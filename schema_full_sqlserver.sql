-- ============================================================
-- GBHSS BHIRIA CITY — Full SQL Server Schema
-- Government Boys Higher Secondary School, Bhiria City
-- District Naushahro Feroze, Sindh
-- ============================================================
-- Generated: 2026-03-24  (synced from live database)
-- Tables   : 26
-- ============================================================
-- SQL SERVER CASCADE RULES (important):
--   SQL Server rejects FK constraints that create "multiple cascade
--   paths" from one table to another. The safe rule applied here:
--     • ON DELETE CASCADE   — only for direct 1-level parent-child
--                             (e.g. school → academic_years)
--     • ON DELETE NO ACTION — everywhere a table has 2+ FKs whose
--                             ancestors share a common root, to
--                             prevent cycle / multi-path errors.
--   Application-level code handles cascades for those tables.
-- ============================================================
-- HOW TO USE
--   Fresh DB  : Run this entire file once.
--   Existing  : IF NOT EXISTS guards on CREATE TABLE and
--               column-existence checks on ALTER TABLE make
--               every statement safe to re-run.
-- ============================================================

USE [gbhss];
GO

-- ============================================================
-- 1. SCHOOLS  (single-school setup — always 1 row)
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='schools')
CREATE TABLE dbo.schools (
    id          UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    name        NVARCHAR(255)    NOT NULL,
    code        NVARCHAR(64)     NULL,
    district    NVARCHAR(128)    NULL,
    semis_code  NVARCHAR(32)     NULL,
    address     NVARCHAR(MAX)    NULL,
    created_at  DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

-- ============================================================
-- 2. ACADEMIC YEARS
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='academic_years')
CREATE TABLE dbo.academic_years (
    id          UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    school_id   UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.schools(id) ON DELETE CASCADE,
    label       NVARCHAR(32)     NOT NULL,
    start_date  DATE             NOT NULL,
    end_date    DATE             NOT NULL,
    is_current  BIT              NOT NULL DEFAULT 0,
    created_at  DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),
    UNIQUE (school_id, label)
);
GO

-- ============================================================
-- 3. GRADES
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='grades')
CREATE TABLE dbo.grades (
    id          UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    school_id   UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.schools(id) ON DELETE CASCADE,
    name        NVARCHAR(64)     NOT NULL,
    level_order INT              NULL,
    created_at  DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),
    UNIQUE (school_id, name)
);
GO

-- ============================================================
-- 4. SECTIONS
-- NO ACTION on both FKs — sections hangs off grade AND
-- academic_year, both of which cascade from schools → cycle.
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='sections')
CREATE TABLE dbo.sections (
    id               UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    grade_id         UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.grades(id)        ON DELETE NO ACTION,
    academic_year_id UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.academic_years(id) ON DELETE NO ACTION,
    name             NVARCHAR(16)     NOT NULL,
    capacity         INT              NULL,
    created_at       DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),
    UNIQUE (grade_id, academic_year_id, name)
);
GO

-- ============================================================
-- 5. SUBJECTS
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='subjects')
CREATE TABLE dbo.subjects (
    id           UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    school_id    UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.schools(id) ON DELETE CASCADE,
    name         NVARCHAR(128)    NOT NULL,
    code         NVARCHAR(32)     NULL,
    subject_type NVARCHAR(32)     NULL DEFAULT 'core',
    medium       NVARCHAR(32)     NULL DEFAULT 'english',
    created_at   DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),
    UNIQUE (school_id, code)
);
GO

-- ============================================================
-- 6. GRADE SUBJECTS
-- NO ACTION on subject_id — grades cascade from schools, subjects
-- also cascade from schools → multi-path.
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='grade_subjects')
CREATE TABLE dbo.grade_subjects (
    grade_id                UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.grades(id)   ON DELETE CASCADE,
    subject_id              UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.subjects(id) ON DELETE NO ACTION,
    passing_marks           NUMERIC(6,2)     NOT NULL DEFAULT 33,
    practical_passing_marks NUMERIC(6,2)     NULL,
    has_practical           BIT              NOT NULL DEFAULT 0,
    max_marks               NUMERIC(6,2)     NOT NULL DEFAULT 100,
    created_at              DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),
    PRIMARY KEY (grade_id, subject_id)
);
GO

