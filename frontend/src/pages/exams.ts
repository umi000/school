import { apiFetch, BASE, printUrl } from "../api"; void BASE;
import { mount, toast } from "../shell";

interface Exam { id: string; title: string; exam_type: string; academic_year_id: string; grade_id?: string; start_date?: string; end_date?: string; status: string; }
interface AcYear { id: string; label: string; }
interface Grade { id: string; name: string; }

export async function examsPage() {
  mount("Examinations", `
    <div class="tab-bar">
      <button class="tab-btn tab-btn--active" data-tab="exams">Examinations</button>
      <button class="tab-btn" data-tab="terms">Assessment Terms</button>
    </div>
    <div id="tab-exams">
      <div class="toolbar"><button id="addExamBtn" class="btn">+ New Examination</button></div>
      <div id="examList"><div class="loading">Loading…</div></div>
      <div id="examDetail" class="mt-16"></div>
    </div>
    <div id="tab-terms" class="hidden">
      <div id="termsSection"><div class="loading">Loading…</div></div>
    </div>`);

  // Tab switching
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("tab-btn--active"));
      btn.classList.add("tab-btn--active");
      const tabId = (btn as HTMLElement).dataset.tab!;
      document.getElementById("tab-exams")!.classList.toggle("hidden", tabId !== "exams");
      document.getElementById("tab-terms")!.classList.toggle("hidden", tabId !== "terms");
      if (tabId === "terms") loadTerms();
    });
  });

  await loadExams();
  document.getElementById("addExamBtn")!.onclick = async () => {
    const [ayRes, gRes] = await Promise.all([
      apiFetch("/academic-years") as Promise<{ data: AcYear[] }>,
      apiFetch("/grades") as Promise<{ data: Grade[] }>,
    ]);
    showExamModal(null, () => loadExams(), ayRes.data, gRes.data);
  };
}

interface Term { id: string; name: string; academic_year_id: string; academic_year_label?: string; start_date?: string; end_date?: string; }

async function loadTerms() {
  const el = document.getElementById("termsSection")!;
  try {
    const [termsData, ayData] = await Promise.all([
      apiFetch("/assessment-terms") as Promise<{ data: Term[] }>,
      apiFetch("/academic-years")   as Promise<{ data: AcYear[] }>,
    ]);
    const terms    = termsData.data;
    const ayOptions = `<option value="">— Academic Year —</option>` + ayData.data.map(a => `<option value="${a.id}">${a.label}</option>`).join("");

    const rows = terms.map(t => `<tr>
      <td>${t.name}</td>
      <td>${t.academic_year_label||"—"}</td>
      <td>${t.start_date?t.start_date.slice(0,10):"—"}</td>
      <td>${t.end_date?t.end_date.slice(0,10):"—"}</td>
      <td>
        <button class="btn btn--sm btn--danger" data-del-term="${t.id}">Delete</button>
      </td>
    </tr>`).join("") || `<tr><td colspan="5" class="muted text-center">No terms yet.</td></tr>`;

    el.innerHTML = `
      <div class="card mt-16">
        <div class="card-header-row">
          <h3>Assessment Terms</h3>
          <button id="addTermBtn" class="btn">+ Add Term</button>
        </div>
        <div class="table-wrap">
          <table class="tbl">
            <thead><tr><th>Name</th><th>Academic Year</th><th>Start</th><th>End</th><th>Action</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <!-- Add form -->
        <div class="card mt-16" id="termFormCard" style="display:none">
          <h4>Add New Term</h4>
          <form id="termForm">
            <div class="form-grid">
              <label class="field"><span class="field__label">Term Name *</span>
                <input id="termName" type="text" placeholder="e.g. Midterm, Annual" required/>
              </label>
              <label class="field"><span class="field__label">Academic Year *</span>
                <select id="termAY" required>${ayOptions}</select>
              </label>
              <label class="field"><span class="field__label">Start Date</span>
                <input id="termStart" type="date"/>
              </label>
              <label class="field"><span class="field__label">End Date</span>
                <input id="termEnd" type="date"/>
              </label>
            </div>
            <div class="form-actions"><button type="submit" class="btn">Save</button>
              <button type="button" id="cancelTermBtn" class="btn btn--ghost">Cancel</button></div>
          </form>
        </div>
      </div>`;

    document.getElementById("addTermBtn")!.addEventListener("click", () => {
      (document.getElementById("termFormCard") as HTMLElement).style.display = "";
    });
    document.getElementById("cancelTermBtn")!.addEventListener("click", () => {
      (document.getElementById("termFormCard") as HTMLElement).style.display = "none";
    });
    document.getElementById("termForm")!.addEventListener("submit", async (e) => {
      e.preventDefault();
      const payload = {
        name:           (document.getElementById("termName")  as HTMLInputElement).value,
        academicYearId: (document.getElementById("termAY")    as HTMLSelectElement).value,
        startDate:      (document.getElementById("termStart") as HTMLInputElement).value || null,
        endDate:        (document.getElementById("termEnd")   as HTMLInputElement).value || null,
      };
      try {
        await apiFetch("/assessment-terms", { method: "POST", body: JSON.stringify(payload) });
        toast("Term added", "ok");
        await loadTerms();
      } catch (err: unknown) { toast(err instanceof Error ? err.message : String(err), "err"); }
    });
    el.addEventListener("click", async (e) => {
      const del = (e.target as HTMLElement).closest("[data-del-term]");
      if (del) {
        if (!confirm("Delete this term?")) return;
        try {
          await apiFetch(`/assessment-terms/${del.getAttribute("data-del-term")}`, { method: "DELETE" });
          toast("Deleted","ok"); await loadTerms();
        } catch (err: unknown) { toast(err instanceof Error ? err.message : String(err), "err"); }
      }
    });
  } catch (err: unknown) {
    el.innerHTML = `<div class="alert alert--err">${err instanceof Error ? err.message : String(err)}</div>`;
  }
}

