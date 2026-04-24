import { apiFetch } from "../api";
import { mount, toast } from "../shell";

interface Teacher { id: string; name: string; employee_code?: string; gender: string; status: string; qualification?: string; contact_phone?: string; contact_email?: string; joining_date?: string; date_of_birth?: string; }

export async function teachersListPage() {
  mount("Teachers", `<div class="toolbar"><button id="addTch" class="btn">+ Add Teacher</button></div><div id="tchTable"><div class="loading">Loading…</div></div>`);
  await loadTeachers();
  document.getElementById("addTch")!.onclick = () => showTeacherModal(null, loadTeachers);
}

async function loadTeachers() {
  try {
    const data = await apiFetch("/teachers") as { data: Teacher[]; total: number };
    const tbody = data.data.map((t: Teacher) => `
      <tr>
        <td>${t.employee_code || "—"}</td>
        <td>${t.name}</td>
        <td>${t.gender || "—"}</td>
        <td>${t.qualification || "—"}</td>
        <td>${t.joining_date ? new Date(t.joining_date).toLocaleDateString("en-PK") : "—"}</td>
        <td><span class="badge badge--${t.status}">${t.status}</span></td>
        <td>
          <button class="btn btn--sm" data-edit="${t.id}">Edit</button>
          <button class="btn btn--sm btn--danger" data-del="${t.id}">Delete</button>
        </td>
      </tr>`).join("");
    document.getElementById("tchTable")!.innerHTML = `
      <div class="table-meta">${data.total} teachers</div>
      <div class="table-wrap"><table class="tbl">
        <thead><tr><th>Code</th><th>Name</th><th>Gender</th><th>Qualification</th><th>Joining Date</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>${tbody || "<tr><td colspan='7' class='muted text-center'>No teachers found</td></tr>"}</tbody>
      </table></div>`;

    document.getElementById("tchTable")!.addEventListener("click", async (e) => {
      const ed = (e.target as HTMLElement).closest("[data-edit]");
      if (ed) {
        const t = data.data.find((x: Teacher) => x.id === ed.getAttribute("data-edit"))!;
        showTeacherModal(t, loadTeachers);
      }
      const del = (e.target as HTMLElement).closest("[data-del]");
      if (del) {
        if (!confirm("Delete this teacher?")) return;
        try {
          await apiFetch(`/teachers/${del.getAttribute("data-del")}`, { method: "DELETE" });
          toast("Teacher deleted", "ok");
          await loadTeachers();
        } catch (err: unknown) { toast(err instanceof Error ? err.message : String(err), "err"); }
      }
    });
  } catch (err: unknown) {
    document.getElementById("tchTable")!.innerHTML = `<div class="alert alert--err">${err instanceof Error ? err.message : String(err)}</div>`;
  }
}

function showTeacherModal(t: Teacher | null, onDone: () => void) {
  const v = (f: keyof Teacher) => (t ? String(t[f] ?? "") : "");
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `
    <div class="modal">
      <h3>${t ? "Edit Teacher" : "Add Teacher"}</h3>
      <form id="tchForm" class="form-grid">
        <label class="field"><span class="field__label">Full Name *</span><input name="name" required value="${v("name")}"/></label>
        <label class="field"><span class="field__label">Employee Code</span><input name="employeeCode" value="${v("employee_code")}"/></label>
        <label class="field"><span class="field__label">Gender *</span>
          <select name="gender" required>
            <option value="male" ${v("gender")==="male"?"selected":""}>Male</option>
            <option value="female" ${v("gender")==="female"?"selected":""}>Female</option>
          </select>
        </label>
        <label class="field"><span class="field__label">Qualification</span><input name="qualification" value="${v("qualification")}" placeholder="e.g. M.A., B.Ed."/></label>
        <label class="field"><span class="field__label">Joining Date</span><input name="joiningDate" type="date" value="${v("joining_date").slice(0,10)}"/></label>
        <label class="field"><span class="field__label">Date of Birth</span><input name="dateOfBirth" type="date" value="${v("date_of_birth").slice(0,10)}"/></label>
        <label class="field"><span class="field__label">Phone</span><input name="contactPhone" type="tel" value="${v("contact_phone")}"/></label>
        <label class="field"><span class="field__label">Email</span><input name="contactEmail" type="email" value="${v("contact_email")}"/></label>
        <label class="field"><span class="field__label">Status</span>
          <select name="status">
            <option value="active" ${v("status")==="active"?"selected":""}>Active</option>
            <option value="inactive" ${v("status")==="inactive"?"selected":""}>Inactive</option>
          </select>
        </label>
        <div class="form-row-full">
          <button type="submit" class="btn">${t ? "Save" : "Add"}</button>
          <button type="button" id="cancelTch" class="btn btn--ghost">Cancel</button>
          <span class="form-err" id="tchErr"></span>
        </div>
      </form>
    </div>`;
  document.body.appendChild(modal);
  document.getElementById("cancelTch")!.onclick = () => modal.remove();

  document.getElementById("tchForm")!.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    const payload = {
      name:          fd.get("name"),
      employeeCode:  fd.get("employeeCode")  || undefined,
      gender:        fd.get("gender"),
      qualification: fd.get("qualification") || undefined,
      joiningDate:   fd.get("joiningDate")   || undefined,
      dateOfBirth:   fd.get("dateOfBirth")   || undefined,
      contactPhone:  fd.get("contactPhone")  || undefined,
      contactEmail:  fd.get("contactEmail")  || undefined,
      status:        fd.get("status"),
    };
    try {
      if (t) await apiFetch(`/teachers/${t.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      else await apiFetch("/teachers", { method: "POST", body: JSON.stringify(payload) });
      toast(t ? "Teacher updated" : "Teacher added", "ok");
      modal.remove();
      onDone();
    } catch (err: unknown) {
      document.getElementById("tchErr")!.textContent = err instanceof Error ? err.message : String(err);
    }
  });
}