-- ============================================================
-- 7. TEACHERS
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='teachers')
CREATE TABLE dbo.teachers (
    id            UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    school_id     UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.schools(id) ON DELETE CASCADE,
    employee_code NVARCHAR(64)     NOT NULL,
    first_name    NVARCHAR(128)    NOT NULL,
    last_name     NVARCHAR(128)    NOT NULL,
    gender        NVARCHAR(16)     NULL,
    date_of_birth DATE             NULL,
    phone         NVARCHAR(32)     NULL,
    email         NVARCHAR(255)    NULL,
    qualification NVARCHAR(255)    NULL,
    joining_date  DATE             NULL,
    status        NVARCHAR(24)     NOT NULL DEFAULT 'active',
    deleted_at    DATETIME2        NULL,
    created_at    DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at    DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),
    UNIQUE (school_id, employee_code)
);
GO

-- ============================================================
-- 8. STUDENTS
-- admitted_grade_id → NO ACTION (grades cascades from schools,
-- students cascades from schools → cycle).
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='students')
CREATE TABLE dbo.students (
    id                    UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    school_id             UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.schools(id)  ON DELETE CASCADE,
    serial_no             INT              NULL,
    general_register_no   NVARCHAR(64)     NULL,
    enrollment_number     NVARCHAR(64)     NOT NULL,
    first_name            NVARCHAR(128)    NOT NULL,
    last_name             NVARCHAR(128)    NOT NULL,
    father_name           NVARCHAR(255)    NULL,
    mother_name           NVARCHAR(255)    NULL,
    guardian_name         NVARCHAR(255)    NULL,
    guardian_relation     NVARCHAR(64)     NULL,
    cnic_form_b           NVARCHAR(32)     NULL,
    father_cnic           NVARCHAR(32)     NULL,
    date_of_birth         DATE             NULL,
    gender                NVARCHAR(16)     NULL,
    caste                 NVARCHAR(128)    NULL,
    religion              NVARCHAR(64)     NULL,
    nationality           NVARCHAR(64)     NULL DEFAULT 'Pakistani',
    place_of_birth        NVARCHAR(255)    NULL,
    phone                 NVARCHAR(32)     NULL,
    email                 NVARCHAR(255)    NULL,
    address               NVARCHAR(MAX)    NULL,
    photo_url             NVARCHAR(MAX)    NULL,
    admission_date        DATE             NULL,
    last_school_attended  NVARCHAR(255)    NULL,
    admitted_grade_id     UNIQUEIDENTIFIER NULL REFERENCES dbo.grades(id)       ON DELETE NO ACTION,
    class_studying_since  DATE             NULL,
    date_of_leaving       DATE             NULL,
    class_left_label      NVARCHAR(64)     NULL,
    conduct_on_leaving    NVARCHAR(64)     NULL,
    progress_on_leaving   NVARCHAR(64)     NULL,
    reason_for_leaving    NVARCHAR(MAX)    NULL,
    remarks               NVARCHAR(MAX)    NULL,
    status                NVARCHAR(24)     NOT NULL DEFAULT 'active'
                          CONSTRAINT CK_student_status CHECK (
                              status IN ('active','withdrawn','alumni','passed_out')),
    deleted_at            DATETIME2        NULL,
    created_at            DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at            DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),
    UNIQUE (school_id, enrollment_number)
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='uq_students_school_gr_no')
    CREATE UNIQUE INDEX uq_students_school_gr_no
        ON dbo.students (school_id, general_register_no)
        WHERE general_register_no IS NOT NULL;
GO

-- ============================================================
-- 9. GUARDIANS
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='guardians')
CREATE TABLE dbo.guardians (
    id           UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    student_id   UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.students(id) ON DELETE CASCADE,
    name         NVARCHAR(255)    NOT NULL,
    relationship NVARCHAR(64)     NULL,
    phone        NVARCHAR(32)     NOT NULL,
    email        NVARCHAR(255)    NULL,
    is_primary   BIT              NOT NULL DEFAULT 0
);
GO

-- ============================================================
-- 10. USERS & RBAC
-- teacher_id → NO ACTION (teachers cascade from schools,
-- users also cascade from schools → multi-path).
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='users')
CREATE TABLE dbo.users (
    id            UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    school_id     UNIQUEIDENTIFIER NULL REFERENCES dbo.schools(id)  ON DELETE SET NULL,
    email         NVARCHAR(255)    NOT NULL UNIQUE,
    password_hash NVARCHAR(MAX)    NOT NULL,
    teacher_id    UNIQUEIDENTIFIER NULL REFERENCES dbo.teachers(id) ON DELETE NO ACTION,
    is_active     BIT              NOT NULL DEFAULT 1,
    created_at    DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='roles')
