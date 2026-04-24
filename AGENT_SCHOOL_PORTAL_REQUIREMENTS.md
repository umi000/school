# Global Requirements: School Admin Portal (Agent Prompt / Spec)

Use this document as the **single source of truth** when designing, implementing, or generating a complete **school administration portal**. Treat every section as **mandatory unless explicitly marked optional**.

---

## 1. Product vision

Build a **web-based school portal** where **authorized administrators** can **create, read, update, and delete (CRUD)** core school entities: **students** (aligned with a **General Register**, including **G.R. No.**), **teachers**, **classes/sections**, **subjects**, **official certificates** and **certification programs** (especially **Grade 8** and **Grade 10**), **examinations** (**datesheets**, **seat numbers**, **printable exam slips** per class), **attendance**, **grades/assessments**, **timetable**, and **users/roles**. Optional later modules inspired by Sindh digital-school references: **student/teacher ID cards**, **notifications**, **lesson planning**. The system must be **secure**, **auditable**, and **data-consistent** suitable for real school operations (not a demo-only prototype).

---

## 2. Actors & permissions

| Role | Capabilities |
|------|----------------|
| **Super Admin** | Full CRUD on all entities; user/role management; system settings. |
| **School Admin** | CRUD on students, teachers, classes, subjects, **certificates** (issue/print official types + catalog), **examinations** (datesheets, seats, bulk slips), attendance, grades within their school/branch. |
| **Registrar** | Student enrollment CRUD; class assignments; **register fields** (G.R. No., etc.); **assign/track certificates** where policy allows; limited teacher view. |
| **Teacher** *(optional phase)* | View assigned classes/students; record attendance and grades for their subjects only. |
| **Read-only Auditor** *(optional)* | View all records; no mutations. |

**Rules:** Enforce **role-based access control (RBAC)** on every API and UI route. **No client-only security**—all checks on the server.

---

## 3. Functional requirements (CRUD surfaces)

### 3.1 Students *(General Register–aligned)*

The student record is the **digital counterpart of the General Register** used in government schools: one canonical row per pupil with stable identifiers and fields needed for **Character**, **Pass**, and **School Leaving** certificates.

- **Create / Update — identity & register fields:**
  - **G.R. No. (General Register number):** unique per school; primary human-facing id on certificates and ledger *(nullable only until assigned; enforce uniqueness when set)*.
  - **Enrollment number** *(if distinct from G.R. No. at your school, keep both; otherwise alias in UI)*.
  - **Name:** given name(s) and family name; **father’s / guardian’s name** (printed as “S/o …” on forms—store explicitly, do not rely only on free-text “name with parentage”).
  - **Gender** — drives pronouns on **Character Certificate** (“He/She bears…”).
  - **Caste** and **religion** *(or “race/religion” as on register)*.
  - **Place of birth**.
  - **Date of birth:** store only canonical date in DB; generate **date in words** at render time for certificates.
  - **Admission date:** store only canonical date in DB; generate **date in words** at render time when needed.
  - **Last school attended** *(before this admission)*.
  - **Class in which admitted** *(grade at first admission—FK to `grades` or legacy label e.g. VI, VIII)*.
  - **Guardians**, **medical notes** (optional), **photo** (optional; exam slips / future ID cards). Class/section per academic year via **enrollment** (§3.4).
- **Leaving / movement** *(for School Leaving certificate and register columns):* when a student leaves: **date of leaving**, **class/grade from which left**, **reason**, **conduct** (e.g. Good), **academic progress** (e.g. Good), **remarks** (e.g. “No arrears”). Store on a **leaving record** linked to the student and academic context—not only free text in remarks.
- **Date-to-words integrity rule (mandatory):** Do **not** persist duplicate textual date columns (e.g. `*_date_words`) in the database. Use backend helper logic (e.g. `formatDateToWords(date)`) during certificate/PDF generation so words always match numeric dates.
- **Read:** List with search/filter (name, **G.R. No.**, class, roll number, status); detail view with history (class transitions, attendance summary—optional).
- **Delete:** Prefer **soft delete**; hard delete only for Super Admin with confirmation and **audit log**.
- **Manual register backup (mandatory):** Provide a **Print Register Page** view for inspections:
  - Export horizontal PDF formatted like a physical **General Register** ledger book.
  - Minimum columns: **G.R. No.**, Student Name, Father/Guardian Name, DOB, Date of Admission, Date of Leaving, Class/Section, Remarks.
  - Support print ranges/filters (by class, section, academic year, G.R. range) and pagination that maps to “book pages”.
  - Include school header + Govt branding; print-friendly margins for binding/filing.

