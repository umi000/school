import { apiFetch } from "../api";
import { mount } from "../shell";

export async function auditLogPage() {
  mount("Audit Log", `<div class="loading">Loading…</div>`);

  const ENTITY_OPTIONS = [
    "students","teachers","users","student_certifications","student_leaving_records",
    "student_enrollments","grades","sections","subjects","examinations","attendance_sessions",
    "grades_scores","certification_programs","teacher_assignments",
  ];

  document.getElementById("page-content")!.innerHTML = `
    <div class="card">
      <div class="card-header-row">
        <h3>Audit Trail</h3>
        <span class="muted" style="font-size:12px">Shows last 100 actions by default</span>
      </div>
      <div class="form-grid" style="margin-bottom:12px">
        <label class="field"><span class="field__label">Filter by Entity</span>
          <select id="entityFilter">
            <option value="">All Entities</option>
            ${ENTITY_OPTIONS.map(e => `<option value="${e}">${e}</option>`).join("")}
          </select>
        </label>
        <label class="field"><span class="field__label">Show</span>
          <select id="limitFilter">
            <option value="50">Last 50</option>
            <option value="100" selected>Last 100</option>
            <option value="200">Last 200</option>
          </select>
        </label>
        <div class="field" style="align-self:flex-end">
          <button id="btnRefresh" class="btn">Refresh</button>
        </div>
      </div>
      <div id="auditTable"><div class="loading">Loading…</div></div>
    </div>`;

  async function load() {
    const entity = (document.getElementById("entityFilter") as HTMLSelectElement).value;
    const limit  = (document.getElementById("limitFilter")  as HTMLSelectElement).value;
    const qs = new URLSearchParams({ limit });
    if (entity) qs.set("entity", entity);
    try {
      const data = await apiFetch(`/audit-logs?${qs}`) as { data: Record<string, unknown>[]; total: number };
      const rows = data.data.map(r => `<tr>
        <td class="mono" style="font-size:11px">${String(r.created_at||"").slice(0,19).replace("T"," ")}</td>
        <td><strong>${String(r.action||"")}</strong></td>
        <td>${String(r.entity_table||"")}</td>
        <td class="mono" style="font-size:11px">${String(r.entity_id||"").slice(0,8)}…</td>
        <td>${String(r.user_email||"—")}</td>
      </tr>`).join("") || `<tr><td colspan="5" class="muted text-center">No audit records found</td></tr>`;
      document.getElementById("auditTable")!.innerHTML = `
        <div class="table-meta">${data.total} record(s)</div>
        <div class="table-wrap">
          <table class="tbl">
            <thead><tr><th>Timestamp (UTC)</th><th>Action</th><th>Entity</th><th>Entity ID</th><th>User</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;
    } catch (err: unknown) {
      document.getElementById("auditTable")!.innerHTML = `<div class="alert alert--err">${err instanceof Error ? err.message : String(err)}</div>`;
    }
  }

  document.getElementById("btnRefresh")!.addEventListener("click", load);
  document.getElementById("entityFilter")!.addEventListener("change", load);
  document.getElementById("limitFilter")!.addEventListener("change", load);
  await load();
}
