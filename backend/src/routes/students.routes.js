const path = require("path");
const { Router } = require("express");
const { z } = require("zod");
const multer = require("multer");
const { asyncHandler } = require("../utils/asyncHandler");
const { getPool, sql } = require("../db/pool");
const { requireAuth, requireRole } = require("../middleware/auth");
const { writeAudit } = require("../services/audit");
const { resolveSchoolId } = require("../utils/schoolScope");

// Multer: store photos to disk, max 5 MB, images only
const photoStorage = multer.diskStorage({
  destination: path.join(__dirname, "..", "..", "uploads", "students"),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});
const uploadPhoto = multer({
  storage: photoStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\//i.test(file.mimetype)) cb(null, true);
    else cb(new Error("Only image files are allowed"));
  },
});

const router = Router();
router.use(requireAuth);

const STATUSES = ["active", "withdrawn", "alumni", "passed_out"];

const pagingSchema = z.object({
  page:      z.coerce.number().int().min(1).default(1),
  pageSize:  z.coerce.number().int().min(1).max(100).default(20),
  limit:     z.coerce.number().int().min(1).max(100).optional(),
  q:         z.string().optional().default(""),
  search:    z.string().optional().default(""),
  status:    z.enum(["active", "withdrawn", "alumni", "passed_out"]).optional(),
  sectionId: z.string().uuid().optional(),
}).strip();

// All fields that can be set on a student (admission or update)
const studentBaseSchema = z.object({
  // Identifiers
  generalRegisterNo:   z.string().max(64).nullable().optional(),
  grNumber:            z.string().max(64).nullable().optional(),
  enrollmentNumber:    z.string().max(64).nullable().optional(),
  // Name
  firstName:           z.string().min(1).max(128),
  lastName:            z.string().min(1).max(128),
  // Family
  fatherName:          z.string().max(255).nullable().optional(),
  motherName:          z.string().max(255).nullable().optional(),
  guardianName:        z.string().max(255).nullable().optional(),
  guardianRelation:    z.string().max(64).nullable().optional(),
  // CNIC
  cnicFormB:           z.string().max(32).nullable().optional(),
  fatherCnic:          z.string().max(32).nullable().optional(),
  // Personal
  dateOfBirth:         z.string().nullable().optional(),
  gender:              z.string().max(16).nullable().optional(),
  caste:               z.string().max(128).nullable().optional(),
  religion:            z.string().max(64).nullable().optional(),
  nationality:         z.string().max(64).nullable().optional(),
  placeOfBirth:        z.string().max(255).nullable().optional(),
  // Contact
  phone:               z.string().max(32).nullable().optional(),
  email:               z.string().email().nullable().optional(),
  address:             z.string().nullable().optional(),
  // Academic
  admissionDate:       z.string().nullable().optional(),
  lastSchoolAttended:  z.string().max(255).nullable().optional(),
  admittedGradeId:     z.string().uuid().nullable().optional(),
  // Status
  status:              z.enum(["active", "withdrawn", "alumni", "passed_out"]).optional(),
  // Leaving / conduct fields
  conductOnLeaving:    z.string().max(64).nullable().optional(),
  progressOnLeaving:   z.string().max(64).nullable().optional(),
  reasonForLeaving:    z.string().nullable().optional(),
  // General Register columns (migration5)
  serialNo:            z.number().int().nullable().optional(),
  classStudyingSince:  z.string().nullable().optional(),
  dateOfLeaving:       z.string().nullable().optional(),
  remarks:             z.string().nullable().optional(),
  classLeftLabel:      z.string().max(64).nullable().optional(),
  // When provided on creation, auto-creates an enrollment for the student
  sectionId:           z.string().uuid().nullable().optional(),
  rollNumber:          z.string().max(32).nullable().optional(),
}).strip();

const studentCreateSchema = studentBaseSchema;
const studentPatchSchema = studentBaseSchema.partial();

function toOffset(page, pageSize) {
  return (page - 1) * pageSize;
}

