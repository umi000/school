import { apiFetch, BASE, printUrl as mkPrint } from "../api"; void BASE;
import { mount, toast } from "../shell";

const MERGE_FIELDS: Record<string, { id: string; label: string; type?: string }[]> = {
  character: [
    { id: "wef_from",         label: "Study Period From (Date)", type: "date" },
    { id: "wef_to",           label: "Study Period To (Date)",   type: "date" },
    { id: "conduct",          label: "Conduct (e.g. Good)" },
    { id: "character_quality",label: "Character Quality (e.g. Good)" },
  ],
  pass_ssc: [
    { id: "bise_name",        label: "BISE / Board Name" },
    { id: "exam_session",     label: "Exam Session (Annual/Supplementary)" },
    { id: "exam_month_year",  label: "Exam Month & Year (e.g. April 2024)" },
    { id: "exam_year",        label: "Exam Year" },
    { id: "board_roll_number",label: "Board Roll No. / Institutional Seat No." },
    { id: "exam_centre",      label: "Exam Centre" },
    { id: "group",            label: "Group / Subject Combination" },
    { id: "reg_type",         label: "Regular / Private" },
    { id: "marks_obtained",   label: "Marks Obtained" },
    { id: "marks_total",      label: "Total Marks" },
    { id: "grade_division",   label: "Grade / Division" },
  ],
  pass_hsc: [
    { id: "bise_name",        label: "BISE / Board Name" },
    { id: "exam_session",     label: "Exam Session" },
    { id: "exam_month_year",  label: "Exam Month & Year" },
    { id: "exam_year",        label: "Exam Year" },
    { id: "board_roll_number",label: "Board Roll No." },
    { id: "group",            label: "Pre-Eng / Pre-Med / Arts / Commerce" },
    { id: "marks_obtained",   label: "Marks Obtained" },
    { id: "marks_total",      label: "Total Marks" },
    { id: "grade_division",   label: "Grade / Division" },
  ],
  school_leaving: [
    { id: "class_admitted",   label: "Class in Which Admitted" },
    { id: "remarks",          label: "Remarks (e.g. No arrears outstanding)" },
  ],
};

export async function certificatesPage() {
  mount("Certificates", `
    <div class="tabs">
      <button class="tab-btn tab-btn--active" data-tab="issue">Issue Certificate</button>
      <button class="tab-btn" data-tab="issued">Issued Records</button>
      <button class="tab-btn" data-tab="programs">Certificate Programs</button>
    </div>
    <div id="tab-issue"    class="tab-panel"><div class="loading">Loading…</div></div>
    <div id="tab-issued"   class="tab-panel" style="display:none;"></div>
    <div id="tab-programs" class="tab-panel" style="display:none;"></div>`);

  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("tab-btn--active"));
      btn.classList.add("tab-btn--active");
      document.querySelectorAll(".tab-panel").forEach(p => ((p as HTMLElement).style.display = "none"));
      const tab = btn.getAttribute("data-tab")!;
      (document.getElementById(`tab-${tab}`)!).style.display = "block";
      if (tab === "issue")    renderIssueForm();
      if (tab === "issued")   renderIssuedList();
      if (tab === "programs") renderPrograms();
    });
  });

  await renderIssueForm();
}

