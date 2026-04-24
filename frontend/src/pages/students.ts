import { apiFetch, BASE, MEDIA_URL, printUrl, getToken } from "../api"; void BASE;
import { mount, toast } from "../shell";
import { navigate } from "../router";

interface Student {
  id: string;
  serial_no?: number;
  gr_number?: string;
  general_register_no?: string;
  enrollment_number?: string;
  grade_is_admitted_only?: number;
  first_name: string;
  last_name: string;
  father_name?: string;
  mother_name?: string;
  guardian_name?: string;
  guardian_relation?: string;
  date_of_birth?: string;
  gender?: string;
  caste?: string;
  religion?: string;
  nationality?: string;
  place_of_birth?: string;
  phone?: string;
  email?: string;
  address?: string;
  cnic_form_b?: string;
  father_cnic?: string;
  admission_date?: string;
  last_school_attended?: string;
  admitted_grade_id?: string;
  conduct_on_leaving?: string;
  progress_on_leaving?: string;
  reason_for_leaving?: string;
  class_studying_since?: string;
  date_of_leaving?: string;
  class_left_label?: string;
  remarks?: string;
  status: string;
  photo_url?: string | null;
  // enriched by list query
  current_grade?: string;
  current_section?: string;
  current_year?: string;
  att_pct?: number | null;
}

type ViewMode = "list" | "class";

export async function studentsListPage() {
  mount("Students", `
    <div class="toolbar toolbar--wrap">
      <a href="/students/new" data-link class="btn">+ Admit Student</a>
      <input id="stuSearch" placeholder="Search by name, GR#, father…" class="search-input" style="flex:1;min-width:180px"/>
      <select id="stuStatus" class="field__input" style="min-width:130px">
        <option value="">All Statuses</option>
        <option value="active">Active</option>
        <option value="withdrawn">Withdrawn</option>
        <option value="alumni">Alumni</option>
        <option value="passed_out">Passed Out</option>
      </select>
      <div class="view-toggle" id="viewToggle">
        <button class="view-toggle__btn view-toggle__btn--active" data-view="list" title="List view">☰ List</button>
        <button class="view-toggle__btn" data-view="class" title="Group by class">⊞ By Class</button>
      </div>
    </div>
    <div id="stuTable"><div class="loading">Loading…</div></div>`);

  let curSearch = "";
  let curStatus = "";
  let curView: ViewMode = "list";

  const loadView = (page: number, search: string, status: string) => {
    curSearch = search; curStatus = status;
    if (curView === "class") loadByClass();
    else loadStudents(page, search, status);
  };

  let debounce: ReturnType<typeof setTimeout>;
  document.getElementById("stuSearch")!.addEventListener("input", (e) => {
    clearTimeout(debounce);
    debounce = setTimeout(() => loadView(1, (e.target as HTMLInputElement).value, curStatus), 350);
  });
  document.getElementById("stuStatus")!.addEventListener("change", (e) => {
    loadView(1, curSearch, (e.target as HTMLSelectElement).value);
  });

  document.getElementById("viewToggle")!.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest("[data-view]");
    if (!btn) return;
    const v = btn.getAttribute("data-view") as ViewMode;
    if (v === curView) return;
    curView = v;
    document.querySelectorAll(".view-toggle__btn").forEach(b => b.classList.remove("view-toggle__btn--active"));
    btn.classList.add("view-toggle__btn--active");
    // hide search/filter for class view since it shows all grouped
    (document.getElementById("stuSearch") as HTMLInputElement).style.display = v === "class" ? "none" : "";
    (document.getElementById("stuStatus") as HTMLSelectElement).style.display = v === "class" ? "none" : "";
    loadView(1, curSearch, curStatus);
  });

  await loadView(1, "", "");
}

/** Returns "X yr(s)" since a date, or "—" */
function yearsAgo(dateStr?: string): string {
  if (!dateStr) return "—";
  const diff = (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24 * 365.25);
  if (diff < 0.08) return "< 1 month";
  if (diff < 1)    return `${Math.round(diff * 12)} month(s)`;
  return `${Math.floor(diff)} yr(s)`;
}

function attBadge(pct: number | null | undefined): string {
  if (pct == null) return `<span class="muted">—</span>`;
  const cls = pct >= 75 ? "ok" : pct >= 50 ? "warn" : "err";
  return `<span class="att-pill att-pill--${cls}">${pct}%</span>`;
}

