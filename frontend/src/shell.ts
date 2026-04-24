import { getToken, clearToken } from "./api";
import { navigate } from "./router";

export function mount(title: string, html: string): HTMLElement {
  const app = document.getElementById("app")!;
  app.innerHTML = renderShell(title, html);
  wireShell();
  return app;
}

export function setContent(html: string) {
  const el = document.getElementById("page-content");
  if (el) el.innerHTML = html;
}

export function toast(msg: string, type: "ok" | "err" | "info" = "info") {
  const t = document.createElement("div");
  t.className = `toast toast--${type}`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

const NAV_ITEMS = [
  { href: "/dashboard",       label: "📊 Dashboard",          group: "" },
  { href: "/students",        label: "🎓 Students",            group: "Academic" },
  { href: "/leaving-records", label: "📤 Leaving Records",    group: "Academic" },
  { href: "/teachers",        label: "👨‍🏫 Teachers",            group: "Academic" },
  { href: "/classes",         label: "🏫 Classes & Sections",  group: "Academic" },
  { href: "/subjects",        label: "📚 Subjects",            group: "Academic" },
  { href: "/grade-subjects",  label: "📋 Grade Subjects",      group: "Academic" },
  { href: "/exams",           label: "📝 Examinations",        group: "Academic" },
  { href: "/attendance",      label: "✅ Attendance",          group: "Academic" },
  { href: "/grades",          label: "🏆 Grades & Marks",      group: "Academic" },
  { href: "/certificates",    label: "📜 Certificates",        group: "Operations" },
  { href: "/promotions",      label: "⬆️ Promotions",          group: "Operations" },
  { href: "/register",        label: "📖 General Register",    group: "Reports" },
  { href: "/users",           label: "👤 User Management",     group: "Admin" },
  { href: "/audit-log",       label: "🔍 Audit Log",           group: "Admin" },
];

function renderShell(title: string, content: string): string {
  const token = getToken();
  const navHtml = token
    ? (() => {
        const groups: Record<string, string[]> = {};
        for (const n of NAV_ITEMS) {
          const grp = n.group || "";
          if (!groups[grp]) groups[grp] = [];
          const isActive = location.pathname === n.href ||
            (n.href !== "/dashboard" && location.pathname.startsWith(n.href));
          groups[grp].push(
            `<a href="${n.href}" data-link class="nav-link${isActive ? " nav-link--active" : ""}">${n.label}</a>`
          );
        }
        return Object.entries(groups).map(([grp, links]) =>
          `${grp ? `<div class="nav-group-label">${grp}</div>` : ""}${links.join("")}`
        ).join("");
      })()
    : "";

  return `
<div class="shell">
  <header class="topbar">
    <div class="topbar__left">
      ${token ? `<button id="menuBtn" class="menu-btn" aria-label="Toggle menu">
        <span></span><span></span><span></span>
      </button>` : ""}
      <a href="/dashboard" data-link class="topbar__brand">
        <img src="/sindh-logo.png" width="34" height="34" alt="Govt of Sindh" class="logo-img"/>
        <div class="topbar__titles">
          <span class="brand-crest">Government of Sindh — Education Dept.</span>
          <span class="brand-main">Government Boys Higher Secondary School, Bhiria City</span>
        </div>
      </a>
    </div>
    <div class="topbar__right">
      <span id="apiPill" class="api-pill api-pill--pending">●</span>
      ${token ? `<button id="logoutBtn" class="btn btn--topbar btn--sm">Sign out</button>` : ""}
    </div>
  </header>

  ${token ? `
  <div id="sidebarOverlay" class="sidebar-overlay"></div>
  <nav class="sidebar" id="sidebar">
    <div class="sidebar__inner">${navHtml}</div>
  </nav>` : ""}

  <div class="${token ? "main-with-sidebar" : "main-no-sidebar"}">
    <div class="page-header">
      <h1 class="page-title">${title}</h1>
    </div>
    <div id="page-content">${content}</div>
  </div>
</div>`;
}

function wireShell() {
  // Logout
  document.getElementById("logoutBtn")?.addEventListener("click", () => {
    clearToken();
    navigate("/");
  });

  // Mobile hamburger menu
  const menuBtn  = document.getElementById("menuBtn");
  const sidebar  = document.getElementById("sidebar");
  const overlay  = document.getElementById("sidebarOverlay");

  function openSidebar() {
    sidebar?.classList.add("sidebar--open");
    overlay?.classList.add("sidebar-overlay--visible");
    document.body.style.overflow = "hidden";
  }
  function closeSidebar() {
    sidebar?.classList.remove("sidebar--open");
    overlay?.classList.remove("sidebar-overlay--visible");
    document.body.style.overflow = "";
  }

  menuBtn?.addEventListener("click", () => {
    if (sidebar?.classList.contains("sidebar--open")) closeSidebar();
    else openSidebar();
  });
  overlay?.addEventListener("click", closeSidebar);

  // Close sidebar on nav link click (mobile)
  sidebar?.querySelectorAll(".nav-link").forEach(link => {
    link.addEventListener("click", () => {
      if (window.innerWidth < 900) closeSidebar();
    });
  });

  checkHealth();
}

async function checkHealth() {
  const pill = document.getElementById("apiPill");
  if (!pill) return;
  try {
    const r = await fetch("http://localhost:4000/api/health");
    const b = await r.json().catch(() => ({}));
    if (b.db === true) {
      pill.className = "api-pill api-pill--ok";
      pill.textContent = "● Live";
      pill.title = "API & Database online";
    } else {
      pill.className = "api-pill api-pill--warn";
      pill.textContent = "● DB down";
    }
  } catch {
    pill.className = "api-pill api-pill--bad";
    pill.textContent = "● Offline";
  }
}