async function loadExams() {
  try {
    const data = await apiFetch("/examinations") as { data: Exam[]; total: number };
    const exams = data.data;
    // Store exam objects for edit lookups
    (window as unknown as Record<string,unknown>).__examsCache = exams;

    document.getElementById("examList")!.innerHTML = exams.length
      ? `<div class="table-wrap"><table class="tbl">
          <thead><tr><th>Title</th><th>Type</th><th>Start</th><th>End</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>${exams.map(ex => `<tr>
            <td>${ex.title}</td>
            <td>${ex.exam_type}</td>
            <td>${ex.start_date ? ex.start_date.slice(0,10) : "—"}</td>
            <td>${ex.end_date ? ex.end_date.slice(0,10) : "—"}</td>
            <td><span class="badge badge--${ex.status}">${ex.status}</span></td>
            <td>
              <button class="btn btn--sm btn--ghost" data-edit-ex="${ex.id}">✏️ Edit</button>
              <button class="btn btn--sm" data-datesheet="${ex.id}">Datesheet</button>
              <button class="btn btn--sm" data-seats="${ex.id}">Seats</button>
              <a href="${printUrl(`/reports/exam-slips/${ex.id}`)}" target="_blank" class="btn btn--sm btn--ghost">Print Slips</a>
              <button class="btn btn--sm btn--danger" data-del-ex="${ex.id}">Del</button>
            </td>
          </tr>`).join("")}</tbody>
        </table></div>`
      : `<p class="muted">No examinations yet. Create one to get started.</p>`;

    document.getElementById("examList")!.addEventListener("click", async (e) => {
      const editBtn = (e.target as HTMLElement).closest("[data-edit-ex]");
      if (editBtn) {
        const eid = editBtn.getAttribute("data-edit-ex")!;
        const cached = ((window as unknown as Record<string,unknown>).__examsCache as Exam[]).find(x => x.id === eid) || null;
        const [ayRes, gRes] = await Promise.all([
          apiFetch("/academic-years") as Promise<{ data: AcYear[] }>,
          apiFetch("/grades") as Promise<{ data: Grade[] }>,
        ]);
        showExamModal(cached, () => loadExams(), ayRes.data, gRes.data);
        return;
      }
      const ds = (e.target as HTMLElement).closest("[data-datesheet]");
      if (ds) showDatesheet(ds.getAttribute("data-datesheet")!);
      const seats = (e.target as HTMLElement).closest("[data-seats]");
      if (seats) showSeats(seats.getAttribute("data-seats")!);
      const del = (e.target as HTMLElement).closest("[data-del-ex]");
      if (del) {
        if (!confirm("Delete examination?")) return;
        try { await apiFetch(`/examinations/${del.getAttribute("data-del-ex")}`, { method: "DELETE" }); toast("Deleted", "ok"); await loadExams(); }
        catch (err: unknown) { toast(err instanceof Error ? err.message : String(err), "err"); }
      }
    });
  } catch (err: unknown) {
    document.getElementById("examList")!.innerHTML = `<div class="alert alert--err">${err instanceof Error ? err.message : String(err)}</div>`;
  }
}

