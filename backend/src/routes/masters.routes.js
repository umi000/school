const { Router } = require("express");
const { z } = require("zod");
const { asyncHandler } = require("../utils/asyncHandler");
const { getPool, sql } = require("../db/pool");
const { requireAuth, requireRole } = require("../middleware/auth");
const { writeAudit } = require("../services/audit");
const { resolveSchoolId } = require("../utils/schoolScope");
const { stripParse } = require("../utils/zodStrip");

const router = Router();
router.use(requireAuth);

/* ─── Academic Years ──────────────────────────────────────────── */

router.get("/academic-years", asyncHandler(async (_req, res) => {
  const pool = await getPool();
  const schoolId = await resolveSchoolId(null);
  const r = await pool.request()
    .input("school_id", sql.UniqueIdentifier, schoolId)
    .query("SELECT * FROM dbo.academic_years WHERE school_id = @school_id ORDER BY start_date DESC");
  res.json({ data: r.recordset, total: r.recordset.length });
}));

router.post("/academic-years", requireRole("super_admin", "admin"), asyncHandler(async (req, res) => {
  const p = z.object({
    label: z.string().min(1),
    startDate: z.string(),
    endDate: z.string(),
    isCurrent: z.boolean().optional().default(false),
  }).parse(req.body);
  const schoolId = await resolveSchoolId(req.user.schoolId);
  const pool = await getPool();
  if (p.isCurrent) {
    await pool.request().input("school_id", sql.UniqueIdentifier, schoolId)
      .query("UPDATE dbo.academic_years SET is_current = 0 WHERE school_id = @school_id");
  }
  const r = await pool.request()
    .input("school_id", sql.UniqueIdentifier, schoolId)
    .input("label", sql.NVarChar(32), p.label)
    .input("start_date", sql.Date, p.startDate)
    .input("end_date", sql.Date, p.endDate)
    .input("is_current", sql.Bit, p.isCurrent ? 1 : 0)
    .query("INSERT INTO dbo.academic_years (school_id, label, start_date, end_date, is_current) OUTPUT INSERTED.* VALUES (@school_id, @label, @start_date, @end_date, @is_current)");
  res.status(201).json(r.recordset[0]);
}));

/* ─── Grades ──────────────────────────────────────────────────── */

router.get("/grades", asyncHandler(async (_req, res) => {
  const pool = await getPool();
  const r = await pool.request()
    .query("SELECT TOP 200 id, school_id, name, level_order AS level FROM dbo.grades ORDER BY level_order, name");
  res.json({ data: r.recordset, total: r.recordset.length });
}));

router.post("/grades", requireRole("super_admin", "admin"), asyncHandler(async (req, res) => {
  const p = z.object({ name: z.string().min(1), level: z.number().int().optional().nullable() }).parse(req.body);
  const schoolId = await resolveSchoolId(req.user.schoolId);
  const r = await (await getPool()).request()
    .input("school_id", sql.UniqueIdentifier, schoolId)
    .input("name", sql.NVarChar(64), p.name)
    .input("level_order", sql.Int, p.level ?? null)
    .query("INSERT INTO dbo.grades (school_id, name, level_order) OUTPUT INSERTED.* VALUES (@school_id, @name, @level_order)");
  await writeAudit({ userId: req.user.id, action: "INSERT", entityTable: "grades", entityId: r.recordset[0].id, newData: r.recordset[0] });
  res.status(201).json(r.recordset[0]);
}));

router.patch("/grades/:id", requireRole("super_admin", "admin"), asyncHandler(async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  const p = z.object({ name: z.string().min(1).optional(), level: z.number().int().optional().nullable() }).parse(req.body);
  const pool = await getPool();
  const existing = (await pool.request().input("id", sql.UniqueIdentifier, id)
    .query("SELECT * FROM dbo.grades WHERE id = @id")).recordset[0];
  if (!existing) return res.status(404).json({ message: "Grade not found" });
  const r = await pool.request()
    .input("id", sql.UniqueIdentifier, id)
    .input("name", sql.NVarChar(64), p.name ?? existing.name)
    .input("level_order", sql.Int, p.level !== undefined ? p.level : existing.level_order)
    .query("UPDATE dbo.grades SET name = @name, level_order = @level_order OUTPUT INSERTED.* WHERE id = @id");
  await writeAudit({ userId: req.user.id, action: "UPDATE", entityTable: "grades", entityId: id, newData: r.recordset[0] });
  res.json(r.recordset[0]);
}));