### 3.2 Teachers

- **Create:** Employment info, employee code, subjects qualified, assigned classes (optional), contact, joining date.
- **Read / Update / Delete:** Same patterns as students; link to **user account** if teachers log in later.

### 3.3 Academic structure

- **Classes / Grades** (e.g. 9th, 10th): CRUD.
- **Sections** (e.g. A, B): CRUD; belong to a class and academic year.
- **Subjects:** CRUD; map to classes (which subjects are taught in which grade).

### 3.3a Official school certificates *(Govt. Higher Secondary School–style)*

The portal must support **printing/PDF generation** of the same **categories of documents** shown in physical samples: **Character Certificate**, **Pass Certificate** (board exam / SSC-oriented), and **School Leaving Certificate**, plus any extra programs in the catalog. Use **separate templates** per document type so wording does not mix **SSC** and **H.S.C Part II** on one form.

**Mandatory document types** (`certificate_template` or equivalent on `certification_programs`):

| Template code | Intended use | Primary merge fields (non-exhaustive) |
|---------------|----------------|--------------------------------------|
| **`character`** | Good conduct / bona fide study period | Student name, **Mr./Miss.** from gender, father line, **W.E.F.** from–to dates, school name, district, issue date, **Principal** signatory block |
| **`pass_ssc`** | Successful **SSC** (10th) / secondary exam pathway | **G.R. No.**, name, S/o, caste, DOB figure + words, **exam annual/supplementary**, **year**, **BISE** (e.g. Sukkur/SBA), **month/year** of exam, **regular/private**, **group**, **seat no.**, **centre**, **grade/division** declared, marks obtained / out of, date, **First Assistant** + **Principal** |
| **`pass_hsc`** | **H.S.C Part II** (if offered) | Same structural fields as pass but **separate PDF/HTML template** and labels—do not reuse `pass_ssc` layout blindly |
| **`school_leaving`** | Student leaving the institution | **Serial (S.No.)** if used, **G.R. No.**, name, father, caste, place of birth, DOB figure + words, last school, admission date, class admitted, conduct, progress, **class studying + since**, **date of leaving**, reason, remarks, certificate date, **Class Teacher** + **Head Master** blocks |

**Catalog (admin CRUD):**

- **Create / Read / Update / Delete** certification definitions: `code`, `name`, **`certificate_template`** (one of `character` \| `pass_ssc` \| `pass_hsc` \| `school_leaving` \| `custom`), description, **issuing body**, **active** flag.
- **Grade offers:** Link each program to eligible `grades`. **Expectation:** programs using **`school_leaving`** and **Grade 8** completions are common; **`pass_ssc`** aligns with **Grade 10** / SSC cohorts.
- Optional extras (ICT, career readiness): use `certificate_template = custom` or extend enum with new template types.

**Per-student issuance (admin/registrar CRUD):**

- Link student → certification program for an **academic year**: status (**enrolled**, **in_progress**, **completed**, **issued**, **withdrawn**).
- **Merge payload:** Store template-specific fields in **`merge_data JSONB`** (e.g. `board_name`, `exam_centre`, `institutional_seat_number`, `board_roll_number`, exam session, marks) so forms not fully covered by student master still export cleanly. **Character** and **School Leaving** should largely auto-fill from **student** + **leaving record**.
- **certificate_number**, **issue_date**, **expiry_date** (optional), **document_url** (scanned copy), notes.
- **Certificate serial (S.No.):** if the school numbers leaving certificates sequentially, implement a **per-school or per-year counter**; do not confuse with G.R. No.
- **Seat/roll distinction rule (mandatory):** Internal exam seat numbers are managed in `examination_seats`; board/BISE identifiers (SSC/HSC roll no.) must be tracked separately (e.g. in `merge_data.board_roll_number`) and must not overwrite institutional seat numbers.
- **Validation:** Student’s **current enrolled grade** (for that year) must be in the program’s **grade offers**; enforce server-side.
- **Status transition rule (mandatory):** Issuing a `school_leaving` certificate must trigger student master status transition from `active` to `withdrawn` (or `alumni` per school policy), and this transition must be audit-logged.

