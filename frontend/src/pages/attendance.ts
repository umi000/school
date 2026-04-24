import { apiFetch } from "../api";
import { mount, toast } from "../shell";

export async function attendancePage() {
  mount("Attendance", `
    <div class="two-col">
      <div class="card">
        <h3>New Attendance Session</h3>
        <form id="sessForm" class="form-grid">
          <label class="field"><span class="field__label">Section</span>
            <select name="sectionId" id="secSel" required><option value="">Loading…</option></select>
          </label>
          <label class="field"><span class="field__label">Date</span>
            <input name="sessionDate" type="date" required value="${new Date().toISOString().slice(0,10)}"/>
          </label>
          <label class="field"><span class="field__label">Period</span>
            <input name="period" type="number" min="1" max="8" value="1"/>
          </label>
          <label class="field"><span class="field__label">Subject (optional)</span>
            <select name="subjectId"><option value="">All subjects</option></select>
          </label>
          <div class="form-row-full">
            <button type="submit" class="btn">Start Session</button>
            <span class="form-err" id="sessErr"></span>
          </div>
        </form>
      </div>
      <div class="card">
        <h3>Recent Sessions</h3>
        <div id="recentSess"><div class="loading">Loading…</div></div>
      </div>
    </div>
    <div id="markPanel" class="mt-16"></div>`);

  const [secRes, subRes] = await Promise.all([
    apiFetch("/sections") as Promise<{ data: { id: string; name: string; grade_name?: string }[] }>,
    apiFetch("/subjects") as Promise<{ data: { id: string; name: string }[] }>,
  ]).catch(() => [{ data: [] }, { data: [] }] as [{ data: { id: string; name: string; grade_name?: string }[] }, { data: { id: string; name: string }[] }]);

  const secSel = document.getElementById("secSel") as HTMLSelectElement;
  secSel.innerHTML = `<option value="">— Select —</option>` + secRes.data.map((s: { id: string; name: string; grade_name?: string }) => `<option value="${s.id}">${s.grade_name ? s.grade_name + " — " : ""}${s.name}</option>`).join("");

  const subSel = document.querySelector("[name='subjectId']") as HTMLSelectElement;
  subSel.innerHTML = `<option value="">All subjects</option>` + subRes.data.map((s: { id: string; name: string }) => `<option value="${s.id}">${s.name}</option>`).join("");

  await loadRecentSessions();

  document.getElementById("sessForm")!.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    try {
      const sess = await apiFetch("/attendance/sessions", { method: "POST", body: JSON.stringify({
        sectionId: fd.get("sectionId"), sessionDate: fd.get("sessionDate"),
        period: Number(fd.get("period")) || undefined, subjectId: fd.get("subjectId") || undefined
      }) }) as { id: string };
      toast("Session created — mark students below", "ok");
      await markAttendance(sess.id, String(fd.get("sectionId")));
    } catch (err: unknown) { document.getElementById("sessErr")!.textContent = err instanceof Error ? err.message : String(err); }
  });
}

async function loadRecentSessions() {
  try {
    const data = await apiFetch("/attendance/sessions?limit=10") as { data: { id: string; session_date: string; section_name?: string; period?: number }[] };
    document.getElementById("recentSess")!.innerHTML = data.data.length
      ? `<ul class="list">${data.data.map(s => `<li class="list-item"><span>${s.session_date?.slice(0,10)} — ${s.section_name || "?"} P${s.period||"?"}</span><button class="btn btn--xs" data-view-sess="${s.id}">View</button></li>`).join("")}</ul>`
      : `<p class="muted">No sessions yet</p>`;
    document.getElementById("recentSess")!.addEventListener("click", async (e) => {
      const btn = (e.target as HTMLElement).closest("[data-view-sess]");
      if (btn) await viewSession(btn.getAttribute("data-view-sess")!);
    });
  } catch {}
}

async function markAttendance(sessionId: string, sectionId: string) {
  const panel = document.getElementById("markPanel")!;
  panel.innerHTML = `<div class="card"><div class="loading">Loading students…</div></div>`;
  try {
    const students = await apiFetch(`/students?sectionId=${sectionId}&limit=100`) as { data: { id: string; first_name: string; last_name: string; gr_number?: string }[] };
    panel.innerHTML = `<div class="card"><h3>Mark Attendance</h3>
      <form id="attForm">
        <div class="table-wrap"><table class="tbl">
          <thead><tr><th>GR #</th><th>Student</th><th>Status</th><th>Remarks</th></tr></thead>
          <tbody>${students.data.map(s => `<tr>
            <td>${s.gr_number || "—"}</td>
            <td>${s.first_name} ${s.last_name}</td>
            <td>
              <select name="att_${s.id}" class="att-sel">
                <option value="present" selected>Present</option>
                <option value="absent">Absent</option>
                <option value="late">Late</option>
                <option value="leave">On Leave</option>
              </select>
            </td>
            <td><input name="rem_${s.id}" class="input-sm" placeholder="optional"/></td>
          </tr>`).join("")}</tbody>
        </table></div>
        <div class="mt-8">
          <button type="submit" class="btn">Save Attendance</button>
          <span class="form-err" id="attErr"></span>
        </div>
      </form></div>`;

    document.getElementById("attForm")!.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target as HTMLFormElement);
      const records = students.data.map((s: { id: string; first_name: string; last_name: string; gr_number?: string }) => ({
        studentId: s.id,
        status: fd.get(`att_${s.id}`),
        remarks: fd.get(`rem_${s.id}`) || undefined,
      }));
      try {
        await apiFetch(`/attendance/sessions/${sessionId}/records/bulk`, { method: "POST", body: JSON.stringify({ records }) });
        toast("Attendance saved", "ok");
        panel.innerHTML = `<div class="alert alert--ok">Attendance saved for ${records.length} students.</div>`;
      } catch (err: unknown) { document.getElementById("attErr")!.textContent = err instanceof Error ? err.message : String(err); }
    });
  } catch (err: unknown) { panel.innerHTML = `<div class="alert alert--err">${err instanceof Error ? err.message : String(err)}</div>`; }
}

async function viewSession(sessionId: string) {
  const panel = document.getElementById("markPanel")!;
  panel.innerHTML = `<div class="card"><div class="loading">Loading…</div></div>`;
  try {
    const data = await apiFetch(`/attendance/sessions/${sessionId}/records`) as { data: unknown[] };
    panel.innerHTML = `<div class="card"><h3>Attendance Records</h3><div class="table-wrap"><table class="tbl">
      <thead><tr><th>Student</th><th>GR#</th><th>Status</th><th>Remarks</th></tr></thead>
      <tbody>${(data.data as Record<string,unknown>[]).map(r => `<tr><td>${String(r.student_name||"—")}</td><td>${String(r.gr_number||"—")}</td><td><span class="badge badge--${String(r.status)}">${String(r.status)}</span></td><td>${String(r.remarks||"")}</td></tr>`).join("") || "<tr><td colspan='4' class='muted text-center'>No records</td></tr>"}</tbody>
    </table></div></div>`;
  } catch (err: unknown) { panel.innerHTML = `<div class="alert alert--err">${err instanceof Error ? err.message : String(err)}</div>`; }
}