router.delete("/grades/:id", requireRole("super_admin", "admin"), asyncHandler(async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  await (await getPool()).request().input("id", sql.UniqueIdentifier, id)
    .query("DELETE FROM dbo.grades WHERE id = @id");
  await writeAudit({ userId: req.user.id, action: "DELETE", entityTable: "grades", entityId: id });
  res.json({ success: true });
}));

/* ─── Sections ────────────────────────────────────────────────── */

router.get("/sections", asyncHandler(async (_req, res) => {
  const pool = await getPool();
  const r = await pool.request().query(`
    SELECT s.id, s.grade_id, s.academic_year_id, s.name, s.capacity,
           s.class_teacher_id,
           g.name AS grade_name, ay.label AS academic_year_label,
           TRIM(t.first_name + ' ' + t.last_name) AS class_teacher_name
    FROM dbo.sections s
    LEFT JOIN dbo.grades g ON g.id = s.grade_id
    LEFT JOIN dbo.academic_years ay ON ay.id = s.academic_year_id
    LEFT JOIN dbo.teachers t ON t.id = s.class_teacher_id
    ORDER BY g.level_order, g.name, s.name
  `);
  res.json({ data: r.recordset, total: r.recordset.length });
}));

router.post("/sections", requireRole("super_admin", "admin", "registrar"), asyncHandler(async (req, res) => {
  const p = z.object({
    gradeId:        z.string().uuid(),
    name:           z.string().min(1),
    academicYearId: z.string().uuid().optional(),
    capacity:       z.number().int().optional().nullable(),
    classTeacherId: z.string().uuid().optional().nullable(),
  }).parse(req.body);
  const pool = await getPool();
  let ayId = p.academicYearId;
  if (!ayId) {
    const schoolId = await resolveSchoolId(null);
    const cur = await pool.request().input("school_id", sql.UniqueIdentifier, schoolId)
      .query("SELECT TOP 1 id FROM dbo.academic_years WHERE school_id = @school_id ORDER BY is_current DESC, start_date DESC");
    if (!cur.recordset[0]) return res.status(400).json({ message: "No academic year found. Create one first." });
    ayId = cur.recordset[0].id;
  }
  const r = await pool.request()
    .input("grade_id",          sql.UniqueIdentifier, p.gradeId)
    .input("academic_year_id",  sql.UniqueIdentifier, ayId)
    .input("name",              sql.NVarChar(16),     p.name)
    .input("capacity",          sql.Int,              p.capacity ?? null)
    .input("class_teacher_id",  sql.UniqueIdentifier, p.classTeacherId ?? null)
    .query(`
      INSERT INTO dbo.sections (grade_id, academic_year_id, name, capacity, class_teacher_id)
      OUTPUT INSERTED.*
      VALUES (@grade_id, @academic_year_id, @name, @capacity, @class_teacher_id)
    `);
  await writeAudit({ userId: req.user.id, action: "INSERT", entityTable: "sections", entityId: r.recordset[0].id, newData: r.recordset[0] });
  res.status(201).json(r.recordset[0]);
}));

router.patch("/sections/:id", requireRole("super_admin", "admin", "registrar"), asyncHandler(async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  const p = z.object({
    name:           z.string().min(1).optional(),
    gradeId:        z.string().uuid().optional(),
    capacity:       z.number().int().optional().nullable(),
    classTeacherId: z.string().uuid().optional().nullable(),
  }).parse(req.body);
  const pool = await getPool();
  const ex = (await pool.request().input("id", sql.UniqueIdentifier, id).query("SELECT * FROM dbo.sections WHERE id = @id")).recordset[0];
  if (!ex) return res.status(404).json({ message: "Section not found" });
  await pool.request()
    .input("id",               sql.UniqueIdentifier, id)
    .input("name",             sql.NVarChar(16),     p.name ?? ex.name)
    .input("grade_id",         sql.UniqueIdentifier, p.gradeId ?? ex.grade_id)
    .input("capacity",         sql.Int,              p.capacity !== undefined ? p.capacity : ex.capacity)
    .input("class_teacher_id", sql.UniqueIdentifier, p.classTeacherId !== undefined ? p.classTeacherId : ex.class_teacher_id)
    .query("UPDATE dbo.sections SET name = @name, grade_id = @grade_id, capacity = @capacity, class_teacher_id = @class_teacher_id WHERE id = @id");
  await writeAudit({ userId: req.user.id, action: "UPDATE", entityTable: "sections", entityId: id });
  res.json({ success: true });
}));