**Reporting:** Filter by template type, grade (8/10), academic year; export lists *(optional)*.

### 3.3b Reference: optional modules *(phase 2)*

Not required for MVP; align if matching SELD-style portals: **digital ID cards**, **cluster** views (multi-school), **notifications**, **AI-assisted question papers**, **lesson planning** with PDF export.

### 3.4 Enrollment & assignments

- **Student–Section** assignment per **academic year** (students can change section year to year).
- **Teacher–Subject–Section** assignment (who teaches what to which section).
- **Bulk promotion utility (mandatory):** At year-close, admins must promote whole cohorts in one workflow (not manual per-student enrollment).
  - Select source cohort (e.g. `Grade 9 - Section A (2025)`) and destination cohort (e.g. `Grade 10 - Section A (2026)`).
  - System creates next-year `student_enrollments` rows in bulk for eligible students (passed/approved policy).
  - Must support dry-run preview, duplicate/conflict detection, explicit confirmation, and rollback-safe transaction handling.
  - Exclude failed/withdrawn/transfer students by default unless authorized override is used.
  - Write batch audit record containing source, destination, student count, actor, and timestamp.

### 3.5 Attendance *(recommended)*

- Daily or per-period attendance; CRUD by authorized roles; **bulk entry** for a section on a date.

### 3.6 Grades / assessments *(recommended)*

- Exams or continuous assessment; scores per student, subject, academic period; CRUD with validation (min/max, weightings optional).
- **Pass/fail logic (mandatory):** Determine subject pass/fail using `grade_subjects.passing_marks` (or configured policy), not only `max_score` on a single score row.
- **Theory/Practical split (mandatory for SSC-aligned subjects):** Support separate components (e.g. Theory, Practical) for subjects where boards require split marks (Biology, Physics, Chemistry, etc.), while still computing combined totals for results/marksheets.
- Optional **class-level analytics:** pass/fail summary, gender-wise charts, top position holders, **batch print marksheets** (see examination naming in §3.6a).

### 3.6a Examinations, datesheets & exam slips

Support **internal/boiler exams** (annual, mid-term, supplementary—configurable labels) aligned with samples: admin defines an **examination** per **academic year**, builds a **datesheet** (subject, date, time range); **day of week** may be derived from date in UI.

- **CRUD:** Examination metadata (name, type, academic year, school).
- **Datesheet:** Per **section** or **grade** (choose one model and document it): ordered rows of **subject**, **exam date**, **start/end time**; validate no overlapping room/teacher if you track those later.
- **Seat numbers:** Assign **integer seat numbers** per student per examination scope (typically unique within **section + examination**). Support **bulk assign** or manual edit.
- **Exam slips:** Generate **printable PDF** (single class or section): each slip includes school header, exam title/year, **student name**, **father’s name**, **class**, **seat number**, **photo** if available, and a **table** (DAY, DATE, SUBJECT, TIME) from the datesheet. Multiple slips per page (e.g. 2×2 grid) is acceptable.
- **Audit:** Log generation events (who printed slips, for which exam/class).

### 3.7 Timetable *(optional)*

- Periods, rooms, teacher–subject–section–slot associations.

### 3.8 Users & authentication

- Admin/teacher accounts: email or username, password hashing (**bcrypt/argon2**), password reset flow (optional).
- **Session or JWT** with expiry; **HTTPS** in production.

### 3.9 Audit & compliance

- Log **who** changed **what** and **when** for sensitive entities (student, teacher, grades, attendance, **student certifications**, **leaving records**, bulk **exam slip** / certificate PDF generation where feasible).
- Export **CSV/PDF** for students/teachers lists *(optional but valuable)*.

---

## 4. Non-functional requirements

- **Performance:** List endpoints paginated (e.g. 20–50 per page); indexes on foreign keys and common filters.
- **Validation:** Server-side validation for all inputs; unique constraints (**G.R. No.**, enrollment no., employee code) enforced in DB.
- **Localization / multi-school:** If multiple campuses: add `school_id` or `branch_id` to all tenant tables and scope queries.
- **Backups:** Document backup/restore for chosen database.
- **Tech stack (agent may choose):** e.g. React/Next.js + Node/Nest or Django/Laravel + one relational DB; keep stack consistent and documented.

