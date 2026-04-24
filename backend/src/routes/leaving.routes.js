const { Router } = require("express");
const { z } = require("zod");
const { asyncHandler } = require("../utils/asyncHandler");
const { getPool, sql } = require("../db/pool");
const { requireAuth, requireRole } = require("../middleware/auth");
const { writeAudit } = require("../services/audit");

const router = Router();
router.use(requireAuth);

const leavingSchema = z.object({
  studentId:         z.string().uuid(),
  academicYearId:    z.string().uuid().optional().nullable(),
  dateLeft:          z.string(),
  classLeftGradeId:  z.string().uuid().optional().nullable(),
  classStudyingSince:z.string().optional().nullable(),
  leavingSerialNo:   z.number().int().optional().nullable(),
  reason:            z.string().optional().nullable(),
  conduct:           z.string().max(64).optional().nullable(),
  progress:          z.string().max(64).optional().nullable(),
  remarks:           z.string().optional().nullable(),
  certificateIssuedAt: z.string().optional().nullable(),
}).strip();

const patchSchema = leavingSchema.partial().required({ studentId: true });

/* ─── List leaving records (optionally for one student) ───── */
router.get("/leaving-records", asyncHandler(async (req, res) => {
  const studentId = req.query.studentId ? z.string().uuid().parse(req.query.studentId) : null;
  const limit     = Math.min(Number(req.query.limit) || 50, 200);
  const r = await (await getPool()).request()
    .input("student_id", sql.UniqueIdentifier, studentId)
    .input("limit",      sql.Int, limit)
    .query(`
      SELECT TOP (@limit)
        lr.*,
        TRIM(s.first_name + ' ' + s.last_name) AS student_name,
        s.general_register_no AS gr_number,
        g.name AS grade_name
      FROM dbo.student_leaving_records lr
      JOIN dbo.students s ON s.id = lr.student_id
      LEFT JOIN dbo.grades g ON g.id = lr.class_left_grade_id
      WHERE (@student_id IS NULL OR lr.student_id = @student_id)
      ORDER BY lr.created_at DESC
    `);
  res.json({ data: r.recordset, total: r.recordset.length });
}));

/* ─── Get single leaving record ─────────────────────────── */
router.get("/leaving-records/:id", asyncHandler(async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  const r  = await (await getPool()).request()
    .input("id", sql.UniqueIdentifier, id)
    .query(`
      SELECT lr.*, TRIM(s.first_name + ' ' + s.last_name) AS student_name,
             s.general_register_no AS gr_number, s.father_name,
             s.caste, s.place_of_birth, s.date_of_birth, s.gender,
             s.admission_date, s.last_school_attended,
             g.name AS grade_name, g.name AS class_left_name,
             ay.label AS academic_year_label
      FROM dbo.student_leaving_records lr
      JOIN dbo.students s ON s.id = lr.student_id
      LEFT JOIN dbo.grades g ON g.id = lr.class_left_grade_id
      LEFT JOIN dbo.academic_years ay ON ay.id = lr.academic_year_id
      WHERE lr.id = @id
    `);
  if (!r.recordset[0]) return res.status(404).json({ message: "Leaving record not found" });
  res.json(r.recordset[0]);
}));

