import { apiFetch } from "../api";
import { mount, toast } from "../shell";

interface User {
  id: string;
  email: string;
  is_active: boolean;
  roles?: string;
  created_at?: string;
}

const ALL_ROLES = ["super_admin", "admin", "registrar", "teacher"];

export async function usersPage() {
  mount("User Management", `<div class="loading">Loading…</div>`);
  const data = await apiFetch("/users") as { data: User[]; total: number };

  document.getElementById("page-content")!.innerHTML = `
    <div class="toolbar">
      <button id="btnAddUser" class="btn">+ Add User</button>
    </div>
    <div class="table-meta">${data.total} user(s)</div>
    <div class="table-wrap">
      <table class="tbl">
        <thead><tr><th>Email</th><th>Roles</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead>
        <tbody id="usersBody">
          ${data.data.map(u => userRow(u)).join("") || "<tr><td colspan='5' class='muted text-center'>No users</td></tr>"}
        </tbody>
      </table>
    </div>
    <!-- Modal -->
    <div id="userModal" class="modal hidden">
      <div class="modal-overlay" id="userClose"></div>
      <div class="modal-box" style="max-width:500px">
        <h3 id="userModalTitle">Add User</h3>
        <form id="userForm">
          <input type="hidden" id="userId"/>
          <div class="form-grid">
            <label class="field"><span class="field__label">Email *</span>
              <input id="userEmail" type="email" required placeholder="user@example.com"/>
            </label>
            <label class="field"><span class="field__label">Password ${`<span id="pwHint" class="muted">(leave blank to keep current)</span>`}</span>
              <input id="userPw" type="password" placeholder="Min 6 characters"/>
            </label>
          </div>
          <div class="field mt-8">
            <span class="field__label">Roles (select all that apply)</span>
            <div class="checkbox-group mt-4">
              ${ALL_ROLES.map(r => `
                <label class="checkbox-item">
                  <input type="checkbox" class="role-cb" value="${r}"/> ${r.replace("_", " ")}
                </label>`).join("")}
            </div>
          </div>
          <label class="field mt-8"><span class="field__label">Active</span>
            <select id="userActive">
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          </label>
          <div class="form-actions mt-16">
            <button type="submit" class="btn">Save</button>
            <button type="button" id="userCancelBtn" class="btn btn--ghost">Cancel</button>
          </div>
        </form>
      </div>
    </div>`;

  document.getElementById("btnAddUser")!.addEventListener("click", () => openModal(null));
  document.getElementById("userClose")!.addEventListener("click", closeModal);
  document.getElementById("userCancelBtn")!.addEventListener("click", closeModal);

  document.getElementById("usersBody")!.addEventListener("click", async (e) => {
    const target = e.target as HTMLElement;
    const editBtn = target.closest("[data-edit]");
    const delBtn  = target.closest("[data-del]");
    if (editBtn) {
      const u = data.data.find(u => u.id === editBtn.getAttribute("data-edit"));
      if (u) openModal(u);
    }
    if (delBtn) {
      if (!confirm("Delete user? This cannot be undone.")) return;
      try {
        await apiFetch(`/users/${delBtn.getAttribute("data-del")}`, { method: "DELETE" });
        toast("User deleted", "ok");
        await usersPage();
      } catch (err: unknown) { toast(err instanceof Error ? err.message : String(err), "err"); }
    }
  });

  document.getElementById("userForm")!.addEventListener("submit", async (e) => {
    e.preventDefault();
    const uid   = (document.getElementById("userId") as HTMLInputElement).value;
    const email = (document.getElementById("userEmail") as HTMLInputElement).value.trim();
    const pw    = (document.getElementById("userPw") as HTMLInputElement).value;
    const roles = Array.from(document.querySelectorAll<HTMLInputElement>(".role-cb:checked")).map(c => c.value);
    const isActive = (document.getElementById("userActive") as HTMLSelectElement).value === "true";

    if (!uid && !pw) { toast("Password is required for new users", "err"); return; }
    if (!roles.length) { toast("Select at least one role", "err"); return; }

    const payload: Record<string, unknown> = { roles, isActive };
    if (!uid) { payload.email = email; payload.password = pw; }
    if (uid && pw) payload.password = pw;
    if (uid) payload.roles = roles;

    try {
      if (uid) {
        await apiFetch(`/users/${uid}`, { method: "PATCH", body: JSON.stringify(payload) });
        toast("User updated", "ok");
      } else {
        await apiFetch("/users", { method: "POST", body: JSON.stringify(payload) });
        toast("User created", "ok");
      }
      closeModal();
      await usersPage();
    } catch (err: unknown) { toast(err instanceof Error ? err.message : String(err), "err"); }
  });
}

function userRow(u: User): string {
  return `<tr>
    <td>${u.email}</td>
    <td>${u.roles || "—"}</td>
    <td><span class="badge badge--${u.is_active ? "active" : "withdrawn"}">${u.is_active ? "Active" : "Inactive"}</span></td>
    <td>${u.created_at ? new Date(u.created_at).toLocaleDateString("en-PK") : "—"}</td>
    <td>
      <button class="btn btn--sm" data-edit="${u.id}">Edit</button>
      <button class="btn btn--sm btn--danger" data-del="${u.id}">Delete</button>
    </td>
  </tr>`;
}

function openModal(u: User | null) {
  document.getElementById("userModal")!.classList.remove("hidden");
  (document.getElementById("userModalTitle") as HTMLElement).textContent = u ? "Edit User" : "Add User";
  (document.getElementById("userId") as HTMLInputElement).value = u?.id || "";
  (document.getElementById("userEmail") as HTMLInputElement).value = u?.email || "";
  (document.getElementById("userEmail") as HTMLInputElement).readOnly = !!u;
  (document.getElementById("userPw") as HTMLInputElement).value = "";
  (document.getElementById("userActive") as HTMLSelectElement).value = u ? (u.is_active ? "true" : "false") : "true";
  // Restore roles
  document.querySelectorAll<HTMLInputElement>(".role-cb").forEach(cb => {
    cb.checked = u ? (u.roles || "").includes(cb.value) : false;
  });
  const hint = document.getElementById("pwHint");
  if (hint) hint.style.display = u ? "inline" : "none";
}

function closeModal() {
  document.getElementById("userModal")!.classList.add("hidden");
}
