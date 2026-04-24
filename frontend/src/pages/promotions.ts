import { apiFetch } from "../api";
import { mount, toast } from "../shell";

export async function promotionsPage() {
  mount("Bulk Promotions", `<div class="loading">Loading…</div>`);

  let sections: { id: string; name: string; grade_name?: string; academic_year_label?: string }[] = [];
  let academicYears: { id: string; label: string }[] = [];

  try {
    const [sec, ay] = await Promise.all([
      apiFetch("/sections") as Promise<{ data: typeof sections }>,
      apiFetch("/academic-years") as Promise<{ data: { id: string; label: string }[] }>,
    ]);
    sections = sec.data || [];
    academicYears = ay.data || [];
  } catch { /* non-fatal */ }

  const secOpts = sections.map(s => {
    const label = [s.grade_name, s.name, s.academic_year_label].filter(Boolean).join(" — ");
    return `<option value="${s.id}">${label}</option>`;
  }).join("");
  const ayOpts = academicYears.map(a => `<option value="${a.id}">${a.label}</option>`).join("");

  document.getElementById("page-content")!.innerHTML = `
    <div class="card">
      <h3>Bulk Promotion Utility</h3>
      <p class="muted mb-8">Promote all active students from one section to another. Use <strong>Dry Run</strong> to preview before confirming.</p>
      <div class="form-grid">
        <label class="field"><span class="field__label">From Section *</span>
          <select id="fromSec">${secOpts}</select>
        </label>
        <label class="field"><span class="field__label">From Academic Year *</span>
          <select id="fromAY">${ayOpts}</select>
        </label>
        <label class="field"><span class="field__label">To Section *</span>
          <select id="toSec">${secOpts}</select>
        </label>
        <label class="field"><span class="field__label">To Academic Year *</span>
          <select id="toAY">${ayOpts}</select>
        </label>
      </div>
      <div class="form-actions mt-16">
        <button id="btnDryRun" class="btn btn--ghost">Dry Run (Preview)</button>
        <button id="btnConfirm" class="btn btn--danger hidden">Confirm Promotion</button>
      </div>
    </div>
    <div id="promoResult" class="mt-16"></div>`;

  let lastPayload: Record<string, unknown> | null = null;

  document.getElementById("btnDryRun")!.addEventListener("click", async () => {
    const payload = buildPayload(true);
    if (!payload) return;
    lastPayload = payload as Record<string, unknown>;
    try {
      const r = await apiFetch("/promotions/bulk", { method: "POST", body: JSON.stringify(payload) }) as {
        dryRun: boolean; count: number; students: { student_id: string }[]
      };
      showResult(r.count, r.students, true);
    } catch (err: unknown) { toast(err instanceof Error ? err.message : String(err), "err"); }
  });

  document.getElementById("btnConfirm")!.addEventListener("click", async () => {
    if (!lastPayload) return;
    if (!confirm(`Promote ${document.getElementById("promoResult")!.querySelector(".promo-count")?.textContent} students? This will create enrollment records in the target section.`)) return;
    const payload = { ...lastPayload, dryRun: false };
    try {
      const r = await apiFetch("/promotions/bulk", { method: "POST", body: JSON.stringify(payload) }) as { promoted: number };
      toast(`${r.promoted} student(s) promoted successfully`, "ok");
      document.getElementById("btnConfirm")!.classList.add("hidden");
      document.getElementById("promoResult")!.innerHTML = `<div class="alert alert--ok">Promoted <strong>${r.promoted}</strong> student(s).</div>`;
    } catch (err: unknown) { toast(err instanceof Error ? err.message : String(err), "err"); }
  });
}

function buildPayload(dryRun: boolean) {
  const fromSec = (document.getElementById("fromSec") as HTMLSelectElement).value;
  const fromAY  = (document.getElementById("fromAY")  as HTMLSelectElement).value;
  const toSec   = (document.getElementById("toSec")   as HTMLSelectElement).value;
  const toAY    = (document.getElementById("toAY")    as HTMLSelectElement).value;
  if (!fromSec || !fromAY || !toSec || !toAY) { toast("Fill all fields", "err"); return null; }
  if (fromSec === toSec && fromAY === toAY) { toast("Source and destination cannot be the same", "err"); return null; }
  return { fromSectionId: fromSec, fromAcademicYearId: fromAY, toSectionId: toSec, toAcademicYearId: toAY, dryRun };
}

function showResult(count: number, students: { student_id: string }[], dryRun: boolean) {
  const el = document.getElementById("promoResult")!;
  const confirmBtn = document.getElementById("btnConfirm")!;
  if (count === 0) {
    el.innerHTML = `<div class="alert alert--warn">No eligible active students found in source section.</div>`;
    confirmBtn.classList.add("hidden");
    return;
  }
  el.innerHTML = `
    <div class="card">
      <p><span class="promo-count">${count}</span> student(s) eligible for promotion (active, not already enrolled in target year).</p>
      ${dryRun ? `<p class="muted mt-4">This is a preview only. No records have been created. Click <strong>Confirm Promotion</strong> to proceed.</p>` : ""}
      <div class="table-wrap mt-8">
        <table class="tbl">
          <thead><tr><th>#</th><th>Student ID</th></tr></thead>
          <tbody>${students.map((s, i) => `<tr><td>${i+1}</td><td class="mono">${s.student_id}</td></tr>`).join("")}</tbody>
        </table>
      </div>
    </div>`;
  if (dryRun) confirmBtn.classList.remove("hidden");
}