/* ─── List students ─────────────────────────────────────────── */
router.get("/students", asyncHandler(async (req, res) => {
  const q = pagingSchema.parse(req.query);
  const pageSize = q.limit || q.pageSize;
  const pool = await getPool();
  const schoolId = await resolveSchoolId(req.user.schoolId);
  const offset = toOffset(q.page, pageSize);
  const searchTerm = (q.search || q.q).trim();

  const whereClause = `
    WHERE s.deleted_at IS NULL
      AND (@q = ''
        OR s.general_register_no LIKE @q + '%'
        OR s.first_name + ' ' + s.last_name LIKE '%' + @q + '%'
        OR s.enrollment_number LIKE @q + '%'
        OR ISNULL(s.father_name,'') LIKE '%' + @q + '%')
      AND (@school_id IS NULL OR s.school_id = @school_id)
      AND (@status IS NULL OR s.status = @status)
      AND (@section_id IS NULL OR s.id IN (
        SELECT student_id FROM dbo.student_enrollments WHERE section_id = @section_id
      ))
  `;

  const baseInputs = (req2) => req2
    .input("q",          sql.NVarChar(128), searchTerm)
    .input("school_id",  sql.UniqueIdentifier, schoolId)
    .input("status",     sql.NVarChar(24), q.status || null)
    .input("section_id", sql.UniqueIdentifier, q.sectionId || null);

  const countResult = await baseInputs(pool.request()).query(
    `SELECT COUNT(1) AS c FROM dbo.students s ${whereClause}`
  );
  // Inline offset/pageSize as literals — msnodesqlv8 ODBC driver misinterprets
  // parameterised FETCH NEXT @n as a cursor FETCH command (error 16950).
  const safeOffset   = Math.max(0, Number(offset)   || 0);
  const safePageSize = Math.max(1, Number(pageSize)  || 20);

  const rowsResult  = await baseInputs(pool.request())
    .query(`
      SELECT
        s.id, s.school_id,
        s.serial_no,
        s.general_register_no AS gr_number,
        s.general_register_no,
        s.enrollment_number,
        s.first_name, s.last_name, s.father_name,
        s.date_of_birth, s.gender, s.status,
        s.phone, s.address,
        s.admission_date, s.class_studying_since,
        s.photo_url, s.admitted_grade_id,
        s.created_at, s.updated_at,
        /* Use enrollment grade; fall back to admitted grade when no enrollment */
        COALESCE(cur_enr.grade_name, ag.name)   AS current_grade,
        cur_enr.section_name AS current_section,
        cur_enr.year_label   AS current_year,
        /* Flag so frontend can show "(Admitted)" label when no enrollment */
        CASE WHEN cur_enr.grade_name IS NULL AND ag.name IS NOT NULL THEN 1 ELSE 0 END AS grade_is_admitted_only,
        att.att_pct
      FROM dbo.students s
      LEFT JOIN dbo.grades ag ON ag.id = s.admitted_grade_id
      OUTER APPLY (
        SELECT TOP 1
          g.name   AS grade_name,
          sec.name AS section_name,
          ay.label AS year_label
        FROM dbo.student_enrollments se
        JOIN dbo.sections       sec ON sec.id = se.section_id
        JOIN dbo.grades         g   ON g.id   = sec.grade_id
        JOIN dbo.academic_years ay  ON ay.id  = se.academic_year_id
        WHERE se.student_id = s.id
        ORDER BY ay.start_date DESC
      ) cur_enr
      OUTER APPLY (
        SELECT
          CASE WHEN COUNT(ar.id) = 0 THEN NULL
               ELSE CAST(ROUND(100.0 * SUM(CASE WHEN ar.status = 'present' THEN 1 ELSE 0 END) / COUNT(ar.id), 1) AS NUMERIC(5,1))
          END AS att_pct
        FROM dbo.attendance_records ar
        WHERE ar.student_id = s.id
      ) att
      ${whereClause}
      ORDER BY
        CASE WHEN @q = '' THEN 0
             WHEN s.general_register_no = @q THEN 0
             WHEN s.general_register_no LIKE @q + '%' THEN 1
             ELSE 2 END,
        s.serial_no ASC, s.created_at DESC
      OFFSET ${safeOffset} ROWS FETCH NEXT ${safePageSize} ROWS ONLY
    `);

  res.json({ page: q.page, pageSize, total: Number(countResult.recordset[0].c || 0), data: rowsResult.recordset });
}));

/* ─── Students grouped by current grade / section ───────────── */
/* NOTE: must be defined BEFORE /students/:id so Express doesn't treat
   "by-class" as an :id parameter value and fail UUID validation.        */
