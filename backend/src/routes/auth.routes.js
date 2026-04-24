const { Router } = require("express");
const { z } = require("zod");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { getPool, sql } = require("../db/pool");
const { asyncHandler } = require("../utils/asyncHandler");
const { env } = require("../config/env");
const { requireAuth, requireRole } = require("../middleware/auth");
const { writeAudit } = require("../services/audit");

const router = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  schoolId: z.string().uuid().nullable().optional(),
  roles: z.array(z.enum(["super_admin", "admin", "registrar", "teacher"])).min(1),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post(
  "/auth/register",
  requireAuth,
  requireRole("super_admin"),
  asyncHandler(async (req, res) => {
    const payload = registerSchema.parse(req.body);
    const passwordHash = await bcrypt.hash(payload.password, 10);
    const pool = await getPool();

    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      const insertUser = await new sql.Request(tx)
        .input("email", sql.NVarChar(255), payload.email)
        .input("password_hash", sql.NVarChar(sql.MAX), passwordHash)
        .input("school_id", sql.UniqueIdentifier, payload.schoolId || null)
        .query(`
          INSERT INTO dbo.users (email, password_hash, school_id)
          OUTPUT INSERTED.id, INSERTED.email, INSERTED.school_id
          VALUES (@email, @password_hash, @school_id)
        `);

      const user = insertUser.recordset[0];
      for (const roleName of payload.roles) {
        await new sql.Request(tx)
          .input("name", sql.NVarChar(64), roleName)
          .query(`
            IF NOT EXISTS (SELECT 1 FROM dbo.roles WHERE name = @name)
            INSERT INTO dbo.roles (id, name) VALUES (NEWID(), @name)
          `);
        await new sql.Request(tx)
          .input("user_id", sql.UniqueIdentifier, user.id)
          .input("name", sql.NVarChar(64), roleName)
          .query(`
            INSERT INTO dbo.user_roles (user_id, role_id)
            SELECT @user_id, r.id FROM dbo.roles r
            WHERE r.name = @name
              AND NOT EXISTS (
                SELECT 1 FROM dbo.user_roles ur WHERE ur.user_id = @user_id AND ur.role_id = r.id
              )
          `);
      }

      await tx.commit();
      await writeAudit({
        userId: req.user.id,
        action: "INSERT",
        entityTable: "users",
        entityId: user.id,
        newData: { email: user.email, roles: payload.roles },
      });
      res.status(201).json({ id: user.id, email: user.email, schoolId: user.school_id });
    } catch (e) {
      await tx.rollback();
      throw e;
    }
  })
);

router.post(
  "/auth/login",
  asyncHandler(async (req, res) => {
    const payload = loginSchema.parse(req.body);
    const pool = await getPool();
    const userResult = await pool
      .request()
      .input("email", sql.NVarChar(255), payload.email)
      .query("SELECT TOP 1 id, email, password_hash, school_id, is_active FROM dbo.users WHERE email = @email");

    const user = userResult.recordset[0];
    if (!user || !user.is_active) return res.status(401).json({ message: "Invalid credentials" });

    const valid = await bcrypt.compare(payload.password, user.password_hash);
    if (!valid) return res.status(401).json({ message: "Invalid credentials" });

    const rolesResult = await pool
      .request()
      .input("user_id", sql.UniqueIdentifier, user.id)
      .query(`
        SELECT r.name
        FROM dbo.user_roles ur
        JOIN dbo.roles r ON r.id = ur.role_id
        WHERE ur.user_id = @user_id
      `);

    const roles = rolesResult.recordset.map((r) => r.name);
    const token = jwt.sign(
      { sub: user.id, email: user.email, roles, schoolId: user.school_id },
      env.auth.jwtSecret,
      { expiresIn: env.auth.jwtExpiresIn }
    );

    await writeAudit({
      userId: user.id,
      action: "LOGIN",
      entityTable: "users",
      entityId: user.id,
      newData: { email: user.email },
    });

    res.json({ token, user: { id: user.id, email: user.email, schoolId: user.school_id, roles } });
  })
);

router.post(
  "/auth/bootstrap",
  asyncHandler(async (req, res) => {
    const payload = registerSchema.parse(req.body);
    const pool = await getPool();
    const count = await pool.request().query("SELECT COUNT(1) AS c FROM dbo.users");
    if (count.recordset[0].c > 0) {
      return res.status(403).json({ message: "Bootstrap disabled after first user creation" });
    }

    const passwordHash = await bcrypt.hash(payload.password, 10);
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      const insertUser = await new sql.Request(tx)
        .input("email", sql.NVarChar(255), payload.email)
        .input("password_hash", sql.NVarChar(sql.MAX), passwordHash)
        .input("school_id", sql.UniqueIdentifier, payload.schoolId || null)
        .query(`
          INSERT INTO dbo.users (email, password_hash, school_id)
          OUTPUT INSERTED.id, INSERTED.email, INSERTED.school_id
          VALUES (@email, @password_hash, @school_id)
        `);

      const user = insertUser.recordset[0];
      for (const roleName of payload.roles) {
        await new sql.Request(tx)
          .input("name", sql.NVarChar(64), roleName)
          .query(`
            IF NOT EXISTS (SELECT 1 FROM dbo.roles WHERE name = @name)
            INSERT INTO dbo.roles (id, name) VALUES (NEWID(), @name)
          `);
        await new sql.Request(tx)
          .input("user_id", sql.UniqueIdentifier, user.id)
          .input("name", sql.NVarChar(64), roleName)
          .query(`
            INSERT INTO dbo.user_roles (user_id, role_id)
            SELECT @user_id, r.id FROM dbo.roles r
            WHERE r.name = @name
              AND NOT EXISTS (
                SELECT 1 FROM dbo.user_roles ur WHERE ur.user_id = @user_id AND ur.role_id = r.id
              )
          `);
      }

      await tx.commit();
      res.status(201).json({ id: user.id, email: user.email, schoolId: user.school_id });
    } catch (e) {
      await tx.rollback();
      throw e;
    }
  })
);

module.exports = { authRoutes: router };
