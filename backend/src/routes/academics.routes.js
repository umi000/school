const { Router } = require("express");
const { z } = require("zod");
const { asyncHandler } = require("../utils/asyncHandler");
const { getPool, sql } = require("../db/pool");
const { requireAuth, requireRole } = require("../middleware/auth");
const { writeAudit } = require("../services/audit");
const { resolveSchoolId } = require("../utils/schoolScope");

const router = Router();
router.use(requireAuth);

/* ─── Helpers ─────────────────────────────────────────────────── */
async function resolveCurrentAcademicYearId(pool, schoolId) {
  const r = await pool.request()
    .input("school_id", sql.UniqueIdentifier, schoolId)
    .query("SELECT TOP 1 id FROM dbo.academic_years WHERE school_id = @school_id ORDER BY is_current DESC, start_date DESC");
  if (!r.recordset[0]) throw new Error("No academic year found. Create one first.");
  return r.recordset[0].id;
}

/* ─── Enrollments ─────────────────────────────────────────────── */

router.get("/enrollments", asyncHandler(async (req, res) => {
  const academicYearId = req.query.academicYearId ? z.string().uuid().parse(req.query.academicYearId) : null;
  const sectionId = req.query.sectionId ? z.string().uuid().parse(req.query.sectionId) : null;
  const r = await (await getPool()).request()
    .input("academic_year_id", sql.UniqueIdentifier, academicYearId)
    .input("section_id", sql.UniqueIdentifier, sectionId)
    .query(`
      SELECT se.*, TRIM(s.first_name + ' ' + s.last_name) AS student_name,
             s.general_register_no AS gr_number, sec.name AS section_name, g.name AS grade_name
      FROM dbo.student_enrollments se
      JOIN dbo.students s ON s.id = se.student_id
      JOIN dbo.sections sec ON sec.id = se.section_id
      JOIN dbo.grades g ON g.id = sec.grade_id
      WHERE (@academic_year_id IS NULL OR se.academic_year_id = @academic_year_id)
        AND (@section_id IS NULL OR se.section_id = @section_id)
      ORDER BY se.enrolled_at DESC
    `);
  res.json({ data: r.recordset, total: r.recordset.length });
}));

router.post("/enrollments", requireRole("super_admin", "admin", "registrar"), asyncHandler(async (req, res) => {
  const p = z.object({
    studentId: z.string().uuid(),
    sectionId: z.string().uuid(),
    academicYearId: z.string().uuid().optional(),
    rollNumber: z.string().nullable().optional(),
    enrolledAt: z.string().nullable().optional(),
  }).parse(req.body);
  const pool = await getPool();
  const schoolId = await resolveSchoolId(null);
  const ayId = p.academicYearId ?? await resolveCurrentAcademicYearId(pool, schoolId);
  const r = await pool.request()
    .input("student_id", sql.UniqueIdentifier, p.studentId)
    .input("section_id", sql.UniqueIdentifier, p.sectionId)
    .input("academic_year_id", sql.UniqueIdentifier, ayId)
    .input("roll_number", sql.NVarChar(32), p.rollNumber ?? null)
    .input("enrolled_at", sql.Date, p.enrolledAt ?? null)
    .query(`
      INSERT INTO dbo.student_enrollments (student_id, section_id, academic_year_id, roll_number, enrolled_at)
      OUTPUT INSERTED.*
      VALUES (@student_id, @section_id, @academic_year_id, @roll_number, ISNULL(@enrolled_at, CONVERT(date, GETDATE())))
    `);
  await writeAudit({ userId: req.user.id, action: "INSERT", entityTable: "student_enrollments", entityId: r.recordset[0].id, newData: r.recordset[0] });
  res.status(201).json(r.recordset[0]);
}));

/* ─── Teacher Assignments ─────────────────────────────────────── */