router.delete("/sections/:id", requireRole("super_admin", "admin"), asyncHandler(async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  await (await getPool()).request().input("id", sql.UniqueIdentifier, id)
    .query("DELETE FROM dbo.sections WHERE id = @id");
  await writeAudit({ userId: req.user.id, action: "DELETE", entityTable: "sections", entityId: id });
  res.json({ success: true });
}));

/* ─── Subjects ────────────────────────────────────────────────── */

router.get("/subjects", asyncHandler(async (_req, res) => {
  const r = await (await getPool()).request()
    .query("SELECT TOP 300 id, school_id, name, code, subject_type, medium FROM dbo.subjects ORDER BY name");
  res.json({ data: r.recordset, total: r.recordset.length });
}));

router.post("/subjects", requireRole("super_admin", "admin"), asyncHandler(async (req, res) => {
  const p = z.object({
    name: z.string().min(1),
    code: z.string().nullable().optional(),
    subjectType: z.string().optional().nullable(),
    medium: z.string().optional().nullable(),
    gradeIds: z.array(z.string().uuid()).optional(),
  }).parse(req.body);
  const schoolId = await resolveSchoolId(req.user.schoolId);
  const pool = await getPool();

  const cols = ["school_id", "name", "code"];
  const vals = ["@school_id", "@name", "@code"];
  const req2 = pool.request()
    .input("school_id", sql.UniqueIdentifier, schoolId)
    .input("name", sql.NVarChar(128), p.name)
    .input("code", sql.NVarChar(32), p.code ?? null);

  // Add optional columns if they exist
  let subjectType = p.subjectType ?? null;
  let medium = p.medium ?? null;
  try {
    const colCheck = await pool.request().query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='subjects' AND TABLE_SCHEMA='dbo' AND COLUMN_NAME IN ('subject_type','medium')");
    const existing = colCheck.recordset.map((r) => r.COLUMN_NAME);
    if (existing.includes("subject_type")) { cols.push("subject_type"); vals.push("@subject_type"); req2.input("subject_type", sql.NVarChar(32), subjectType); }
    if (existing.includes("medium")) { cols.push("medium"); vals.push("@medium"); req2.input("medium", sql.NVarChar(32), medium); }
  } catch { /* ignore */ }

  const r = await req2.query(`INSERT INTO dbo.subjects (${cols.join(",")}) OUTPUT INSERTED.* VALUES (${vals.join(",")})`);
  const subject = r.recordset[0];

  if (p.gradeIds?.length) {
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      for (const gid of p.gradeIds) {
        await new sql.Request(tx)
          .input("grade_id", sql.UniqueIdentifier, gid)
          .input("subject_id", sql.UniqueIdentifier, subject.id)
          .query("IF NOT EXISTS (SELECT 1 FROM dbo.grade_subjects WHERE grade_id=@grade_id AND subject_id=@subject_id) INSERT INTO dbo.grade_subjects (grade_id, subject_id) VALUES (@grade_id, @subject_id)");
      }
      await tx.commit();
    } catch (e) { await tx.rollback(); throw e; }
  }

  await writeAudit({ userId: req.user.id, action: "INSERT", entityTable: "subjects", entityId: subject.id, newData: subject });
  res.status(201).json(subject);
}));

