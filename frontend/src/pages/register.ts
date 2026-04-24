import { apiFetch, BASE, getToken, printUrl as mkPrint } from "../api"; void BASE;
import { mount, toast } from "../shell";

export async function registerPage() {
  mount("General Register", `<div class="loading">Loading…</div>`);

  let grades: { id: string; name: string }[] = [];
  let sections: { id: string; name: string; grade_name?: string }[] = [];
  let academicYears: { id: string; label: string }[] = [];

  try {
    const [gr, sec, ay] = await Promise.all([
      apiFetch("/grades") as Promise<{ data: { id: string; name: string }[] }>,
      apiFetch("/sections") as Promise<{ data: { id: string; name: string; grade_name?: string }[] }>,
      apiFetch("/academic-years") as Promise<{ data: { id: string; label: string }[] }>,
    ]);
    grades = gr.data || [];
    sections = sec.data || [];
    academicYears = ay.data || [];
  } catch { /* non-fatal */ }

  document.getElementById("page-content")!.innerHTML = `
    <div class="card">
      <h3>Filter &amp; Export General Register</h3>
      <p class="muted mb-8">The General Register is the official student ledger. Use filters to narrow the print range.</p>
      <div class="form-grid">
        <label class="field"><span class="field__label">Academic Year</span>
          <select id="regAY">
            <option value="">All Years</option>
            ${academicYears.map(a => `<option value="${a.id}">${a.label}</option>`).join("")}
          </select>
        </label>
        <label class="field"><span class="field__label">Grade</span>
          <select id="regGrade">
            <option value="">All Grades</option>
            ${grades.map(g => `<option value="${g.id}">${g.name}</option>`).join("")}
          </select>
        </label>
        <label class="field"><span class="field__label">Section</span>
          <select id="regSection">
            <option value="">All Sections</option>
            ${sections.map(s => `<option value="${s.id}">${s.grade_name ? s.grade_name + " — " : ""}${s.name}</option>`).join("")}
          </select>
        </label>
        <label class="field"><span class="field__label">GR# From</span>
          <input id="regFrom" placeholder="e.g. 1001"/>
        </label>
        <label class="field"><span class="field__label">GR# To</span>
          <input id="regTo" placeholder="e.g. 2000"/>
        </label>
      </div>
      <div class="form-actions mt-16">
        <button id="btnPreview" class="btn">Preview Register</button>
        <button id="btnPrint" class="btn btn--ghost">Open Printable Version</button>
      </div>
    </div>

    <div id="regPreview" class="mt-16"></div>`;

  function buildQS() {
    const qs = new URLSearchParams();
    const ay  = (document.getElementById("regAY")      as HTMLSelectElement).value;
    const gr  = (document.getElementById("regGrade")   as HTMLSelectElement).value;
    const sec = (document.getElementById("regSection") as HTMLSelectElement).value;
    const frm = (document.getElementById("regFrom")    as HTMLInputElement).value.trim();
    const to  = (document.getElementById("regTo")      as HTMLInputElement).value.trim();
    if (ay)  qs.set("academicYearId", ay);
    if (gr)  qs.set("gradeId", gr);
    if (sec) qs.set("sectionId", sec);
    if (frm) qs.set("grFrom", frm);
    if (to)  qs.set("grTo", to);
    return qs.toString();
  }

  document.getElementById("btnPrint")!.addEventListener("click", () => {
    const qs = buildQS();
    window.open(mkPrint("/reports/general-register", qs ? Object.fromEntries(new URLSearchParams(qs)) : {}), "_blank");
  });

  document.getElementById("btnPreview")!.addEventListener("click", async () => {
    const preview = document.getElementById("regPreview")!;
    preview.innerHTML = `<div class="loading">Loading…</div>`;
    try {
      const qs = buildQS();
      const resp = await fetch(`${BASE}/reports/general-register${qs ? "?" + qs : ""}`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      const html = await resp.text();
      // show inline preview in sandboxed iframe
      const iframe = document.createElement("iframe");
      iframe.style.cssText = "width:100%;height:600px;border:1px solid #ddd;border-radius:6px";
      iframe.sandbox.add("allow-same-origin");
      preview.innerHTML = "";
      preview.appendChild(iframe);
      iframe.contentDocument!.open();
      iframe.contentDocument!.write(html.replace("<script>window.onload=()=>window.print();<\/script>", ""));
      iframe.contentDocument!.close();
    } catch (err: unknown) {
      preview.innerHTML = `<div class="alert alert--err">${err instanceof Error ? err.message : String(err)}</div>`;
      toast("Failed to load register", "err");
    }
  });
}
