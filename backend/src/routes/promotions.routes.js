const { Router } = require("express");
const { z } = require("zod");
const { asyncHandler } = require("../utils/asyncHandler");
const { getPool, sql } = require("../db/pool");
const { requireAuth, requireRole } = require("../middleware/auth");
const { writeAudit } = require("../services/audit");

const router = Router();
router.use(requireAuth);

const bulkPromotionSchema = z.object({
  fromSectionId: z.string().uuid(),
  toSectionId: z.string().uuid(),
  fromAcademicYearId: z.string().uuid(),
  toAcademicYearId: z.string().uuid(),
  dryRun: z.boolean().default(true),
});

router.post(
  "/promotions/bulk",
  requireRole("super_admin", "admin", "registrar"),
  asyncHandler(async (req, res) => {
    const input = bulkPromotionSchema.parse(req.body);
    const pool = await getPool();

    const candidates = await pool
      .request()
      .input("fromSectionId", sql.UniqueIdentifier, input.fromSectionId)
      .input("fromAcademicYearId", sql.UniqueIdentifier, input.fromAcademicYearId)
      .query(`
        SELECT se.student_id
        FROM dbo.student_enrollments se
        JOIN dbo.students s ON s.id = se.student_id
        WHERE se.section_id = @fromSectionId
          AND se.academic_year_id = @fromAcademicYearId
          AND s.status = 'active'
      `);

    if (input.dryRun) {
      return res.json({ dryRun: true, count: candidates.recordset.length, students: candidates.recordset });
    }

    const tx = new sql.Transaction(await getPool());
    await tx.begin();
    try {
      for (const row of candidates.recordset) {
        await new sql.Request(tx)
          .input("studentId", sql.UniqueIdentifier, row.student_id)
          .input("toSectionId", sql.UniqueIdentifier, input.toSectionId)
          .input("toAcademicYearId", sql.UniqueIdentifier, input.toAcademicYearId)
          .query(`
            IF NOT EXISTS (
              SELECT 1 FROM dbo.student_enrollments
              WHERE student_id = @studentId AND academic_year_id = @toAcademicYearId
            )
            INSERT INTO dbo.student_enrollments (student_id, section_id, academic_year_id)
            VALUES (@studentId, @toSectionId, @toAcademicYearId)
          `);
      }
      await tx.commit();
      await writeAudit({
        userId: req.user.id,
        action: "INSERT",
        entityTable: "student_enrollments",
        newData: {
          sourceSectionId: input.fromSectionId,
          destinationSectionId: input.toSectionId,
          sourceAcademicYearId: input.fromAcademicYearId,
          destinationAcademicYearId: input.toAcademicYearId,
          promoted: candidates.recordset.length,
        },
      });
      res.json({ dryRun: false, promoted: candidates.recordset.length });
    } catch (err) {
      await tx.rollback();
      throw err;
    }
  })
);

module.exports = { promotionRoutes: router };