router.patch("/subjects/:id", requireRole("super_admin", "admin"), asyncHandler(async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  const p = z.object({ name: z.string().min(1).optional(), code: z.string().nullable().optional(), subjectType: z.string().optional().nullable(), medium: z.string().optional().nullable() }).parse(req.body);
  const pool = await getPool();
  const ex = (await pool.request().input("id", sql.UniqueIdentifier, id).query("SELECT * FROM dbo.subjects WHERE id = @id")).recordset[0];
  if (!ex) return res.status(404).json({ message: "Subject not found" });

  // Build SET clause — always update name/code, optionally update subject_type/medium if columns exist
  const setClauses = ["name = @name", "code = @code"];
  const req2 = pool.request()
    .input("id",   sql.UniqueIdentifier, id)
    .input("name", sql.NVarChar(128), p.name ?? ex.name)
    .input("code", sql.NVarChar(32),  p.code !== undefined ? p.code : ex.code);

  try {
    const colCheck = await pool.request().query(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='subjects' AND TABLE_SCHEMA='dbo' AND COLUMN_NAME IN ('subject_type','medium')"
    );
    const existing = colCheck.recordset.map(r => r.COLUMN_NAME);
    if (existing.includes("subject_type")) {
      setClauses.push("subject_type = @subject_type");
      req2.input("subject_type", sql.NVarChar(32), p.subjectType !== undefined ? p.subjectType : ex.subject_type);
    }
    if (existing.includes("medium")) {
      setClauses.push("medium = @medium");
      req2.input("medium", sql.NVarChar(32), p.medium !== undefined ? p.medium : ex.medium);
    }
  } catch { /* ignore col check failures */ }

  await req2.query(`UPDATE dbo.subjects SET ${setClauses.join(", ")} WHERE id = @id`);
  await writeAudit({ userId: req.user.id, action: "UPDATE", entityTable: "subjects", entityId: id });
  res.json({ success: true });
}));

router.delete("/subjects/:id", requireRole("super_admin", "admin"), asyncHandler(async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  await (await getPool()).request().input("id", sql.UniqueIdentifier, id)
    .query("DELETE FROM dbo.subjects WHERE id = @id");
  await writeAudit({ userId: req.user.id, action: "DELETE", entityTable: "subjects", entityId: id });
  res.json({ success: true });
}));

/* ─── Teachers ────────────────────────────────────────────────── */

