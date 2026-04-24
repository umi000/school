const { Router } = require("express");
const { z } = require("zod");
const { asyncHandler } = require("../utils/asyncHandler");
const { getPool, sql } = require("../db/pool");
const { requireAuth, requireRole } = require("../middleware/auth");
const { writeAudit } = require("../services/audit");
const { resolveSchoolId } = require("../utils/schoolScope");
const { dateToWords, fmt, pronoun, CERT_CSS } = require("../utils/certHelpers");

const router = Router();
router.use(requireAuth);

const CERT_TYPES = ["character","pass_ssc","pass_hsc","school_leaving","custom"];

/* ─── Auto-resolve or create program ─────────────────────── */
async function resolveOrCreateProgram(pool, schoolId, certType) {
  const tpl = CERT_TYPES.includes(certType) ? certType : "character";
  const names = { character:"Character Certificate", pass_ssc:"Pass Certificate (SSC)", pass_hsc:"Pass Certificate (HSC)", school_leaving:"School Leaving Certificate", custom:"Custom Certificate" };
  const ex = await pool.request().input("s",sql.UniqueIdentifier,schoolId).input("t",sql.NVarChar(32),tpl)
    .query("SELECT TOP 1 id FROM dbo.certification_programs WHERE school_id=@s AND certificate_template=@t AND is_active=1");
  if (ex.recordset[0]) return ex.recordset[0].id;
  const cr = await pool.request()
    .input("s",sql.UniqueIdentifier,schoolId).input("code",sql.NVarChar(64),tpl.toUpperCase())
    .input("name",sql.NVarChar(255),names[tpl]).input("tpl",sql.NVarChar(32),tpl)
    .query("INSERT INTO dbo.certification_programs (school_id,code,name,certificate_template) OUTPUT INSERTED.id VALUES (@s,@code,@name,@tpl)");
  return cr.recordset[0].id;
}

/* ─── Programs CRUD ──────────────────────────────────────── */
router.get("/certificates/programs", asyncHandler(async (req, res) => {
  const schoolId = await resolveSchoolId(req.user.schoolId);
  const r = await (await getPool()).request().input("s",sql.UniqueIdentifier,schoolId)
    .query("SELECT *, certificate_template AS cert_type FROM dbo.certification_programs WHERE school_id=@s ORDER BY created_at DESC");
  res.json({ data: r.recordset, total: r.recordset.length });
}));

router.post("/certificates/programs", requireRole("super_admin","admin"), asyncHandler(async (req, res) => {
  const p = z.object({
    code:z.string().min(1).max(64).optional(), name:z.string().min(1).max(255),
    certType:z.string().optional(), certificateTemplate:z.string().optional(),
    description:z.string().nullable().optional(), issuingBody:z.string().nullable().optional(),
    isActive:z.boolean().default(true), gradeIds:z.array(z.string().uuid()).default([]),
  }).strip().parse(req.body);
  const tpl = p.certType ?? p.certificateTemplate ?? "character";
  const schoolId = await resolveSchoolId(req.user.schoolId);
  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const cr = await new sql.Request(tx)
      .input("s",sql.UniqueIdentifier,schoolId).input("code",sql.NVarChar(64),p.code??tpl.toUpperCase())
      .input("name",sql.NVarChar(255),p.name).input("tpl",sql.NVarChar(32),tpl)
      .input("desc",sql.NVarChar(sql.MAX),p.description??null).input("ib",sql.NVarChar(255),p.issuingBody??null)
      .input("act",sql.Bit,p.isActive?1:0)
      .query("INSERT INTO dbo.certification_programs (school_id,code,name,certificate_template,description,issuing_body,is_active) OUTPUT INSERTED.* VALUES (@s,@code,@name,@tpl,@desc,@ib,@act)");
    const prog = cr.recordset[0];
    for (const gid of p.gradeIds) {
      await new sql.Request(tx).input("pid",sql.UniqueIdentifier,prog.id).input("gid",sql.UniqueIdentifier,gid)
        .query("IF NOT EXISTS (SELECT 1 FROM dbo.certification_grade_offers WHERE certification_program_id=@pid AND grade_id=@gid) INSERT INTO dbo.certification_grade_offers VALUES (@pid,@gid)");
    }
    await tx.commit();
    await writeAudit({userId:req.user.id,action:"INSERT",entityTable:"certification_programs",entityId:prog.id,newData:prog});
    res.status(201).json(prog);
  } catch (e) { await tx.rollback(); throw e; }
}));

