import { apiFetch } from "../api";
import { mount, toast } from "../shell";

interface Grade    { id: string; name: string; level: number; }
interface Teacher  { id: string; first_name: string; last_name: string; }
interface Section  { id: string; name: string; grade_id: string; grade_name?: string; capacity?: number; class_teacher_id?: string; class_teacher_name?: string; }

export async function classesPage() {
  mount("Classes (Grades & Sections)", `
    <div class="two-col">
      <div class="card">
        <div class="card-header-row"><h3>Grades</h3><button id="addGradeBtn" class="btn btn--sm">+ Grade</button></div>
        <div id="gradeList"><div class="loading">Loading…</div></div>
      </div>
      <div class="card">
        <div class="card-header-row"><h3>Sections</h3><button id="addSectionBtn" class="btn btn--sm">+ Section</button></div>
        <div id="sectionList"><div class="loading">Loading…</div></div>
      </div>
    </div>`);

  await Promise.all([loadGrades(), loadSections()]);

  document.getElementById("addGradeBtn")!.onclick = () => showGradeModal(null, loadGrades);

  // FIX: fetch grades + teachers first, then open modal
  document.getElementById("addSectionBtn")!.onclick = async () => {
    try {
      const [gradesData, teachersData] = await Promise.all([
        apiFetch("/grades")   as Promise<{ data: Grade[] }>,
        apiFetch("/teachers") as Promise<{ data: Teacher[] }>,
      ]);
      showSectionModal(null, loadSections, gradesData.data, teachersData.data);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : String(err), "err");
    }
  };
}

async function loadGrades() {
  try {
    const data = await apiFetch("/grades") as { data: Grade[] };
    document.getElementById("gradeList")!.innerHTML = data.data.length
      ? `<ul class="list">${data.data.map(g => `<li class="list-item">
          <span>${g.name} (Level ${g.level})</span>
          <span>
            <button class="btn btn--xs" data-edit-grade='${JSON.stringify(g)}'>Edit</button>
            <button class="btn btn--xs btn--danger" data-del-grade="${g.id}">Del</button>
          </span>
        </li>`).join("")}</ul>`
      : `<p class="muted">No grades yet</p>`;

    document.getElementById("gradeList")!.addEventListener("click", async (e) => {
      const ed = (e.target as HTMLElement).closest("[data-edit-grade]");
      if (ed) { showGradeModal(JSON.parse(ed.getAttribute("data-edit-grade")!), loadGrades); }
      const del = (e.target as HTMLElement).closest("[data-del-grade]");
      if (del) {
        if (!confirm("Delete grade?")) return;
        try { await apiFetch(`/grades/${del.getAttribute("data-del-grade")}`, { method: "DELETE" }); toast("Grade deleted", "ok"); await loadGrades(); }
        catch (err: unknown) { toast(err instanceof Error ? err.message : String(err), "err"); }
      }
    });
  } catch (err: unknown) {
    document.getElementById("gradeList")!.innerHTML = `<div class="alert alert--err">${err instanceof Error ? err.message : String(err)}</div>`;
  }
}

async function loadSections() {
  try {
    const [gradesData, sectionsData, teachersData] = await Promise.all([
      apiFetch("/grades")   as Promise<{ data: Grade[] }>,
      apiFetch("/sections") as Promise<{ data: Section[] }>,
      apiFetch("/teachers") as Promise<{ data: Teacher[] }>,
    ]);

    document.getElementById("sectionList")!.innerHTML = sectionsData.data.length
      ? `<ul class="list">${sectionsData.data.map(s => `
          <li class="list-item" style="flex-direction:column;align-items:flex-start;gap:2px">
            <div style="display:flex;width:100%;align-items:center;justify-content:space-between">
              <span class="fw-600">${s.grade_name ? s.grade_name + " — " : ""}Section <strong>${s.name}</strong></span>
              <span>
                <button class="btn btn--xs" data-edit-sec='${JSON.stringify(s)}'>Edit</button>
                <button class="btn btn--xs btn--danger" data-del-sec="${s.id}">Del</button>
              </span>
            </div>
            <div style="font-size:12px;color:var(--clr-muted);display:flex;gap:16px;flex-wrap:wrap">
              <span>👤 Class Teacher: <strong>${s.class_teacher_name || "— Not assigned"}</strong></span>
              <span>Capacity: ${s.capacity ?? "—"}</span>
            </div>
          </li>`).join("")}</ul>`
      : `<p class="muted">No sections yet</p>`;

    document.getElementById("sectionList")!.addEventListener("click", async (e) => {
      const ed = (e.target as HTMLElement).closest("[data-edit-sec]");
      if (ed) showSectionModal(JSON.parse(ed.getAttribute("data-edit-sec")!), loadSections, gradesData.data, teachersData.data);
      const del = (e.target as HTMLElement).closest("[data-del-sec]");
      if (del) {
        if (!confirm("Delete section?")) return;
        try { await apiFetch(`/sections/${del.getAttribute("data-del-sec")}`, { method: "DELETE" }); toast("Section deleted", "ok"); await loadSections(); }
        catch (err: unknown) { toast(err instanceof Error ? err.message : String(err), "err"); }
      }
    });
  } catch (err: unknown) {
    document.getElementById("sectionList")!.innerHTML = `<div class="alert alert--err">${err instanceof Error ? err.message : String(err)}</div>`;
  }
}