CREATE TABLE dbo.roles (
    id   UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    name NVARCHAR(64)     NOT NULL UNIQUE
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='user_roles')
CREATE TABLE dbo.user_roles (
    user_id UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.users(id)  ON DELETE CASCADE,
    role_id UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.roles(id)  ON DELETE CASCADE,
    PRIMARY KEY (user_id, role_id)
);
GO

-- Seed default roles
IF NOT EXISTS (SELECT 1 FROM dbo.roles WHERE name='super_admin') INSERT INTO dbo.roles (id,name) VALUES (NEWID(),'super_admin');
IF NOT EXISTS (SELECT 1 FROM dbo.roles WHERE name='admin')       INSERT INTO dbo.roles (id,name) VALUES (NEWID(),'admin');
IF NOT EXISTS (SELECT 1 FROM dbo.roles WHERE name='registrar')   INSERT INTO dbo.roles (id,name) VALUES (NEWID(),'registrar');
IF NOT EXISTS (SELECT 1 FROM dbo.roles WHERE name='teacher')     INSERT INTO dbo.roles (id,name) VALUES (NEWID(),'teacher');
GO

-- ============================================================
-- 11. STUDENT ENROLLMENTS
-- NO ACTION on section_id + academic_year_id (both ultimately
-- root at schools → multi-path from students side too).
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='student_enrollments')
CREATE TABLE dbo.student_enrollments (
    id               UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    student_id       UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.students(id)       ON DELETE CASCADE,
    section_id       UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.sections(id)       ON DELETE NO ACTION,
    academic_year_id UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.academic_years(id) ON DELETE NO ACTION,
    roll_number      NVARCHAR(32)     NULL,
    enrolled_at      DATE             NOT NULL DEFAULT CAST(SYSUTCDATETIME() AS DATE),
    UNIQUE (student_id, academic_year_id)
);
GO

-- ============================================================
-- 12. TEACHER ASSIGNMENTS
-- NO ACTION everywhere — all FKs cascade from schools.
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='teacher_assignments')
CREATE TABLE dbo.teacher_assignments (
    id               UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    teacher_id       UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.teachers(id)       ON DELETE NO ACTION,
    section_id       UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.sections(id)       ON DELETE NO ACTION,
    subject_id       UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.subjects(id)       ON DELETE NO ACTION,
    academic_year_id UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.academic_years(id) ON DELETE NO ACTION,
    created_at       DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),
    UNIQUE (teacher_id, section_id, subject_id, academic_year_id)
);
GO

-- ============================================================
-- 13. CERTIFICATION PROGRAMS
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='certification_programs')
CREATE TABLE dbo.certification_programs (
    id                   UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    school_id            UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.schools(id) ON DELETE CASCADE,
    code                 NVARCHAR(64)     NOT NULL,
    name                 NVARCHAR(255)    NOT NULL,
    certificate_template NVARCHAR(32)     NOT NULL DEFAULT 'character'
                         CONSTRAINT CK_cert_template CHECK (certificate_template IN
                           ('character','pass_ssc','pass_hsc','school_leaving','custom')),
    description          NVARCHAR(MAX)    NULL,
    issuing_body         NVARCHAR(255)    NULL,
    is_active            BIT              NOT NULL DEFAULT 1,
    created_at           DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at           DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),
    UNIQUE (school_id, code)
);
GO

-- ============================================================
-- 14. CERTIFICATION GRADE OFFERS
-- NO ACTION — cert_programs and grades both cascade from schools.
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='certification_grade_offers')
CREATE TABLE dbo.certification_grade_offers (
    certification_program_id UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.certification_programs(id) ON DELETE CASCADE,
    grade_id                 UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.grades(id)                 ON DELETE NO ACTION,
    PRIMARY KEY (certification_program_id, grade_id)
);
GO

-- ============================================================
-- 15. STUDENT CERTIFICATIONS
-- NO ACTION on non-student FKs to avoid multi-path.
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='student_certifications')
CREATE TABLE dbo.student_certifications (
    id                       UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    student_id               UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.students(id)              ON DELETE CASCADE,
    certification_program_id UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.certification_programs(id) ON DELETE NO ACTION,
    academic_year_id         UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.academic_years(id)         ON DELETE NO ACTION,
    status                   NVARCHAR(24)     NOT NULL DEFAULT 'enrolled'
                             CONSTRAINT CK_cert_status CHECK (status IN
                               ('enrolled','in_progress','completed','issued','withdrawn')),
    certificate_number       NVARCHAR(128)    NULL,
    merge_data               NVARCHAR(MAX)    NULL,
    issue_date               DATE             NULL,
    expiry_date              DATE             NULL,
    document_url             NVARCHAR(MAX)    NULL,
    notes                    NVARCHAR(MAX)    NULL,
    created_at               DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at               DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),
    UNIQUE (student_id, certification_program_id, academic_year_id)
);
GO