router.get("/teacher-assignments", asyncHandler(async (_req, res) => {
  const r = await (await getPool()).request().query(`
    SELECT ta.*, TRIM(t.first_name + ' ' + t.last_name) AS teacher_name,
           sub.name AS subject_name, sec.name AS section_name
    FROM dbo.teacher_assignments ta
    JOIN dbo.teachers t ON t.id = ta.teacher_id
    JOIN dbo.subjects sub ON sub.id = ta.subject_id
    JOIN dbo.sections sec ON sec.id = ta.section_id
    ORDER BY ta.created_at DESC
  `);
  res.json({ data: r.recordset, total: r.recordset.length });
}));

router.post("/teacher-assignments", requireRole("super_admin", "admin"), asyncHandler(async (req, res) => {
  const p = z.object({
    teacherId: z.string().uuid(),
    sectionId: z.string().uuid(),
    subjectId: z.string().uuid(),
    academicYearId: z.string().uuid().optional(),
  }).parse(req.body);
  const pool = await getPool();
  const schoolId = await resolveSchoolId(null);
  const ayId = p.academicYearId ?? await resolveCurrentAcademicYearId(pool, schoolId);
  const r = await pool.request()
    .input("teacher_id", sql.UniqueIdentifier, p.teacherId)
    .input("section_id", sql.UniqueIdentifier, p.sectionId)
    .input("subject_id", sql.UniqueIdentifier, p.subjectId)
    .input("academic_year_id", sql.UniqueIdentifier, ayId)
    .query(`
      INSERT INTO dbo.teacher_assignments (teacher_id, section_id, subject_id, academic_year_id)
      OUTPUT INSERTED.*
      VALUES (@teacher_id, @section_id, @subject_id, @academic_year_id)
    `);
  await writeAudit({ userId: req.user.id, action: "INSERT", entityTable: "teacher_assignments", entityId: r.recordset[0].id, newData: r.recordset[0] });
  res.status(201).json(r.recordset[0]);
}));

/* ─── Examinations ────────────────────────────────────────────── */