router.get("/teachers", asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 300);
  const page = Math.max(Number(req.query.page) || 1, 1);
  const offset = (page - 1) * limit;
  const pool = await getPool();
  const r = await pool.request()
    .input("offset", sql.Int, offset)
    .input("limit", sql.Int, limit)
    .query(`
      SELECT id, school_id, employee_code,
             TRIM(first_name + ' ' + last_name) AS name,
             first_name, last_name, phone AS contact_phone, email AS contact_email,
             status, created_at,
             joining_date, date_of_birth,
             CASE WHEN COL_LENGTH('dbo.teachers','qualification') IS NOT NULL THEN qualification ELSE NULL END AS qualification
      FROM dbo.teachers
      WHERE deleted_at IS NULL
      ORDER BY created_at DESC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);
  const cnt = await pool.request().query("SELECT COUNT(1) AS c FROM dbo.teachers WHERE deleted_at IS NULL");
  res.json({ data: r.recordset, total: cnt.recordset[0].c });
}));

router.post("/teachers", requireRole("super_admin", "admin"), asyncHandler(async (req, res) => {
  const p = z.object({
    name: z.string().min(1).optional(),
    firstName: z.string().min(1).optional(),
    lastName: z.string().min(1).optional(),
    employeeCode: z.string().optional().nullable(),
    gender: z.string().optional().nullable(),
    qualification: z.string().optional().nullable(),
    joiningDate: z.string().optional().nullable(),
    dateOfBirth: z.string().optional().nullable(),
    contactPhone: z.string().optional().nullable(),
    contactEmail: z.string().email().optional().nullable(),
    status: z.string().optional().default("active"),
  }).strip().parse(req.body);

  let firstName = p.firstName || "";
  let lastName = p.lastName || "";
  if (p.name && !firstName) {
    const parts = p.name.trim().split(/\s+/);
    firstName = parts[0];
    lastName = parts.slice(1).join(" ") || parts[0];
  }

  const schoolId = await resolveSchoolId(req.user.schoolId);
  const empCode = p.employeeCode?.trim() || `EMP-${Date.now()}`;
  const pool = await getPool();

  // Dynamic: check if qualification column exists
  const hasQual = (await pool.request().query("SELECT COL_LENGTH('dbo.teachers','qualification') AS v")).recordset[0].v !== null;
  const hasJoinDate = (await pool.request().query("SELECT COL_LENGTH('dbo.teachers','joining_date') AS v")).recordset[0].v !== null;
  const hasDOB = (await pool.request().query("SELECT COL_LENGTH('dbo.teachers','date_of_birth') AS v")).recordset[0].v !== null;

  const qualCol     = hasQual     ? ", qualification"  : "";
  const joinCol     = hasJoinDate ? ", joining_date"    : "";
  const dobCol      = hasDOB      ? ", date_of_birth"   : "";
  const qualVal     = hasQual     ? ", @qualification"  : "";
  const joinVal     = hasJoinDate ? ", @joining_date"   : "";
  const dobVal      = hasDOB      ? ", @date_of_birth"  : "";

  const req2 = pool.request()
    .input("school_id", sql.UniqueIdentifier, schoolId)
    .input("employee_code", sql.NVarChar(64), empCode)
    .input("first_name", sql.NVarChar(128), firstName)
    .input("last_name", sql.NVarChar(128), lastName)
    .input("phone", sql.NVarChar(32), p.contactPhone ?? null)
    .input("email", sql.NVarChar(255), p.contactEmail ?? null)
    .input("status", sql.NVarChar(24), p.status ?? "active");
  if (hasQual)     req2.input("qualification",  sql.NVarChar(255), p.qualification  ?? null);
  if (hasJoinDate) req2.input("joining_date",   sql.Date,          p.joiningDate    ?? null);
  if (hasDOB)      req2.input("date_of_birth",  sql.Date,          p.dateOfBirth    ?? null);

  const r = await req2.query(`
      INSERT INTO dbo.teachers (school_id, employee_code, first_name, last_name, phone, email, status${qualCol}${joinCol}${dobCol})
      OUTPUT INSERTED.*
      VALUES (@school_id, @employee_code, @first_name, @last_name, @phone, @email, @status${qualVal}${joinVal}${dobVal})
    `);
  await writeAudit({ userId: req.user.id, action: "INSERT", entityTable: "teachers", entityId: r.recordset[0].id, newData: r.recordset[0] });
  res.status(201).json(r.recordset[0]);
}));

router.patch("/teachers/:id", requireRole("super_admin", "admin"), asyncHandler(async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  const p = z.object({
    name: z.string().optional(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    employeeCode: z.string().optional().nullable(),
    contactPhone: z.string().optional().nullable(),
    contactEmail: z.string().email().optional().nullable(),
    qualification: z.string().optional().nullable(),
    joiningDate: z.string().optional().nullable(),
    dateOfBirth: z.string().optional().nullable(),
    gender: z.string().optional().nullable(),
    status: z.string().optional(),
  }).strip().parse(req.body);
  const pool = await getPool();
  const ex = (await pool.request().input("id", sql.UniqueIdentifier, id).query("SELECT * FROM dbo.teachers WHERE id = @id")).recordset[0];
  if (!ex) return res.status(404).json({ message: "Teacher not found" });

  let firstName = p.firstName ?? ex.first_name;
  let lastName = p.lastName ?? ex.last_name;
  if (p.name) {
    const parts = p.name.trim().split(/\s+/);
    firstName = parts[0];
    lastName = parts.slice(1).join(" ") || parts[0];
  }

  const hasQual = (await pool.request().query("SELECT COL_LENGTH('dbo.teachers','qualification') AS v")).recordset[0].v !== null;
  const hasJoinDate = (await pool.request().query("SELECT COL_LENGTH('dbo.teachers','joining_date') AS v")).recordset[0].v !== null;
  const hasDOB = (await pool.request().query("SELECT COL_LENGTH('dbo.teachers','date_of_birth') AS v")).recordset[0].v !== null;
  const qualSet = hasQual     ? ", qualification=@qualification"    : "";
  const joinSet = hasJoinDate ? ", joining_date=@joining_date"       : "";
  const dobSet  = hasDOB      ? ", date_of_birth=@date_of_birth"     : "";

  const upReq = pool.request()
    .input("id", sql.UniqueIdentifier, id)
    .input("first_name", sql.NVarChar(128), firstName)
    .input("last_name", sql.NVarChar(128), lastName)
    .input("phone", sql.NVarChar(32), p.contactPhone !== undefined ? p.contactPhone : ex.phone)
    .input("email", sql.NVarChar(255), p.contactEmail !== undefined ? p.contactEmail : ex.email)
    .input("status", sql.NVarChar(24), p.status ?? ex.status)
    .input("updated_at", sql.DateTime2, new Date());
  if (hasQual)     upReq.input("qualification", sql.NVarChar(255), p.qualification  !== undefined ? p.qualification  : ex.qualification);
  if (hasJoinDate) upReq.input("joining_date",  sql.Date,          p.joiningDate    !== undefined ? p.joiningDate    : ex.joining_date);
  if (hasDOB)      upReq.input("date_of_birth", sql.Date,          p.dateOfBirth    !== undefined ? p.dateOfBirth    : ex.date_of_birth);
  await upReq.query(`UPDATE dbo.teachers SET first_name=@first_name, last_name=@last_name, phone=@phone, email=@email, status=@status, updated_at=@updated_at${qualSet}${joinSet}${dobSet} WHERE id=@id`);
  await writeAudit({ userId: req.user.id, action: "UPDATE", entityTable: "teachers", entityId: id });
  res.json({ success: true });
}));

router.delete("/teachers/:id", requireRole("super_admin", "admin"), asyncHandler(async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  await (await getPool()).request()
    .input("id", sql.UniqueIdentifier, id)
    .input("ts", sql.DateTime2, new Date())
    .query("UPDATE dbo.teachers SET deleted_at = @ts WHERE id = @id");
  await writeAudit({ userId: req.user.id, action: "DELETE", entityTable: "teachers", entityId: id });
  res.json({ success: true });
}));

/* ─── Grade Subjects (passing marks, practical) ──────────── */

router.get("/grade-subjects", asyncHandler(async (req, res) => {
  const gradeId = req.query.gradeId ? z.string().uuid().parse(req.query.gradeId) : null;
  const r = await (await getPool()).request()
    .input("gid", sql.UniqueIdentifier, gradeId)
    .query(`
      SELECT gs.grade_id, gs.subject_id, gs.passing_marks, gs.practical_passing_marks,
             gs.has_practical, gs.max_marks,
             g.name AS grade_name, sub.name AS subject_name, sub.code AS subject_code
      FROM dbo.grade_subjects gs
      JOIN dbo.grades g ON g.id = gs.grade_id
      JOIN dbo.subjects sub ON sub.id = gs.subject_id
      WHERE (@gid IS NULL OR gs.grade_id = @gid)
      ORDER BY g.name, sub.name
    `);
  res.json({ data: r.recordset, total: r.recordset.length });
}));

router.post("/grade-subjects", requireRole("super_admin","admin"), asyncHandler(async (req, res) => {
  const p = z.object({
    gradeId:               z.string().uuid(),
    subjectId:             z.string().uuid(),
    passingMarks:          z.number().default(33),
    practicalPassingMarks: z.number().nullable().optional(),
    hasPractical:          z.boolean().default(false),
    maxMarks:              z.number().default(100),
  }).strip().parse(req.body);
  const r = await (await getPool()).request()
    .input("gid",  sql.UniqueIdentifier, p.gradeId)
    .input("sid",  sql.UniqueIdentifier, p.subjectId)
    .input("pm",   sql.Numeric(6,2), p.passingMarks)
    .input("ppm",  sql.Numeric(6,2), p.practicalPassingMarks ?? null)
    .input("hp",   sql.Bit, p.hasPractical ? 1 : 0)
    .input("mm",   sql.Numeric(6,2), p.maxMarks)
    .query(`
      MERGE dbo.grade_subjects AS t
      USING (SELECT @gid g, @sid s) AS src ON (t.grade_id=src.g AND t.subject_id=src.s)
      WHEN MATCHED THEN UPDATE SET passing_marks=@pm, practical_passing_marks=@ppm, has_practical=@hp, max_marks=@mm
      WHEN NOT MATCHED THEN INSERT (grade_id,subject_id,passing_marks,practical_passing_marks,has_practical,max_marks)
           VALUES (@gid,@sid,@pm,@ppm,@hp,@mm)
      OUTPUT INSERTED.*;
    `);
  res.status(201).json(r.recordset[0]);
}));

router.delete("/grade-subjects", requireRole("super_admin","admin"), asyncHandler(async (req, res) => {
  const gradeId   = z.string().uuid().parse(req.query.gradeId);
  const subjectId = z.string().uuid().parse(req.query.subjectId);
  await (await getPool()).request()
    .input("gid", sql.UniqueIdentifier, gradeId)
    .input("sid", sql.UniqueIdentifier, subjectId)
    .query("DELETE FROM dbo.grade_subjects WHERE grade_id=@gid AND subject_id=@sid");
  res.json({ success: true });
}));

/* ─── Assessment Terms ───────────────────────────────────── */

router.get("/assessment-terms", asyncHandler(async (req, res) => {
  const ayId = req.query.academicYearId ? z.string().uuid().parse(req.query.academicYearId) : null;
  const r = await (await getPool()).request()
    .input("ayid", sql.UniqueIdentifier, ayId)
    .query(`
      SELECT t.*, ay.label AS academic_year_label
      FROM dbo.assessment_terms t
      JOIN dbo.academic_years ay ON ay.id = t.academic_year_id
      WHERE (@ayid IS NULL OR t.academic_year_id = @ayid)
      ORDER BY t.start_date
    `);
  res.json({ data: r.recordset, total: r.recordset.length });
}));

router.post("/assessment-terms", requireRole("super_admin","admin"), asyncHandler(async (req, res) => {
  const p = z.object({
    academicYearId: z.string().uuid(),
    name:           z.string().min(1).max(64),
    startDate:      z.string().nullable().optional(),
    endDate:        z.string().nullable().optional(),
  }).strip().parse(req.body);
  const r = await (await getPool()).request()
    .input("ayid",  sql.UniqueIdentifier, p.academicYearId)
    .input("name",  sql.NVarChar(64), p.name)
    .input("sdate", sql.Date, p.startDate ?? null)
    .input("edate", sql.Date, p.endDate   ?? null)
    .query(`
      IF NOT EXISTS (SELECT 1 FROM dbo.assessment_terms WHERE academic_year_id=@ayid AND name=@name)
        INSERT INTO dbo.assessment_terms (academic_year_id,name,start_date,end_date) OUTPUT INSERTED.*
        VALUES (@ayid,@name,@sdate,@edate)
    `);
  res.status(201).json(r.recordset[0] || { success: true });
}));

router.patch("/assessment-terms/:id", requireRole("super_admin","admin"), asyncHandler(async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  const p  = z.object({ name:z.string().optional(), startDate:z.string().nullable().optional(), endDate:z.string().nullable().optional() }).strip().parse(req.body);
  const ex = (await (await getPool()).request().input("id",sql.UniqueIdentifier,id).query("SELECT * FROM dbo.assessment_terms WHERE id=@id")).recordset[0];
  if (!ex) return res.status(404).json({ message: "Term not found" });
  await (await getPool()).request()
    .input("id",sql.UniqueIdentifier,id)
    .input("name",sql.NVarChar(64),p.name??ex.name)
    .input("sd",sql.Date,p.startDate!==undefined?p.startDate:ex.start_date)
    .input("ed",sql.Date,p.endDate  !==undefined?p.endDate  :ex.end_date)
    .query("UPDATE dbo.assessment_terms SET name=@name, start_date=@sd, end_date=@ed WHERE id=@id");
  res.json({ success: true });
}));

router.delete("/assessment-terms/:id", requireRole("super_admin","admin"), asyncHandler(async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  await (await getPool()).request().input("id",sql.UniqueIdentifier,id).query("DELETE FROM dbo.assessment_terms WHERE id=@id");
  res.json({ success: true });
}));

/* ─── Audit Log list ─────────────────────────────────────── */

router.get("/audit-logs", requireRole("super_admin","admin"), asyncHandler(async (req, res) => {
  const limit  = Math.min(Number(req.query.limit)||50, 200);
  const entity = req.query.entity ? String(req.query.entity) : null;
  const r = await (await getPool()).request()
    .input("limit",  sql.Int, limit)
    .input("entity", sql.NVarChar(64), entity)
    .query(`
      SELECT TOP (@limit) al.id, al.action, al.entity_table, al.entity_id,
             al.created_at, u.email AS user_email
      FROM dbo.audit_logs al
      LEFT JOIN dbo.users u ON u.id = al.user_id
      WHERE (@entity IS NULL OR al.entity_table = @entity)
      ORDER BY al.created_at DESC
    `);
  res.json({ data: r.recordset, total: r.recordset.length });
}));

module.exports = { masterRoutes: router };