/* ─── Issued list ────────────────────────────────────────── */
router.get("/certificates/issued", asyncHandler(async (req, res) => {
  const studentId = req.query.studentId ? z.string().uuid().parse(req.query.studentId) : null;
  const limit = Math.min(Number(req.query.limit)||50,200);
  const r = await (await getPool()).request()
    .input("sid",sql.UniqueIdentifier,studentId).input("lim",sql.Int,limit)
    .query(`
      SELECT TOP (@lim) sc.id, sc.student_id, sc.status, sc.certificate_number,
             sc.issue_date, sc.expiry_date, sc.notes, sc.merge_data,
             cp.name AS program_name, cp.certificate_template AS cert_type,
             TRIM(s.first_name+' '+s.last_name) AS student_name,
             s.general_register_no AS gr_number
      FROM dbo.student_certifications sc
      JOIN dbo.certification_programs cp ON cp.id=sc.certification_program_id
      JOIN dbo.students s ON s.id=sc.student_id
      WHERE (@sid IS NULL OR sc.student_id=@sid)
      ORDER BY sc.created_at DESC
    `);
  res.json({ data: r.recordset, total: r.recordset.length });
}));

/* ─── Issue certificate ──────────────────────────────────── */
router.post("/certificates/issue", requireRole("super_admin","admin","registrar"), asyncHandler(async (req, res) => {
  const p = z.object({
    studentId:z.string().uuid(), certType:z.string().optional().default("character"),
    certificationProgramId:z.string().uuid().optional(), academicYearId:z.string().uuid().optional(),
    issueDate:z.string().nullable().optional(), expiryDate:z.string().nullable().optional(),
    notes:z.string().nullable().optional(), certificateNumber:z.string().nullable().optional(),
    mergeData:z.record(z.any()).optional(),
  }).strip().parse(req.body);
  const pool = await getPool();
  const schoolId = await resolveSchoolId(null);
  const programId = p.certificationProgramId ?? await resolveOrCreateProgram(pool, schoolId, p.certType);
  let ayId = p.academicYearId;
  if (!ayId) {
    const ay = await pool.request().input("s",sql.UniqueIdentifier,schoolId)
      .query("SELECT TOP 1 id FROM dbo.academic_years WHERE school_id=@s ORDER BY is_current DESC, start_date DESC");
    if (!ay.recordset[0]) return res.status(400).json({message:"No academic year found"});
    ayId = ay.recordset[0].id;
  }
  // ── Eligibility check: student's grade must be in program's grade offers ──
  const progInfo = (await pool.request().input("pid",sql.UniqueIdentifier,programId)
    .query("SELECT certificate_template FROM dbo.certification_programs WHERE id=@pid")).recordset[0];
  const gradeOffers = (await pool.request().input("pid",sql.UniqueIdentifier,programId)
    .query("SELECT grade_id FROM dbo.certification_grade_offers WHERE certification_program_id=@pid")).recordset;
  if (gradeOffers.length > 0) {
    // get student's current enrolled grade
    const enrolled = (await pool.request().input("sid",sql.UniqueIdentifier,p.studentId).input("ayid",sql.UniqueIdentifier,ayId)
      .query(`SELECT g.id AS grade_id FROM dbo.student_enrollments se
              JOIN dbo.sections sec ON sec.id=se.section_id
              JOIN dbo.grades g ON g.id=sec.grade_id
              WHERE se.student_id=@sid AND se.academic_year_id=@ayid`)).recordset[0];
    if (enrolled) {
      const allowed = gradeOffers.map(o => o.grade_id);
      if (!allowed.includes(enrolled.grade_id)) {
        return res.status(400).json({ message: "Student's current grade is not eligible for this certificate program. Check grade offers in the catalog." });
      }
    }
  }

  const certType = progInfo?.certificate_template ?? p.certType ?? "character";
  const certNo = p.certificateNumber ?? `CERT-${Date.now()}`;
  const mergeJson = p.mergeData ? JSON.stringify(p.mergeData) : null;
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const upsert = await new sql.Request(tx)
      .input("sid",sql.UniqueIdentifier,p.studentId).input("pid",sql.UniqueIdentifier,programId)
      .input("ayid",sql.UniqueIdentifier,ayId).input("status",sql.NVarChar(24),"issued")
      .input("certno",sql.NVarChar(128),certNo)
      .input("idate",sql.Date,p.issueDate??new Date().toISOString().slice(0,10))
      .input("edate",sql.Date,p.expiryDate??null).input("notes",sql.NVarChar(sql.MAX),p.notes??null)
      .input("md",sql.NVarChar(sql.MAX),mergeJson)
      .query(`
        MERGE dbo.student_certifications AS t
        USING (SELECT @sid s,@pid p,@ayid ay) AS src ON (t.student_id=src.s AND t.certification_program_id=src.p AND t.academic_year_id=src.ay)
        WHEN MATCHED THEN UPDATE SET status=@status,certificate_number=@certno,issue_date=@idate,expiry_date=@edate,notes=@notes,merge_data=@md,updated_at=SYSUTCDATETIME()
        WHEN NOT MATCHED THEN INSERT (student_id,certification_program_id,academic_year_id,status,certificate_number,issue_date,expiry_date,notes,merge_data) VALUES (@sid,@pid,@ayid,@status,@certno,@idate,@edate,@notes,@md)
        OUTPUT INSERTED.*;
      `);
    if (certType === "school_leaving") {
      // Update student status → withdrawn
      await new sql.Request(tx).input("id",sql.UniqueIdentifier,p.studentId)
        .query("UPDATE dbo.students SET status='withdrawn',updated_at=SYSUTCDATETIME() WHERE id=@id");
      // Auto-create leaving_record if none exists for this student
      const lrExists = (await new sql.Request(tx).input("sid",sql.UniqueIdentifier,p.studentId)
        .query("SELECT TOP 1 id FROM dbo.student_leaving_records WHERE student_id=@sid")).recordset[0];
      if (!lrExists) {
        const issueDate = p.issueDate ?? new Date().toISOString().slice(0,10);
        await new sql.Request(tx)
          .input("sid",   sql.UniqueIdentifier, p.studentId)
          .input("ayid",  sql.UniqueIdentifier, ayId)
          .input("dl",    sql.Date, issueDate)
          .input("ciat",  sql.Date, issueDate)
          .query(`INSERT INTO dbo.student_leaving_records (student_id,academic_year_id,date_left,certificate_issued_at)
                  VALUES (@sid,@ayid,@dl,@ciat)`);
      }
    }
    await tx.commit();
    const row = upsert.recordset[0];
    await writeAudit({userId:req.user.id,action:"UPSERT",entityTable:"student_certifications",entityId:row.id,newData:row});
    res.status(201).json(row);
  } catch (e) { await tx.rollback(); throw e; }
}));