---

## 5. Database choice: **SQL (relational) vs JSON / NoSQL**

**Recommendation: use a relational SQL database (PostgreSQL preferred, or MySQL/MariaDB).**

| Criterion | SQL (PostgreSQL, etc.) | Document/JSON NoSQL (MongoDB, etc.) |
|-----------|------------------------|-------------------------------------|
| **Relations** | Native FKs: student↔section↔teacher↔subject fit naturally | Possible but easier to get inconsistent references |
| **Transactions** | ACID for attendance + grades + enrollment updates | Varies; cross-document consistency is harder |
| **Reporting** | Joins, aggregates, exports are standard | Often more application-side logic |
| **Schema & integrity** | Unique keys, check constraints, migrations | Schema flexibility can hide data bugs |
| **When NoSQL fits** | — | Extreme scale, flexible unstructured blobs, or proven team expertise |

**Conclusion:** For a **school admin portal** with heavy **relational data** and **reporting**, **SQL is the best default**. Use **JSON columns** in PostgreSQL only for **truly variable** attributes (e.g. `metadata`, rare custom fields)—not as a replacement for core relations.

---

## 6. Suggested relational schema (PostgreSQL-style)

Naming: `snake_case`, plural table names. Use `uuid` or `bigserial` for PKs; below uses **`uuid`** for global uniqueness (optional).

### 6.1 Reference & tenancy

```sql
-- Multi-school support (omit if single school)
CREATE TABLE schools (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(255) NOT NULL,
  code          VARCHAR(64) UNIQUE,
  district      VARCHAR(128),           -- e.g. Naushahro Feroze
  semis_code    VARCHAR(32),            -- government school code where applicable
  address       TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE academic_years (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  label         VARCHAR(32) NOT NULL,  -- e.g. '2024-2025'
  start_date    DATE NOT NULL,
  end_date      DATE NOT NULL,
  is_current    BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (school_id, label)
);
```

### 6.2 Structure: classes, sections, subjects

```sql
CREATE TABLE grades (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name          VARCHAR(64) NOT NULL,  -- e.g. 'Grade 9'
  level_order   INT,
  UNIQUE (school_id, name)
);

CREATE TABLE sections (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grade_id      UUID NOT NULL REFERENCES grades(id) ON DELETE CASCADE,
  academic_year_id UUID NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
  name          VARCHAR(16) NOT NULL,  -- 'A', 'B'
  UNIQUE (grade_id, academic_year_id, name)
);

CREATE TABLE subjects (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name          VARCHAR(128) NOT NULL,
  code          VARCHAR(32),
  UNIQUE (school_id, code)
);

CREATE TABLE grade_subjects (
  grade_id      UUID NOT NULL REFERENCES grades(id) ON DELETE CASCADE,
  subject_id    UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  passing_marks NUMERIC(6,2) NOT NULL DEFAULT 33,
  practical_passing_marks NUMERIC(6,2),
  has_practical BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (grade_id, subject_id)
);
```

### 6.3 People: students, teachers, guardians

*Run `students` before `certification_*` and `student_certifications` blocks below.*