async function loadStudents(page: number, search: string, status: string) {
  try {
    const qs = new URLSearchParams({ page: String(page), limit: "20", search });
    if (status) qs.set("status", status);
    const data = await apiFetch(`/students?${qs}`) as { total: number; data: Student[] };

    const tbody = data.data.map((s: Student) => {
      const classInfo = s.current_grade
        ? `${s.current_grade}${s.current_section ? "-" + s.current_section : ""}${s.grade_is_admitted_only ? ' <span class="muted" title="No enrollment yet — admitted grade shown">(adm.)</span>' : ""}`
        : "—";
      const sinceTxt = yearsAgo(s.class_studying_since);
      const admDate  = s.admission_date ? new Date(s.admission_date).toLocaleDateString("en-PK") : "—";
      const photoSrc = s.photo_url ? MEDIA_URL + s.photo_url : null;
      const avatar   = photoSrc
        ? `<img src="${photoSrc}" class="stu-avatar" alt=""/>`
        : `<div class="stu-avatar stu-avatar--initials">${s.first_name[0] || "?"}${s.last_name[0] || ""}</div>`;
      return `<tr>
        <td class="mono fw-600">${s.serial_no || "—"}</td>
        <td class="mono">${s.gr_number || s.general_register_no || "—"}</td>
        <td>
          <div class="stu-name-cell">
            ${avatar}
            <a href="/students/${s.id}" data-link class="link fw-600">${s.first_name} ${s.last_name}</a>
          </div>
        </td>
        <td>${s.father_name || "—"}</td>
        <td class="text-center">${s.gender || "—"}</td>
        <td class="text-center">${classInfo}</td>
        <td class="text-center" title="Since ${s.class_studying_since || "unknown"}">${sinceTxt}</td>
        <td class="text-center">${admDate}</td>
        <td class="text-center">${attBadge(s.att_pct)}</td>
        <td><span class="badge badge--${s.status}">${s.status}</span></td>
        <td>
          <a href="/students/${s.id}" data-link class="btn btn--sm">View</a>
          <a href="/students/${s.id}/edit" data-link class="btn btn--sm btn--ghost">Edit</a>
          <button class="btn btn--sm btn--danger" data-del="${s.id}">Del</button>
        </td>
      </tr>`;
    }).join("");

    const pages = Math.ceil(data.total / 20);
    document.getElementById("stuTable")!.innerHTML = `
      <div class="table-meta">${data.total} student(s) found</div>
      <div class="table-wrap">
        <table class="tbl tbl--compact">
          <thead><tr>
            <th>S.No</th><th>GR#</th><th>Name / Photo</th><th>Father</th>
            <th>Gender</th><th>Class</th><th>Since</th>
            <th>Admitted</th><th>Att%</th><th>Status</th><th>Actions</th>
          </tr></thead>
          <tbody>${tbody || "<tr><td colspan='11' class='muted text-center'>No records found</td></tr>"}</tbody>
        </table>
      </div>
      <div class="pagination">
        ${page > 1 ? `<button class="btn btn--sm" data-page="${page - 1}">← Prev</button>` : ""}
        <span class="muted">Page ${page} of ${Math.max(pages, 1)}</span>
        ${page < pages ? `<button class="btn btn--sm" data-page="${page + 1}">Next →</button>` : ""}
      </div>`;

    document.getElementById("stuTable")!.addEventListener("click", async (e) => {
      const delBtn = (e.target as HTMLElement).closest("[data-del]");
      if (delBtn) {
        if (!confirm("Delete this student record? This cannot be undone.")) return;
        try {
          await apiFetch(`/students/${delBtn.getAttribute("data-del")}`, { method: "DELETE" });
          toast("Student deleted", "ok");
          await loadStudents(page, search, status);
        } catch (err: unknown) { toast(err instanceof Error ? err.message : String(err), "err"); }
      }
      const pageBtn = (e.target as HTMLElement).closest("[data-page]");
      if (pageBtn) await loadStudents(Number(pageBtn.getAttribute("data-page")), search, status);
    });
  } catch (err: unknown) {
    document.getElementById("stuTable")!.innerHTML = `<div class="alert alert--err">${err instanceof Error ? err.message : String(err)}</div>`;
  }
}

/* ══════════════════════════════════════════════════════════
   CLASS-GROUPED VIEW
   ══════════════════════════════════════════════════════════ */
interface ClassGroup {
  grade_id: string; grade_name: string;
  section_id: string; section_name: string;
  academic_year_label: string;
  student_count: number;
  students: Student[];
}

async function loadByClass() {
  const container = document.getElementById("stuTable")!;
  container.innerHTML = `<div class="loading">Loading class groups…</div>`;
  try {
    const data = await apiFetch("/students/by-class") as { groups: ClassGroup[] };
    if (!data.groups.length) {
      container.innerHTML = `<div class="card"><p class="muted text-center" style="padding:24px">
        No sections with enrolled students found for the current academic year.<br/>
        Go to <a href="/classes" data-link class="link">Classes</a> to create sections and enrol students.
      </p></div>`;
      return;
    }

    // Group sections by grade for accordion display
    const byGrade: Record<string, ClassGroup[]> = {};
    for (const g of data.groups) {
      if (!byGrade[g.grade_name]) byGrade[g.grade_name] = [];
      byGrade[g.grade_name].push(g);
    }

    const totalStudents = data.groups.reduce((a, g) => a + g.student_count, 0);

    let html = `<div class="table-meta">${totalStudents} enrolled student(s) across ${data.groups.length} section(s) — ${data.groups[0]?.academic_year_label || ""}</div>`;

    for (const [gradeName, sections] of Object.entries(byGrade)) {
      const gradeTotal = sections.reduce((a, s) => a + s.student_count, 0);
      html += `
      <div class="class-grade-block">
        <div class="class-grade-header" data-toggle-grade="${gradeName}">
          <span class="class-grade-icon">▼</span>
          <span class="class-grade-name">${gradeName}</span>
          <span class="class-grade-meta">${sections.length} section(s) &nbsp;·&nbsp; ${gradeTotal} student(s)</span>
        </div>
        <div class="class-grade-body" id="grade-body-${gradeName.replace(/\s+/g,'-')}">`;

      for (const sec of sections) {
        html += `
          <div class="class-section-block">
            <div class="class-section-header" data-toggle-section="${sec.section_id}">
              <span class="class-section-icon">▾</span>
              <span class="class-section-label">Section <strong>${sec.section_name}</strong></span>
              <span class="class-section-count">${sec.student_count} student(s)</span>
              <button class="btn btn--sm btn--ghost" style="margin-left:auto" data-print-section="${sec.section_id}" data-sec-label="${gradeName}-${sec.section_name}">🖨 Print List</button>
            </div>
            <div class="class-section-body" id="section-body-${sec.section_id}">
              ${sec.student_count === 0
                ? `<p class="muted text-center" style="padding:12px">No students enrolled in this section</p>`
                : `<div class="table-wrap">
                  <table class="tbl tbl--compact">
                    <thead><tr>
                      <th>#</th><th>Roll#</th><th>GR#</th><th>Name</th>
                      <th>Father</th><th>Gender</th><th>Att%</th><th>Status</th><th>Action</th>
                    </tr></thead>
                    <tbody>
                      ${sec.students.map((s, i) => {
                        const photo = s.photo_url ? MEDIA_URL + s.photo_url : null;
                        const av = photo
                          ? `<img src="${photo}" class="stu-avatar" alt=""/>`
                          : `<div class="stu-avatar stu-avatar--initials">${(s.first_name[0]||"?").toUpperCase()}${(s.last_name[0]||"").toUpperCase()}</div>`;
                        return `<tr>
                          <td class="mono text-center">${i + 1}</td>
                          <td class="mono text-center">${(s as unknown as Record<string,unknown>).roll_number || s.serial_no || "—"}</td>
                          <td class="mono">${s.gr_number || "—"}</td>
                          <td>
                            <div class="stu-name-cell">
                              ${av}
                              <a href="/students/${s.id}" data-link class="link fw-600">${s.first_name} ${s.last_name}</a>
                            </div>
                          </td>
                          <td>${s.father_name || "—"}</td>
                          <td class="text-center">${s.gender || "—"}</td>
                          <td class="text-center">${attBadge(s.att_pct)}</td>
                          <td><span class="badge badge--${s.status}">${s.status}</span></td>
                          <td>
                            <a href="/students/${s.id}" data-link class="btn btn--sm">View</a>
                            <a href="/students/${s.id}/edit" data-link class="btn btn--sm btn--ghost">Edit</a>
                          </td>
                        </tr>`;
                      }).join("")}
                    </tbody>
                  </table>
                </div>`}
            </div>
          </div>`;
      }
      html += `</div></div>`;
    }

    container.innerHTML = html;

    // Accordion toggles — grade level
    container.querySelectorAll("[data-toggle-grade]").forEach(el => {
      el.addEventListener("click", () => {
        const grade = (el as HTMLElement).dataset.toggleGrade!;
        const body  = document.getElementById(`grade-body-${grade.replace(/\s+/g,"-")}`)!;
        const icon  = el.querySelector(".class-grade-icon")!;
        const open  = !body.classList.contains("collapsed");
        body.classList.toggle("collapsed", open);
        icon.textContent = open ? "►" : "▼";
      });
    });

    // Accordion toggles — section level
    container.querySelectorAll("[data-toggle-section]").forEach(el => {
      el.addEventListener("click", (e) => {
        if ((e.target as HTMLElement).closest("button")) return;
        const sid  = (el as HTMLElement).dataset.toggleSection!;
        const body = document.getElementById(`section-body-${sid}`)!;
        const icon = el.querySelector(".class-section-icon")!;
        const open = !body.classList.contains("collapsed");
        body.classList.toggle("collapsed", open);
        icon.textContent = open ? "▸" : "▾";
      });
    });

    // Print section list
    container.querySelectorAll("[data-print-section]").forEach(btn => {
      btn.addEventListener("click", () => {
        const sid   = (btn as HTMLElement).dataset.printSection!;
        const label = (btn as HTMLElement).dataset.secLabel!;
        const body  = document.getElementById(`section-body-${sid}`)!;
        const table = body.querySelector("table")?.outerHTML || "<p>No students</p>";
        const w = window.open("", "_blank");
        if (!w) return;
        w.document.write(`<!doctype html><html><head><meta charset="UTF-8"/>
          <title>Class List — ${label}</title>
          <style>body{font-family:serif;padding:20px}h2{color:#1a6b3a}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:6px 8px;font-size:12px}th{background:#1a6b3a;color:#fff}img{display:none}@media print{@page{size:A4;margin:15mm}}</style>
          </head><body>
          <h2>Government Boys Higher Secondary School, Bhiria City</h2>
          <h3>Class List — ${label}</h3>
          ${table}
          <script>window.onload=()=>window.print();<\/script>
          </body></html>`);
        w.document.close();
      });
    });

  } catch (err: unknown) {
    container.innerHTML = `<div class="alert alert--err">${err instanceof Error ? err.message : String(err)}</div>`;
  }
}

