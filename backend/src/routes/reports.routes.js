const { Router } = require("express");
const { z } = require("zod");
const { asyncHandler } = require("../utils/asyncHandler");
const { getPool, sql } = require("../db/pool");
const { requireAuth } = require("../middleware/auth");
const { fmt, dateToWords, CERT_CSS } = require("../utils/certHelpers");

const router = Router();
router.use(requireAuth);

const SCHOOL = "Government Boys Higher Secondary School, Bhiria City";
const ADDR   = "Bhiria City, District Naushahro Feroze, Sindh";

/* ═══════════════════════════════════════════════════════════
   GENERAL REGISTER (Printable ledger)
   ═══════════════════════════════════════════════════════════ */
router.get("/reports/general-register", asyncHandler(async (req, res) => {
  const gradeId    = req.query.gradeId    ? z.string().uuid().parse(req.query.gradeId)    : null;
  const sectionId  = req.query.sectionId  ? z.string().uuid().parse(req.query.sectionId)  : null;
  const ayId       = req.query.academicYearId ? z.string().uuid().parse(req.query.academicYearId) : null;
  const grFrom     = req.query.grFrom     ? String(req.query.grFrom)  : null;
  const grTo       = req.query.grTo       ? String(req.query.grTo)    : null;

  const pool = await getPool();
  const rows = await pool.request()
    .input("grade_id",   sql.UniqueIdentifier, gradeId)
    .input("section_id", sql.UniqueIdentifier, sectionId)
    .input("ay_id",      sql.UniqueIdentifier, ayId)
    .input("gr_from",    sql.NVarChar(64), grFrom)
    .input("gr_to",      sql.NVarChar(64), grTo)
    .query(`
      SELECT
        s.general_register_no AS gr_number,
        s.serial_no,
        TRIM(s.first_name+' '+s.last_name) AS student_name,
        s.father_name, s.caste, s.religion,
        s.date_of_birth, s.place_of_birth,
        s.admission_date, s.last_school_attended,
        s.class_studying_since,
        s.status,
        /* Latest enrollment (or AY-filtered) — ONE row per student via OUTER APPLY */
        enr.grade_name, enr.section_name, enr.roll_number, enr.ay_label,
        /* Admitted grade as fallback when no enrollment */
        COALESCE(enr.grade_name, ag.name) AS display_grade,
        /* Latest leaving record */
        lr.date_left, lr.reason AS leaving_reason, lr.conduct, lr.progress,
        lr.remarks AS leaving_remarks
      FROM dbo.students s
      /* Admitted grade fallback */
      LEFT JOIN dbo.grades ag ON ag.id = s.admitted_grade_id
      /* Latest matching enrollment — OUTER APPLY prevents duplicate rows */
      OUTER APPLY (
        SELECT TOP 1
          g.name  AS grade_name,
          sec.name AS section_name,
          ay.label AS ay_label,
          se.roll_number
        FROM dbo.student_enrollments se
        JOIN dbo.sections       sec ON sec.id = se.section_id
        JOIN dbo.grades         g   ON g.id   = sec.grade_id
        JOIN dbo.academic_years ay  ON ay.id  = se.academic_year_id
        WHERE se.student_id = s.id
          AND (@ay_id IS NULL OR se.academic_year_id = @ay_id)
        ORDER BY ay.start_date DESC
      ) enr
      /* Latest leaving record — OUTER APPLY prevents duplicate rows */
      OUTER APPLY (
        SELECT TOP 1 date_left, reason, conduct, progress, remarks
        FROM dbo.student_leaving_records
        WHERE student_id = s.id
        ORDER BY created_at DESC
      ) lr
      WHERE s.deleted_at IS NULL
        AND (@grade_id   IS NULL OR enr.grade_name IS NOT NULL AND EXISTS (
              SELECT 1 FROM dbo.student_enrollments se2
              JOIN dbo.sections sec2 ON sec2.id = se2.section_id
              WHERE se2.student_id = s.id AND sec2.grade_id = @grade_id
                AND (@ay_id IS NULL OR se2.academic_year_id = @ay_id)
            ))
        AND (@section_id IS NULL OR EXISTS (
              SELECT 1 FROM dbo.student_enrollments se3
              WHERE se3.student_id = s.id AND se3.section_id = @section_id
                AND (@ay_id IS NULL OR se3.academic_year_id = @ay_id)
            ))
        AND (@gr_from IS NULL OR s.general_register_no >= @gr_from)
        AND (@gr_to   IS NULL OR s.general_register_no <= @gr_to)
      ORDER BY s.serial_no, s.general_register_no
    `);

  const tableRows = rows.recordset.map((r, i) => `
    <tr>
      <td>${r.serial_no || i + 1}</td>
      <td>${r.gr_number || "—"}</td>
      <td>${r.student_name}</td>
      <td>${r.father_name || "—"}</td>
      <td>${r.caste || "—"}</td>
      <td>${r.date_of_birth ? fmt(r.date_of_birth) : "—"}</td>
      <td>${r.place_of_birth || "—"}</td>
      <td>${r.admission_date ? fmt(r.admission_date) : "—"}</td>
      <td>${r.display_grade || r.grade_name || "—"}</td>
      <td>${r.section_name || "—"}</td>
      <td>${r.roll_number || "—"}</td>
      <td>${r.class_studying_since || "—"}</td>
      <td>${r.date_left ? fmt(r.date_left) : "—"}</td>
      <td>${r.leaving_reason || "—"}</td>
      <td>${r.conduct || "—"}</td>
      <td class="${r.status === "withdrawn" ? "badge-red" : "badge-green"}">${r.status}</td>
    </tr>`).join("");

  const html = `<!doctype html>
<html lang="en">
<head><meta charset="UTF-8"/><title>General Register — ${SCHOOL}</title>
<style>
  body { font-family: "Times New Roman", serif; margin: 10mm; font-size: 9pt; color: #111; }
  .header { text-align: center; margin-bottom: 6mm; }
  .school-name { font-size: 14pt; font-weight: bold; }
  .sub { font-size: 10pt; }
  .title { font-size: 13pt; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; margin: 4mm 0; text-decoration: underline; }
  table { width: 100%; border-collapse: collapse; font-size: 8pt; }
  th { background: #1a6b3a; color: #fff; padding: 5px 4px; text-align: center; }
  td { padding: 4px; border: 1px solid #ccc; vertical-align: top; }
  tr:nth-child(even) td { background: #f7fdf9; }
  .badge-red { color: #c00; font-weight: bold; }
  .badge-green { color: #1a6b3a; font-weight: bold; }
  .footer { margin-top: 8mm; display: flex; justify-content: space-between; font-size: 9pt; }
  @media print { body { margin: 5mm; } }
</style>
</head>
<body>
<div class="header">
  <div style="display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:3mm">
    <img src="${req.protocol}://${req.get("host")}/sindh-logo.png" width="50" height="50" alt="Govt of Sindh" style="border-radius:50%"/>
    <div>
      <div style="font-size:9pt">Government of Sindh — Education Department</div>
      <div class="school-name">${SCHOOL}</div>
      <div class="sub">${ADDR}</div>
    </div>
  </div>
  <div class="title">General Register / Admission Register</div>
  <div class="sub">Printed: ${new Date().toLocaleDateString("en-PK")}</div>
</div>
<table>
  <thead>
    <tr>
      <th>#</th><th>G.R. No.</th><th>Student Name</th><th>Father Name</th>
      <th>Caste</th><th>Date of Birth</th><th>Place of Birth</th>
      <th>Admission Date</th><th>Class</th><th>Section</th><th>Roll No</th>
      <th>Class Since</th><th>Date of Leaving</th><th>Reason</th><th>Conduct</th><th>Status</th>
    </tr>
  </thead>
  <tbody>${tableRows || "<tr><td colspan='16' style='text-align:center'>No records</td></tr>"}</tbody>
</table>
<div class="footer">
  <div>Total Records: <strong>${rows.recordset.length}</strong>&nbsp;(Class shown from latest enrollment; admitted class used as fallback)</div>
  <div>
    ______________________<br/>Class Teacher / In-Charge
  </div>
  <div>
    ______________________<br/>Head Master / Principal
  </div>
</div>
<script>window.onload=()=>window.print();</script>
</body>
</html>`;
  res.setHeader("Content-Type","text/html");
  res.send(html);
}));