```sql
CREATE TABLE students (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id             UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  general_register_no   VARCHAR(64),       -- G.R. No.; unique when not null
  enrollment_number     VARCHAR(64) NOT NULL,
  first_name            VARCHAR(128) NOT NULL,
  last_name             VARCHAR(128) NOT NULL,
  father_name           VARCHAR(255),
  cnic_form_b           VARCHAR(32),       -- Student Bay Form / national id where applicable
  father_cnic           VARCHAR(32),       -- Guardian/Father CNIC for board/government workflows
  date_of_birth         DATE,
  gender                VARCHAR(16),
  caste                 VARCHAR(128),
  religion              VARCHAR(64),
  place_of_birth        VARCHAR(255),
  phone                 VARCHAR(32),
  email                 VARCHAR(255),
  address               TEXT,
  admission_date        DATE,
  last_school_attended  VARCHAR(255),
  admitted_grade_id     UUID REFERENCES grades(id) ON DELETE SET NULL,
  status                VARCHAR(24) NOT NULL DEFAULT 'active',
  photo_url             TEXT,
  deleted_at            TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (school_id, enrollment_number)
);

CREATE UNIQUE INDEX uq_students_school_gr_no ON students (school_id, general_register_no)
  WHERE general_register_no IS NOT NULL;

-- One formal "leaving" row per departure event (School Leaving certificate / register)
CREATE TABLE student_leaving_records (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id         UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  academic_year_id   UUID REFERENCES academic_years(id) ON DELETE SET NULL,
  leaving_serial_no  INT,
  class_left_grade_id UUID REFERENCES grades(id) ON DELETE SET NULL,
  class_studying_since DATE,
  date_left          DATE NOT NULL,
  reason             TEXT,
  conduct            VARCHAR(64),
  progress           VARCHAR(64),
  remarks            TEXT,
  certificate_issued_at DATE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_leaving_student ON student_leaving_records (student_id);

CREATE TABLE guardians (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id    UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  name          VARCHAR(255) NOT NULL,
  relationship  VARCHAR(64),
  phone         VARCHAR(32) NOT NULL,
  email         VARCHAR(255),
  is_primary    BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE teachers (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id         UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  employee_code     VARCHAR(64) NOT NULL,
  first_name        VARCHAR(128) NOT NULL,
  last_name         VARCHAR(128) NOT NULL,
  date_of_birth     DATE,
  phone             VARCHAR(32),
  email             VARCHAR(255),
  joining_date      DATE,
  status            VARCHAR(24) NOT NULL DEFAULT 'active',
  deleted_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (school_id, employee_code)
);

-- Certification catalog; certificate_template drives PDF layout (character, pass_ssc, etc.)
CREATE TABLE certification_programs (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id            UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  code                 VARCHAR(64) NOT NULL,
  name                 VARCHAR(255) NOT NULL,
  certificate_template VARCHAR(32) NOT NULL
    CHECK (certificate_template IN ('character','pass_ssc','pass_hsc','school_leaving','custom')),
  description          TEXT,
  issuing_body         VARCHAR(255),
  is_active            BOOLEAN NOT NULL DEFAULT true,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (school_id, code)
);

CREATE TABLE certification_grade_offers (
  certification_program_id UUID NOT NULL REFERENCES certification_programs(id) ON DELETE CASCADE,
  grade_id                 UUID NOT NULL REFERENCES grades(id) ON DELETE CASCADE,
  PRIMARY KEY (certification_program_id, grade_id)
);

CREATE TABLE student_certifications (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id               UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  certification_program_id UUID NOT NULL REFERENCES certification_programs(id) ON DELETE CASCADE,
  academic_year_id         UUID NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
  status                   VARCHAR(24) NOT NULL DEFAULT 'enrolled'
    CHECK (status IN ('enrolled','in_progress','completed','issued','withdrawn')),
  certificate_number       VARCHAR(128),
  merge_data               JSONB,
  issue_date               DATE,
  expiry_date              DATE,
  document_url             TEXT,
  notes                    TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, certification_program_id, academic_year_id)
);

CREATE INDEX idx_student_certifications_student ON student_certifications (student_id);
CREATE INDEX idx_student_certifications_program ON student_certifications (certification_program_id);
```

### 6.4 Users & RBAC

```sql
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     UUID REFERENCES schools(id) ON DELETE SET NULL,
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  teacher_id    UUID REFERENCES teachers(id) ON DELETE SET NULL,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE roles (
  id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name   VARCHAR(64) NOT NULL UNIQUE  -- super_admin, admin, registrar, teacher
);

CREATE TABLE user_roles (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, role_id)
);
```

### 6.5 Enrollment & teaching assignments

```sql
-- Student in a section for a given academic year
CREATE TABLE student_enrollments (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id         UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  section_id         UUID NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  academic_year_id   UUID NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
  roll_number        VARCHAR(32),
  enrolled_at        DATE NOT NULL DEFAULT CURRENT_DATE,
  UNIQUE (student_id, academic_year_id),
  UNIQUE (section_id, roll_number)  -- adjust if roll unique per grade only
);

CREATE TABLE teacher_assignments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id       UUID NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  section_id       UUID NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  subject_id       UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  academic_year_id UUID NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
  UNIQUE (teacher_id, section_id, subject_id, academic_year_id)
);
```