async function renderIssueForm() {
  const panel = document.getElementById("tab-issue")!;
  panel.innerHTML = `<div class="card">
    <h3>Issue a Certificate</h3>
    <form id="issueForm">
      <div class="form-grid">
        <label class="field"><span class="field__label">Student Search (GR# or Name)</span>
          <input id="stuSearch" placeholder="Type GR number or student name…" autocomplete="off"/>
          <input type="hidden" id="stuId"/>
          <div id="stuSugg" class="suggestions"></div>
        </label>
        <label class="field"><span class="field__label">Certificate Type *</span>
          <select id="certTypeSelect" name="certType" required>
            <option value="character">Character Certificate</option>
            <option value="school_leaving">School Leaving Certificate</option>
            <option value="pass_ssc">Pass Certificate (SSC / 10th)</option>
            <option value="pass_hsc">Pass Certificate (HSC Part-II)</option>
          </select>
        </label>
        <label class="field"><span class="field__label">Certificate Number</span>
          <input name="certificateNumber" placeholder="Auto-generated if blank"/>
        </label>
        <label class="field"><span class="field__label">Issue Date</span>
          <input name="issueDate" type="date" value="${new Date().toISOString().slice(0,10)}"/>
        </label>
        <label class="field"><span class="field__label">Expiry Date</span>
          <input name="expiryDate" type="date"/>
        </label>
        <label class="field"><span class="field__label">Notes</span>
          <input name="notes" placeholder="Optional notes"/>
        </label>
      </div>

      <div id="mergeSection" class="form-section card mt-16" style="display:none">
        <h4 class="form-section__title">Certificate-Specific Fields (Merge Data)</h4>
        <p class="muted mb-8">These fields populate the certificate template. Leave blank if not applicable.</p>
        <div id="mergeFields" class="form-grid"></div>
      </div>

      <div class="form-actions mt-16">
        <button type="submit" class="btn">Issue Certificate</button>
        <span id="issueResult"></span>
      </div>
    </form>
  </div>`;

  const searchEl  = document.getElementById("stuSearch")  as HTMLInputElement;
  const stuIdEl   = document.getElementById("stuId")       as HTMLInputElement;
  const suggestions = document.getElementById("stuSugg")!;
  const certTypeSel = document.getElementById("certTypeSelect") as HTMLSelectElement;

  // Render merge fields when type changes
  function updateMergeFields() {
    const t = certTypeSel.value;
    const fields = MERGE_FIELDS[t] || [];
    const sec = document.getElementById("mergeSection")!;
    const container = document.getElementById("mergeFields")!;
    if (fields.length === 0) { sec.style.display = "none"; return; }
    sec.style.display = "block";
    container.innerHTML = fields.map(f =>
      `<label class="field"><span class="field__label">${f.label}</span>
         <input id="mf_${f.id}" data-key="${f.id}" type="${f.type || "text"}" placeholder="${f.label}"/>
       </label>`
    ).join("");
  }
  certTypeSel.addEventListener("change", updateMergeFields);
  updateMergeFields();

  let debounce: ReturnType<typeof setTimeout>;
  searchEl.addEventListener("input", () => {
    clearTimeout(debounce);
    const q = searchEl.value.trim();
    if (q.length < 2) { suggestions.innerHTML = ""; return; }
    debounce = setTimeout(async () => {
      try {
        const r = await apiFetch(`/students?search=${encodeURIComponent(q)}&limit=8`) as {
          data: { id: string; first_name: string; last_name: string; gr_number?: string }[]
        };
        suggestions.innerHTML = r.data.map(s =>
          `<div class="suggestion-item" data-id="${s.id}" data-name="${s.first_name} ${s.last_name} (${s.gr_number||"—"})">
             <strong>${s.gr_number||"—"}</strong> — ${s.first_name} ${s.last_name}
           </div>`
        ).join("") || `<div class='suggestion-item muted'>No results</div>`;
        suggestions.querySelectorAll("[data-id]").forEach(el => {
          el.addEventListener("click", () => {
            stuIdEl.value  = el.getAttribute("data-id")!;
            searchEl.value = el.getAttribute("data-name")!;
            suggestions.innerHTML = "";
          });
        });
      } catch { /* silent */ }
    }, 300);
  });
  document.addEventListener("click", (e) => {
    if (!(e.target as HTMLElement).closest("#stuSearch, #stuSugg")) suggestions.innerHTML = "";
  });

  document.getElementById("issueForm")!.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    const studentId = stuIdEl.value;
    const resultEl  = document.getElementById("issueResult")!;
    if (!studentId) { toast("Select a student first", "err"); return; }

    // Collect merge data
    const mergeData: Record<string, string> = {};
    document.querySelectorAll<HTMLInputElement>("[data-key]").forEach(el => {
      if (el.value.trim()) mergeData[el.getAttribute("data-key")!] = el.value.trim();
    });

    try {
      const res = await apiFetch("/certificates/issue", {
        method: "POST",
        body: JSON.stringify({
          studentId,
          certType:          fd.get("certType"),
          certificateNumber: fd.get("certificateNumber") || undefined,
          issueDate:         fd.get("issueDate") || undefined,
          expiryDate:        fd.get("expiryDate") || undefined,
          notes:             fd.get("notes") || undefined,
          mergeData:         Object.keys(mergeData).length ? mergeData : undefined,
        })
      }) as { id: string };
      const pUrl = mkPrint(`/certificates/${res.id}/print`);
      resultEl.innerHTML = `<span class="text-ok">Issued! &nbsp;<a href="${pUrl}" target="_blank" class="btn btn--sm">Print Certificate</a></span>`;
      toast("Certificate issued successfully", "ok");
    } catch (err: unknown) {
      resultEl.innerHTML = `<span class="text-err">${err instanceof Error ? err.message : String(err)}</span>`;
    }
  });
}

