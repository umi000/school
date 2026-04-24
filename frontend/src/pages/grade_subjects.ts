import { apiFetch } from "../api";
import { mount, toast } from "../shell";

interface GS { grade_id: string; subject_id: string; grade_name: string; subject_name: string; passing_marks: number; max_marks: number; has_practical: boolean; practical_passing_marks?: number; }
interface Grade   { id: string; name: string; }
interface Subject { id: string; name: string; code?: string; }

export async function gradeSubjectsPage() {
  mount("Grade Subjects & Passing Marks", `<div class="loading">Loading…</div>`);

  const [gsData, grData, subData] = await Promise.all([
    apiFetch("/grade-subjects") as Promise<{ data: GS[] }>,
    apiFetch("/grades")         as Promise<{ data: Grade[] }>,
    apiFetch("/subjects")       as Promise<{ data: Subject[] }>,
  ]);

  let gs  = gsData.data  || [];
  const grades   = grData.data   || [];
  const subjects = subData.data  || [];

  let filterGradeId = "";

  const gradeOpts = `<option value="">All Grades</option>` + grades.map(g => `<option value="${g.id}">${g.name}</option>`).join("");
  const gradeSelOpts = `<option value="">— Select Grade —</option>` + grades.map(g => `<option value="${g.id}">${g.name}</option>`).join("");
  const subjectSelOpts = `<option value="">— Select Subject —</option>` + subjects.map(s => `<option value="${s.id}">${s.name}${s.code ? ` (${s.code})` : ""}</option>`).join("");

  document.getElementById("page-content")!.innerHTML = `
    <div class="card">
      <div class="card-header-row">
        <div>
          <h3>Subject Assignments per Grade</h3>
          <p class="muted">Define which subjects are taught in each grade with passing marks for pass/fail logic.</p>
        </div>
        <button id="btnAddGS" class="btn">+ Assign Subject to Grade</button>
      </div>
      <div class="form-grid" style="margin-bottom:12px">
        <label class="field"><span class="field__label">Filter by Grade</span>
          <select id="gradeFilter">${gradeOpts}</select>
        </label>
      </div>
      <div id="gsTable"><div class="loading">Loading…</div></div>
    </div>

    <!-- Modal -->
    <div id="gsModal" class="modal hidden">
      <div class="modal-overlay" id="gsClose"></div>
      <div class="modal-box" style="max-width:520px">
        <h3>Assign Subject to Grade</h3>
        <form id="gsForm">
          <div class="form-grid">
            <label class="field"><span class="field__label">Grade *</span>
              <select id="gsGrade" required>${gradeSelOpts}</select>
            </label>
            <label class="field"><span class="field__label">Subject *</span>
              <select id="gsSubject" required>${subjectSelOpts}</select>
            </label>
            <label class="field"><span class="field__label">Max Marks</span>
              <input id="gsMax" type="number" value="100" min="1"/>
            </label>
            <label class="field"><span class="field__label">Passing Marks *</span>
              <input id="gsPassing" type="number" value="33" required min="1"/>
            </label>
            <label class="field"><span class="field__label">Has Practical?</span>
              <select id="gsHasPractical">
                <option value="false">No</option>
                <option value="true">Yes</option>
              </select>
            </label>
            <label class="field"><span class="field__label">Practical Passing Marks</span>
              <input id="gsPracticalPassing" type="number" placeholder="Leave blank if no practical"/>
            </label>
          </div>
          <div class="form-actions mt-16">
            <button type="submit" class="btn">Save</button>
            <button type="button" id="gsCancelBtn" class="btn btn--ghost">Cancel</button>
          </div>
        </form>
      </div>
    </div>`;

  renderTable(gs, filterGradeId);

  document.getElementById("gradeFilter")!.addEventListener("change", (e) => {
    filterGradeId = (e.target as HTMLSelectElement).value;
    const filtered = filterGradeId ? gs.filter(g => g.grade_id === filterGradeId) : gs;
    renderTable(filtered, filterGradeId);
  });
  document.getElementById("btnAddGS")!.addEventListener("click", () => document.getElementById("gsModal")!.classList.remove("hidden"));
  document.getElementById("gsClose")!.addEventListener("click", closeModal);
  document.getElementById("gsCancelBtn")!.addEventListener("click", closeModal);

  document.getElementById("gsForm")!.addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = {
      gradeId:              (document.getElementById("gsGrade")           as HTMLSelectElement).value,
      subjectId:            (document.getElementById("gsSubject")         as HTMLSelectElement).value,
      maxMarks:             Number((document.getElementById("gsMax")              as HTMLInputElement).value),
      passingMarks:         Number((document.getElementById("gsPassing")          as HTMLInputElement).value),
      hasPractical:         (document.getElementById("gsHasPractical")    as HTMLSelectElement).value === "true",
      practicalPassingMarks: (document.getElementById("gsPracticalPassing") as HTMLInputElement).value
        ? Number((document.getElementById("gsPracticalPassing") as HTMLInputElement).value) : null,
    };
    try {
      await apiFetch("/grade-subjects", { method: "POST", body: JSON.stringify(payload) });
      toast("Subject assigned to grade", "ok");
      closeModal();
      const r = await apiFetch("/grade-subjects") as { data: GS[] };
      gs = r.data;
      renderTable(filterGradeId ? gs.filter(g => g.grade_id === filterGradeId) : gs, filterGradeId);
    } catch (err: unknown) { toast(err instanceof Error ? err.message : String(err), "err"); }
  });

  document.getElementById("gsTable")!.addEventListener("click", async (e) => {
    const delBtn = (e.target as HTMLElement).closest("[data-del-gs]");
    if (delBtn) {
      if (!confirm("Remove this subject from grade?")) return;
      const [gid, sid] = (delBtn.getAttribute("data-del-gs") || "").split("|");
      try {
        await apiFetch(`/grade-subjects?gradeId=${gid}&subjectId=${sid}`, { method: "DELETE" });
        toast("Removed", "ok");
        const r = await apiFetch("/grade-subjects") as { data: GS[] };
        gs = r.data;
        renderTable(filterGradeId ? gs.filter(g => g.grade_id === filterGradeId) : gs, filterGradeId);
      } catch (err: unknown) { toast(err instanceof Error ? err.message : String(err), "err"); }
    }
  });
}

function renderTable(data: GS[], filterGradeId: string) {
  const rows = data.map(g => `<tr>
    <td>${g.grade_name}</td>
    <td>${g.subject_name}</td>
    <td>${g.max_marks}</td>
    <td>${g.passing_marks}</td>
    <td>${g.has_practical ? "Yes" : "No"}</td>
    <td>${g.practical_passing_marks ?? "—"}</td>
    <td><button class="btn btn--sm btn--danger" data-del-gs="${g.grade_id}|${g.subject_id}">Remove</button></td>
  </tr>`).join("") || `<tr><td colspan="7" class="muted text-center">No subjects assigned${filterGradeId ? " to this grade" : ""}. Click + to add.</td></tr>`;
  document.getElementById("gsTable")!.innerHTML = `
    <div class="table-meta">${data.length} assignment(s)</div>
    <div class="table-wrap">
      <table class="tbl">
        <thead><tr><th>Grade</th><th>Subject</th><th>Max</th><th>Pass Marks</th><th>Practical</th><th>Practical Pass</th><th>Action</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function closeModal() {
  document.getElementById("gsModal")!.classList.add("hidden");
}