function showGradeModal(g: Grade | null, onDone: () => void) {
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `<div class="modal"><h3>${g ? "Edit Grade" : "Add Grade"}</h3>
    <form id="gradeForm" class="form-grid">
      <label class="field"><span class="field__label">Grade Name *</span><input name="name" required value="${g?.name ?? ""}"/></label>
      <label class="field"><span class="field__label">Level *</span><input name="level" type="number" min="1" max="16" required value="${g?.level ?? ""}"/></label>
      <div class="form-row-full">
        <button type="submit" class="btn">${g ? "Save" : "Add"}</button>
        <button type="button" id="cancelGrade" class="btn btn--ghost">Cancel</button>
        <span class="form-err" id="gradeErr"></span>
      </div>
    </form></div>`;
  document.body.appendChild(modal);
  document.getElementById("cancelGrade")!.onclick = () => modal.remove();
  document.getElementById("gradeForm")!.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    try {
      if (g) await apiFetch(`/grades/${g.id}`, { method: "PATCH", body: JSON.stringify({ name: fd.get("name"), level: Number(fd.get("level")) }) });
      else    await apiFetch("/grades",         { method: "POST",  body: JSON.stringify({ name: fd.get("name"), level: Number(fd.get("level")) }) });
      toast(g ? "Grade updated" : "Grade added", "ok"); modal.remove(); onDone();
    } catch (err: unknown) { document.getElementById("gradeErr")!.textContent = err instanceof Error ? err.message : String(err); }
  });
}

function showSectionModal(
  s: Section | null,
  onDone: () => void,
  grades: Grade[],
  teachers: Teacher[],
) {
  const gradeOpts   = grades.map(g =>
    `<option value="${g.id}" ${s?.grade_id === g.id ? "selected" : ""}>${g.name}</option>`
  ).join("");

  const teacherOpts = teachers.map(t =>
    `<option value="${t.id}" ${s?.class_teacher_id === t.id ? "selected" : ""}>${t.first_name} ${t.last_name}</option>`
  ).join("");

  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `
    <div class="modal" style="max-width:480px">
      <h3>${s ? "Edit Section" : "Add Section"}</h3>
      <form id="secForm" class="form-grid">
        <label class="field">
          <span class="field__label">Grade *</span>
          <select name="gradeId" required>
            <option value="">— Select Grade —</option>
            ${gradeOpts}
          </select>
        </label>
        <label class="field">
          <span class="field__label">Section Name *</span>
          <input name="name" required value="${s?.name ?? ""}" placeholder="e.g. A, B, Blue"/>
        </label>
        <label class="field">
          <span class="field__label">Class Teacher</span>
          <select name="classTeacherId">
            <option value="">— Not Assigned —</option>
            ${teacherOpts}
          </select>
        </label>
        <label class="field">
          <span class="field__label">Capacity</span>
          <input name="capacity" type="number" min="1" value="${s?.capacity ?? ""}" placeholder="Max students"/>
        </label>
        <div class="form-row-full">
          <button type="submit" class="btn">${s ? "Save" : "Add"}</button>
          <button type="button" id="cancelSec" class="btn btn--ghost">Cancel</button>
          <span class="form-err" id="secErr"></span>
        </div>
      </form>
    </div>`;
  document.body.appendChild(modal);
  document.getElementById("cancelSec")!.onclick = () => modal.remove();

  document.getElementById("secForm")!.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    const payload: Record<string, unknown> = {
      name:           fd.get("name"),
      gradeId:        fd.get("gradeId"),
      classTeacherId: fd.get("classTeacherId") || null,
      capacity:       fd.get("capacity") ? Number(fd.get("capacity")) : null,
    };
    try {
      if (s) await apiFetch(`/sections/${s.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      else    await apiFetch("/sections",         { method: "POST",  body: JSON.stringify(payload) });
      toast(s ? "Section updated" : "Section added", "ok");
      modal.remove();
      onDone();
    } catch (err: unknown) {
      document.getElementById("secErr")!.textContent = err instanceof Error ? err.message : String(err);
    }
  });
}