/* ═══════════════════════════════════════════════════════════
   EXAM SLIPS (printable, 2 per page)
   ═══════════════════════════════════════════════════════════ */
router.get("/reports/exam-slips/:examId", asyncHandler(async (req, res) => {
  const examId    = z.string().uuid().parse(req.params.examId);
  const sectionId = req.query.sectionId ? z.string().uuid().parse(req.query.sectionId) : null;
  const pool      = await getPool();

  const exam = (await pool.request().input("id",sql.UniqueIdentifier,examId)
    .query(`SELECT e.*, COALESCE(e.title,e.name) AS title, ay.label AS ay_label
            FROM dbo.examinations e
            LEFT JOIN dbo.academic_years ay ON ay.id = e.academic_year_id
            WHERE e.id=@id`)).recordset[0];
  if (!exam) return res.status(404).json({message:"Examination not found"});

  const seats = await pool.request()
    .input("eid",sql.UniqueIdentifier,examId)
    .input("sid",sql.UniqueIdentifier,sectionId)
    .query(`
      SELECT es.seat_number,
             TRIM(s.first_name+' '+s.last_name) AS student_name,
             s.father_name, s.general_register_no AS gr_number,
             s.photo_url, sec.name AS section_name, g.name AS grade_name
      FROM dbo.examination_seats es
      JOIN dbo.students s ON s.id=es.student_id
      JOIN dbo.sections sec ON sec.id=es.section_id
      JOIN dbo.grades g ON g.id=sec.grade_id
      WHERE es.examination_id=@eid
        AND (@sid IS NULL OR es.section_id=@sid)
      ORDER BY es.seat_number
    `);

  const schedule = await pool.request()
    .input("eid",sql.UniqueIdentifier,examId)
    .input("sid",sql.UniqueIdentifier,sectionId)
    .query(`
      SELECT sl.exam_date, sl.time_start, sl.time_end, sub.name AS subject_name,
             DATENAME(WEEKDAY, sl.exam_date) AS day_name
      FROM dbo.examination_schedule_lines sl
      LEFT JOIN dbo.subjects sub ON sub.id=sl.subject_id
      WHERE sl.examination_id=@eid
        AND (@sid IS NULL OR sl.section_id=@sid)
      ORDER BY sl.exam_date, sl.sort_order
    `);

  const scheduleRows = schedule.recordset.map(l =>
    `<tr><td>${l.day_name||"—"}</td><td>${l.exam_date?fmt(l.exam_date):"—"}</td><td>${l.subject_name||"—"}</td><td>${l.time_start||"—"} – ${l.time_end||"—"}</td></tr>`
  ).join("") || "<tr><td colspan='4'>No datesheet lines</td></tr>";

  const slipHtml = seats.recordset.map(st => `
    <div class="slip">
      <div class="slip-header">
        <div class="slip-logo-row">
          <img src="/sindh-logo.png" width="40" height="40" alt="Govt of Sindh" style="border-radius:50%"/>
          <div>
            <div class="slip-school">${SCHOOL}</div>
            <div class="slip-addr">${ADDR}</div>
          </div>
        </div>
        <div class="slip-exam-title">${exam.title}${exam.ay_label ? " — " + exam.ay_label : ""}</div>
        <div class="slip-exam-sub">Admit Card / Exam Slip</div>
      </div>
      <div class="slip-fields">
        <div class="slip-row"><span class="sl">Seat No.</span><span class="sv seat-big">${st.seat_number}</span></div>
        <div class="slip-row"><span class="sl">G.R. No.</span><span class="sv">${st.gr_number||"—"}</span></div>
        <div class="slip-row"><span class="sl">Student Name</span><span class="sv">${st.student_name}</span></div>
        <div class="slip-row"><span class="sl">Father Name</span><span class="sv">${st.father_name||"—"}</span></div>
        <div class="slip-row"><span class="sl">Class / Section</span><span class="sv">${st.grade_name||"—"} — ${st.section_name||"—"}</span></div>
      </div>
      <table class="sched-table">
        <thead><tr><th>Day</th><th>Date</th><th>Subject</th><th>Time</th></tr></thead>
        <tbody>${scheduleRows}</tbody>
      </table>
      <div class="slip-footer">
        <div>_____________________<br/><small>Class Teacher</small></div>
        <div style="font-size:7pt;text-align:center;color:#aaa">This slip is required to enter the exam hall. Keep it safe.</div>
        <div>_____________________<br/><small>Principal</small></div>
      </div>
    </div>`).join("");

  const html = `<!doctype html>
<html lang="en">
<head><meta charset="UTF-8"/><title>Exam Slips — ${exam.title}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: "Times New Roman", serif; margin: 0; padding: 6mm; font-size: 9pt; background:#fff; }
  .slip-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; }
  .slip { border: 2px solid #1a6b3a; padding: 4mm; page-break-inside: avoid; }
  .slip-header { border-bottom: 1px solid #1a6b3a; padding-bottom: 2mm; margin-bottom: 2mm; }
  .slip-logo-row { display: flex; align-items: center; gap: 6px; margin-bottom: 2mm; }
  .slip-school { font-size: 10pt; font-weight: bold; color: #1a6b3a; }
  .slip-addr   { font-size: 7pt; color: #555; }
  .slip-exam-title { font-size: 10pt; font-weight: bold; text-align: center; margin-top: 2mm; }
  .slip-exam-sub   { font-size: 8pt; text-align: center; color: #555; }
  .slip-fields { margin: 2mm 0; }
  .slip-row    { display: flex; gap: 4px; margin-bottom: 1mm; }
  .sl  { width: 80px; font-size: 8pt; color: #555; flex-shrink: 0; }
  .sv  { font-weight: bold; font-size: 9pt; border-bottom: 1px solid #aaa; flex: 1; }
  .seat-big { font-size: 16pt; font-weight: 900; color: #1a6b3a; border: none; }
  .sched-table { width: 100%; border-collapse: collapse; font-size: 8pt; margin-top: 2mm; }
  .sched-table th { background: #1a6b3a; color: #fff; padding: 3px 4px; }
  .sched-table td { padding: 3px 4px; border-bottom: 1px solid #ddd; }
  .slip-footer { display: flex; justify-content: space-between; margin-top: 3mm; font-size: 8pt; text-align: center; }
  @media print {
    body { padding: 3mm; }
    .no-print { display: none; }
    .slip-grid { page-break-after: always; }
  }
</style>
</head>
<body>
  <div class="no-print" style="padding:8px;background:#e8f5ee;margin-bottom:8px;font-family:sans-serif;font-size:12px">
    <strong>${seats.recordset.length} exam slip(s)</strong> for exam: <strong>${exam.title}</strong>
    &nbsp; <button onclick="window.print()" style="background:#1a6b3a;color:#fff;border:none;padding:4px 12px;cursor:pointer">Print All</button>
  </div>
  <div class="slip-grid">${slipHtml || "<p>No seat assignments found for this examination.</p>"}</div>
</body>
</html>`;
  res.setHeader("Content-Type","text/html");
  res.send(html);
}));