-- ============================================================
-- 16. STUDENT LEAVING RECORDS
-- NO ACTION on non-student FKs.
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='student_leaving_records')
CREATE TABLE dbo.student_leaving_records (
    id                   UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    student_id           UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.students(id)       ON DELETE CASCADE,
    academic_year_id     UNIQUEIDENTIFIER NULL  REFERENCES dbo.academic_years(id)    ON DELETE NO ACTION,
    leaving_serial_no    INT              NULL,
    class_left_grade_id  UNIQUEIDENTIFIER NULL  REFERENCES dbo.grades(id)            ON DELETE NO ACTION,
    class_studying_since DATE             NULL,
    date_left            DATE             NOT NULL,
    reason               NVARCHAR(MAX)    NULL,
    conduct              NVARCHAR(64)     NULL,
    progress             NVARCHAR(64)     NULL,
    remarks              NVARCHAR(MAX)    NULL,
    certificate_issued_at DATE            NULL,
    created_at           DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME()
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='idx_leaving_student')
    CREATE INDEX idx_leaving_student ON dbo.student_leaving_records (student_id);
GO

-- ============================================================
-- 17. ASSESSMENT TERMS
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='assessment_terms')
CREATE TABLE dbo.assessment_terms (
    id               UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    academic_year_id UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.academic_years(id) ON DELETE CASCADE,
    name             NVARCHAR(64)     NOT NULL,
    start_date       DATE             NULL,
    end_date         DATE             NULL,
    created_at       DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),
    UNIQUE (academic_year_id, name)
);
GO

-- ============================================================
-- 18. EXAMINATIONS
-- NO ACTION on grade_id — grades + school already cascades.
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='examinations')
CREATE TABLE dbo.examinations (
    id               UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    school_id        UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.schools(id)          ON DELETE CASCADE,
    academic_year_id UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.academic_years(id)   ON DELETE NO ACTION,
    name             NVARCHAR(255)    NULL,
    title            NVARCHAR(255)    NULL,
    exam_kind        NVARCHAR(32)     NOT NULL DEFAULT 'annual'
                     CONSTRAINT CK_exam_kind CHECK (exam_kind IN
                       ('annual','mid_term','half_yearly','monthly','supplementary','mock','other')),
    exam_type        NVARCHAR(32)     NULL DEFAULT 'annual',
    grade_id         UNIQUEIDENTIFIER NULL REFERENCES dbo.grades(id)               ON DELETE NO ACTION,
    start_date       DATE             NULL,
    end_date         DATE             NULL,
    status           NVARCHAR(24)     NOT NULL DEFAULT 'scheduled',
    created_at       DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

-- ============================================================
-- 19. EXAMINATION SCHEDULE LINES  (datesheet)
-- NO ACTION on all — examination, section, subject all ultimately
-- root at schools.
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='examination_schedule_lines')
CREATE TABLE dbo.examination_schedule_lines (
    id             UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    examination_id UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.examinations(id) ON DELETE CASCADE,
    section_id     UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.sections(id)     ON DELETE NO ACTION,
    subject_id     UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.subjects(id)     ON DELETE NO ACTION,
    exam_date      DATE             NOT NULL,
    time_start     TIME             NULL,
    time_end       TIME             NULL,
    room           NVARCHAR(64)     NULL,
    sort_order     INT              NOT NULL DEFAULT 0,
    UNIQUE (examination_id, section_id, subject_id, exam_date)
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='idx_exam_sched_exam')
    CREATE INDEX idx_exam_sched_exam ON dbo.examination_schedule_lines (examination_id, section_id);
GO

-- ============================================================
-- 20. EXAMINATION SEATS
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='examination_seats')
CREATE TABLE dbo.examination_seats (
    id             UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    examination_id UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.examinations(id) ON DELETE CASCADE,
    section_id     UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.sections(id)     ON DELETE NO ACTION,
    student_id     UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.students(id)     ON DELETE NO ACTION,
    seat_number    INT              NOT NULL,
    created_at     DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),
    UNIQUE (examination_id, student_id),
    UNIQUE (examination_id, section_id, seat_number)
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='idx_exam_seats_exam')
    CREATE INDEX idx_exam_seats_exam ON dbo.examination_seats (examination_id, section_id);