### 6.5a Examinations, datesheets & seat numbers

*Scope datesheets **per section** (matches “pick class → build schedule → generate slips for all students in that class” in reference UIs).*

```sql
CREATE TABLE examinations (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id          UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  academic_year_id   UUID NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
  name               VARCHAR(255) NOT NULL,
  exam_kind          VARCHAR(32) NOT NULL DEFAULT 'annual'
    CHECK (exam_kind IN ('annual','mid_term','supplementary','other')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE examination_schedule_lines (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  examination_id  UUID NOT NULL REFERENCES examinations(id) ON DELETE CASCADE,
  section_id      UUID NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  subject_id      UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  exam_date       DATE NOT NULL,
  time_start      TIME,
  time_end        TIME,
  sort_order      INT NOT NULL DEFAULT 0,
  UNIQUE (examination_id, section_id, subject_id, exam_date)
);

CREATE TABLE examination_seats (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  examination_id  UUID NOT NULL REFERENCES examinations(id) ON DELETE CASCADE,
  section_id      UUID NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  student_id      UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  seat_number     INT NOT NULL,
  UNIQUE (examination_id, student_id),
  UNIQUE (examination_id, section_id, seat_number)
);

CREATE INDEX idx_exam_sched_exam ON examination_schedule_lines (examination_id, section_id);
CREATE INDEX idx_exam_seats_exam ON examination_seats (examination_id, section_id);
```

### 6.6 Attendance & grades

```sql
CREATE TABLE attendance_sessions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id       UUID NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  subject_id       UUID REFERENCES subjects(id) ON DELETE SET NULL,
  academic_year_id UUID NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
  date             DATE NOT NULL,
  period           VARCHAR(16),  -- or INT for period number
  UNIQUE (section_id, date, period, subject_id)
);

CREATE TABLE attendance_records (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID NOT NULL REFERENCES attendance_sessions(id) ON DELETE CASCADE,
  student_id      UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  status          VARCHAR(16) NOT NULL,  -- present, absent, late, excused
  note            TEXT,
  UNIQUE (session_id, student_id)
);

CREATE TABLE assessment_terms (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  academic_year_id UUID NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
  name             VARCHAR(64) NOT NULL,  -- Midterm, Final
  start_date       DATE,
  end_date         DATE,
  UNIQUE (academic_year_id, name)
);

CREATE TABLE grades_scores (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id       UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  subject_id       UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  section_id       UUID NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  academic_year_id UUID NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
  term_id          UUID REFERENCES assessment_terms(id) ON DELETE SET NULL,
  score_component  VARCHAR(24) NOT NULL DEFAULT 'overall'
    CHECK (score_component IN ('overall','theory','practical','oral','project')),
  score            NUMERIC(6,2) NOT NULL,
  max_score        NUMERIC(6,2) NOT NULL DEFAULT 100,
  assessment_type  VARCHAR(64),  -- quiz, exam, homework
  recorded_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, subject_id, section_id, academic_year_id, term_id, assessment_type, score_component, recorded_at)
  -- simplify UNIQUE in real design per business rules
);
```

**Scoring note:** for SSC-style subjects with `has_practical = true`, store separate `grades_scores` rows for `score_component = 'theory'` and `score_component = 'practical'`; compute display totals in result/marksheet queries (or materialized views) according to board policy.

### 6.7 Audit *(recommended)*

```sql
CREATE TABLE audit_logs (
  id            BIGSERIAL PRIMARY KEY,
  user_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  action        VARCHAR(32) NOT NULL,  -- INSERT, UPDATE, DELETE, LOGIN
  entity_table  VARCHAR(64) NOT NULL,
  entity_id     UUID,
  old_data      JSONB,
  new_data      JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_entity ON audit_logs (entity_table, entity_id);
CREATE INDEX idx_audit_created ON audit_logs (created_at DESC);
```

**Indexes (minimum):** FK columns on `students`, `teachers`, `student_enrollments`, `attendance_records`, `grades_scores`, `student_certifications`, `examination_schedule_lines`, `examination_seats`, `student_leaving_records`; index on `students (school_id, general_register_no)` for lookups; partial index on `students`/`teachers` where `deleted_at IS NULL` if soft delete is used.