router.get("/students/by-class", asyncHandler(async (req, res) => {
  const schoolId = await resolveSchoolId(req.user.schoolId);
  const pool = await getPool();

  const sectionsResult = await pool.request()
    .input("school_id", sql.UniqueIdentifier, schoolId)
    .query(`
      SELECT
        g.id          AS grade_id,
        g.name        AS grade_name,
        g.level_order,
        sec.id        AS section_id,
        sec.name      AS section_name,
        ay.id         AS academic_year_id,
        ay.label      AS academic_year_label,
        COUNT(se.id)  AS student_count
      FROM dbo.sections sec
      JOIN dbo.grades        g   ON g.id   = sec.grade_id
      JOIN dbo.academic_years ay  ON ay.id  = sec.academic_year_id
      LEFT JOIN dbo.student_enrollments se ON se.section_id = sec.id
      LEFT JOIN dbo.students stu ON stu.id = se.student_id AND stu.deleted_at IS NULL
      WHERE (g.school_id = @school_id OR @school_id IS NULL)
        AND ay.is_current = 1
      GROUP BY g.id, g.name, g.level_order, sec.id, sec.name, ay.id, ay.label
      ORDER BY ISNULL(g.level_order, 999), g.name, sec.name
    `);

  if (!sectionsResult.recordset.length) {
    return res.json({ groups: [] });
  }

  const groups = [];
  for (const sec of sectionsResult.recordset) {
    const studentsResult = await pool.request()
      .input("section_id", sql.UniqueIdentifier, sec.section_id)
      .query(`
        SELECT
          stu.id, stu.serial_no,
          stu.general_register_no AS gr_number,
          stu.enrollment_number,
          stu.first_name, stu.last_name,
          stu.father_name,
          stu.date_of_birth, stu.gender,
          stu.phone, stu.status,
          stu.admission_date,
          stu.photo_url,
          stu.class_studying_since,
          se.roll_number,
          att.att_pct
        FROM dbo.student_enrollments se
        JOIN dbo.students stu ON stu.id = se.student_id AND stu.deleted_at IS NULL
        OUTER APPLY (
          SELECT
            CASE WHEN COUNT(ar.id) = 0 THEN NULL
                 ELSE CAST(ROUND(100.0 * SUM(CASE WHEN ar.status='present' THEN 1 ELSE 0 END) / COUNT(ar.id), 1) AS NUMERIC(5,1))
            END AS att_pct
          FROM dbo.attendance_records ar
          WHERE ar.student_id = stu.id
        ) att
        WHERE se.section_id = @section_id
        ORDER BY stu.serial_no, stu.first_name
      `);
    groups.push({
      grade_id:            sec.grade_id,
      grade_name:          sec.grade_name,
      section_id:          sec.section_id,
      section_name:        sec.section_name,
      academic_year_id:    sec.academic_year_id,
      academic_year_label: sec.academic_year_label,
      student_count:       studentsResult.recordset.length,
      students:            studentsResult.recordset,
    });
  }

  res.json({ groups });
}));

/* ─── Single student detail ─────────────────────────────────── */
router.get("/students/:id", asyncHandler(async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  const pool = await getPool();

  const result = await pool.request().input("id", sql.UniqueIdentifier, id)
    .query(`
      SELECT TOP 1 s.*, ag.name AS admitted_grade_name
      FROM dbo.students s
      LEFT JOIN dbo.grades ag ON ag.id = s.admitted_grade_id
      WHERE s.id = @id AND s.deleted_at IS NULL
    `);
  const student = result.recordset[0];
  if (!student) return res.status(404).json({ message: "Student not found" });

  // alias gr_number
  student.gr_number = student.general_register_no;

  const enrollments = await pool.request().input("student_id", sql.UniqueIdentifier, id).query(`
    SELECT se.*, sec.name AS section_name, g.name AS grade_name, ay.label AS academic_year_label
    FROM dbo.student_enrollments se
    JOIN dbo.sections sec ON sec.id = se.section_id
    JOIN dbo.grades g ON g.id = sec.grade_id
    JOIN dbo.academic_years ay ON ay.id = se.academic_year_id
    WHERE se.student_id = @student_id
    ORDER BY ay.start_date DESC
  `);

  const leaving = await pool.request().input("student_id", sql.UniqueIdentifier, id)
    .query("SELECT * FROM dbo.student_leaving_records WHERE student_id = @student_id ORDER BY created_at DESC");

  const attResult = await pool.request().input("student_id", sql.UniqueIdentifier, id)
    .query(`
      SELECT
        COUNT(ar.id) AS total_sessions,
        SUM(CASE WHEN ar.status = 'present' THEN 1 ELSE 0 END) AS present_count,
        SUM(CASE WHEN ar.status = 'absent'  THEN 1 ELSE 0 END) AS absent_count,
        CASE WHEN COUNT(ar.id) = 0 THEN NULL
             ELSE CAST(ROUND(100.0 * SUM(CASE WHEN ar.status = 'present' THEN 1 ELSE 0 END) / COUNT(ar.id), 1) AS NUMERIC(5,1))
        END AS att_pct
      FROM dbo.attendance_records ar
      WHERE ar.student_id = @student_id
    `);

  res.json({
    student,
    enrollments: enrollments.recordset,
    leavingRecords: leaving.recordset,
    attendance: attResult.recordset[0] || { total_sessions: 0, present_count: 0, absent_count: 0, att_pct: null },
  });
}));