GO

-- ============================================================
-- 21. ATTENDANCE SESSIONS
-- NO ACTION — section + academic_year both cascade from schools.
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='attendance_sessions')
CREATE TABLE dbo.attendance_sessions (
    id               UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    section_id       UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.sections(id)       ON DELETE NO ACTION,
    subject_id       UNIQUEIDENTIFIER NULL  REFERENCES dbo.subjects(id)          ON DELETE NO ACTION,
    academic_year_id UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.academic_years(id) ON DELETE NO ACTION,
    [date]           DATE             NOT NULL,
    session_date     AS CAST([date] AS DATE) PERSISTED,
    period           NVARCHAR(16)     NULL,
    created_at       DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),
    UNIQUE (section_id, [date], period, subject_id)
);
GO

-- ============================================================
-- 22. ATTENDANCE RECORDS
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='attendance_records')
CREATE TABLE dbo.attendance_records (
    id         UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    session_id UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.attendance_sessions(id) ON DELETE CASCADE,
    student_id UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.students(id)            ON DELETE NO ACTION,
    status     NVARCHAR(16)     NOT NULL
               CONSTRAINT CK_att_status CHECK (status IN ('present','absent','late','excused')),
    note       NVARCHAR(MAX)    NULL,
    UNIQUE (session_id, student_id)
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='idx_att_records_session')
    CREATE INDEX idx_att_records_session ON dbo.attendance_records (session_id);
GO

-- ============================================================
-- 23. GRADES / SCORES
-- NO ACTION on all non-student FKs to avoid multi-path.
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='grades_scores')
CREATE TABLE dbo.grades_scores (
    id               UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    student_id       UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.students(id)        ON DELETE CASCADE,
    subject_id       UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.subjects(id)        ON DELETE NO ACTION,
    section_id       UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.sections(id)        ON DELETE NO ACTION,
    academic_year_id UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.academic_years(id)  ON DELETE NO ACTION,
    examination_id   UNIQUEIDENTIFIER NULL  REFERENCES dbo.examinations(id)       ON DELETE NO ACTION,
    term_id          UNIQUEIDENTIFIER NULL  REFERENCES dbo.assessment_terms(id)   ON DELETE NO ACTION,
    score_component  NVARCHAR(24)     NOT NULL DEFAULT 'overall'
                     CONSTRAINT CK_score_component CHECK (score_component IN
                       ('overall','theory','practical','oral','project')),
    score            NUMERIC(6,2)     NULL,
    obtained_marks   NUMERIC(6,2)     NULL,
    max_score        NUMERIC(6,2)     NULL DEFAULT 100,
    total_marks      NUMERIC(6,2)     NULL DEFAULT 100,
    grade            NVARCHAR(8)      NULL,
    remarks          NVARCHAR(MAX)    NULL,
    assessment_type  NVARCHAR(64)     NULL,
    recorded_at      DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME()
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='idx_scores_student_exam')
    CREATE INDEX idx_scores_student_exam ON dbo.grades_scores (student_id, examination_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='idx_scores_exam')
    CREATE INDEX idx_scores_exam ON dbo.grades_scores (examination_id, section_id, subject_id);
GO

-- ============================================================
-- 24. AUDIT LOGS
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='audit_logs')
CREATE TABLE dbo.audit_logs (
    id           BIGINT           NOT NULL PRIMARY KEY IDENTITY(1,1),
    user_id      UNIQUEIDENTIFIER NULL REFERENCES dbo.users(id) ON DELETE SET NULL,
    action       NVARCHAR(32)     NOT NULL,
    entity_table NVARCHAR(64)     NOT NULL,
    entity_id    UNIQUEIDENTIFIER NULL,
    old_data     NVARCHAR(MAX)    NULL,
    new_data     NVARCHAR(MAX)    NULL,
    ip_address   NVARCHAR(64)     NULL,
    created_at   DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME()
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='idx_audit_entity')
    CREATE INDEX idx_audit_entity ON dbo.audit_logs (entity_table, entity_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='idx_audit_created')
    CREATE INDEX idx_audit_created ON dbo.audit_logs (created_at DESC);
GO