export async function studentDetailPage(id: string) {
  mount("Student Detail", `<div class="loading">Loading…</div>`);
  try {
    const resp = await apiFetch(`/students/${id}`) as {
      student: Student;
      enrollments: Record<string, unknown>[];
      leavingRecords: Record<string, unknown>[];
      attendance?: { att_pct: number | null; total_sessions: number; present_count: number; absent_count: number };
    };
    let s = resp.student;
    const att = resp.attendance;
    const grNo = s.gr_number || s.general_register_no || "—";

    const renderPhotoEl = (url?: string | null) => {
      const src = url ? MEDIA_URL + url : null;
      return src
        ? `<img id="stuPhoto" src="${src}" class="stu-photo" alt="Student photo"/>`
        : `<div id="stuPhoto" class="stu-photo stu-photo--empty"><span>No Photo</span></div>`;
    };

    const attPct = att?.att_pct ?? null;
    const attDisplay = attPct != null
      ? `${attBadge(attPct)} <span class="muted" style="font-size:12px">${att!.present_count} present / ${att!.total_sessions} sessions (${att!.absent_count} absent)</span>`
      : `<span class="muted">No attendance records</span>`;

    document.getElementById("page-content")!.innerHTML = `
      <!-- ─── Top action bar ─── -->
      <div class="card" style="padding:12px 16px;margin-bottom:12px">
        <div class="card-actions" style="flex-wrap:wrap;gap:8px;margin:0">
          <a href="/students" data-link class="btn btn--ghost btn--sm">← Back to list</a>
          <a href="/students/${id}/edit" data-link class="btn btn--sm">✏️ Edit</a>
          <a href="/leaving-records/student/${id}" data-link class="btn btn--ghost btn--sm">📋 Leaving Records</a>
          <a href="${printUrl(`/reports/marksheet/${id}`)}" target="_blank" class="btn btn--ghost btn--sm">🖨 Print Marksheet</a>
          <button id="btnPrintIDCard" class="btn btn--ghost btn--sm">🖨 Print ID Card</button>
        </div>
      </div>

      <!-- ─── Two-column layout ─── -->
      <div style="display:flex;gap:20px;align-items:flex-start;flex-wrap:wrap">

        <!-- ─── LEFT: Student Details ─── -->
        <div style="flex:1;min-width:300px">
          <div class="card">
            <!-- Profile header: photo + name -->
            <div class="stu-profile-header">
              <div class="stu-photo-col">
                ${renderPhotoEl(s.photo_url)}
                <div class="photo-actions mt-8">
                  <label class="btn btn--sm btn--ghost" style="cursor:pointer">
                    📷 Upload Photo
                    <input type="file" id="photoInput" accept="image/*" style="display:none"/>
                  </label>
                  ${s.photo_url ? `<button id="delPhotoBtn" class="btn btn--sm btn--danger">Remove</button>` : ""}
                </div>
                <div id="photoMsg" style="font-size:11px;margin-top:4px;color:var(--clr-muted)"></div>
              </div>
              <div style="flex:1;min-width:0">
                <div class="card-header-row">
                  <div>
                    <h2 style="margin:0">${s.first_name} ${s.last_name}</h2>
                    <p class="muted" style="margin-top:4px;font-size:12px">
                      S.No: <strong>${s.serial_no || "—"}</strong>
                      &nbsp;|&nbsp; GR#: <strong>${grNo}</strong>
                      &nbsp;|&nbsp; Enrolment: ${s.enrollment_number || "—"}
                    </p>
                  </div>
                  <span class="badge badge--${s.status}">${s.status}</span>
                </div>

                <!-- Attendance highlight -->
                <div style="background:var(--clr-green-l);border-radius:6px;padding:8px 12px;margin-top:10px;display:flex;align-items:center;gap:8px">
                  <span style="font-size:11px;color:var(--clr-muted);font-weight:600;min-width:80px">Attendance</span>
                  <span>${attDisplay}</span>
                </div>
              </div>
            </div>

            <div class="section-title mt-16">Personal Information</div>
            <div class="detail-grid">
              <div class="detail-row"><span class="detail-label">Father Name</span><span>${s.father_name || "—"}</span></div>
              <div class="detail-row"><span class="detail-label">Mother Name</span><span>${s.mother_name || "—"}</span></div>
              <div class="detail-row"><span class="detail-label">Date of Birth</span><span>${s.date_of_birth ? new Date(s.date_of_birth).toLocaleDateString("en-PK") : "—"}</span></div>
              <div class="detail-row"><span class="detail-label">Gender</span><span>${s.gender || "—"}</span></div>
              <div class="detail-row"><span class="detail-label">Religion</span><span>${s.religion || "—"}</span></div>
              <div class="detail-row"><span class="detail-label">Caste / Race</span><span>${s.caste || "—"}</span></div>
              <div class="detail-row"><span class="detail-label">Nationality</span><span>${s.nationality || "—"}</span></div>
              <div class="detail-row"><span class="detail-label">Place of Birth</span><span>${s.place_of_birth || "—"}</span></div>
            </div>

            <div class="section-title mt-16">CNIC / Identification</div>
            <div class="detail-grid">
              <div class="detail-row"><span class="detail-label">Student B-Form</span><span>${s.cnic_form_b || "—"}</span></div>
              <div class="detail-row"><span class="detail-label">Father CNIC</span><span>${s.father_cnic || "—"}</span></div>
            </div>

            <div class="section-title mt-16">Contact</div>
            <div class="detail-grid">
              <div class="detail-row"><span class="detail-label">Phone</span><span>${s.phone || "—"}</span></div>
              <div class="detail-row"><span class="detail-label">Email</span><span>${s.email || "—"}</span></div>
              <div class="detail-row"><span class="detail-label">Address</span><span>${s.address || "—"}</span></div>
            </div>

            <div class="section-title mt-16">Admission</div>
            <div class="detail-grid">
              <div class="detail-row"><span class="detail-label">Admission Date</span><span>${s.admission_date ? new Date(s.admission_date).toLocaleDateString("en-PK") : "—"}</span></div>
              <div class="detail-row"><span class="detail-label">Admitted in Class</span><span>${(s as {admitted_grade_name?:string}).admitted_grade_name || "—"}</span></div>
              <div class="detail-row"><span class="detail-label">Last School</span><span>${s.last_school_attended || "—"}</span></div>
              <div class="detail-row"><span class="detail-label">Studying in Class Since</span><span>${s.class_studying_since ? new Date(s.class_studying_since).toLocaleDateString("en-PK") : "—"}</span></div>
            </div>

            <div class="section-title mt-16">Leaving / Transfer Details</div>
            <div class="detail-grid">
              <div class="detail-row"><span class="detail-label">Date of Leaving</span><span>${s.date_of_leaving ? new Date(s.date_of_leaving).toLocaleDateString("en-PK") : "—"}</span></div>
              <div class="detail-row"><span class="detail-label">Class Left</span><span>${s.class_left_label || "—"}</span></div>
              <div class="detail-row"><span class="detail-label">Conduct</span><span>${s.conduct_on_leaving || "—"}</span></div>
              <div class="detail-row"><span class="detail-label">Progress</span><span>${s.progress_on_leaving || "—"}</span></div>
              <div class="detail-row"><span class="detail-label">Reason</span><span>${s.reason_for_leaving || "—"}</span></div>
              <div class="detail-row"><span class="detail-label">Remarks</span><span>${s.remarks || "—"}</span></div>
            </div>
          </div>

          <div class="card mt-16">
            <div class="card-header-row">
              <h3>Enrollment History</h3>
              <button id="btnEnrollNow" class="btn btn--sm btn--ghost">+ Enroll in Section</button>
            </div>
            ${resp.enrollments?.length
              ? `<ul class="list">${resp.enrollments.map(e => `<li class="list-item">
                  <strong>${String(e.grade_name || "")}${e.section_name ? "-" + String(e.section_name) : ""}</strong>
                  &nbsp;<span class="muted">${String(e.academic_year_label || "")}</span>
                  ${e.roll_number ? `&nbsp;· Roll# ${e.roll_number}` : ""}
                </li>`).join("")}</ul>`
              : `<p class='muted mt-8'>No enrollment records yet.${(s as {admitted_grade_name?:string}).admitted_grade_name ? ` Admitted in <strong>${(s as {admitted_grade_name?:string}).admitted_grade_name}</strong> — use "+ Enroll in Section" to create an enrollment.` : " Use \"+ Enroll in Section\" to enroll this student."}</p>`}
            <div id="enrollForm" class="hidden mt-12"></div>
          </div>
        </div>

        <!-- ─── RIGHT: ID Card (front then back) ─── -->
        <div class="stu-idcard-panel">
          <div class="stu-idcard-panel__title">🪪 Student ID Card</div>
          <div id="idCardInline">${buildIDCardPreview(s, resp.enrollments)}</div>
        </div>

      </div>`;

    /* ── Quick enrollment from detail page ── */
    document.getElementById("btnEnrollNow")!.addEventListener("click", async () => {
      const formDiv = document.getElementById("enrollForm")!;
      if (!formDiv.classList.contains("hidden")) { formDiv.classList.add("hidden"); return; }
      formDiv.innerHTML = `<div class="loading">Loading…</div>`;
      formDiv.classList.remove("hidden");
      try {
        const [ayData, sectionData] = await Promise.all([
          apiFetch("/academic-years") as Promise<{data:{id:string;label:string}[]}>,
          apiFetch("/sections") as Promise<{data:{id:string;name:string;grade_name?:string;grade_id?:string}[]}>,
        ]);
        const ayOpts = ayData.data.map(a => `<option value="${a.id}">${a.label}</option>`).join("");
        const secOpts = sectionData.data.map(s2 => `<option value="${s2.id}">${s2.grade_name ? s2.grade_name + " — " : ""}${s2.name}</option>`).join("");
        formDiv.innerHTML = `
          <div class="form-grid" style="margin-top:8px">
            <label class="field"><span class="field__label">Section</span>
              <select id="enrSec" class="field__input"><option value="">— Select Section —</option>${secOpts}</select>
            </label>
            <label class="field"><span class="field__label">Academic Year</span>
              <select id="enrAy" class="field__input"><option value="">— Current Year —</option>${ayOpts}</select>
            </label>
            <label class="field"><span class="field__label">Roll Number (optional)</span>
              <input id="enrRoll" class="field__input" placeholder="e.g. 12"/>
            </label>
          </div>
          <div style="display:flex;gap:8px;margin-top:10px">
            <button id="enrSaveBtn" class="btn btn--sm">Save Enrollment</button>
            <button id="enrCancelBtn" class="btn btn--sm btn--ghost">Cancel</button>
          </div>
          <div id="enrErr" class="muted" style="font-size:12px;margin-top:4px"></div>`;
        document.getElementById("enrCancelBtn")!.onclick = () => formDiv.classList.add("hidden");
        document.getElementById("enrSaveBtn")!.onclick = async () => {
          const sectionId = (document.getElementById("enrSec") as HTMLSelectElement).value;
          const ayId      = (document.getElementById("enrAy") as HTMLSelectElement).value || undefined;
          const rollNum   = (document.getElementById("enrRoll") as HTMLInputElement).value.trim() || undefined;
          const errEl     = document.getElementById("enrErr")!;
          if (!sectionId) { errEl.textContent = "Please select a section."; return; }
          try {
            await apiFetch("/enrollments", { method: "POST", body: JSON.stringify({ studentId: id, sectionId, academicYearId: ayId || undefined, rollNumber: rollNum || undefined }) });
            toast("Enrolled successfully", "ok");
            navigate(`/students/${id}`);
          } catch (err2: unknown) { errEl.textContent = err2 instanceof Error ? err2.message : String(err2); }
        };
      } catch { formDiv.innerHTML = `<p class="muted">Failed to load data.</p>`; }
    });

    /* ── Photo upload ── */
    document.getElementById("photoInput")!.addEventListener("change", async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const msgEl = document.getElementById("photoMsg")!;
      msgEl.textContent = "Uploading…";
      const fd = new FormData();
      fd.append("photo", file);
      try {
        const r = await fetch(`${BASE}/students/${id}/photo`, {
          method: "POST",
          headers: { Authorization: `Bearer ${getToken()}` },
          body: fd,
        });
        const j = await r.json() as { photo_url?: string; message?: string };
        if (!r.ok) throw new Error(j.message || "Upload failed");
        s = { ...s, photo_url: j.photo_url };
        document.getElementById("stuPhoto")!.outerHTML =
          `<img id="stuPhoto" src="${MEDIA_URL + (j.photo_url || "")}" class="stu-photo" alt="Student photo"/>`;
        // Refresh ID card with new photo
        document.getElementById("idCardInline")!.innerHTML = buildIDCardPreview(s, resp.enrollments);
        msgEl.textContent = "Photo updated ✓";
        setTimeout(() => { msgEl.textContent = ""; }, 2500);
      } catch (err: unknown) { msgEl.textContent = err instanceof Error ? err.message : String(err); }
    });

    document.getElementById("delPhotoBtn")?.addEventListener("click", async () => {
      if (!confirm("Remove photo?")) return;
      try {
        await apiFetch(`/students/${id}/photo`, { method: "DELETE" });
        s = { ...s, photo_url: null };
        document.getElementById("stuPhoto")!.outerHTML =
          `<div id="stuPhoto" class="stu-photo stu-photo--empty"><span>No Photo</span></div>`;
        document.getElementById("delPhotoBtn")?.remove();
        document.getElementById("idCardInline")!.innerHTML = buildIDCardPreview(s, resp.enrollments);
        toast("Photo removed", "ok");
      } catch (err: unknown) { toast(err instanceof Error ? err.message : String(err), "err"); }
    });

    /* ── Print ID Card ── */
    document.getElementById("btnPrintIDCard")!.addEventListener("click", () => {
      const w = window.open("", "_blank", "width=760,height=560");
      if (!w) return;
      w.document.write(buildIDCardHTML(s, resp.enrollments));
      w.document.close();
      w.focus();
      setTimeout(() => w.print(), 600);
    });

  } catch (err: unknown) {
    document.getElementById("page-content")!.innerHTML =
      `<div class="alert alert--err">${err instanceof Error ? err.message : String(err)}</div>`;
  }
}

function buildIDCardPreview(s: Student, enrollments: Record<string, unknown>[]): string {
  const photo = s.photo_url ? MEDIA_URL + s.photo_url : null;
  const grNo  = s.gr_number || s.general_register_no || "—";
  const dob   = s.date_of_birth ? new Date(s.date_of_birth).toLocaleDateString("en-PK") : "—";
  const lastEnrol = enrollments?.[0];
  const classInfo = lastEnrol
    ? `${String(lastEnrol.grade_name || "")}${lastEnrol.section_name ? "-" + String(lastEnrol.section_name) : ""}`
    : "—";
  const validYear = new Date().getFullYear() + 1;

  return `
  <div style="display:flex;flex-direction:column;gap:12px;font-family:'Segoe UI',sans-serif;align-items:flex-start">

    <!-- FRONT -->
    <div class="id-card id-card--front">
      <div class="id-card__header">
          <img src="/sindh-logo.png" width="36" height="36" alt="Govt of Sindh" style="border-radius:50%;background:#fff;padding:1px"/>
        <div>
          <div style="font-weight:700;font-size:9px;color:#fff">Govt. of Sindh — Education Dept.</div>
          <div style="font-weight:700;font-size:8px;color:#e8f5ee">Govt. Boys Higher Secondary School</div>
          <div style="font-size:7px;color:#c8e6c9">Bhiria City, Naushahro Feroze</div>
        </div>
        <div style="margin-left:auto;font-size:8px;color:#c8e6c9;font-weight:600">STUDENT ID</div>
      </div>
      <div class="id-card__body">
        <div class="id-card__photo">
          ${photo
            ? `<img src="${photo}" alt="photo" style="width:100%;height:100%;object-fit:cover;border-radius:4px"/>`
            : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#e8f5ee;border-radius:4px;font-size:22px;color:#1a6b3a;font-weight:700">${(s.first_name[0] || "?").toUpperCase()}</div>`}
        </div>
        <div class="id-card__info">
          <div class="id-card__name">${s.first_name} ${s.last_name}</div>
          <div class="id-field"><span>S/O</span><span>${s.father_name || "—"}</span></div>
          <div class="id-field"><span>Class</span><span>${classInfo}</span></div>
          <div class="id-field"><span>GR#</span><span>${grNo}</span></div>
          <div class="id-field"><span>DOB</span><span>${dob}</span></div>
          <div class="id-field"><span>Gender</span><span>${s.gender || "—"}</span></div>
        </div>
      </div>
      <div class="id-card__footer">
        <span>Valid till: Dec ${validYear}</span>
        <span style="font-family:monospace;letter-spacing:2px;font-size:9px">${grNo}</span>
      </div>
    </div>

    <!-- BACK -->
    <div class="id-card id-card--back">
      <div class="id-card__header">
        <div style="font-weight:700;font-size:9px;color:#fff">Govt. Boys Higher Secondary School, Bhiria City</div>
        <div style="font-size:8px;color:#c8e6c9;margin-left:auto">District Naushahro Feroze, Sindh</div>
      </div>
      <div class="id-card__body" style="flex-direction:column;gap:6px;padding:10px 14px">
        <div style="font-size:10px;font-weight:600;color:#1a6b3a;border-bottom:1px solid #c8e6c9;padding-bottom:4px">
          Student Information
        </div>
        <div class="id-field"><span>Enrolment #</span><span>${s.enrollment_number || "—"}</span></div>
        <div class="id-field"><span>B-Form / CNIC</span><span>${s.cnic_form_b || "—"}</span></div>
        <div class="id-field"><span>Religion</span><span>${s.religion || "—"}</span></div>
        <div class="id-field"><span>Nationality</span><span>${s.nationality || "Pakistani"}</span></div>
        <div class="id-field"><span>Phone</span><span>${s.phone || "—"}</span></div>
        <div class="id-field" style="flex-wrap:wrap"><span>Address</span><span style="max-width:160px;word-break:break-word">${(s.address || "—").slice(0, 70)}</span></div>
        <div style="margin-top:auto;border-top:1px solid #c8e6c9;padding-top:6px;font-size:8px;color:#888;text-align:center">
          If found, please return to school office. Tel: (0244) xxxxxxx
        </div>
      </div>
      <div class="id-card__footer">
        <span>Admission: ${s.admission_date ? new Date(s.admission_date).getFullYear() : "—"}</span>
        <span style="font-size:8px;color:#c8e6c9">GBHS-BC / ${grNo}</span>
      </div>
    </div>

  </div>`;
}

function buildIDCardHTML(s: Student, enrollments: Record<string, unknown>[]): string {
  const cardHTML = buildIDCardPreview(s, enrollments);
  return `<!doctype html><html><head><meta charset="UTF-8"/><title>ID Card — ${s.first_name} ${s.last_name}</title>
<style>
  body { font-family:'Segoe UI',sans-serif; display:flex; justify-content:center; align-items:center; min-height:100vh; margin:0; background:#f0f0f0; }
  .id-card { width:320px; height:200px; border-radius:10px; overflow:hidden; display:flex; flex-direction:column; box-shadow:0 4px 16px rgba(0,0,0,.25); }
  .id-card--front { background:linear-gradient(135deg,#1a6b3a 0%,#2d9e5f 100%); }
  .id-card--back  { background:linear-gradient(135deg,#0f4a28 0%,#1a6b3a 100%); }
  .id-card__header { display:flex; align-items:center; gap:8px; padding:8px 12px; background:rgba(0,0,0,.2); }
  .id-card__body { display:flex; gap:12px; padding:10px 12px; flex:1; }
  .id-card__photo { width:72px; height:90px; border:2px solid rgba(255,255,255,.4); border-radius:6px; flex-shrink:0; overflow:hidden; }
  .id-card__info { flex:1; color:#fff; display:flex; flex-direction:column; gap:3px; }
  .id-card__name { font-size:13px; font-weight:700; color:#fff; border-bottom:1px solid rgba(255,255,255,.3); padding-bottom:3px; margin-bottom:2px; }
  .id-field { display:flex; justify-content:space-between; font-size:9px; color:#e8f5ee; }
  .id-field span:first-child { color:rgba(255,255,255,.65); font-weight:500; min-width:50px; }
  .id-card__footer { padding:6px 12px; background:rgba(0,0,0,.25); display:flex; justify-content:space-between; font-size:9px; color:#c8e6c9; }
  @media print { body { background:white; } @page { size: 3.37in 2.12in landscape; margin:0; } }
</style></head><body>
<div style="display:flex;gap:20px;flex-wrap:wrap;justify-content:center">${cardHTML.replace(/class="id-card /g, 'style="" class="id-card ')}</div>
<script>window.onload=()=>window.print();</script>
</body></html>`;
}

export async function studentFormPage(id?: string) {
  let existing: Student | null = null;
  mount(id ? "Edit Student" : "Admit New Student", `<div class="loading">Loading…</div>`);

  type SectionItem = { id: string; name: string; grade_id?: string; grade_name?: string };
  let grades: { id: string; name: string; level: number }[] = [];
  let allSections: SectionItem[] = [];
  try {
    const [gr, sec] = await Promise.all([
      apiFetch("/grades") as Promise<{ data: { id: string; name: string; level: number }[] }>,
      apiFetch("/sections") as Promise<{ data: SectionItem[] }>,
    ]);
    grades = gr.data;
    allSections = sec.data;
  } catch { /* non-fatal */ }

  if (id) {
    try {
      const r = await apiFetch(`/students/${id}`) as { student: Student };
      existing = r.student;
    } catch { /* new form fallback */ }
  }

  const today = new Date().toISOString().slice(0, 10);
  const v   = (f: keyof Student, fallback = "") => existing ? String(existing[f] ?? fallback) : fallback;
  const sel = (f: keyof Student, val: string) => v(f) === val ? "selected" : "";
  const gradeOpts = `<option value="">— Select Grade —</option>` +
    grades.map(g => `<option value="${g.id}" ${v("admitted_grade_id") === g.id ? "selected" : ""}>${g.name}</option>`).join("");
  const sectionOpts = `<option value="">— None / Select Later —</option>` +
    allSections.map(s2 => `<option value="${s2.id}">${s2.grade_name ? s2.grade_name + " — " : ""}${s2.name}</option>`).join("");

  document.getElementById("page-content")!.innerHTML = `
    <form id="stuForm" autocomplete="off">

      <!-- ══ REGISTER HEADER ══════════════════════════════════════ -->
      <div class="reg-form-header card">
        <div class="reg-form-title">
          <span class="reg-form-title__main">${id ? "Edit Student Record" : "Student Admission Form"}</span>
          <span class="reg-form-title__sub">General Register Entry — Government Boys Higher Secondary School, Bhiria City</span>
        </div>
        <div class="reg-form-meta form-grid">
          <label class="field">
            <span class="field__label">Serial No. <span class="badge badge--active" style="font-size:10px;padding:2px 6px">Auto</span></span>
            <input name="serialNo" type="number" value="${v("serial_no")}" placeholder="Auto-assigned" min="1"/>
          </label>
          <label class="field">
            <span class="field__label">G.R. No. (General Register No.)</span>
            <input name="grNumber" value="${v("gr_number") || v("general_register_no")}" placeholder="Assigned at admission"/>
          </label>
          <label class="field">
            <span class="field__label">Date <span class="muted">(Admission Date)</span></span>
            <input name="admissionDate" type="date" value="${v("admission_date").slice(0, 10) || today}"/>
          </label>
          <label class="field">
            <span class="field__label">Status</span>
            <select name="status">
              <option value="active"     ${sel("status","active")}>Active</option>
              <option value="withdrawn"  ${sel("status","withdrawn")}>Withdrawn</option>
              <option value="passed_out" ${sel("status","passed_out")}>Passed Out</option>
              <option value="alumni"     ${sel("status","alumni")}>Alumni</option>
            </select>
          </label>
        </div>
      </div>

      <!-- ══ PERSONAL DETAILS ══════════════════════════════════ -->
      <div class="form-section card mt-16">
        <h3 class="form-section__title">Personal Details</h3>
        <div class="form-grid">
          <label class="field form-col-span2">
            <span class="field__label">Full Name (First &amp; Last) *</span>
            <div class="input-group">
              <input name="firstName" required value="${v("first_name")}" placeholder="First name" style="flex:1"/>
              <input name="lastName"  required value="${v("last_name")}"  placeholder="Last / Family name" style="flex:1"/>
            </div>
          </label>
          <label class="field">
            <span class="field__label">Father Name (S/o) *</span>
            <input name="fatherName" required value="${v("father_name")}" placeholder="Father / Guardian name"/>
          </label>
          <label class="field">
            <span class="field__label">Mother Name</span>
            <input name="motherName" value="${v("mother_name")}" placeholder="Mother's name"/>
          </label>
          <label class="field">
            <span class="field__label">Race / Caste</span>
            <input name="caste" value="${v("caste")}" placeholder="e.g. Rajput, Syed, Baloch"/>
          </label>
          <label class="field">
            <span class="field__label">Religion</span>
            <select name="religion">
              <option value="">— Select —</option>
              <option value="Islam"        ${sel("religion","Islam")}>Islam</option>
              <option value="Hinduism"     ${sel("religion","Hinduism")}>Hinduism</option>
              <option value="Christianity" ${sel("religion","Christianity")}>Christianity</option>
              <option value="Other"        ${sel("religion","Other")}>Other</option>
            </select>
          </label>
          <label class="field">
            <span class="field__label">Place of Birth</span>
            <input name="placeOfBirth" value="${v("place_of_birth")}" placeholder="City / Village"/>
          </label>
          <label class="field">
            <span class="field__label">Date of Birth (Figures) *</span>
            <input name="dateOfBirth" type="date" required value="${v("date_of_birth").slice(0, 10)}"/>
          </label>
          <label class="field">
            <span class="field__label">Gender *</span>
            <select name="gender" required>
              <option value="">— Select —</option>
              <option value="male"   ${sel("gender","male")}>Male</option>
              <option value="female" ${sel("gender","female")}>Female</option>
              <option value="other"  ${sel("gender","other")}>Other</option>
            </select>
          </label>
          <label class="field">
            <span class="field__label">Nationality</span>
            <input name="nationality" value="${v("nationality") || "Pakistani"}"/>
          </label>
        </div>
      </div>

      <!-- ══ ADMISSION DETAILS ═════════════════════════════════ -->
      <div class="form-section card mt-16">
        <h3 class="form-section__title">Admission Details</h3>
        <div class="form-grid">
          <label class="field">
            <span class="field__label">Last School Attended</span>
            <input name="lastSchoolAttended" value="${v("last_school_attended")}" placeholder="Previous school name"/>
          </label>
          <label class="field">
            <span class="field__label">Class in Which Admitted</span>
            <select name="admittedGradeId">${gradeOpts}</select>
          </label>
          ${!id ? `
          <label class="field">
            <span class="field__label">Enroll in Section <span class="muted" style="font-size:11px">(optional — creates enrollment record)</span></span>
            <select name="sectionId">${sectionOpts}</select>
          </label>
          <label class="field">
            <span class="field__label">Roll Number <span class="muted" style="font-size:11px">(if enrolling)</span></span>
            <input name="rollNumber" placeholder="e.g. 12"/>
          </label>
          ` : ""}
          <label class="field">
            <span class="field__label">Studying in This Class Since</span>
            <input name="classStudyingSince" type="date" value="${v("class_studying_since").slice(0, 10)}"/>
          </label>
        </div>
      </div>

      <!-- ══ IDENTIFICATION / CNIC ═════════════════════════════ -->
      <div class="form-section card mt-16">
        <h3 class="form-section__title">Identification Documents</h3>
        <div class="form-grid">
          <label class="field">
            <span class="field__label">Student B-Form / CNIC</span>
            <input name="cnicFormB" value="${v("cnic_form_b")}" placeholder="XXXXX-XXXXXXX-X"/>
          </label>
          <label class="field">
            <span class="field__label">Father CNIC</span>
            <input name="fatherCnic" value="${v("father_cnic")}" placeholder="XXXXX-XXXXXXX-X"/>
          </label>
          <label class="field">
            <span class="field__label">Enrollment Number</span>
            <input name="enrollmentNumber" value="${v("enrollment_number")}" placeholder="Auto-generated if blank"/>
          </label>
        </div>
      </div>

      <!-- ══ CONTACT ═══════════════════════════════════════════ -->
      <div class="form-section card mt-16">
        <h3 class="form-section__title">Contact &amp; Address</h3>
        <div class="form-grid">
          <label class="field">
            <span class="field__label">Phone</span>
            <input name="phone" type="tel" value="${v("phone")}" placeholder="03XX-XXXXXXX"/>
          </label>
          <label class="field">
            <span class="field__label">Email</span>
            <input name="email" type="email" value="${v("email")}"/>
          </label>
          <label class="field">
            <span class="field__label">Guardian Name</span>
            <input name="guardianName" value="${v("guardian_name")}" placeholder="If different from father"/>
          </label>
          <label class="field">
            <span class="field__label">Guardian Relation</span>
            <input name="guardianRelation" value="${v("guardian_relation")}" placeholder="e.g. Uncle, Elder Brother"/>
          </label>
          <label class="field form-col-span2">
            <span class="field__label">Home Address</span>
            <textarea name="address" rows="2">${v("address")}</textarea>
          </label>
        </div>
      </div>

      <!-- ══ LEAVING DETAILS (always visible for completeness) ═ -->
      <div class="form-section card mt-16">
        <h3 class="form-section__title">Leaving / Transfer Details <span class="muted" style="font-size:12px;font-weight:400">(fill when student leaves)</span></h3>
        <div class="form-grid">
          <label class="field">
            <span class="field__label">Date of Leaving School</span>
            <input name="dateOfLeaving" type="date" value="${v("date_of_leaving").slice(0, 10)}"/>
          </label>
          <label class="field">
            <span class="field__label">Class Left (label)</span>
            <input name="classLeftLabel" value="${v("class_left_label")}" placeholder="e.g. X-A, 9th"/>
          </label>
          <label class="field">
            <span class="field__label">Conduct</span>
            <select name="conductOnLeaving">
              <option value="">— Select —</option>
              <option value="Good"         ${sel("conduct_on_leaving","Good")}>Good</option>
              <option value="Satisfactory" ${sel("conduct_on_leaving","Satisfactory")}>Satisfactory</option>
              <option value="Excellent"    ${sel("conduct_on_leaving","Excellent")}>Excellent</option>
              <option value="Fair"         ${sel("conduct_on_leaving","Fair")}>Fair</option>
            </select>
          </label>
          <label class="field">
            <span class="field__label">Progress / Result</span>
            <select name="progressOnLeaving">
              <option value="">— Select —</option>
              <option value="Promoted"  ${sel("progress_on_leaving","Promoted")}>Promoted</option>
              <option value="Passed"    ${sel("progress_on_leaving","Passed")}>Passed</option>
              <option value="Failed"    ${sel("progress_on_leaving","Failed")}>Failed</option>
              <option value="Left"      ${sel("progress_on_leaving","Left")}>Left mid-year</option>
            </select>
          </label>
          <label class="field form-col-span2">
            <span class="field__label">Reason of Leaving School</span>
            <textarea name="reasonForLeaving" rows="2" placeholder="e.g. Transfer, Passed out, Family relocation">${v("reason_for_leaving")}</textarea>
          </label>
          <label class="field form-col-span2">
            <span class="field__label">Remarks</span>
            <textarea name="remarks" rows="2" placeholder="e.g. No arrears outstanding, Behaviour satisfactory">${v("remarks")}</textarea>
          </label>
        </div>
      </div>

      <!-- ══ SUBMIT ═════════════════════════════════════════════ -->
      <div class="card mt-16">
        <div class="form-actions">
          <button type="submit" class="btn btn--lg">${id ? "Save Changes" : "Admit Student"}</button>
          <a href="${id ? `/students/${id}` : "/students"}" data-link class="btn btn--ghost">Cancel</a>
          <span class="form-err" id="formErr"></span>
        </div>
      </div>
    </form>`;

  document.getElementById("stuForm")!.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd  = new FormData(e.target as HTMLFormElement);
    const g   = (n: string) => fd.get(n) as string | null;
    const opt = (n: string) => g(n) || undefined;
    const num = (n: string) => { const v = g(n); return v ? Number(v) : undefined; };

    const payload: Record<string, unknown> = {
      firstName:           g("firstName"),
      lastName:            g("lastName"),
      fatherName:          opt("fatherName"),
      motherName:          opt("motherName"),
      guardianName:        opt("guardianName"),
      guardianRelation:    opt("guardianRelation"),
      grNumber:            opt("grNumber"),
      enrollmentNumber:    opt("enrollmentNumber"),
      cnicFormB:           opt("cnicFormB"),
      fatherCnic:          opt("fatherCnic"),
      dateOfBirth:         opt("dateOfBirth"),
      gender:              opt("gender"),
      religion:            opt("religion"),
      caste:               opt("caste"),
      nationality:         opt("nationality"),
      placeOfBirth:        opt("placeOfBirth"),
      phone:               opt("phone"),
      email:               opt("email"),
      address:             opt("address"),
      admissionDate:       opt("admissionDate"),
      lastSchoolAttended:  opt("lastSchoolAttended"),
      admittedGradeId:     opt("admittedGradeId"),
      sectionId:           opt("sectionId"),
      rollNumber:          opt("rollNumber"),
      status:              g("status") || "active",
      // General Register fields
      serialNo:            num("serialNo"),
      classStudyingSince:  opt("classStudyingSince"),
      dateOfLeaving:       opt("dateOfLeaving"),
      classLeftLabel:      opt("classLeftLabel"),
      conductOnLeaving:    opt("conductOnLeaving"),
      progressOnLeaving:   opt("progressOnLeaving"),
      reasonForLeaving:    opt("reasonForLeaving"),
      remarks:             opt("remarks"),
    };

    const errEl = document.getElementById("formErr")!;
    errEl.textContent = "";
    try {
      if (id) {
        await apiFetch(`/students/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
        toast("Student updated", "ok");
        navigate(`/students/${id}`);
      } else {
        const res = await apiFetch("/students", { method: "POST", body: JSON.stringify(payload) }) as { id: string };
        toast("Student admitted successfully", "ok");
        navigate(`/students/${res.id}`);
      }
    } catch (err: unknown) {
      errEl.textContent = err instanceof Error ? err.message : String(err);
    }
  });
}