/* ─── Create leaving record ─────────────────────────────── */
router.post("/leaving-records", requireRole("super_admin", "admin", "registrar"), asyncHandler(async (req, res) => {
  const p = leavingSchema.parse(req.body);
  const pool = await getPool();

  // Optionally resolve current academic year
  let ayId = p.academicYearId;
  if (!ayId) {
    const ay = await pool.request().query("SELECT TOP 1 id FROM dbo.academic_years ORDER BY is_current DESC, start_date DESC");
    ayId = ay.recordset[0]?.id ?? null;
  }

  const r = await pool.request()
    .input("student_id",          sql.UniqueIdentifier, p.studentId)
    .input("academic_year_id",    sql.UniqueIdentifier, ayId ?? null)
    .input("date_left",           sql.Date,             p.dateLeft)
    .input("class_left_grade_id", sql.UniqueIdentifier, p.classLeftGradeId ?? null)
    .input("class_studying_since",sql.Date,             p.classStudyingSince ?? null)
    .input("leaving_serial_no",   sql.Int,              p.leavingSerialNo ?? null)
    .input("reason",              sql.NVarChar(sql.MAX),p.reason ?? null)
    .input("conduct",             sql.NVarChar(64),     p.conduct ?? null)
    .input("progress",            sql.NVarChar(64),     p.progress ?? null)
    .input("remarks",             sql.NVarChar(sql.MAX),p.remarks ?? null)
    .input("cert_issued_at",      sql.Date,             p.certificateIssuedAt ?? null)
    .query(`
      INSERT INTO dbo.student_leaving_records
        (student_id, academic_year_id, date_left, class_left_grade_id, class_studying_since,
         leaving_serial_no, reason, conduct, progress, remarks, certificate_issued_at)
      OUTPUT INSERTED.*
      VALUES (@student_id, @academic_year_id, @date_left, @class_left_grade_id, @class_studying_since,
              @leaving_serial_no, @reason, @conduct, @progress, @remarks, @cert_issued_at)
    `);

  // Update student status to withdrawn
  await pool.request().input("id", sql.UniqueIdentifier, p.studentId)
    .query("UPDATE dbo.students SET status = 'withdrawn', updated_at = SYSUTCDATETIME() WHERE id = @id AND status = 'active'");

  await writeAudit({ userId: req.user.id, action: "INSERT", entityTable: "student_leaving_records", entityId: r.recordset[0].id, newData: r.recordset[0] });
  res.status(201).json(r.recordset[0]);
}));

/* ─── Update leaving record ─────────────────────────────── */
router.patch("/leaving-records/:id", requireRole("super_admin", "admin", "registrar"), asyncHandler(async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  const p  = leavingSchema.partial().strip().parse(req.body);
  const pool = await getPool();
  const ex = (await pool.request().input("id", sql.UniqueIdentifier, id)
    .query("SELECT * FROM dbo.student_leaving_records WHERE id = @id")).recordset[0];
  if (!ex) return res.status(404).json({ message: "Record not found" });

  await pool.request()
    .input("id",                  sql.UniqueIdentifier, id)
    .input("date_left",           sql.Date,             p.dateLeft           ?? ex.date_left)
    .input("class_left_grade_id", sql.UniqueIdentifier, p.classLeftGradeId   !== undefined ? p.classLeftGradeId   : ex.class_left_grade_id)
    .input("class_studying_since",sql.Date,             p.classStudyingSince !== undefined ? p.classStudyingSince : ex.class_studying_since)
    .input("leaving_serial_no",   sql.Int,              p.leavingSerialNo    !== undefined ? p.leavingSerialNo    : ex.leaving_serial_no)
    .input("reason",              sql.NVarChar(sql.MAX),p.reason             !== undefined ? p.reason             : ex.reason)
    .input("conduct",             sql.NVarChar(64),     p.conduct            !== undefined ? p.conduct            : ex.conduct)
    .input("progress",            sql.NVarChar(64),     p.progress           !== undefined ? p.progress           : ex.progress)
    .input("remarks",             sql.NVarChar(sql.MAX),p.remarks            !== undefined ? p.remarks            : ex.remarks)
    .input("cert_issued_at",      sql.Date,             p.certificateIssuedAt!== undefined ? p.certificateIssuedAt: ex.certificate_issued_at)
    .query(`
      UPDATE dbo.student_leaving_records SET
        date_left = @date_left, class_left_grade_id = @class_left_grade_id,
        class_studying_since = @class_studying_since, leaving_serial_no = @leaving_serial_no,
        reason = @reason, conduct = @conduct, progress = @progress,
        remarks = @remarks, certificate_issued_at = @cert_issued_at
      WHERE id = @id
    `);
  await writeAudit({ userId: req.user.id, action: "UPDATE", entityTable: "student_leaving_records", entityId: id });
  res.json({ success: true });
}));

/* ─── Delete leaving record ─────────────────────────────── */
router.delete("/leaving-records/:id", requireRole("super_admin", "admin"), asyncHandler(async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  await (await getPool()).request().input("id", sql.UniqueIdentifier, id)
    .query("DELETE FROM dbo.student_leaving_records WHERE id = @id");
  await writeAudit({ userId: req.user.id, action: "DELETE", entityTable: "student_leaving_records", entityId: id });
  res.json({ success: true });
}));

module.exports = { leavingRoutes: router };
