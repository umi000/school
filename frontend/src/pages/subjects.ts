import { apiFetch } from "../api";
import { mount, toast } from "../shell";

interface Subject { id: string; name: string; code?: string; subject_type?: string; medium?: string; }
interface Grade { id: string; name: string; }

export async function subjectsPage() {
  mount("Subjects", `<div class="toolbar"><button id="addSubBtn" class="btn">+ Add Subject</button></div><div id="subList"><div class="loading">Loading…</div></div>`);
  await loadSubjects();
  document.getElementById("addSubBtn")!.onclick = () => showSubjectModal(null, loadSubjects);
}

async function loadSubjects() {
  try {
    const [subRes, gradeRes] = await Promise.all([
      apiFetch("/subjects") as Promise<{ data: Subject[]; total: number }>,
      apiFetch("/grades") as Promise<{ data: Grade[] }>,
    ]);
    const grades = gradeRes.data;
    document.getElementById("subList")!.innerHTML = `
      <div class="table-meta">${subRes.total} subjects</div>
      <div class="table-wrap"><table class="tbl">
        <thead><tr><th>Code</th><th>Name</th><th>Type</th><th>Medium</th><th>Actions</th></tr></thead>
        <tbody>${subRes.data.map(s => `<tr>
          <td>${s.code || "—"}</td><td>${s.name}</td><td>${s.subject_type || "—"}</td><td>${s.medium || "—"}</td>
          <td>
            <button class="btn btn--sm" data-edit='${JSON.stringify(s)}'>Edit</button>
            <button class="btn btn--sm btn--danger" data-del="${s.id}">Delete</button>
          </td>
        </tr>`).join("") || "<tr><td colspan='5' class='muted text-center'>No subjects</td></tr>"}</tbody>
      </table></div>`;

    document.getElementById("subList")!.addEventListener("click", async (e) => {
      const ed = (e.target as HTMLElement).closest("[data-edit]");
      if (ed) showSubjectModal(JSON.parse(ed.getAttribute("data-edit")!), loadSubjects, grades);
      const del = (e.target as HTMLElement).closest("[data-del]");
      if (del) {
        if (!confirm("Delete subject?")) return;
        try { await apiFetch(`/subjects/${del.getAttribute("data-del")}`, { method: "DELETE" }); toast("Deleted", "ok"); await loadSubjects(); }
        catch (err: unknown) { toast(err instanceof Error ? err.message : String(err), "err"); }
      }
    });
  } catch (err: unknown) {
    document.getElementById("subList")!.innerHTML = `<div class="alert alert--err">${err instanceof Error ? err.message : String(err)}</div>`;
  }
}

function showSubjectModal(s: Subject | null, onDone: () => void, grades: Grade[] = []) {
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `<div class="modal"><h3>${s ? "Edit Subject" : "Add Subject"}</h3>
    <form id="subForm" class="form-grid">
      <label class="field"><span class="field__label">Name *</span><input name="name" required value="${s?.name ?? ""}"/></label>
      <label class="field"><span class="field__label">Code</span><input name="code" value="${s?.code ?? ""}"/></label>
      <label class="field"><span class="field__label">Type</span>
        <select name="subjectType">
          <option value="core" ${s?.subject_type==="core"?"selected":""}>Core</option>
          <option value="elective" ${s?.subject_type==="elective"?"selected":""}>Elective</option>
          <option value="optional" ${s?.subject_type==="optional"?"selected":""}>Optional</option>
        </select>
      </label>
      <label class="field"><span class="field__label">Medium</span>
        <select name="medium">
          <option value="urdu" ${s?.medium==="urdu"?"selected":""}>Urdu</option>
          <option value="english" ${s?.medium==="english"?"selected":""}>English</option>
          <option value="sindhi" ${s?.medium==="sindhi"?"selected":""}>Sindhi</option>
        </select>
      </label>
      ${grades.length ? `<label class="field form-col-full"><span class="field__label">Assign to Grade(s)</span>
        <div class="checkbox-group">${grades.map(g => `<label class="checkbox-item"><input type="checkbox" name="gradeIds" value="${g.id}"/> ${g.name}</label>`).join("")}</div>
      </label>` : ""}
      <div class="form-row-full">
        <button type="submit" class="btn">${s ? "Save" : "Add"}</button>
        <button type="button" id="cancelSub" class="btn btn--ghost">Cancel</button>
        <span class="form-err" id="subErr"></span>
      </div>
    </form></div>`;
  document.body.appendChild(modal);
  document.getElementById("cancelSub")!.onclick = () => modal.remove();
  document.getElementById("subForm")!.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    const gradeIds = fd.getAll("gradeIds") as string[];
    const payload = { name: fd.get("name"), code: fd.get("code") || undefined, subjectType: fd.get("subjectType"), medium: fd.get("medium"), gradeIds: gradeIds.length ? gradeIds : undefined };
    try {
      if (s) await apiFetch(`/subjects/${s.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      else await apiFetch("/subjects", { method: "POST", body: JSON.stringify(payload) });
      toast(s ? "Subject updated" : "Subject added", "ok"); modal.remove(); onDone();
    } catch (err: unknown) { document.getElementById("subErr")!.textContent = err instanceof Error ? err.message : String(err); }
  });
}
