const { Router } = require("express");
const { z } = require("zod");
const bcrypt = require("bcryptjs");
const { asyncHandler } = require("../utils/asyncHandler");
const { getPool, sql } = require("../db/pool");
const { requireAuth, requireRole } = require("../middleware/auth");
const { writeAudit } = require("../services/audit");

const router = Router();
router.use(requireAuth);
router.use(requireRole("super_admin", "admin"));

const VALID_ROLES = ["super_admin", "admin", "registrar", "teacher"];

/* ─── List users ─────────────────────────────────────────── */
router.get("/users", asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const pool = await getPool();
  const [countRes, rowsRes] = await Promise.all([
    pool.request().query("SELECT COUNT(1) AS c FROM dbo.users"),
    pool.request().input("limit", sql.Int, limit).query(`
      SELECT TOP (@limit)
        u.id, u.email, u.is_active, u.created_at,
        STRING_AGG(ro.name, ', ') AS roles
      FROM dbo.users u
      LEFT JOIN dbo.user_roles ur ON ur.user_id = u.id
      LEFT JOIN dbo.roles ro ON ro.id = ur.role_id
      GROUP BY u.id, u.email, u.is_active, u.created_at
      ORDER BY u.created_at DESC
    `),
  ]);
  res.json({ data: rowsRes.recordset, total: Number(countRes.recordset[0]?.c || 0) });
}));

/* ─── Create user ────────────────────────────────────────── */
router.post("/users", asyncHandler(async (req, res) => {
  const p = z.object({
    email:    z.string().email(),
    password: z.string().min(6),
    roles:    z.array(z.enum(["super_admin","admin","registrar","teacher"])).min(1),
    isActive: z.boolean().default(true),
  }).strip().parse(req.body);
  const hash = await bcrypt.hash(p.password, 10);
  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const ins = await new sql.Request(tx)
      .input("email",    sql.NVarChar(255), p.email)
      .input("hash",     sql.NVarChar(sql.MAX), hash)
      .input("is_active",sql.Bit, p.isActive ? 1 : 0)
      .query("INSERT INTO dbo.users (email, password_hash, is_active) OUTPUT INSERTED.id, INSERTED.email, INSERTED.is_active VALUES (@email, @hash, @is_active)");
    const user = ins.recordset[0];
    for (const roleName of p.roles) {
      await new sql.Request(tx).input("name", sql.NVarChar(64), roleName)
        .query("IF NOT EXISTS (SELECT 1 FROM dbo.roles WHERE name=@name) INSERT INTO dbo.roles (id,name) VALUES (NEWID(),@name)");
      await new sql.Request(tx).input("uid", sql.UniqueIdentifier, user.id).input("name", sql.NVarChar(64), roleName)
        .query("INSERT INTO dbo.user_roles (user_id, role_id) SELECT @uid, r.id FROM dbo.roles r WHERE r.name=@name AND NOT EXISTS (SELECT 1 FROM dbo.user_roles WHERE user_id=@uid AND role_id=r.id)");
    }
    await tx.commit();
    await writeAudit({ userId: req.user.id, action: "INSERT", entityTable: "users", entityId: user.id, newData: { email: user.email, roles: p.roles } });
    res.status(201).json({ id: user.id, email: user.email, roles: p.roles });
  } catch (e) { await tx.rollback(); throw e; }
}));

/* ─── Update user (toggle active, reset password) ────────── */
router.patch("/users/:id", asyncHandler(async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  const p  = z.object({
    isActive: z.boolean().optional(),
    password: z.string().min(6).optional(),
    roles:    z.array(z.enum(["super_admin","admin","registrar","teacher"])).optional(),
  }).strip().parse(req.body);
  const pool = await getPool();
  if (p.isActive !== undefined) {
    await pool.request().input("id", sql.UniqueIdentifier, id).input("v", sql.Bit, p.isActive ? 1 : 0)
      .query("UPDATE dbo.users SET is_active = @v WHERE id = @id");
  }
  if (p.password) {
    const hash = await bcrypt.hash(p.password, 10);
    await pool.request().input("id", sql.UniqueIdentifier, id).input("h", sql.NVarChar(sql.MAX), hash)
      .query("UPDATE dbo.users SET password_hash = @h WHERE id = @id");
  }
  if (p.roles?.length) {
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      await new sql.Request(tx).input("uid", sql.UniqueIdentifier, id).query("DELETE FROM dbo.user_roles WHERE user_id = @uid");
      for (const roleName of p.roles) {
        await new sql.Request(tx).input("name", sql.NVarChar(64), roleName)
          .query("IF NOT EXISTS (SELECT 1 FROM dbo.roles WHERE name=@name) INSERT INTO dbo.roles (id,name) VALUES (NEWID(),@name)");
        await new sql.Request(tx).input("uid", sql.UniqueIdentifier, id).input("name", sql.NVarChar(64), roleName)
          .query("INSERT INTO dbo.user_roles (user_id, role_id) SELECT @uid, r.id FROM dbo.roles r WHERE r.name=@name");
      }
      await tx.commit();
    } catch (e) { await tx.rollback(); throw e; }
  }
  await writeAudit({ userId: req.user.id, action: "UPDATE", entityTable: "users", entityId: id });
  res.json({ success: true });
}));

/* ─── Delete user ────────────────────────────────────────── */
router.delete("/users/:id", requireRole("super_admin"), asyncHandler(async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  if (id === req.user.id) return res.status(400).json({ message: "Cannot delete your own account" });
  await (await getPool()).request().input("id", sql.UniqueIdentifier, id)
    .query("DELETE FROM dbo.users WHERE id = @id");
  await writeAudit({ userId: req.user.id, action: "DELETE", entityTable: "users", entityId: id });
  res.json({ success: true });
}));

module.exports = { userRoutes: router };