**Note on `general_register_no`:** The schema uses a **partial unique index** so many pupils can be “G.R. pending” (`NULL`) while each non-null G.R. No. remains unique per school.

---

## 7. API & UI expectations (for implementation agents)

- **REST or GraphQL** with consistent error format; **OpenAPI/Swagger** recommended.
- **Global theme policy (mandatory):** Use only **green + white** as the main product theme across the app.
  - Primary brand color: `#15803D` (green 700) or equivalent.
  - Surfaces/background: white (`#FFFFFF`) and very light green tints only.
  - Keep component styles consistent: buttons, links, active nav, tabs, badges, charts should use green family only for brand states.
  - **Do not** introduce extra brand hues (purple/blue/orange) for normal UI states.
  - **Certificate template exception (mandatory):** Keep existing certificate designs as they are:
    - Template variant A: **green** certificate style.
    - Template variant B: **blue** certificate style.
    - These two certificate colors are explicitly allowed and should not be normalized to green-only.
  - **Exception (keep global standards):** Semantic states stay standard and accessible:
    - Success: green shades
    - Warning: amber/yellow shades
    - Error/destructive: red shades
    - Info: blue shades (if needed)
- **Admin UI:** Dashboard, sidebar navigation, data tables with pagination/sort/filter, forms with validation, confirm modals on delete.
- **Global search UX (mandatory):** Search/typeahead must prioritize **G.R. No.** exact and prefix matches over name matches. Typing a register number (e.g. `4512`) should immediately surface the student record and allow direct open from suggestions without extra filters.
- **Certificates UI:** **Catalog** with **template type** (Character / Pass SSC / Pass HSC / School Leaving / Custom); **grade offers**; **issue** flow with preview/PDF; **`merge_data`** editor for board/exam-only fields; **leaving record** form wired to School Leaving template.
- **Certificate typography policy (mandatory):** Official certificate templates/PDFs must use formal, inspection-safe serif fonts (e.g. **Times New Roman**, **Noto Serif**). Decorative/script display fonts are not allowed.
- **Examinations UI:** Create exam → **datesheet** grid (subject, date, time; auto day-of-week) → **assign seats** → **generate slips PDF** for a section/class; mobile-friendly layout is acceptable.
- **Official branding assets (mandatory):** Add and use the **Government of Sindh logo** in:
  - App header/login splash (where official branding is shown),
  - Certificate templates (Character / Pass / School Leaving),
  - Exam-slip printable templates.
  Keep safe margins, preserve logo aspect ratio, and store a configurable logo file path/URL in school settings for easy replacement.
- **Favicon (mandatory):** Use an official **Government of Sindh seal/icon** as the browser/app favicon to reinforce trust and “official portal” identity.
  - Provide at least `favicon.ico` plus PNG variants (`16x16`, `32x32`, `180x180` for Apple touch icon).
  - Keep it legible at small sizes (simplified seal variant if needed), and ensure the green/white brand palette remains visually consistent.
- **Idempotency** for bulk operations where useful.

---

## 8. Agent checklist before “done”

- [ ] All CRUD flows covered for students (**G.R. No.** + register fields), **student_leaving_records**, teachers, structure, enrollments, assignments.
- [ ] **Bulk promotion** implemented with dry-run preview, conflict checks, and transactional batch enrollment creation.
- [ ] **Certificates:** catalog with **`certificate_template`**, grade offers, issuance with **`merge_data`**, PDF for **character**, **pass_ssc** / **pass_hsc**, **school_leaving**; eligibility enforced server-side.
- [ ] Issuing **school_leaving** updates student status (`withdrawn`/`alumni`) and writes audit logs.
- [ ] **Examinations:** `examinations`, **datesheet** lines per section, **seat** assignment, **bulk exam slips** PDF.
- [ ] Global search prioritizes **G.R. No.** exact/prefix lookup with direct typeahead open.
- [ ] Certificate PDFs use formal serif fonts (Times New Roman / Noto Serif class).
- [ ] RBAC enforced server-side; default admin seed documented.
- [ ] Migrations/versioned schema match this spec (or documented deltas).
- [ ] Soft delete / status policy documented.
- [ ] Basic audit or changelog for sensitive tables.
- [ ] README: how to run, env vars, first-time setup.

---

*End of global requirements. Paste this entire file at the start of an agent session when generating or extending the school portal.*