async function renderIssuedList() {
  const panel = document.getElementById("tab-issued")!;
  panel.innerHTML = `<div class="card"><div class="loading">Loading…</div></div>`;
  try {
    const data = await apiFetch("/certificates/issued?limit=100") as { data: Record<string, unknown>[] };
    const rows = data.data.map(c => {
      const pUrl = mkPrint(`/certificates/${String(c.id)}/print`);
      return `<tr>
        <td>${String(c.gr_number||"—")}</td>
        <td>${String(c.student_name||"—")}</td>
        <td>${String(c.cert_type||"").replace("_", " ").toUpperCase()}</td>
        <td><span class="badge badge--${String(c.status)==="issued"?"active":"alumni"}">${String(c.status)}</span></td>
        <td>${String(c.certificate_number||"—")}</td>
        <td>${String(c.issue_date||"").slice(0,10)}</td>
        <td><a href="${pUrl}" target="_blank" class="btn btn--sm">Print</a></td>
      </tr>`;
    }).join("") || "<tr><td colspan='7' class='muted text-center'>No issued certificates</td></tr>";
    panel.innerHTML = `<div class="card">
      <div class="table-meta">${data.data.length} certificate(s) issued</div>
      <div class="table-wrap">
        <table class="tbl">
          <thead><tr><th>GR#</th><th>Student</th><th>Type</th><th>Status</th><th>Cert #</th><th>Issue Date</th><th>Actions</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
  } catch (err: unknown) { panel.innerHTML = `<div class="alert alert--err">${err instanceof Error ? err.message : String(err)}</div>`; }
}

async function renderPrograms() {
  const panel = document.getElementById("tab-programs")!;
  panel.innerHTML = `<div class="card">
    <div class="card-header-row"><h3>Certification Programs</h3><button id="addProg" class="btn btn--sm">+ Add Program</button></div>
    <div id="progList"><div class="loading">Loading…</div></div>
  </div>`;
  await loadPrograms();
  document.getElementById("addProg")!.onclick = () => showProgramModal(null, loadPrograms);
}

async function loadPrograms() {
  try {
    const data = await apiFetch("/certificates/programs") as { data: Record<string, unknown>[] };
    document.getElementById("progList")!.innerHTML = data.data.length
      ? `<div class="table-wrap"><table class="tbl">
           <thead><tr><th>Name</th><th>Template</th><th>Code</th><th>Status</th></tr></thead>
           <tbody>${data.data.map(p => `<tr>
             <td>${String(p.name||"")}</td>
             <td>${String(p.cert_type||"").replace("_", " ").toUpperCase()}</td>
             <td><code>${String(p.code||"")}</code></td>
             <td><span class="badge badge--${p.is_active?"active":"withdrawn"}">${p.is_active?"Active":"Inactive"}</span></td>
           </tr>`).join("")}</tbody>
         </table></div>`
      : `<p class="muted mt-8">No programs configured. Add one above.</p>`;
  } catch { /* silent */ }
}

function showProgramModal(p: Record<string,unknown> | null, onDone: () => void) {
  const overlay = document.createElement("div");
  overlay.className = "modal";
  overlay.innerHTML = `
    <div class="modal-overlay" id="cancelProg2"></div>
    <div class="modal-box" style="max-width:500px">
      <h3>${p ? "Edit Program" : "Add Certification Program"}</h3>
      <form id="progForm" class="form-grid">
        <label class="field"><span class="field__label">Name *</span><input name="name" required value="${p?.name??""}" placeholder="Character Certificate"/></label>
        <label class="field"><span class="field__label">Certificate Template *</span>
          <select name="certType" required>
            <option value="character"      ${p?.cert_type==="character"?"selected":""}>Character</option>
            <option value="pass_ssc"       ${p?.cert_type==="pass_ssc"?"selected":""}>Pass SSC</option>
            <option value="pass_hsc"       ${p?.cert_type==="pass_hsc"?"selected":""}>Pass HSC</option>
            <option value="school_leaving" ${p?.cert_type==="school_leaving"?"selected":""}>School Leaving</option>
            <option value="custom"         ${p?.cert_type==="custom"?"selected":""}>Custom</option>
          </select>
        </label>
        <label class="field"><span class="field__label">Description</span><input name="description" value="${p?.description??""}" placeholder="optional"/></label>
        <label class="field"><span class="field__label">Issuing Body</span><input name="issuingBody" value="${p?.issuing_body??""}" placeholder="e.g. Govt. Boys Higher Secondary School, Bhiria City"/></label>
        <div class="form-row-full form-actions">
          <button type="submit" class="btn">${p?"Save":"Add"}</button>
          <button type="button" id="cancelProg" class="btn btn--ghost">Cancel</button>
        </div>
      </form>
    </div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  document.getElementById("cancelProg")!.onclick  = close;
  document.getElementById("cancelProg2")!.onclick = close;
  document.getElementById("progForm")!.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    try {
      await apiFetch("/certificates/programs", { method: "POST", body: JSON.stringify({
        name: fd.get("name"), certType: fd.get("certType"),
        description: fd.get("description") || undefined,
        issuingBody: fd.get("issuingBody") || undefined,
      })});
      toast("Program saved", "ok"); close(); onDone();
    } catch (err: unknown) { toast(err instanceof Error ? err.message : String(err), "err"); }
  });
}