/* ═══════════════════════════════════════════════════════════
   CERTIFICATE PRINT TEMPLATES
   ═══════════════════════════════════════════════════════════ */

router.get("/certificates/:id/print", asyncHandler(async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  const pool = await getPool();
  const r = await pool.request().input("id",sql.UniqueIdentifier,id).query(`
    SELECT sc.*, cp.name AS program_name, cp.certificate_template AS cert_type,
           s.first_name, s.last_name, s.father_name, s.gender,
           s.general_register_no AS gr_number, s.date_of_birth, s.admission_date,
           s.caste, s.place_of_birth, s.last_school_attended,
           s.cnic_form_b, s.father_cnic, s.religion,
           ay.label AS academic_year,
           lr.date_left, lr.conduct, lr.progress, lr.reason, lr.remarks AS leaving_remarks,
           lr.class_studying_since, lr.leaving_serial_no, lr.certificate_issued_at,
           lg.name AS class_left_name
    FROM dbo.student_certifications sc
    JOIN dbo.certification_programs cp ON cp.id=sc.certification_program_id
    JOIN dbo.students s ON s.id=sc.student_id
    JOIN dbo.academic_years ay ON ay.id=sc.academic_year_id
    LEFT JOIN dbo.student_leaving_records lr ON lr.student_id=s.id
    LEFT JOIN dbo.grades lg ON lg.id=lr.class_left_grade_id
    WHERE sc.id=@id
  `);
  const cert = r.recordset[0];
  if (!cert) return res.status(404).json({message:"Certificate not found"});
  const md = (() => { try { return typeof cert.merge_data === "string" ? JSON.parse(cert.merge_data) : (cert.merge_data || {}); } catch { return {}; } })();
  const studentName = `${cert.first_name} ${cert.last_name}`;
  const { he, his, mr } = pronoun(cert.gender);
  const schoolName = "Government Boys Higher Secondary School, Bhiria City";
  const schoolAddr = "Bhiria City, District Naushahro Feroze, Sindh";
  const logoSrc = "/logo.svg";

  let bodyHtml = "";
  let titleText = cert.program_name;
  let borderClass = "";

  // ── Character Certificate ──────────────────────────────────
  if (cert.cert_type === "character") {
    const fromDate = md.wef_from ? fmt(md.wef_from) : (cert.admission_date ? fmt(cert.admission_date) : "—");
    const toDate   = md.wef_to   ? fmt(md.wef_to)   : fmt(cert.issue_date);
    bodyHtml = `
      <p class="body-text">
        This is to certify that <span class="underline">${mr} ${studentName}</span>
        son/daughter of <span class="underline">${cert.father_name||"—"}</span>
        bearing G.R. No. <span class="underline">${cert.gr_number||"—"}</span>
        was a <strong>bonafide student</strong> of this institution
        from <span class="underline">${fromDate}</span> to <span class="underline">${toDate}</span>.
      </p>
      <p class="body-text">
        ${he} is an <span class="underline">${md.conduct||"Good"}</span> student.
        ${his} character and conduct during ${his.toLowerCase()} stay at this institution
        were found to be <span class="underline">${md.character_quality||"Good"}</span>.
      </p>
      <p class="body-text">
        This certificate is issued on ${his.toLowerCase()} request for the purpose it may serve.
        No fee/dues/arrears are outstanding against ${his.toLowerCase()}.
      </p>`;
  }
  // ── Pass SSC Certificate ───────────────────────────────────
  else if (cert.cert_type === "pass_ssc") {
    borderClass = "blue-border";
    titleText = "Pass Certificate (S.S.C)";
    bodyHtml = `
      <p class="body-text">This is to certify that the following student has <strong>passed</strong> the
        <span class="underline">${md.exam_session||"Annual"}</span> Examination
        held by <span class="underline">${md.bise_name||"Board of Intermediate &amp; Secondary Education, Sukkur"}</span>
        in the month of <span class="underline">${md.exam_month_year||cert.academic_year||"—"}</span>.
      </p>
      <div class="row-pair" style="margin:4mm 0">
        <div class="field-block"><span class="field-label">G.R. No.</span><span class="field-val">${cert.gr_number||"—"}</span></div>
        <div class="field-block"><span class="field-label">Roll / Seat No.</span><span class="field-val">${md.board_roll_number||md.seat_number||"—"}</span></div>
        <div class="field-block"><span class="field-label">Exam Year</span><span class="field-val">${md.exam_year||cert.academic_year||"—"}</span></div>
      </div>
      <div class="row-pair" style="margin:4mm 0">
        <div class="field-block"><span class="field-label">Student Name</span><span class="field-val">${studentName}</span></div>
        <div class="field-block"><span class="field-label">Father Name (S/o)</span><span class="field-val">${cert.father_name||"—"}</span></div>
      </div>
      <div class="row-pair" style="margin:4mm 0">
        <div class="field-block"><span class="field-label">Caste</span><span class="field-val">${cert.caste||"—"}</span></div>
        <div class="field-block"><span class="field-label">Date of Birth</span><span class="field-val">${fmt(cert.date_of_birth)}</span></div>
        <div class="field-block"><span class="field-label">D.O.B. in Words</span><span class="field-val">${dateToWords(cert.date_of_birth)}</span></div>
      </div>
      <div class="row-pair" style="margin:4mm 0">
        <div class="field-block"><span class="field-label">Exam Centre</span><span class="field-val">${md.exam_centre||"—"}</span></div>
        <div class="field-block"><span class="field-label">Group / Subject Combo</span><span class="field-val">${md.group||"—"}</span></div>
        <div class="field-block"><span class="field-label">Regular / Private</span><span class="field-val">${md.reg_type||"Regular"}</span></div>
      </div>
      <div class="row-pair" style="margin:4mm 0">
        <div class="field-block"><span class="field-label">Marks Obtained</span><span class="field-val">${md.marks_obtained||"—"} / ${md.marks_total||"—"}</span></div>
        <div class="field-block"><span class="field-label">Grade / Division</span><span class="field-val">${md.grade_division||"—"}</span></div>
      </div>`;
  }
  // ── Pass HSC Certificate ───────────────────────────────────
  else if (cert.cert_type === "pass_hsc") {
    borderClass = "blue-border";
    titleText = "Pass Certificate (H.S.C Part-II)";
    bodyHtml = `
      <p class="body-text">This is to certify that the following student has <strong>passed</strong> the
        <span class="underline">${md.exam_session||"Annual"}</span> H.S.C Part-II Examination
        held by <span class="underline">${md.bise_name||"Board of Intermediate &amp; Secondary Education, Sukkur"}</span>
        in the month of <span class="underline">${md.exam_month_year||cert.academic_year||"—"}</span>.
      </p>
      <div class="row-pair" style="margin:4mm 0">
        <div class="field-block"><span class="field-label">G.R. No.</span><span class="field-val">${cert.gr_number||"—"}</span></div>
        <div class="field-block"><span class="field-label">Board Roll No.</span><span class="field-val">${md.board_roll_number||"—"}</span></div>
        <div class="field-block"><span class="field-label">Exam Year</span><span class="field-val">${md.exam_year||cert.academic_year||"—"}</span></div>
      </div>
      <div class="row-pair" style="margin:4mm 0">
        <div class="field-block"><span class="field-label">Student Name</span><span class="field-val">${studentName}</span></div>
        <div class="field-block"><span class="field-label">Father Name (S/o)</span><span class="field-val">${cert.father_name||"—"}</span></div>
      </div>
      <div class="row-pair" style="margin:4mm 0">
        <div class="field-block"><span class="field-label">Caste</span><span class="field-val">${cert.caste||"—"}</span></div>
        <div class="field-block"><span class="field-label">Date of Birth</span><span class="field-val">${fmt(cert.date_of_birth)}</span></div>
        <div class="field-block"><span class="field-label">D.O.B. in Words</span><span class="field-val">${dateToWords(cert.date_of_birth)}</span></div>
      </div>
      <div class="row-pair" style="margin:4mm 0">
        <div class="field-block"><span class="field-label">Pre-Engineering / Pre-Medical / Arts</span><span class="field-val">${md.group||"—"}</span></div>
        <div class="field-block"><span class="field-label">Marks Obtained</span><span class="field-val">${md.marks_obtained||"—"} / ${md.marks_total||"—"}</span></div>
        <div class="field-block"><span class="field-label">Grade / Division</span><span class="field-val">${md.grade_division||"—"}</span></div>
      </div>`;
  }
  // ── School Leaving Certificate ─────────────────────────────
  else {
    titleText = "School Leaving Certificate";
    const dateLeftWords = dateToWords(cert.date_left);
    const dobWords      = dateToWords(cert.date_of_birth);
    const admitWords    = dateToWords(cert.admission_date);
    bodyHtml = `
      <table class="table-data" style="font-size:11pt">
        <colgroup><col style="width:45%"><col style="width:55%"></colgroup>
        <tr><td>S. No. (Serial)</td><td><strong>${cert.leaving_serial_no||"—"}</strong></td></tr>
        <tr><td>G.R. No.</td><td><strong>${cert.gr_number||"—"}</strong></td></tr>
        <tr><td>Student Name</td><td><strong>${studentName}</strong></td></tr>
        <tr><td>Father Name (S/o)</td><td><strong>${cert.father_name||"—"}</strong></td></tr>
        <tr><td>Caste</td><td>${cert.caste||"—"}</td></tr>
        <tr><td>Place of Birth</td><td>${cert.place_of_birth||"—"}</td></tr>
        <tr><td>Date of Birth (Figures)</td><td>${fmt(cert.date_of_birth)}</td></tr>
        <tr><td>Date of Birth (Words)</td><td>${dobWords}</td></tr>
        <tr><td>Last School Attended</td><td>${cert.last_school_attended||"—"}</td></tr>
        <tr><td>Date of Admission</td><td>${fmt(cert.admission_date)} (${admitWords})</td></tr>
        <tr><td>Class Admitted</td><td>${md.class_admitted||"—"}</td></tr>
        <tr><td>Class Last Studied &amp; Since</td><td>${cert.class_left_name||"—"} (since ${cert.class_studying_since?fmt(cert.class_studying_since):"—"})</td></tr>
        <tr><td>Date of Leaving</td><td>${cert.date_left?fmt(cert.date_left):"—"} (${dateLeftWords})</td></tr>
        <tr><td>Reason for Leaving</td><td>${cert.reason||"—"}</td></tr>
        <tr><td>Conduct</td><td>${cert.conduct||"—"}</td></tr>
        <tr><td>Progress / Result</td><td>${cert.progress||"—"}</td></tr>
        <tr><td>Remarks</td><td>${cert.leaving_remarks||md.remarks||"No arrears outstanding"}</td></tr>
        <tr><td>Certificate Issue Date</td><td>${fmt(cert.certificate_issued_at||cert.issue_date)}</td></tr>
      </table>`;
  }

  // Signature blocks (role names differ per type)
  const leftSig  = cert.cert_type === "school_leaving" ? "Class Teacher" : "First Assistant";
  const rightSig = cert.cert_type === "school_leaving" ? "Head Master / Headmistress" : "Principal";

  const html = `<!doctype html>
<html lang="en">
<head><meta charset="UTF-8"/>
<title>${titleText} — ${studentName}</title>
<style>${CERT_CSS}</style>
</head>
<body>
<div class="page no-print-margin">
  <div class="cert-wrap ${borderClass}">
    <div class="header">
      <div class="header-logo">
        <img src="/logo.svg" alt="Govt Sindh"/>
        <div>
          <div style="font-size:10pt;color:#555">Government of Sindh — Education Department</div>
          <div class="school-name">${schoolName}</div>
          <div class="school-addr">${schoolAddr}</div>
        </div>
      </div>
    </div>
    <div class="cert-title ${borderClass==="blue-border"?"blue":""}">${titleText}</div>
    <div style="text-align:right;font-size:9pt;color:#666;margin-bottom:2mm">Certificate No: <strong>${cert.certificate_number||"—"}</strong></div>
    ${bodyHtml}
    <div class="sig-block">
      <div class="sig-col">
        <div class="sig-line"></div>
        <div class="sig-label">${leftSig}</div>
        <div class="sig-sub">${schoolName}</div>
      </div>
      <div class="sig-col" style="text-align:center">
        <div style="width:80px;height:80px;border:1px dashed #aaa;margin:0 auto;display:flex;align-items:center;justify-content:center;font-size:8pt;color:#aaa">SCHOOL<br/>STAMP</div>
      </div>
      <div class="sig-col">
        <div class="sig-line"></div>
        <div class="sig-label">${rightSig}</div>
        <div class="sig-sub">${schoolName}</div>
      </div>
    </div>
    <div class="stamp-area">Printed on: ${new Date().toLocaleDateString("en-PK")}</div>
  </div>
</div>
<script>window.onload=()=>window.print();</script>
</body>
</html>`;
  res.setHeader("Content-Type","text/html");
  res.send(html);
}));

module.exports = { certificateRoutes: router };
