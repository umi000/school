import { apiFetch } from "../api";
import { mount } from "../shell";

export async function dashboardPage() {
  mount("Dashboard", `<div class="stat-grid">
    <div class="stat-card"><div class="stat-card__value" id="sTot">—</div><div class="stat-card__label">Total Students</div></div>
    <div class="stat-card"><div class="stat-card__value" id="sActive">—</div><div class="stat-card__label">Active Students</div></div>
    <div class="stat-card"><div class="stat-card__value" id="sTeachers">—</div><div class="stat-card__label">Teachers</div></div>
    <div class="stat-card"><div class="stat-card__value" id="sExams">—</div><div class="stat-card__label">Examinations</div></div>
  </div>
  <div class="dash-grid">
    <div class="card"><h3>Quick Links</h3>
      <div class="quick-links">
        <a href="/students/new" data-link class="ql-item">+ New Student</a>
        <a href="/exams" data-link class="ql-item">Examination Setup</a>
        <a href="/certificates" data-link class="ql-item">Issue Certificate</a>
        <a href="/attendance" data-link class="ql-item">Mark Attendance</a>
        <a href="/grades" data-link class="ql-item">Enter Marks</a>
        <a href="/promotions" data-link class="ql-item">Promotions</a>
      </div>
    </div>
    <div class="card"><h3>Government Boys Higher Secondary School</h3>
      <p class="muted" style="margin-top:.5rem;">Bhiria City, District Naushahro Feroze, Sindh<br/>School Management Portal</p>
      <p class="muted" style="margin-top:.5rem;">Date: <strong>${new Date().toDateString()}</strong></p>
    </div>
  </div>`);

  try {
    const [stuRes, activeRes, tchRes, examRes] = await Promise.allSettled([
      apiFetch("/students?limit=1") as Promise<{total:number}>,
      apiFetch("/students?limit=1&status=active") as Promise<{total:number}>,
      apiFetch("/teachers?limit=1") as Promise<{total:number}>,
      apiFetch("/examinations?limit=1") as Promise<{total:number}>,
    ]);

    if (stuRes.status === "fulfilled") {
      (document.getElementById("sTot") as HTMLElement).textContent = String(stuRes.value.total);
    }
    if (activeRes.status === "fulfilled") {
      (document.getElementById("sActive") as HTMLElement).textContent = String(activeRes.value.total);
    }
    if (tchRes.status === "fulfilled") {
      (document.getElementById("sTeachers") as HTMLElement).textContent = String(tchRes.value.total);
    }
    if (examRes.status === "fulfilled") {
      (document.getElementById("sExams") as HTMLElement).textContent = String(examRes.value.total);
    }
  } catch {
    // stats optional
  }
}