/* ─── Admit (create) student ────────────────────────────────── */
router.post("/students", requireRole("super_admin", "admin", "registrar"), asyncHandler(async (req, res) => {
  const p = studentCreateSchema.parse(req.body);
  const schoolId = await resolveSchoolId(req.user.schoolId);
  const pool = await getPool();
  const grNo    = p.grNumber ?? p.generalRegisterNo ?? null;
  const enrollNo = p.enrollmentNumber?.trim() || `ENR-${Date.now()}`;

  // Auto-assign serial_no if not provided (next integer for this school)
  let autoSerialNo = p.serialNo ?? null;
  if (!autoSerialNo) {
    const snRes = await pool.request().input("sid", sql.UniqueIdentifier, schoolId)
      .query("SELECT ISNULL(MAX(serial_no), 0) + 1 AS next_sn FROM dbo.students WHERE school_id = @sid");
    autoSerialNo = snRes.recordset[0]?.next_sn ?? 1;
  }
  // Override p.serialNo so addOptionalStudentInputs picks it up
  p.serialNo = autoSerialNo;

  // Detect optional columns added by migration
  const optCols = await detectOptionalStudentCols(pool);

  const req2 = pool.request()
    .input("school_id",           sql.UniqueIdentifier, schoolId)
    .input("general_register_no", sql.NVarChar(64),  grNo)
    .input("enrollment_number",   sql.NVarChar(64),  enrollNo)
    .input("first_name",          sql.NVarChar(128), p.firstName)
    .input("last_name",           sql.NVarChar(128), p.lastName)
    .input("father_name",         sql.NVarChar(255), p.fatherName ?? null)
    .input("cnic_form_b",         sql.NVarChar(32),  p.cnicFormB ?? null)
    .input("father_cnic",         sql.NVarChar(32),  p.fatherCnic ?? null)
    .input("date_of_birth",       sql.Date,          p.dateOfBirth ?? null)
    .input("gender",              sql.NVarChar(16),  p.gender ?? null)
    .input("caste",               sql.NVarChar(128), p.caste ?? null)
    .input("religion",            sql.NVarChar(64),  p.religion ?? null)
    .input("place_of_birth",      sql.NVarChar(255), p.placeOfBirth ?? null)
    .input("phone",               sql.NVarChar(32),  p.phone ?? null)
    .input("email",               sql.NVarChar(255), p.email ?? null)
    .input("address",             sql.NVarChar(sql.MAX), p.address ?? null)
    .input("admission_date",      sql.Date,          p.admissionDate ?? null)
    .input("last_school_attended",sql.NVarChar(255), p.lastSchoolAttended ?? null)
    .input("admitted_grade_id",   sql.UniqueIdentifier, p.admittedGradeId ?? null)
    .input("status",              sql.NVarChar(24),  p.status || "active");

  const cols = [
    "school_id","general_register_no","enrollment_number","first_name","last_name","father_name",
    "cnic_form_b","father_cnic","date_of_birth","gender","caste","religion","place_of_birth",
    "phone","email","address","admission_date","last_school_attended","admitted_grade_id","status"
  ];
  const vals = [
    "@school_id","@general_register_no","@enrollment_number","@first_name","@last_name","@father_name",
    "@cnic_form_b","@father_cnic","@date_of_birth","@gender","@caste","@religion","@place_of_birth",
    "@phone","@email","@address","@admission_date","@last_school_attended","@admitted_grade_id","@status"
  ];

  addOptionalStudentInputs(req2, p, optCols, cols, vals);

  const r = await req2.query(`INSERT INTO dbo.students (${cols.join(",")}) OUTPUT INSERTED.* VALUES (${vals.join(",")})`);
  const student = r.recordset[0];
  student.gr_number = student.general_register_no;
  await writeAudit({ userId: req.user.id, action: "INSERT", entityTable: "students", entityId: student.id, newData: student });

  // Auto-create enrollment when a section is provided at admission time
  if (p.sectionId) {
    try {
      const ayId = await (async () => {
        const ay = await pool.request().input("sid", sql.UniqueIdentifier, schoolId)
          .query("SELECT TOP 1 id FROM dbo.academic_years WHERE school_id = @sid ORDER BY is_current DESC, start_date DESC");
        return ay.recordset[0]?.id ?? null;
      })();
      if (ayId) {
        const enrReq = pool.request()
          .input("student_id", sql.UniqueIdentifier, student.id)
          .input("section_id", sql.UniqueIdentifier, p.sectionId)
          .input("academic_year_id", sql.UniqueIdentifier, ayId)
          .input("roll_number", sql.NVarChar(32), p.rollNumber ?? null)
          .input("enrolled_at", sql.Date, p.admissionDate ?? null);
        const enrRes = await enrReq.query(`
          INSERT INTO dbo.student_enrollments (student_id, section_id, academic_year_id, roll_number, enrolled_at)
          OUTPUT INSERTED.*
          VALUES (@student_id, @section_id, @academic_year_id, @roll_number, ISNULL(@enrolled_at, CONVERT(date, GETDATE())))
        `);
        await writeAudit({ userId: req.user.id, action: "INSERT", entityTable: "student_enrollments", entityId: enrRes.recordset[0].id, newData: enrRes.recordset[0] });
        student.auto_enrollment_id = enrRes.recordset[0].id;
      }
    } catch (enrollErr) {
      // Non-fatal — student is already created; log the failure but don't reject
      console.error("[WARN] Auto-enrollment failed:", enrollErr?.message ?? enrollErr);
    }
  }

  res.status(201).json(student);
}));

