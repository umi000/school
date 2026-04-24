import { apiFetch } from "../api";
import { mount, toast } from "../shell";

interface LeavingRecord {
  id: string;
  student_id: string;
  student_name?: string;
  gr_number?: string;
  date_left: string;
  class_left_grade_id?: string;
  grade_name?: string;
  conduct?: string;
  progress?: string;
  reason?: string;
  remarks?: string;
  leaving_serial_no?: number;
  class_studying_since?: string;
  certificate_issued_at?: string;
}

export async function leavingRecordsPage(studentId?: string) {
  mount("Leaving Records", `<div class="loading">Loading…</div>`);
  const grades = await loadGrades();

  const data = await apiFetch(
    `/leaving-records${studentId ? `?studentId=${studentId}` : ""}`
  ) as { data: LeavingRecord[]; total: number };

  document.getElementById("page-content")!.innerHTML = `
    <div class="toolbar">
      <button id="btnAddLeaving" class="btn">+ Add Leaving Record</button>
    </div>
    <div class="table-meta">${data.total} record(s)</div>
    <div class="table-wrap">
      <table class="tbl">
        <thead><tr>
          <th>S.No</th><th>GR#</th><th>Student</th><th>Date of Leaving</th>
          <th>Class Left</th><th>Conduct</th><th>Progress</th><th>Actions</th>
        </tr></thead>
        <tbody id="lrBody">
          ${data.data.map(r => lrRow(r)).join("") || "<tr><td colspan='8' class='muted text-center'>No records</td></tr>"}
        </tbody>
      </table>
    </div>
    <!-- Modal -->
    <div id="lrModal" class="modal hidden">
      <div class="modal-overlay" id="lrClose"></div>
      <div class="modal-box" style="max-width:680px">
        <h3 id="lrModalTitle">Add Leaving Record</h3>
        <form id="lrForm">
          <input type="hidden" id="lrId"/>
          <div class="form-grid">
            <label class="field"><span class="field__label">Student ID *</span>
              <input id="lrStudentId" value="${studentId || ""}" ${studentId ? "readonly" : ""} placeholder="Paste student UUID"/>
            </label>
            <label class="field"><span class="field__label">Serial No.</span>
              <input id="lrSerial" type="number" placeholder="Leaving serial #"/>
            </label>
            <label class="field"><span class="field__label">Date of Leaving *</span>
              <input id="lrDate" type="date" required/>
            </label>
            <label class="field"><span class="field__label">Class Left (Grade)</span>
              <select id="lrGrade">
                <option value="">— Select —</option>
                ${grades.map((g: {id:string;name:string}) => `<option value="${g.id}">${g.name}</option>`).join("")}
              </select>
            </label>
            <label class="field"><span class="field__label">Class Studying Since</span>
              <input id="lrStudyingSince" type="date"/>
            </label>
            <label class="field"><span class="field__label">Conduct</span>
              <select id="lrConduct">
                <option value="">— Select —</option>
                <option value="Good">Good</option>
                <option value="Satisfactory">Satisfactory</option>
                <option value="Excellent">Excellent</option>
                <option value="Fair">Fair</option>
              </select>
            </label>
            <label class="field"><span class="field__label">Progress / Result</span>
              <select id="lrProgress">
                <option value="">— Select —</option>
                <option value="Good">Good</option>
                <option value="Satisfactory">Satisfactory</option>
                <option value="Excellent">Excellent</option>
                <option value="Pass">Pass</option>
                <option value="Fail">Fail</option>
              </select>
            </label>
            <label class="field"><span class="field__label">Certificate Issued Date</span>
              <input id="lrCertDate" type="date"/>
            </label>
          </div>
          <label class="field mt-8"><span class="field__label">Reason for Leaving</span>
            <textarea id="lrReason" rows="2"></textarea>
          </label>
          <label class="field mt-8"><span class="field__label">Remarks</span>
            <textarea id="lrRemarks" rows="2" placeholder="e.g. No arrears outstanding"></textarea>
          </label>
          <div class="form-actions mt-16">
            <button type="submit" class="btn">Save Record</button>
            <button type="button" id="lrCancelBtn" class="btn btn--ghost">Cancel</button>
          </div>
        </form>
      </div>
    </div>`;

  document.getElementById("btnAddLeaving")!.addEventListener("click", () => openModal(null, studentId));
  document.getElementById("lrClose")!.addEventListener("click", closeModal);
  document.getElementById("lrCancelBtn")!.addEventListener("click", closeModal);

  document.getElementById("lrBody")!.addEventListener("click", async (e) => {
    const target = e.target as HTMLElement;
    const editBtn = target.closest("[data-edit]");
    const delBtn  = target.closest("[data-del]");
    if (editBtn) {
      const rec = data.data.find(r => r.id === editBtn.getAttribute("data-edit"));
      if (rec) openModal(rec);
    }
    if (delBtn) {
      if (!confirm("Delete this leaving record?")) return;
      try {
        await apiFetch(`/leaving-records/${delBtn.getAttribute("data-del")}`, { method: "DELETE" });
        toast("Deleted", "ok");
        await leavingRecordsPage(studentId);
      } catch (err: unknown) { toast(err instanceof Error ? err.message : String(err), "err"); }
    }
  });

  document.getElementById("lrForm")!.addEventListener("submit", async (e) => {
    e.preventDefault();
    const recId = (document.getElementById("lrId") as HTMLInputElement).value;
    const payload: Record<string, unknown> = {
      studentId:          (document.getElementById("lrStudentId") as HTMLInputElement).value.trim(),
      dateLeft:           (document.getElementById("lrDate") as HTMLInputElement).value,
      classLeftGradeId:   (document.getElementById("lrGrade") as HTMLSelectElement).value || null,
      leavingSerialNo:    Number((document.getElementById("lrSerial") as HTMLInputElement).value) || null,
      classStudyingSince: (document.getElementById("lrStudyingSince") as HTMLInputElement).value || null,
      conduct:            (document.getElementById("lrConduct") as HTMLSelectElement).value || null,
      progress:           (document.getElementById("lrProgress") as HTMLSelectElement).value || null,
      reason:             (document.getElementById("lrReason") as HTMLTextAreaElement).value || null,
      remarks:            (document.getElementById("lrRemarks") as HTMLTextAreaElement).value || null,
      certificateIssuedAt:(document.getElementById("lrCertDate") as HTMLInputElement).value || null,
    };
    try {
      if (recId) {
        await apiFetch(`/leaving-records/${recId}`, { method: "PATCH", body: JSON.stringify(payload) });
        toast("Updated", "ok");
      } else {
        await apiFetch("/leaving-records", { method: "POST", body: JSON.stringify(payload) });
        toast("Leaving record created. Student status set to withdrawn.", "ok");
      }
      closeModal();
      await leavingRecordsPage(studentId);
    } catch (err: unknown) { toast(err instanceof Error ? err.message : String(err), "err"); }
  });
}

