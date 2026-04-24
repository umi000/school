import { apiFetch } from "../api";
import { mount, toast } from "../shell";

export async function gradesEntryPage() {
  mount("Marks / Scores", `
    <div class="card">
      <h3>Enter Marks</h3>
      <div class="form-grid">
        <label class="field"><span class="field__label">Examination</span>
          <select id="examSel"><option value="">Loading…</option></select>
        </label>
        <label class="field"><span class="field__label">Subject</span>
          <select id="subSel"><option value="">Loading…</option></select>
        </label>
        <label class="field"><span class="field__label">Section</span>
          <select id="secSel"><option value="">Loading…</option></select>
        </label>
        <div class="form-row-full">
          <button id="loadStudentsBtn" class="btn">Load Students</button>
        </div>
      </div>
    </div>
    <div id="marksPanel" class="mt-16"></div>`);

  const [examRes, subRes, secRes] = await Promise.all([
    apiFetch("/examinations") as Promise<{ data: { id: string; title: string }[] }>,
    apiFetch("/subjects") as Promise<{ data: { id: string; name: string }[] }>,
    apiFetch("/sections") as Promise<{ data: { id: string; name: string; grade_name?: string }[] }>,
  ]).catch(() => [{ data: [] }, { data: [] }, { data: [] }] as [{ data: { id: string; title: string }[] }, { data: { id: string; name: string }[] }, { data: { id: string; name: string; grade_name?: string }[] }]);

  (document.getElementById("examSel") as HTMLSelectElement).innerHTML =
    `<option value="">— Select —</option>` + examRes.data.map((e: { id: string; title: string }) => `<option value="${e.id}">${e.title}</option>`).join("");
  (document.getElementById("subSel") as HTMLSelectElement).innerHTML =
    `<option value="">— Select —</option>` + subRes.data.map((s: { id: string; name: string }) => `<option value="${s.id}">${s.name}</option>`).join("");
  (document.getElementById("secSel") as HTMLSelectElement).innerHTML =
    `<option value="">— Select —</option>` + secRes.data.map((s: { id: string; name: string; grade_name?: string }) => `<option value="${s.id}">${s.grade_name ? s.grade_name + " — " : ""}${s.name}</option>`).join("");

  document.getElementById("loadStudentsBtn")!.onclick = async () => {
    const examId = (document.getElementById("examSel") as HTMLSelectElement).value;
    const subjectId = (document.getElementById("subSel") as HTMLSelectElement).value;
    const sectionId = (document.getElementById("secSel") as HTMLSelectElement).value;
    if (!examId || !subjectId) { toast("Select exam and subject first", "err"); return; }
    await loadMarksPanel(examId, subjectId, sectionId);
  };
}

async function loadMarksPanel(examId: string, subjectId: string, sectionId: string) {
  const panel = document.getElementById("marksPanel")!;
  panel.innerHTML = `<div class="card"><div class="loading">Loading…</div></div>`;
  try {
    const stuRes = await apiFetch(`/students?limit=100${sectionId ? "&sectionId=" + sectionId : ""}`) as { data: { id: string; first_name: string; last_name: string; gr_number?: string }[] };
    const existingRes = await apiFetch(`/scores?examinationId=${examId}&subjectId=${subjectId}${sectionId ? "&sectionId=" + sectionId : ""}`).catch(() => ({ data: [] })) as { data: { student_id: string; obtained_marks?: number; total_marks?: number; grade?: string; remarks?: string }[] };
    const existing = Object.fromEntries((existingRes.data || []).map(s => [s.student_id, s]));

    panel.innerHTML = `<div class="card"><h3>Enter Marks</h3>
      <form id="marksForm">
        <div class="table-wrap"><table class="tbl">
          <thead><tr><th>GR#</th><th>Student</th><th>Obtained</th><th>Total</th><th>Grade</th><th>Remarks</th></tr></thead>
          <tbody>${stuRes.data.map(s => {
            const ex = existing[s.id] || {};
            return `<tr>
              <td>${s.gr_number || "—"}</td>
              <td>${s.first_name} ${s.last_name}</td>
              <td><input name="obt_${s.id}" type="number" min="0" max="9999" class="input-sm" value="${ex.obtained_marks ?? ""}"/></td>
              <td><input name="tot_${s.id}" type="number" min="0" max="9999" class="input-sm" value="${ex.total_marks ?? "100"}"/></td>
              <td><input name="grd_${s.id}" class="input-sm" maxlength="4" value="${ex.grade ?? ""}"/></td>
              <td><input name="rem_${s.id}" class="input-sm" value="${ex.remarks ?? ""}"/></td>
            </tr>`;
          }).join("")}</tbody>
        </table></div>
        <div class="mt-8">
          <button type="submit" class="btn">Save All Marks</button>
          <span class="form-err" id="marksErr"></span>
        </div>
      </form></div>`;

    document.getElementById("marksForm")!.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target as HTMLFormElement);
      const scores = stuRes.data
        .filter((s: { id: string; first_name: string; last_name: string; gr_number?: string }) => fd.get(`obt_${s.id}`) !== "")
        .map((s: { id: string; first_name: string; last_name: string; gr_number?: string }) => ({
          studentId: s.id, examinationId: examId, subjectId,
          obtainedMarks: Number(fd.get(`obt_${s.id}`)),
          totalMarks: Number(fd.get(`tot_${s.id}`)) || 100,
          grade: fd.get(`grd_${s.id}`) || undefined,
          remarks: fd.get(`rem_${s.id}`) || undefined,
        }));
      if (!scores.length) { toast("No marks to save", "err"); return; }
      try {
        await apiFetch("/scores/bulk", { method: "POST", body: JSON.stringify({ scores }) });
        toast(`Saved ${scores.length} marks`, "ok");
      } catch (err: unknown) { document.getElementById("marksErr")!.textContent = err instanceof Error ? err.message : String(err); }
    });
  } catch (err: unknown) { panel.innerHTML = `<div class="alert alert--err">${err instanceof Error ? err.message : String(err)}</div>`; }
}