/* ─── Update student ────────────────────────────────────────── */
router.patch("/students/:id", requireRole("super_admin", "admin", "registrar"), asyncHandler(async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  const p  = studentPatchSchema.parse(req.body);
  const pool = await getPool();

  const oldResult = await pool.request().input("id", sql.UniqueIdentifier, id)
    .query("SELECT TOP 1 * FROM dbo.students WHERE id = @id AND deleted_at IS NULL");
  const oldRow = oldResult.recordset[0];
  if (!oldRow) return res.status(404).json({ message: "Student not found" });

  const merged = {
    ...oldRow,
    general_register_no:  p.grNumber ?? p.generalRegisterNo ?? oldRow.general_register_no,
    enrollment_number:    p.enrollmentNumber ?? oldRow.enrollment_number,
    first_name:           p.firstName ?? oldRow.first_name,
    last_name:            p.lastName  ?? oldRow.last_name,
    father_name:          p.fatherName          !== undefined ? p.fatherName          : oldRow.father_name,
    cnic_form_b:          p.cnicFormB           !== undefined ? p.cnicFormB           : oldRow.cnic_form_b,
    father_cnic:          p.fatherCnic          !== undefined ? p.fatherCnic          : oldRow.father_cnic,
    date_of_birth:        p.dateOfBirth         !== undefined ? p.dateOfBirth         : oldRow.date_of_birth,
    gender:               p.gender              !== undefined ? p.gender              : oldRow.gender,
    caste:                p.caste               !== undefined ? p.caste               : oldRow.caste,
    religion:             p.religion            !== undefined ? p.religion            : oldRow.religion,
    place_of_birth:       p.placeOfBirth        !== undefined ? p.placeOfBirth        : oldRow.place_of_birth,
    phone:                p.phone               !== undefined ? p.phone               : oldRow.phone,
    email:                p.email               !== undefined ? p.email               : oldRow.email,
    address:              p.address             !== undefined ? p.address             : oldRow.address,
    admission_date:       p.admissionDate       !== undefined ? p.admissionDate       : oldRow.admission_date,
    last_school_attended: p.lastSchoolAttended  !== undefined ? p.lastSchoolAttended  : oldRow.last_school_attended,
    admitted_grade_id:    p.admittedGradeId     !== undefined ? p.admittedGradeId     : oldRow.admitted_grade_id,
    status:               p.status              ?? oldRow.status,
  };

  // Detect optional columns for PATCH too
  const patchOptCols = await detectOptionalStudentCols(pool);
  const optMerge = (key, col) => patchOptCols.has(col) ? (p[key] !== undefined ? p[key] : oldRow[col]) : undefined;

  const upReq = pool.request()
    .input("id",                   sql.UniqueIdentifier, id)
    .input("general_register_no",  sql.NVarChar(64),     merged.general_register_no)
    .input("enrollment_number",    sql.NVarChar(64),     merged.enrollment_number)
    .input("first_name",           sql.NVarChar(128),    merged.first_name)
    .input("last_name",            sql.NVarChar(128),    merged.last_name)
    .input("father_name",          sql.NVarChar(255),    merged.father_name)
    .input("cnic_form_b",          sql.NVarChar(32),     merged.cnic_form_b)
    .input("father_cnic",          sql.NVarChar(32),     merged.father_cnic)
    .input("date_of_birth",        sql.Date,             merged.date_of_birth)
    .input("gender",               sql.NVarChar(16),     merged.gender)
    .input("caste",                sql.NVarChar(128),    merged.caste)
    .input("religion",             sql.NVarChar(64),     merged.religion)
    .input("place_of_birth",       sql.NVarChar(255),    merged.place_of_birth)
    .input("phone",                sql.NVarChar(32),     merged.phone)
    .input("email",                sql.NVarChar(255),    merged.email)
    .input("address",              sql.NVarChar(sql.MAX),merged.address)
    .input("admission_date",       sql.Date,             merged.admission_date)
    .input("last_school_attended", sql.NVarChar(255),    merged.last_school_attended)
    .input("admitted_grade_id",    sql.UniqueIdentifier, merged.admitted_grade_id)
    .input("status",               sql.NVarChar(24),     merged.status);

  // Optional columns
  let optSets = "";
  const optPatchMap = [
    ["mother_name",         "motherName",         sql.NVarChar(255)],
    ["guardian_name",       "guardianName",        sql.NVarChar(255)],
    ["guardian_relation",   "guardianRelation",    sql.NVarChar(64)],
    ["nationality",         "nationality",         sql.NVarChar(64)],
    ["conduct_on_leaving",  "conductOnLeaving",    sql.NVarChar(64)],
    ["progress_on_leaving", "progressOnLeaving",   sql.NVarChar(64)],
    ["reason_for_leaving",  "reasonForLeaving",    sql.NVarChar(sql.MAX)],
    ["serial_no",           "serialNo",            sql.Int],
    ["class_studying_since","classStudyingSince",  sql.Date],
    ["date_of_leaving",     "dateOfLeaving",       sql.Date],
    ["remarks",             "remarks",             sql.NVarChar(sql.MAX)],
    ["class_left_label",    "classLeftLabel",      sql.NVarChar(64)],
  ];
  for (const [col, key, type] of optPatchMap) {
    if (patchOptCols.has(col)) {
      const val = p[key] !== undefined ? p[key] : oldRow[col];
      upReq.input(col, type, val ?? null);
      optSets += `, ${col} = @${col}`;
    }
  }

  const updated = await upReq.query(`
      UPDATE dbo.students SET
        general_register_no   = @general_register_no,
        enrollment_number     = @enrollment_number,
        first_name            = @first_name,
        last_name             = @last_name,
        father_name           = @father_name,
        cnic_form_b           = @cnic_form_b,
        father_cnic           = @father_cnic,
        date_of_birth         = @date_of_birth,
        gender                = @gender,
        caste                 = @caste,
        religion              = @religion,
        place_of_birth        = @place_of_birth,
        phone                 = @phone,
        email                 = @email,
        address               = @address,
        admission_date        = @admission_date,
        last_school_attended  = @last_school_attended,
        admitted_grade_id     = @admitted_grade_id,
        status                = @status
        ${optSets},
        updated_at            = SYSUTCDATETIME()
      OUTPUT INSERTED.*
      WHERE id = @id AND deleted_at IS NULL
    `);

  updated.recordset[0].gr_number = updated.recordset[0].general_register_no;
  await writeAudit({ userId: req.user.id, action: "UPDATE", entityTable: "students", entityId: id, oldData: oldRow, newData: updated.recordset[0] });
  res.json(updated.recordset[0]);
}));