function lrRow(r: LeavingRecord): string {
  return `<tr>
    <td>${r.leaving_serial_no || "—"}</td>
    <td>${r.gr_number || "—"}</td>
    <td>${r.student_name || r.student_id}</td>
    <td>${r.date_left ? new Date(r.date_left).toLocaleDateString("en-PK") : "—"}</td>
    <td>${r.grade_name || "—"}</td>
    <td>${r.conduct || "—"}</td>
    <td>${r.progress || "—"}</td>
    <td>
      <button class="btn btn--sm" data-edit="${r.id}">Edit</button>
      <button class="btn btn--sm btn--danger" data-del="${r.id}">Del</button>
    </td>
  </tr>`;
}

function openModal(rec: LeavingRecord | null, defaultStudentId?: string) {
  const modal = document.getElementById("lrModal")!;
  modal.classList.remove("hidden");
  (document.getElementById("lrModalTitle") as HTMLElement).textContent = rec ? "Edit Leaving Record" : "Add Leaving Record";
  (document.getElementById("lrId") as HTMLInputElement).value = rec?.id || "";
  (document.getElementById("lrStudentId") as HTMLInputElement).value = rec?.student_id || defaultStudentId || "";
  (document.getElementById("lrDate") as HTMLInputElement).value = rec?.date_left?.slice(0,10) || "";
  (document.getElementById("lrGrade") as HTMLSelectElement).value = rec?.class_left_grade_id || "";
  (document.getElementById("lrSerial") as HTMLInputElement).value = String(rec?.leaving_serial_no || "");
  (document.getElementById("lrStudyingSince") as HTMLInputElement).value = rec?.class_studying_since?.slice(0,10) || "";
  (document.getElementById("lrConduct") as HTMLSelectElement).value = rec?.conduct || "";
  (document.getElementById("lrProgress") as HTMLSelectElement).value = rec?.progress || "";
  (document.getElementById("lrCertDate") as HTMLInputElement).value = rec?.certificate_issued_at?.slice(0,10) || "";
  (document.getElementById("lrReason") as HTMLTextAreaElement).value = rec?.reason || "";
  (document.getElementById("lrRemarks") as HTMLTextAreaElement).value = rec?.remarks || "";
}

function closeModal() {
  document.getElementById("lrModal")!.classList.add("hidden");
}

async function loadGrades(): Promise<{id:string;name:string}[]> {
  try {
    const r = await apiFetch("/grades") as { data: {id:string;name:string}[] };
    return r.data || [];
  } catch { return []; }
}
