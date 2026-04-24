import { apiFetch, setToken, getToken } from "../api";
import { mount, toast } from "../shell";
import { navigate } from "../router";

export function loginPage() {
  if (getToken()) { navigate("/dashboard"); return; }

  mount("Government Boys Higher Secondary School — Sign In", `
    <div class="auth-wrap">
      <div class="auth-card">
        <img src="/logo.svg" width="80" height="80" alt="" class="auth-logo"/>
        <h2 class="auth-title">Sign in</h2>
        <p class="auth-sub">Government Boys Higher Secondary School, Bhiria City</p>
        <form id="loginForm" class="auth-form">
          <label class="field"><span class="field__label">Email</span>
            <input name="email" type="email" autocomplete="username" placeholder="admin@gbhss.edu.pk" required />
          </label>
          <label class="field"><span class="field__label">Password</span>
            <input name="password" type="password" autocomplete="current-password" placeholder="••••••••" required />
          </label>
          <button type="submit" class="btn btn--full">Sign in</button>
          <p class="auth-err" id="loginErr"></p>
        </form>
        <hr class="divider"/>
        <details class="bootstrap-details">
          <summary>First-time setup (bootstrap admin)</summary>
          <form id="bootstrapForm" class="auth-form mt-8">
            <label class="field"><span class="field__label">Admin email</span>
              <input name="email" type="email" placeholder="admin@gbhss.edu.pk" required />
            </label>
            <label class="field"><span class="field__label">Password (min 6)</span>
              <input name="password" type="password" placeholder="min 6 chars" required />
            </label>
            <button type="submit" class="btn btn--secondary btn--full">Bootstrap admin account</button>
            <p class="auth-err" id="bootstrapErr"></p>
          </form>
        </details>
      </div>
    </div>
  `);

  document.getElementById("loginForm")!.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    const errEl = document.getElementById("loginErr")!;
    errEl.textContent = "";
    try {
      const body = await apiFetch("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: fd.get("email"), password: fd.get("password") }),
      }) as { token: string };
      setToken(body.token);
      toast("Signed in successfully", "ok");
      navigate("/dashboard");
    } catch (err: unknown) {
      errEl.textContent = err instanceof Error ? err.message : String(err);
    }
  });

  document.getElementById("bootstrapForm")!.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    const errEl = document.getElementById("bootstrapErr")!;
    errEl.textContent = "";
    try {
      await apiFetch("/auth/bootstrap", {
        method: "POST",
        body: JSON.stringify({ email: fd.get("email"), password: fd.get("password"), schoolId: null, roles: ["super_admin"] }),
      });
      toast("Admin created — sign in now", "ok");
    } catch (err: unknown) {
      errEl.textContent = err instanceof Error ? err.message : String(err);
    }
  });
}