/* ─── Soft-delete student ───────────────────────────────────── */
router.delete("/students/:id", requireRole("super_admin", "admin"), asyncHandler(async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  const pool = await getPool();
  const oldResult = await pool.request().input("id", sql.UniqueIdentifier, id)
    .query("SELECT TOP 1 * FROM dbo.students WHERE id = @id AND deleted_at IS NULL");
  if (!oldResult.recordset[0]) return res.status(404).json({ message: "Student not found" });
  await pool.request().input("id", sql.UniqueIdentifier, id)
    .query("UPDATE dbo.students SET deleted_at = SYSUTCDATETIME(), status = 'withdrawn', updated_at = SYSUTCDATETIME() WHERE id = @id");
  await writeAudit({ userId: req.user.id, action: "DELETE", entityTable: "students", entityId: id, oldData: oldResult.recordset[0] });
  res.json({ success: true });
}));

/* ─── Helpers ───────────────────────────────────────────────── */
async function detectOptionalStudentCols(pool) {
  const r = await pool.request().query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='students' AND TABLE_SCHEMA='dbo'
     AND COLUMN_NAME IN (
       'mother_name','guardian_name','guardian_relation','nationality',
       'conduct_on_leaving','progress_on_leaving','reason_for_leaving',
       'serial_no','class_studying_since','date_of_leaving','remarks','class_left_label'
     )`
  );
  return new Set(r.recordset.map((c) => c.COLUMN_NAME));
}

function addOptionalStudentInputs(req2, p, optCols, cols, vals) {
  const map = {
    mother_name:          ["motherName",          sql.NVarChar(255)],
    guardian_name:        ["guardianName",         sql.NVarChar(255)],
    guardian_relation:    ["guardianRelation",     sql.NVarChar(64)],
    nationality:          ["nationality",          sql.NVarChar(64)],
    conduct_on_leaving:   ["conductOnLeaving",     sql.NVarChar(64)],
    progress_on_leaving:  ["progressOnLeaving",    sql.NVarChar(64)],
    reason_for_leaving:   ["reasonForLeaving",     sql.NVarChar(sql.MAX)],
    serial_no:            ["serialNo",             sql.Int],
    class_studying_since: ["classStudyingSince",   sql.Date],
    date_of_leaving:      ["dateOfLeaving",        sql.Date],
    remarks:              ["remarks",              sql.NVarChar(sql.MAX)],
    class_left_label:     ["classLeftLabel",       sql.NVarChar(64)],
  };
  for (const [col, [prop, type]] of Object.entries(map)) {
    if (optCols.has(col)) {
      req2.input(col, type, p[prop] ?? null);
      cols.push(col);
      vals.push(`@${col}`);
    }
  }
}

/* ─── Photo upload ───────────────────────────────────────────── */
router.post("/students/:id/photo", uploadPhoto.single("photo"), asyncHandler(async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  if (!req.file) return res.status(400).json({ message: "No file uploaded" });

  const photoUrl = `/uploads/students/${req.file.filename}`;
  const pool = await getPool();
  await pool.request()
    .input("id",  sql.UniqueIdentifier, id)
    .input("url", sql.NVarChar(sql.MAX), photoUrl)
    .query("UPDATE dbo.students SET photo_url = @url, updated_at = SYSUTCDATETIME() WHERE id = @id AND deleted_at IS NULL");

  await writeAudit({ userId: req.user.id, action: "UPDATE", entityTable: "students", entityId: id, newData: { photo_url: photoUrl } });
  res.json({ photo_url: photoUrl });
}));

router.delete("/students/:id/photo", asyncHandler(async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  const pool = await getPool();
  await pool.request()
    .input("id", sql.UniqueIdentifier, id)
    .query("UPDATE dbo.students SET photo_url = NULL, updated_at = SYSUTCDATETIME() WHERE id = @id AND deleted_at IS NULL");
  res.json({ success: true });
}));

module.exports = { studentRoutes: router };