-- ============================================================
-- INCREMENTAL ALTER TABLE
-- (adds columns missing on older databases — all idempotent)
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='academic_years'  AND COLUMN_NAME='created_at')    ALTER TABLE dbo.academic_years  ADD created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME();
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='grades'           AND COLUMN_NAME='created_at')    ALTER TABLE dbo.grades          ADD created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME();
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='sections'         AND COLUMN_NAME='created_at')    ALTER TABLE dbo.sections        ADD created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME();
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='subjects'         AND COLUMN_NAME='subject_type')  ALTER TABLE dbo.subjects        ADD subject_type NVARCHAR(32) NULL DEFAULT 'core';
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='subjects'         AND COLUMN_NAME='medium')        ALTER TABLE dbo.subjects        ADD medium NVARCHAR(32) NULL DEFAULT 'english';
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='subjects'         AND COLUMN_NAME='created_at')    ALTER TABLE dbo.subjects        ADD created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME();
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='grade_subjects'   AND COLUMN_NAME='max_marks')     ALTER TABLE dbo.grade_subjects  ADD max_marks NUMERIC(6,2) NOT NULL DEFAULT 100;
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='grade_subjects'   AND COLUMN_NAME='created_at')    ALTER TABLE dbo.grade_subjects  ADD created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME();
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='teachers'         AND COLUMN_NAME='qualification') ALTER TABLE dbo.teachers        ADD qualification NVARCHAR(255) NULL;
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='teachers'         AND COLUMN_NAME='joining_date')  ALTER TABLE dbo.teachers        ADD joining_date DATE NULL;
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='teachers'         AND COLUMN_NAME='date_of_birth') ALTER TABLE dbo.teachers        ADD date_of_birth DATE NULL;
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='teachers'         AND COLUMN_NAME='gender')        ALTER TABLE dbo.teachers        ADD gender NVARCHAR(16) NULL;
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='students'         AND COLUMN_NAME='serial_no')          ALTER TABLE dbo.students ADD serial_no INT NULL;
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='students'         AND COLUMN_NAME='photo_url')          ALTER TABLE dbo.students ADD photo_url NVARCHAR(MAX) NULL;
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='students'         AND COLUMN_NAME='mother_name')        ALTER TABLE dbo.students ADD mother_name NVARCHAR(255) NULL;
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='students'         AND COLUMN_NAME='guardian_name')      ALTER TABLE dbo.students ADD guardian_name NVARCHAR(255) NULL;
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='students'         AND COLUMN_NAME='guardian_relation')  ALTER TABLE dbo.students ADD guardian_relation NVARCHAR(64) NULL;
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='students'         AND COLUMN_NAME='nationality')        ALTER TABLE dbo.students ADD nationality NVARCHAR(64) NULL DEFAULT 'Pakistani';
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='students'         AND COLUMN_NAME='conduct_on_leaving') ALTER TABLE dbo.students ADD conduct_on_leaving NVARCHAR(64) NULL;
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='students'         AND COLUMN_NAME='progress_on_leaving')ALTER TABLE dbo.students ADD progress_on_leaving NVARCHAR(64) NULL;
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='students'         AND COLUMN_NAME='reason_for_leaving') ALTER TABLE dbo.students ADD reason_for_leaving NVARCHAR(MAX) NULL;
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='students'         AND COLUMN_NAME='class_studying_since')ALTER TABLE dbo.students ADD class_studying_since DATE NULL;
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='students'         AND COLUMN_NAME='date_of_leaving')    ALTER TABLE dbo.students ADD date_of_leaving DATE NULL;
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='students'         AND COLUMN_NAME='class_left_label')   ALTER TABLE dbo.students ADD class_left_label NVARCHAR(64) NULL;
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='students'         AND COLUMN_NAME='remarks')            ALTER TABLE dbo.students ADD remarks NVARCHAR(MAX) NULL;
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='students'         AND COLUMN_NAME='updated_at')         ALTER TABLE dbo.students ADD updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME();
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='examinations'     AND COLUMN_NAME='title')       ALTER TABLE dbo.examinations      ADD title NVARCHAR(255) NULL;
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='examinations'     AND COLUMN_NAME='exam_type')   ALTER TABLE dbo.examinations      ADD exam_type NVARCHAR(32) NULL DEFAULT 'annual';
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='examinations'     AND COLUMN_NAME='grade_id')    ALTER TABLE dbo.examinations      ADD grade_id UNIQUEIDENTIFIER NULL REFERENCES dbo.grades(id) ON DELETE NO ACTION;
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='examinations'     AND COLUMN_NAME='start_date')  ALTER TABLE dbo.examinations      ADD start_date DATE NULL;
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='examinations'     AND COLUMN_NAME='end_date')    ALTER TABLE dbo.examinations      ADD end_date DATE NULL;
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='examinations'     AND COLUMN_NAME='status')      ALTER TABLE dbo.examinations      ADD status NVARCHAR(24) NOT NULL DEFAULT 'scheduled';
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='examination_schedule_lines' AND COLUMN_NAME='room') ALTER TABLE dbo.examination_schedule_lines ADD room NVARCHAR(64) NULL;
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='examination_seats'           AND COLUMN_NAME='created_at') ALTER TABLE dbo.examination_seats ADD created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME();
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='attendance_sessions'         AND COLUMN_NAME='created_at') ALTER TABLE dbo.attendance_sessions ADD created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME();
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='teacher_assignments'         AND COLUMN_NAME='created_at') ALTER TABLE dbo.teacher_assignments ADD created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME();
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='grades_scores'    AND COLUMN_NAME='examination_id') ALTER TABLE dbo.grades_scores ADD examination_id UNIQUEIDENTIFIER NULL REFERENCES dbo.examinations(id) ON DELETE NO ACTION;
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='grades_scores'    AND COLUMN_NAME='term_id')        ALTER TABLE dbo.grades_scores ADD term_id UNIQUEIDENTIFIER NULL REFERENCES dbo.assessment_terms(id) ON DELETE NO ACTION;
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='grades_scores'    AND COLUMN_NAME='obtained_marks') ALTER TABLE dbo.grades_scores ADD obtained_marks NUMERIC(6,2) NULL;
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='grades_scores'    AND COLUMN_NAME='total_marks')    ALTER TABLE dbo.grades_scores ADD total_marks NUMERIC(6,2) NULL DEFAULT 100;
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='grades_scores'    AND COLUMN_NAME='grade')          ALTER TABLE dbo.grades_scores ADD grade NVARCHAR(8) NULL;
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='grades_scores'    AND COLUMN_NAME='remarks')        ALTER TABLE dbo.grades_scores ADD remarks NVARCHAR(MAX) NULL;
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='student_certifications' AND COLUMN_NAME='merge_data')  ALTER TABLE dbo.student_certifications ADD merge_data NVARCHAR(MAX) NULL;
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='student_certifications' AND COLUMN_NAME='updated_at') ALTER TABLE dbo.student_certifications ADD updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME();
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='assessment_terms'       AND COLUMN_NAME='created_at') ALTER TABLE dbo.assessment_terms ADD created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME();
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='audit_logs'             AND COLUMN_NAME='ip_address') ALTER TABLE dbo.audit_logs ADD ip_address NVARCHAR(64) NULL;
GO