router.get("/examinations", asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const page = Math.max(Number(req.query.page) || 1, 1);
  const offset = (page - 1) * limit;
  const ayId = req.query.academicYearId ? z.string().uuid().parse(req.query.academicYearId) : null;
  const pool = await getPool();
  const r = await pool.request()
    .input("ay_id", sql.UniqueIdentifier, ayId)
    .input("offset", sql.Int, offset)
    .input("limit", sql.Int, limit)
    .query(`
      SELECT e.*,
             COALESCE(e.title, e.name) AS title,
             COALESCE(e.exam_type, e.exam_kind) AS exam_type
      FROM dbo.examinations e
      WHERE (@ay_id IS NULL OR e.academic_year_id = @ay_id)
      ORDER BY e.created_at DESC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);
  const cnt = await pool.request()
    .input("ay_id", sql.UniqueIdentifier, ayId)
    .query("SELECT COUNT(1) AS c FROM dbo.examinations WHERE (@ay_id IS NULL OR academic_year_id = @ay_id)");
  res.json({ data: r.recordset, total: cnt.recordset[0].c });
}));

router.post("/examinations", requireRole("super_admin", "admin", "registrar"), asyncHandler(async (req, res) => {
  const p = z.object({
    title: z.string().min(1),
    examType: z.string().default("annual"),
    academicYearId: z.string().uuid().optional(),
    gradeId: z.string().uuid().optional().nullable(),
    startDate: z.string().optional().nullable(),
    endDate: z.string().optional().nullable(),
  }).parse(req.body);
  const pool = await getPool();
  const schoolId = await resolveSchoolId(null);
  const ayId = p.academicYearId ?? await resolveCurrentAcademicYearId(pool, schoolId);

  // Try inserting with modern column names first, fall back to legacy names
  let r;
  try {
    r = await pool.request()
      .input("school_id", sql.UniqueIdentifier, schoolId)
      .input("academic_year_id", sql.UniqueIdentifier, ayId)
      .input("title", sql.NVarChar(255), p.title)
      .input("exam_type", sql.NVarChar(32), p.examType)
      .input("grade_id", sql.UniqueIdentifier, p.gradeId ?? null)
      .input("start_date", sql.Date, p.startDate ?? null)
      .input("end_date", sql.Date, p.endDate ?? null)
      .query(`
        INSERT INTO dbo.examinations (school_id, academic_year_id, title, exam_type, grade_id, start_date, end_date)
        OUTPUT INSERTED.*
        VALUES (@school_id, @academic_year_id, @title, @exam_type, @grade_id, @start_date, @end_date)
      `);
  } catch (e1) {
    // Fallback to legacy schema (name, exam_kind)
    r = await pool.request()
      .input("school_id", sql.UniqueIdentifier, schoolId)
      .input("academic_year_id", sql.UniqueIdentifier, ayId)
      .input("name", sql.NVarChar(255), p.title)
      .input("exam_kind", sql.NVarChar(32), p.examType)
      .query(`
        INSERT INTO dbo.examinations (school_id, academic_year_id, name, exam_kind)
        OUTPUT INSERTED.*
        VALUES (@school_id, @academic_year_id, @name, @exam_kind)
      `);
  }
  await writeAudit({ userId: req.user.id, action: "INSERT", entityTable: "examinations", entityId: r.recordset[0].id, newData: r.recordset[0] });
  res.status(201).json(r.recordset[0]);
}));

router.patch("/examinations/:id", requireRole("super_admin", "admin", "registrar"), asyncHandler(async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  const p = z.object({
    title: z.string().min(1).optional(),
    examType: z.string().optional(),
    startDate: z.string().optional().nullable(),
    endDate: z.string().optional().nullable(),
    status: z.string().optional(),
  }).parse(req.body);
  const pool = await getPool();
  const ex = (await pool.request().input("id", sql.UniqueIdentifier, id).query("SELECT * FROM dbo.examinations WHERE id = @id")).recordset[0];
  if (!ex) return res.status(404).json({ message: "Examination not found" });
  // Detect column name (title vs name)
  const hasTitleCol = ex.title !== undefined;
  const titleCol = hasTitleCol ? "title" : "name";
  const typeCol = ex.exam_type !== undefined ? "exam_type" : "exam_kind";
  const sets = [`${titleCol} = @title`, `${typeCol} = @etype`];
  if (ex.start_date !== undefined) sets.push("start_date = @start_date", "end_date = @end_date");
  await pool.request()
    .input("id", sql.UniqueIdentifier, id)
    .input("title", sql.NVarChar(255), p.title ?? (hasTitleCol ? ex.title : ex.name))
    .input("etype", sql.NVarChar(32), p.examType ?? (ex.exam_type ?? ex.exam_kind))
    .input("start_date", sql.Date, p.startDate ?? ex.start_date ?? null)
    .input("end_date", sql.Date, p.endDate ?? ex.end_date ?? null)
    .query(`UPDATE dbo.examinations SET ${sets.join(", ")} WHERE id = @id`);
  res.json({ success: true });
}));

router.delete("/examinations/:id", requireRole("super_admin", "admin"), asyncHandler(async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  await (await getPool()).request().input("id", sql.UniqueIdentifier, id)
    .query("DELETE FROM dbo.examinations WHERE id = @id");
  await writeAudit({ userId: req.user.id, action: "DELETE", entityTable: "examinations", entityId: id });
  res.json({ success: true });
}));

/* ─── Examination Schedule ────────────────────────────────────── */

router.get("/examinations/:id/schedule", asyncHandler(async (req, res) => {
  const eid = z.string().uuid().parse(req.params.id);
  const r = await (await getPool()).request()
    .input("eid", sql.UniqueIdentifier, eid)
    .query(`
      SELECT l.*, sub.name AS subject_name
      FROM dbo.examination_schedule_lines l
      LEFT JOIN dbo.subjects sub ON sub.id = l.subject_id
      WHERE l.examination_id = @eid
      ORDER BY l.exam_date, l.sort_order
    `);
  res.json({ data: r.recordset, total: r.recordset.length });
}));

router.post("/examinations/:id/schedule", requireRole("super_admin", "admin", "registrar"), asyncHandler(async (req, res) => {
  const eid = z.string().uuid().parse(req.params.id);
  const p = z.object({
    subjectId: z.string().uuid(),
    examDate: z.string(),
    startTime: z.string().optional().nullable(),
    endTime: z.string().optional().nullable(),
    room: z.string().optional().nullable(),
    sectionId: z.string().uuid().optional().nullable(),
    sortOrder: z.number().int().default(0),
  }).parse(req.body);
  const pool = await getPool();
  let secId = p.sectionId;
  if (!secId) {
    // pick first section linked to this exam's academic year
    const ex = (await pool.request().input("eid", sql.UniqueIdentifier, eid).query("SELECT academic_year_id FROM dbo.examinations WHERE id = @eid")).recordset[0];
    if (ex) {
      const sec = (await pool.request().input("ay", sql.UniqueIdentifier, ex.academic_year_id).query("SELECT TOP 1 id FROM dbo.sections WHERE academic_year_id = @ay ORDER BY name")).recordset[0];
      secId = sec?.id ?? null;
    }
  }
  // Detect which columns exist in schedule_lines
  const colCheck = await pool.request().query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='examination_schedule_lines' AND TABLE_SCHEMA='dbo'");
  const existCols = colCheck.recordset.map((c) => c.COLUMN_NAME);
  const hasRoom = existCols.includes("room");
  const hasTimeStart = existCols.includes("time_start");
  const startTimeCol = hasTimeStart ? "time_start" : "start_time";
  const endTimeCol = hasTimeStart ? "time_end" : "end_time";

  const cols = ["examination_id", "subject_id", "exam_date", startTimeCol, endTimeCol, "sort_order"];
  const vals = ["@eid", "@sid", "@exam_date", "@time_start", "@time_end", "@sort_order"];
  const r2 = pool.request()
    .input("eid", sql.UniqueIdentifier, eid)
    .input("sid", sql.UniqueIdentifier, p.subjectId)
    .input("exam_date", sql.Date, p.examDate)
    .input("time_start", sql.NVarChar(8), p.startTime ?? null)
    .input("time_end", sql.NVarChar(8), p.endTime ?? null)
    .input("sort_order", sql.Int, p.sortOrder);
  if (secId) { cols.push("section_id"); vals.push("@section_id"); r2.input("section_id", sql.UniqueIdentifier, secId); }
  if (hasRoom) { cols.push("room"); vals.push("@room"); r2.input("room", sql.NVarChar(64), p.room ?? null); }
  const r = await r2.query(`INSERT INTO dbo.examination_schedule_lines (${cols.join(",")}) OUTPUT INSERTED.* VALUES (${vals.join(",")})`);
  await writeAudit({ userId: req.user.id, action: "INSERT", entityTable: "examination_schedule_lines", entityId: r.recordset[0].id, newData: r.recordset[0] });
  res.status(201).json(r.recordset[0]);
}));

/* ─── Examination Seats ───────────────────────────────────────── */

router.get("/examinations/:id/seats", asyncHandler(async (req, res) => {
  const eid = z.string().uuid().parse(req.params.id);
  const sectionId = req.query.sectionId ? z.string().uuid().parse(req.query.sectionId) : null;
  const r = await (await getPool()).request()
    .input("eid", sql.UniqueIdentifier, eid)
    .input("section_id", sql.UniqueIdentifier, sectionId)
    .query(`
      SELECT es.*, TRIM(s.first_name + ' ' + s.last_name) AS student_name,
             s.general_register_no AS gr_number
      FROM dbo.examination_seats es
      JOIN dbo.students s ON s.id = es.student_id
      WHERE es.examination_id = @eid
        AND (@section_id IS NULL OR es.section_id = @section_id)
      ORDER BY es.seat_number
    `);
  res.json({ data: r.recordset, total: r.recordset.length });
}));

router.post("/examinations/:id/seats/assign-bulk", requireRole("super_admin", "admin", "registrar"), asyncHandler(async (req, res) => {
  const eid = z.string().uuid().parse(req.params.id);
  const p = z.object({ startSeat: z.number().int().min(1).default(1), sectionId: z.string().uuid().optional().nullable() }).parse(req.body);
  const pool = await getPool();

  // Get all active enrolled students for this examination (across all sections if no sectionId)
  const ex = (await pool.request().input("eid", sql.UniqueIdentifier, eid).query("SELECT academic_year_id FROM dbo.examinations WHERE id = @eid")).recordset[0];
  if (!ex) return res.status(404).json({ message: "Examination not found" });

  const students = await pool.request()
    .input("ay", sql.UniqueIdentifier, ex.academic_year_id)
    .input("sec", sql.UniqueIdentifier, p.sectionId ?? null)
    .query(`
      SELECT se.student_id, se.section_id
      FROM dbo.student_enrollments se
      JOIN dbo.students st ON st.id = se.student_id
      WHERE se.academic_year_id = @ay
        AND st.status = 'active' AND st.deleted_at IS NULL
        AND (@sec IS NULL OR se.section_id = @sec)
      ORDER BY se.section_id, se.roll_number, se.enrolled_at
    `);

  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    let current = p.startSeat;
    for (const row of students.recordset) {
      await new sql.Request(tx)
        .input("eid", sql.UniqueIdentifier, eid)
        .input("section_id", sql.UniqueIdentifier, row.section_id)
        .input("student_id", sql.UniqueIdentifier, row.student_id)
        .input("seat_number", sql.Int, current)
        .query(`
          IF NOT EXISTS (SELECT 1 FROM dbo.examination_seats WHERE examination_id = @eid AND student_id = @student_id)
          INSERT INTO dbo.examination_seats (examination_id, section_id, student_id, seat_number)
          VALUES (@eid, @section_id, @student_id, @seat_number)
        `);
      current++;
    }
    await tx.commit();
    await writeAudit({ userId: req.user.id, action: "BULK_ASSIGN", entityTable: "examination_seats", newData: { examinationId: eid, assigned: students.recordset.length } });
    res.json({ assigned: students.recordset.length, startFrom: p.startSeat });
  } catch (e) { await tx.rollback(); throw e; }
}));

/* ─── Attendance Sessions ─────────────────────────────────────── */

router.get("/attendance/sessions", asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const sectionId = req.query.sectionId ? z.string().uuid().parse(req.query.sectionId) : null;
  const pool = await getPool();
  const r = await pool.request()
    .input("section_id", sql.UniqueIdentifier, sectionId)
    .input("limit", sql.Int, limit)
    .query(`
      SELECT TOP (@limit) ats.id, ats.section_id, ats.subject_id, ats.academic_year_id,
             ats.period, ats.created_at,
             CONVERT(NVARCHAR(10), ats.[date], 120) AS session_date,
             sec.name AS section_name,
             g.name AS grade_name,
             sub.name AS subject_name
      FROM dbo.attendance_sessions ats
      LEFT JOIN dbo.sections sec ON sec.id = ats.section_id
      LEFT JOIN dbo.grades g ON g.id = sec.grade_id
      LEFT JOIN dbo.subjects sub ON sub.id = ats.subject_id
      WHERE (@section_id IS NULL OR ats.section_id = @section_id)
      ORDER BY ats.[date] DESC, ats.period DESC
    `);
  res.json({ data: r.recordset, total: r.recordset.length });
}));

router.post("/attendance/sessions", requireRole("super_admin", "admin", "registrar", "teacher"), asyncHandler(async (req, res) => {
  const p = z.object({
    sectionId: z.string().uuid(),
    subjectId: z.string().uuid().optional().nullable(),
    academicYearId: z.string().uuid().optional(),
    sessionDate: z.string().optional(),
    date: z.string().optional(),
    period: z.union([z.string(), z.number()]).optional().nullable(),
  }).parse(req.body);
  const pool = await getPool();
  const schoolId = await resolveSchoolId(null);
  const ayId = p.academicYearId ?? await resolveCurrentAcademicYearId(pool, schoolId);
  const dateVal = p.sessionDate ?? p.date ?? new Date().toISOString().slice(0, 10);
  const r = await pool.request()
    .input("section_id", sql.UniqueIdentifier, p.sectionId)
    .input("subject_id", sql.UniqueIdentifier, p.subjectId ?? null)
    .input("academic_year_id", sql.UniqueIdentifier, ayId)
    .input("date", sql.Date, dateVal)
    .input("period", sql.NVarChar(16), p.period != null ? String(p.period) : null)
    .query(`
      INSERT INTO dbo.attendance_sessions (section_id, subject_id, academic_year_id, [date], period)
      OUTPUT INSERTED.*
      VALUES (@section_id, @subject_id, @academic_year_id, @date, @period)
    `);
  await writeAudit({ userId: req.user.id, action: "INSERT", entityTable: "attendance_sessions", entityId: r.recordset[0].id, newData: r.recordset[0] });
  res.status(201).json(r.recordset[0]);
}));

router.post("/attendance/sessions/:id/records/bulk", requireRole("super_admin", "admin", "registrar", "teacher"), asyncHandler(async (req, res) => {
  const sessionId = z.string().uuid().parse(req.params.id);
  const records = z.array(z.object({
    studentId: z.string().uuid(),
    status: z.enum(["present", "absent", "late", "excused", "leave"]),
    remarks: z.string().optional().nullable(),
    note: z.string().optional().nullable(),
  })).min(1).parse(req.body.records ?? []);
  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    for (const rec of records) {
      const noteVal = rec.remarks ?? rec.note ?? null;
      await new sql.Request(tx)
        .input("session_id", sql.UniqueIdentifier, sessionId)
        .input("student_id", sql.UniqueIdentifier, rec.studentId)
        .input("status", sql.NVarChar(16), rec.status)
        .input("note", sql.NVarChar(sql.MAX), noteVal)
        .query(`
          MERGE dbo.attendance_records AS target
          USING (SELECT @session_id session_id, @student_id student_id) AS src
          ON (target.session_id = src.session_id AND target.student_id = src.student_id)
          WHEN MATCHED THEN UPDATE SET status = @status, note = @note
          WHEN NOT MATCHED THEN INSERT (session_id, student_id, status, note) VALUES (@session_id, @student_id, @status, @note);
        `);
    }
    await tx.commit();
    await writeAudit({ userId: req.user.id, action: "BULK_UPSERT", entityTable: "attendance_records", newData: { sessionId, count: records.length } });
    res.json({ success: true, count: records.length });
  } catch (e) { await tx.rollback(); throw e; }
}));

router.get("/attendance/sessions/:id/records", asyncHandler(async (req, res) => {
  const sessionId = z.string().uuid().parse(req.params.id);
  const r = await (await getPool()).request()
    .input("session_id", sql.UniqueIdentifier, sessionId)
    .query(`
      SELECT ar.*, TRIM(s.first_name + ' ' + s.last_name) AS student_name, s.general_register_no AS gr_number
      FROM dbo.attendance_records ar
      JOIN dbo.students s ON s.id = ar.student_id
      WHERE ar.session_id = @session_id
      ORDER BY s.first_name, s.last_name
    `);
  res.json({ data: r.recordset, total: r.recordset.length });
}));

/* ─── Scores / Marks ──────────────────────────────────────────── */

router.get("/scores", asyncHandler(async (req, res) => {
  const sectionId = req.query.sectionId ? z.string().uuid().parse(req.query.sectionId) : null;
  const subjectId = req.query.subjectId ? z.string().uuid().parse(req.query.subjectId) : null;
  const examinationId = req.query.examinationId ? z.string().uuid().parse(req.query.examinationId) : null;
  const r = await (await getPool()).request()
    .input("section_id", sql.UniqueIdentifier, sectionId)
    .input("subject_id", sql.UniqueIdentifier, subjectId)
    .input("examination_id", sql.UniqueIdentifier, examinationId)
    .query(`
      SELECT gs.*, TRIM(s.first_name + ' ' + s.last_name) AS student_name,
             s.general_register_no AS gr_number, sub.name AS subject_name
      FROM dbo.grades_scores gs
      JOIN dbo.students s ON s.id = gs.student_id
      JOIN dbo.subjects sub ON sub.id = gs.subject_id
      WHERE (@section_id IS NULL OR gs.section_id = @section_id)
        AND (@subject_id IS NULL OR gs.subject_id = @subject_id)
        AND (@examination_id IS NULL OR gs.examination_id = @examination_id)
      ORDER BY gs.recorded_at DESC
    `);
  res.json({ data: r.recordset, total: r.recordset.length });
}));

router.post("/scores/bulk", requireRole("super_admin", "admin", "registrar", "teacher"), asyncHandler(async (req, res) => {
  const scores = z.array(z.object({
    studentId: z.string().uuid(),
    examinationId: z.string().uuid().optional().nullable(),
    subjectId: z.string().uuid(),
    obtainedMarks: z.number(),
    totalMarks: z.number().positive().default(100),
    grade: z.string().optional().nullable(),
    remarks: z.string().optional().nullable(),
  })).min(1).parse(req.body.scores ?? []);

  const pool = await getPool();
  const schoolId = await resolveSchoolId(null);
  const ayId = await resolveCurrentAcademicYearId(pool, schoolId);

  // Detect column names in grades_scores
  const colCheck = await pool.request().query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='grades_scores' AND TABLE_SCHEMA='dbo'");
  const existCols = new Set(colCheck.recordset.map((c) => c.COLUMN_NAME));
  const hasExamId = existCols.has("examination_id");
  const hasObtained = existCols.has("obtained_marks");
  const scoreColName = hasObtained ? "obtained_marks" : "score";
  const totalColName = existCols.has("total_marks") ? "total_marks" : "max_score";

  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    for (const sc of scores) {
      const req2 = new sql.Request(tx)
        .input("student_id", sql.UniqueIdentifier, sc.studentId)
        .input("subject_id", sql.UniqueIdentifier, sc.subjectId)
        .input("academic_year_id", sql.UniqueIdentifier, ayId)
        .input("obtained_marks", sql.Decimal(6, 2), sc.obtainedMarks)
        .input("total_marks", sql.Decimal(6, 2), sc.totalMarks)
        .input("grade", sql.NVarChar(8), sc.grade ?? null)
        .input("remarks", sql.NVarChar(sql.MAX), sc.remarks ?? null);

      const cols = ["student_id", "subject_id", "academic_year_id", scoreColName, totalColName];
      const vals = ["@student_id", "@subject_id", "@academic_year_id", "@obtained_marks", "@total_marks"];
      if (hasExamId) { cols.push("examination_id"); vals.push("@exam_id"); req2.input("exam_id", sql.UniqueIdentifier, sc.examinationId ?? null); }
      if (existCols.has("grade")) { cols.push("grade"); vals.push("@grade"); }
      if (existCols.has("remarks")) { cols.push("remarks"); vals.push("@remarks"); }

      await req2.query(`
        MERGE dbo.grades_scores AS t
        USING (SELECT @student_id AS student_id, @subject_id AS subject_id, @academic_year_id AS ay_id${hasExamId ? ", @exam_id AS exam_id" : ""}) AS src
        ON (t.student_id = src.student_id AND t.subject_id = src.subject_id AND t.academic_year_id = src.ay_id${hasExamId ? " AND (t.examination_id = src.exam_id OR (t.examination_id IS NULL AND src.exam_id IS NULL))" : ""})
        WHEN MATCHED THEN UPDATE SET ${scoreColName} = @obtained_marks, ${totalColName} = @total_marks${existCols.has("grade") ? ", grade = @grade" : ""}${existCols.has("remarks") ? ", remarks = @remarks" : ""}
        WHEN NOT MATCHED THEN INSERT (${cols.join(",")}) VALUES (${vals.join(",")});
      `);
    }
    await tx.commit();
    await writeAudit({ userId: req.user.id, action: "BULK_UPSERT", entityTable: "grades_scores", newData: { count: scores.length } });
    res.json({ success: true, count: scores.length });
  } catch (e) { await tx.rollback(); throw e; }
}));

router.post("/scores", requireRole("super_admin", "admin", "registrar", "teacher"), asyncHandler(async (req, res) => {
  // Single score entry — wrap in bulk handler
  const sc = z.object({
    studentId: z.string().uuid(),
    examinationId: z.string().uuid().optional().nullable(),
    subjectId: z.string().uuid(),
    obtainedMarks: z.number(),
    totalMarks: z.number().positive().default(100),
    grade: z.string().optional().nullable(),
    remarks: z.string().optional().nullable(),
  }).parse(req.body);
  const pool = await getPool();
  const schoolId = await resolveSchoolId(null);
  const ayId = await resolveCurrentAcademicYearId(pool, schoolId);
  const colCheck = await pool.request().query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='grades_scores' AND TABLE_SCHEMA='dbo'");
  const existCols = new Set(colCheck.recordset.map((c) => c.COLUMN_NAME));
  const hasExamId = existCols.has("examination_id");
  const scoreColName = existCols.has("obtained_marks") ? "obtained_marks" : "score";
  const totalColName = existCols.has("total_marks") ? "total_marks" : "max_score";
  const cols = ["student_id", "subject_id", "academic_year_id", scoreColName, totalColName];
  const vals = ["@student_id", "@subject_id", "@academic_year_id", "@obtained_marks", "@total_marks"];
  const r2 = pool.request()
    .input("student_id", sql.UniqueIdentifier, sc.studentId)
    .input("subject_id", sql.UniqueIdentifier, sc.subjectId)
    .input("academic_year_id", sql.UniqueIdentifier, ayId)
    .input("obtained_marks", sql.Decimal(6, 2), sc.obtainedMarks)
    .input("total_marks", sql.Decimal(6, 2), sc.totalMarks)
    .input("grade", sql.NVarChar(8), sc.grade ?? null)
    .input("remarks", sql.NVarChar(sql.MAX), sc.remarks ?? null);
  if (hasExamId) { cols.push("examination_id"); vals.push("@exam_id"); r2.input("exam_id", sql.UniqueIdentifier, sc.examinationId ?? null); }
  if (existCols.has("grade")) { cols.push("grade"); vals.push("@grade"); }
  if (existCols.has("remarks")) { cols.push("remarks"); vals.push("@remarks"); }
  const r = await r2.query(`INSERT INTO dbo.grades_scores (${cols.join(",")}) OUTPUT INSERTED.* VALUES (${vals.join(",")})`);
  await writeAudit({ userId: req.user.id, action: "INSERT", entityTable: "grades_scores", entityId: r.recordset[0].id, newData: r.recordset[0] });
  res.status(201).json(r.recordset[0]);
}));

module.exports = { academicRoutes: router };