async function showDatesheet(examId: string) {
  const det = document.getElementById("examDetail")!;
  det.innerHTML = `<div class="card"><div class="loading">Loading datesheet…</div></div>`;
  try {
    const [sched, subjects] = await Promise.all([
      apiFetch(`/examinations/${examId}/schedule`) as Promise<{ data: unknown[] }>,
      apiFetch("/subjects") as Promise<{ data: { id: string; name: string }[] }>,
    ]);
    const subOpts = subjects.data.map(s => `<option value="${s.id}">${s.name}</option>`).join("");
    det.innerHTML = `<div class="card">
      <div class="card-header-row"><h3>Datesheet</h3><button id="addDS" class="btn btn--sm">+ Add Line</button></div>
      <div class="table-wrap"><table class="tbl">
        <thead><tr><th>Subject</th><th>Date</th><th>Start</th><th>End</th><th>Room</th></tr></thead>
        <tbody>${(sched.data as Record<string,unknown>[]).map(l => `<tr><td>${String(l.subject_name||"—")}</td><td>${String(l.exam_date||"").slice(0,10)}</td><td>${String(l.start_time||"—")}</td><td>${String(l.end_time||"—")}</td><td>${String(l.room||"—")}</td></tr>`).join("") || "<tr><td colspan='5' class='muted text-center'>No datesheet lines</td></tr>"}</tbody>
      </table></div>
      <div id="dsForm" class="mt-16" style="display:none;">
        <form id="addDSForm" class="form-grid">
          <label class="field"><span class="field__label">Subject</span><select name="subjectId">${subOpts}</select></label>
          <label class="field"><span class="field__label">Date</span><input name="examDate" type="date" required/></label>
          <label class="field"><span class="field__label">Start Time</span><input name="startTime" type="time"/></label>
          <label class="field"><span class="field__label">End Time</span><input name="endTime" type="time"/></label>
          <label class="field"><span class="field__label">Room</span><input name="room"/></label>
          <div class="form-row-full">
            <button type="submit" class="btn btn--sm">Add Line</button>
            <button type="button" id="cancelDS" class="btn btn--ghost btn--sm">Cancel</button>
            <span class="form-err" id="dsErr"></span>
          </div>
        </form>
      </div>
    </div>`;

    document.getElementById("addDS")!.onclick = () => { document.getElementById("dsForm")!.style.display = "block"; };
    document.getElementById("cancelDS")!.onclick = () => { document.getElementById("dsForm")!.style.display = "none"; };
    document.getElementById("addDSForm")!.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target as HTMLFormElement);
      try {
        await apiFetch(`/examinations/${examId}/schedule`, { method: "POST", body: JSON.stringify({ subjectId: fd.get("subjectId"), examDate: fd.get("examDate"), startTime: fd.get("startTime") || undefined, endTime: fd.get("endTime") || undefined, room: fd.get("room") || undefined }) });
        toast("Schedule line added", "ok"); showDatesheet(examId);
      } catch (err: unknown) { document.getElementById("dsErr")!.textContent = err instanceof Error ? err.message : String(err); }
    });
  } catch (err: unknown) { det.innerHTML = `<div class="alert alert--err">${err instanceof Error ? err.message : String(err)}</div>`; }
}