-- Expand exam_kind constraint
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name='CK_exam_kind')
    ALTER TABLE dbo.examinations DROP CONSTRAINT CK_exam_kind;
ALTER TABLE dbo.examinations ADD CONSTRAINT CK_exam_kind
    CHECK (exam_kind IN ('annual','mid_term','half_yearly','monthly','supplementary','mock','other'));
GO

-- ============================================================
-- PERFORMANCE INDEXES
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='idx_students_school_status')
    CREATE INDEX idx_students_school_status  ON dbo.students            (school_id, status)          WHERE deleted_at IS NULL;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='idx_students_gr')
    CREATE INDEX idx_students_gr             ON dbo.students            (general_register_no)         WHERE general_register_no IS NOT NULL AND deleted_at IS NULL;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='idx_students_serial')
    CREATE INDEX idx_students_serial         ON dbo.students            (school_id, serial_no)        WHERE deleted_at IS NULL;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='idx_enrollments_student')
    CREATE INDEX idx_enrollments_student     ON dbo.student_enrollments (student_id, academic_year_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='idx_enrollments_section')
    CREATE INDEX idx_enrollments_section     ON dbo.student_enrollments (section_id, academic_year_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='idx_certifications_student')
    CREATE INDEX idx_certifications_student  ON dbo.student_certifications (student_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='idx_teacher_assignments_section')
    CREATE INDEX idx_teacher_assignments_section ON dbo.teacher_assignments (section_id, academic_year_id);
GO

-- ============================================================
-- SEED DATA  (run once on fresh DB — skipped if data exists)
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM dbo.schools)
INSERT INTO dbo.schools (id, name, code, district, semis_code, address) VALUES (
    '00000000-0000-0000-0000-000000000001',
    'Government Boys Higher Secondary School, Bhiria City',
    'GBHSS-BC', 'Naushahro Feroze', '416010421',
    'Bhiria City, District Naushahro Feroze, Sindh, Pakistan'
);
GO

