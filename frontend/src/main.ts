import "./style.css";
import { on, start } from "./router";
import { getToken } from "./api";
import { navigate } from "./router";

import { loginPage }                                              from "./pages/login";
import { dashboardPage }                                          from "./pages/dashboard";
import { studentsListPage, studentDetailPage, studentFormPage }   from "./pages/students";
import { teachersListPage }                                       from "./pages/teachers";
import { classesPage }                                            from "./pages/classes";
import { subjectsPage }                                           from "./pages/subjects";
import { examsPage }                                              from "./pages/exams";
import { attendancePage }                                         from "./pages/attendance";
import { gradesEntryPage }                                        from "./pages/grades_entry";
import { certificatesPage }                                       from "./pages/certificates";
import { promotionsPage }                                         from "./pages/promotions";
import { leavingRecordsPage }                                     from "./pages/leaving_records";
import { usersPage }                                              from "./pages/users";
import { registerPage }                                           from "./pages/register";
import { gradeSubjectsPage }                                      from "./pages/grade_subjects";
import { auditLogPage }                                           from "./pages/audit_log";

function guard(fn: () => void | Promise<void>) {
  return () => {
    if (!getToken()) { navigate("/"); return; }
    fn();
  };
}

on("/", loginPage);
on("/login", loginPage);
on("/dashboard",       guard(dashboardPage));
on("/students",        guard(studentsListPage));
on("/students/new",    guard(() => studentFormPage()));
on("/teachers",        guard(teachersListPage));
on("/classes",         guard(classesPage));
on("/subjects",        guard(subjectsPage));
on("/exams",           guard(examsPage));
on("/attendance",      guard(attendancePage));
on("/grades",          guard(gradesEntryPage));
on("/certificates",    guard(certificatesPage));
on("/promotions",      guard(promotionsPage));
on("/leaving-records",  guard(() => leavingRecordsPage()));
on("/users",            guard(usersPage));
on("/register",         guard(registerPage));
on("/grade-subjects",   guard(gradeSubjectsPage));
on("/audit-log",        guard(auditLogPage));

// Dynamic routes
const handleDynamic = () => {
  const path = location.pathname;
  if (!getToken()) { navigate("/"); return; }
  const editMatch   = path.match(/^\/students\/([^/]+)\/edit$/);
  const detailMatch = path.match(/^\/students\/([^/]+)$/);
  const lrMatch     = path.match(/^\/leaving-records\/student\/([^/]+)$/);
  if (editMatch)   { studentFormPage(editMatch[1]); return; }
  if (detailMatch) { studentDetailPage(detailMatch[1]); return; }
  if (lrMatch)     { leavingRecordsPage(lrMatch[1]); return; }
  navigate("/dashboard");
};

on("/404", handleDynamic);

window.addEventListener("popstate", () => {
  const path = location.pathname;
  if (
    path.match(/^\/students\/[^/]+(\/edit)?$/) ||
    path.match(/^\/leaving-records\/student\/[^/]+$/)
  ) handleDynamic();
});

document.addEventListener("DOMContentLoaded", () => {
  const path = location.pathname;
  if (
    path.match(/^\/students\/[^/]+(\/edit)?$/) ||
    path.match(/^\/leaving-records\/student\/[^/]+$/)
  ) { handleDynamic(); return; }
  start();
});