async function showSeats(examId: string) {
  const det = document.getElementById("examDetail")!;
  det.innerHTML = `<div class="card">
    <div class="card-header-row"><h3>Seat Assignments</h3></div>
    <p class="muted">Bulk assign seat numbers automatically:</p>
    <form id="seatForm">
      <label class="field"><span class="field__label">Starting Seat No</span><input name="startSeat" type="number" value="1" min="1"/></label>
      <button type="submit" class="btn btn--sm mt-8">Auto Assign Seats</button>
      <span class="form-err" id="seatErr"></span>
    </form>
    <div id="seatTable" class="mt-16"><div class="loading">Loading seats…</div></div>
  </div>`;

  document.getElementById("seatForm")!.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    try {
      await apiFetch(`/examinations/${examId}/seats/assign-bulk`, { method: "POST", body: JSON.stringify({ startSeat: Number(fd.get("startSeat")) }) });
      toast("Seats assigned", "ok"); loadSeats(examId);
    } catch (err: unknown) { document.getElementById("seatErr")!.textContent = err instanceof Error ? err.message : String(err); }
  });

  loadSeats(examId);
}

async function loadSeats(examId: string) {
  try {
    const data = await apiFetch(`/examinations/${examId}/seats`) as { data: unknown[] };
    document.getElementById("seatTable")!.innerHTML = `<div class="table-wrap"><table class="tbl">
      <thead><tr><th>Seat No</th><th>Student</th><th>GR #</th></tr></thead>
      <tbody>${(data.data as Record<string,unknown>[]).map(s => `<tr><td>${String(s.seat_number||"—")}</td><td>${String(s.student_name||"—")}</td><td>${String(s.gr_number||"—")}</td></tr>`).join("") || "<tr><td colspan='3' class='muted text-center'>No seats assigned</td></tr>"}</tbody>
    </table></div>`;
  } catch {}
}

function showExamModal(ex: Exam | null, onDone: () => void, academicYears: AcYear[], grades: Grade[]) {
  const ayOpts = academicYears.map(a => `<option value="${a.id}" ${ex?.academic_year_id===a.id?"selected":""}>${a.label}</option>`).join("");
  const grOpts = grades.map(g => `<option value="${g.id}" ${ex?.grade_id===g.id?"selected":""}>${g.name}</option>`).join("");
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `<div class="modal"><h3>${ex ? "Edit Examination" : "New Examination"}</h3>
    <form id="examForm" class="form-grid">
      <label class="field"><span class="field__label">Title *</span><input name="title" required value="${ex?.title??""}" placeholder="Annual Exam 2025"/></label>
      <label class="field"><span class="field__label">Type *</span>
        <select name="examType" required>
          <option value="annual" ${ex?.exam_type==="annual"?"selected":""}>Annual</option>
          <option value="half_yearly" ${ex?.exam_type==="half_yearly"?"selected":""}>Half Yearly</option>
          <option value="monthly" ${ex?.exam_type==="monthly"?"selected":""}>Monthly Test</option>
          <option value="mock" ${ex?.exam_type==="mock"?"selected":""}>Mock</option>
        </select>
      </label>
      <label class="field"><span class="field__label">Academic Year *</span><select name="academicYearId" required>${ayOpts}</select></label>
      <label class="field"><span class="field__label">Grade (optional)</span><select name="gradeId"><option value="">All grades</option>${grOpts}</select></label>
      <label class="field"><span class="field__label">Start Date</span><input name="startDate" type="date" value="${ex?.start_date?.slice(0,10)??""}" /></label>
      <label class="field"><span class="field__label">End Date</span><input name="endDate" type="date" value="${ex?.end_date?.slice(0,10)??""}" /></label>
      <div class="form-row-full">
        <button type="submit" class="btn">${ex?"Save":"Create"}</button>
        <button type="button" id="cancelEx" class="btn btn--ghost">Cancel</button>
        <span class="form-err" id="exErr"></span>
      </div>
    </form></div>`;
  document.body.appendChild(modal);
  document.getElementById("cancelEx")!.onclick = () => modal.remove();
  document.getElementById("examForm")!.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    const p = { title: fd.get("title"), examType: fd.get("examType"), academicYearId: fd.get("academicYearId"), gradeId: fd.get("gradeId") || undefined, startDate: fd.get("startDate") || undefined, endDate: fd.get("endDate") || undefined };
    try {
      if (ex) await apiFetch(`/examinations/${ex.id}`, { method: "PATCH", body: JSON.stringify(p) });
      else await apiFetch("/examinations", { method: "POST", body: JSON.stringify(p) });
      toast(ex?"Updated":"Created","ok"); modal.remove(); onDone();
    } catch (err: unknown) { document.getElementById("exErr")!.textContent = err instanceof Error ? err.message : String(err); }
  });
}