IF NOT EXISTS (SELECT 1 FROM dbo.academic_years WHERE school_id='00000000-0000-0000-0000-000000000001')
INSERT INTO dbo.academic_years (school_id, label, start_date, end_date, is_current) VALUES
    ('00000000-0000-0000-0000-000000000001', '2024-2025', '2024-04-01', '2025-03-31', 1);
GO

PRINT '========================================';
PRINT 'GBHSS Schema complete — 26 tables OK';
PRINT '========================================';
GO


-- Created by GitHub Copilot in SSMS - review carefully before executing
-- Add users with roles for GBHSS system
-- ⚠️  WARNING: Passwords shown here are placeholders. 
--     Use a proper hashing algorithm (bcrypt, PBKDF2, ARGON2) in production.

USE [GBHSS];
GO

-- Get the school ID and role IDs
DECLARE @SchoolId UNIQUEIDENTIFIER = '00000000-0000-0000-0000-000000000001';
DECLARE @RoleIdSuperAdmin UNIQUEIDENTIFIER = (SELECT id FROM dbo.roles WHERE name='super_admin');
DECLARE @RoleIdAdmin UNIQUEIDENTIFIER = (SELECT id FROM dbo.roles WHERE name='admin');
DECLARE @RoleIdRegistrar UNIQUEIDENTIFIER = (SELECT id FROM dbo.roles WHERE name='registrar');
DECLARE @RoleIdTeacher UNIQUEIDENTIFIER = (SELECT id FROM dbo.roles WHERE name='teacher');

-- 1. Insert Super Admin User
DECLARE @SuperAdminUserId UNIQUEIDENTIFIER = NEWID();
IF NOT EXISTS (SELECT 1 FROM dbo.users WHERE email = 'admin@gbhss.edu.pk')
BEGIN
    INSERT INTO dbo.users (id, school_id, email, password_hash, is_active)
    VALUES (@SuperAdminUserId, @SchoolId, 'admin@gbhss.edu.pk', 
            'Admin@123', 1);
    
    INSERT INTO dbo.user_roles (user_id, role_id)
    VALUES (@SuperAdminUserId, @RoleIdSuperAdmin);
    
    PRINT 'Super Admin user created: admin@gbhss.edu.pk';
END
ELSE
    PRINT 'Super Admin user already exists.';

-- 2. Insert Registrar User
DECLARE @RegistrarUserId UNIQUEIDENTIFIER = NEWID();
IF NOT EXISTS (SELECT 1 FROM dbo.users WHERE email = 'registrar@gbhss.edu.pk')
BEGIN
    INSERT INTO dbo.users (id, school_id, email, password_hash, is_active)
    VALUES (@RegistrarUserId, @SchoolId, 'registrar@gbhss.edu.pk', 
            'Registrar@123', 1);
    
    INSERT INTO dbo.user_roles (user_id, role_id)
    VALUES (@RegistrarUserId, @RoleIdRegistrar);
    
    PRINT 'Registrar user created: registrar@gbhss.edu.pk';
END
ELSE
    PRINT 'Registrar user already exists.';

-- 3. Insert Teacher User
DECLARE @TeacherUserId UNIQUEIDENTIFIER = NEWID();
IF NOT EXISTS (SELECT 1 FROM dbo.users WHERE email = 'teacher1@gbhss.edu.pk')
BEGIN
    INSERT INTO dbo.users (id, school_id, email, password_hash, is_active)
    VALUES (@TeacherUserId, @SchoolId, 'teacher1@gbhss.edu.pk', 
            'Teacher@123', 1);
    
    INSERT INTO dbo.user_roles (user_id, role_id)
    VALUES (@TeacherUserId, @RoleIdTeacher);
    
    PRINT 'Teacher user created: teacher1@gbhss.edu.pk';
END
ELSE
    PRINT 'Teacher user already exists.';

-- Verify inserted users
SELECT u.email, STRING_AGG(r.name, ', ') AS Roles
FROM dbo.users u
LEFT JOIN dbo.user_roles ur ON u.id = ur.user_id
LEFT JOIN dbo.roles r ON ur.role_id = r.id
WHERE u.email IN ('admin@gbhss.edu.pk', 'registrar@gbhss.edu.pk', 'teacher1@gbhss.edu.pk')
GROUP BY u.email
ORDER BY u.email;
GO
select * from user_roles

delete from user