/* ═══════════════════════════════════════════════════════════
   MARKSHEET / RESULT CARD (per student per exam)
   ═══════════════════════════════════════════════════════════ */
router.get("/reports/marksheet/:studentId", asyncHandler(async (req, res) => {
  const studentId  = z.string().uuid().parse(req.params.studentId);
  const examId     = req.query.examinationId ? z.string().uuid().parse(req.query.examinationId) : null;
  const pool = await getPool();

  const student = (await pool.request().input("id", sql.UniqueIdentifier, studentId)
    .query("SELECT *, general_register_no AS gr_number, TRIM(first_name+' '+last_name) AS full_name FROM dbo.students WHERE id=@id")).recordset[0];
  if (!student) return res.status(404).json({ message: "Student not found" });

  // Build absolute photo URL for embedding in the print page
  const photoAbsUrl = student.photo_url
    ? `${req.protocol}://${req.get("host")}${student.photo_url}`
    : null;

  const scores = await pool.request()
    .input("sid",   sql.UniqueIdentifier, studentId)
    .input("eid",   sql.UniqueIdentifier, examId)
    .query(`
      SELECT gs.id, sub.name AS subject_name, sub.code AS subject_code,
             COALESCE(gs.obtained_marks, gs.score) AS obtained_marks,
             COALESCE(gs.total_marks, gs.max_score, 100) AS total_marks,
             gs.grade, gs.remarks, gs.score_component,
             gss.passing_marks, gss.has_practical
      FROM dbo.grades_scores gs
      JOIN dbo.subjects sub ON sub.id = gs.subject_id
      LEFT JOIN dbo.sections sec ON sec.id = gs.section_id
      LEFT JOIN dbo.grade_subjects gss ON gss.subject_id = gs.subject_id AND gss.grade_id = sec.grade_id
      WHERE gs.student_id = @sid
        AND (@eid IS NULL OR gs.examination_id = @eid)
      ORDER BY sub.name, gs.score_component
    `);

  const exam = examId ? (await pool.request().input("id",sql.UniqueIdentifier,examId)
    .query("SELECT *, COALESCE(title,name) AS title FROM dbo.examinations WHERE id=@id")).recordset[0] : null;

  // Resolve student's class/section from latest enrollment (with admitted grade as fallback)
  const enrollmentInfo = (await pool.request().input("sid", sql.UniqueIdentifier, studentId).query(`
    SELECT TOP 1 g.name AS grade_name, sec.name AS section_name, ay.label AS ay_label
    FROM dbo.student_enrollments se
    JOIN dbo.sections sec ON sec.id = se.section_id
    JOIN dbo.grades   g   ON g.id   = sec.grade_id
    JOIN dbo.academic_years ay ON ay.id = se.academic_year_id
    WHERE se.student_id = @sid
    ORDER BY ay.start_date DESC
  `)).recordset[0] || null;

  // Admitted grade as fallback
  const admittedGrade = !enrollmentInfo && student.admitted_grade_id
    ? (await pool.request().input("gid", sql.UniqueIdentifier, student.admitted_grade_id)
        .query("SELECT name FROM dbo.grades WHERE id = @gid")).recordset[0]
    : null;

  const classDisplay = enrollmentInfo
    ? `${enrollmentInfo.grade_name}${enrollmentInfo.section_name ? " — " + enrollmentInfo.section_name : ""}`
    : (admittedGrade ? admittedGrade.name + " (Admitted)" : "—");

  // Aggregate theory + practical into combined
  const bySubject = {};
  for (const r of scores.recordset) {
    const key = r.subject_name;
    if (!bySubject[key]) {
      bySubject[key] = { subject: r.subject_name, theory: undefined, practical: undefined, total: 0, max: Number(r.total_marks)||100, passing: Number(r.passing_marks)||33, hasPractical: !!r.has_practical, grade: r.grade, status: "—" };
    }
    const marks = Number(r.obtained_marks) || 0;
    if (r.score_component === "practical") bySubject[key].practical = marks;
    else if (r.score_component === "theory") bySubject[key].theory = marks;
    else bySubject[key].total = marks;
  }
  // Compute combined totals
  for (const s of Object.values(bySubject)) {
    if (s.theory !== undefined || s.practical !== undefined) {
      s.total = (s.theory || 0) + (s.practical || 0);
    }
    s.status = s.total >= s.passing ? "Pass" : "Fail";
  }

  const rows = Object.values(bySubject);
  const grandTotal    = rows.reduce((a, r) => a + r.total, 0);
  const grandMax      = rows.reduce((a, r) => a + r.max, 0);
  const passCount     = rows.filter(r => r.status === "Pass").length;
  const overallResult = passCount === rows.length ? "PASS" : "FAIL";
  const percentage    = grandMax > 0 ? ((grandTotal / grandMax) * 100).toFixed(1) : "0";

  const tableRows = rows.map((r, i) => `
    <tr>
      <td>${i+1}</td>
      <td>${r.subject}</td>
      <td>${r.theory !== undefined ? r.theory : "—"}</td>
      <td>${r.hasPractical && r.practical !== undefined ? r.practical : "—"}</td>
      <td><strong>${r.total}</strong></td>
      <td>${r.max}</td>
      <td>${r.passing}</td>
      <td>${r.grade || "—"}</td>
      <td class="${r.status==="Pass"?"pass-cell":"fail-cell"}">${r.status}</td>
    </tr>`).join("");

  const html = `<!doctype html>
<html lang="en">
<head><meta charset="UTF-8"/><title>Marksheet — ${student.full_name}</title>
<style>
  body { font-family: "Times New Roman",serif; margin: 10mm; font-size: 10pt; color:#111; }
  .header { text-align:center; margin-bottom:6mm; }
  .school { font-size:15pt; font-weight:bold; color:#1a6b3a; }
  .addr   { font-size:9pt; color:#555; }
  .title  { font-size:14pt; font-weight:bold; letter-spacing:1px; margin:4mm 0; text-decoration:underline; }
  .student-header { display:flex; gap:6mm; align-items:flex-start; margin:4mm 0; }
  .student-photo { width:28mm; height:34mm; border:1.5px solid #1a6b3a; border-radius:3px; object-fit:cover; flex-shrink:0; }
  .student-photo-empty { width:28mm; height:34mm; border:1.5px dashed #aaa; border-radius:3px; display:flex; align-items:center; justify-content:center; background:#f7fdf9; font-size:8pt; color:#888; flex-shrink:0; }
  .student-info { display:grid; grid-template-columns:1fr 1fr; gap:4px; flex:1; font-size:10pt; }
  .si-row { display:flex; gap:6px; }
  .si-label { color:#555; width:130px; flex-shrink:0; }
  .si-val { font-weight:bold; border-bottom:1px solid #aaa; flex:1; }
  table { width:100%; border-collapse:collapse; margin:4mm 0; font-size:9.5pt; }
  th { background:#1a6b3a; color:#fff; padding:5px 6px; text-align:center; }
  td { padding:5px 6px; border:1px solid #ccc; text-align:center; }
  td:nth-child(2) { text-align:left; }
  .pass-cell { color:#1a6b3a; font-weight:bold; }
  .fail-cell { color:#c00;    font-weight:bold; }
  .summary { margin-top:4mm; font-size:11pt; }
  .result-box { display:inline-block; padding:6px 18px; border:2px solid; font-size:14pt; font-weight:bold; margin-top:4mm; }
  .result-pass { border-color:#1a6b3a; color:#1a6b3a; }
  .result-fail { border-color:#c00;    color:#c00; }
  .sigs { display:flex; justify-content:space-between; margin-top:14mm; }
  .sig-col { text-align:center; }
  .sig-line { border-top:1px solid #333; width:130px; margin:16mm auto 4px; }
  @media print { body { margin:5mm; } }
</style>
</head>
<body>
<div class="header">
  <div style="display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:3mm">
    <img src="${req.protocol}://${req.get("host")}/sindh-logo.png" width="55" height="55" alt="Govt of Sindh" style="border-radius:50%"/>
    <div>
      <div style="font-size:9pt;color:#555">Government of Sindh — Education Department</div>
      <div class="school">${SCHOOL}</div>
      <div class="addr">${ADDR}</div>
    </div>
  </div>
  <div class="title">RESULT CARD / MARKSHEET</div>
  ${exam ? `<div style="font-size:11pt">${exam.title}</div>` : ""}
  <div style="font-size:9pt;color:#888">Printed: ${new Date().toLocaleDateString("en-PK")}</div>
</div>

<div class="student-header">
  ${photoAbsUrl
    ? `<img src="${photoAbsUrl}" class="student-photo" alt="Student photo"/>`
    : `<div class="student-photo-empty">No Photo</div>`}
  <div class="student-info">
    <div class="si-row"><span class="si-label">Student Name</span><span class="si-val">${student.full_name}</span></div>
    <div class="si-row"><span class="si-label">G.R. No.</span><span class="si-val">${student.gr_number||"—"}</span></div>
    <div class="si-row"><span class="si-label">Father Name</span><span class="si-val">${student.father_name||"—"}</span></div>
    <div class="si-row"><span class="si-label">S.No.</span><span class="si-val">${student.serial_no||"—"}</span></div>
    <div class="si-row"><span class="si-label">Date of Birth</span><span class="si-val">${student.date_of_birth?fmt(student.date_of_birth):"—"}</span></div>
    <div class="si-row"><span class="si-label">Gender</span><span class="si-val">${student.gender||"—"}</span></div>
    <div class="si-row"><span class="si-label">Class / Section</span><span class="si-val">${classDisplay}</span></div>
    <div class="si-row"><span class="si-label">Admission Date</span><span class="si-val">${student.admission_date?fmt(student.admission_date):"—"}</span></div>
  </div>
</div>

<table>
  <thead>
    <tr><th>#</th><th>Subject</th><th>Theory</th><th>Practical</th><th>Total</th><th>Max</th><th>Passing</th><th>Grade</th><th>Result</th></tr>
  </thead>
  <tbody>
    ${tableRows || "<tr><td colspan='9' style='text-align:center;color:#888'>No score records found</td></tr>"}
  </tbody>
  <tfoot>
    <tr style="background:#f0f9f0;font-weight:bold">
      <td colspan="4" style="text-align:right">TOTAL</td>
      <td>${grandTotal}</td><td>${grandMax}</td><td colspan="2"></td>
      <td class="${overallResult==="PASS"?"pass-cell":"fail-cell"}">${overallResult}</td>
    </tr>
  </tfoot>
</table>

<div class="summary">
  Percentage: <strong>${percentage}%</strong> &nbsp;|&nbsp;
  Subjects Passed: <strong>${passCount} / ${rows.length}</strong>
  <div class="result-box result-${overallResult.toLowerCase()}">${overallResult}</div>
</div>

<div class="sigs">
  <div class="sig-col"><div class="sig-line"></div>Class Teacher</div>
  <div class="sig-col"><div class="sig-line"></div>Head Master / Principal</div>
</div>
<script>window.onload=()=>window.print();</script>
</body>
</html>`;
  res.setHeader("Content-Type","text/html");
  res.send(html);
}));

module.exports = { reportRoutes: router };
