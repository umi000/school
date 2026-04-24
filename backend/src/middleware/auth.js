const jwt = require("jsonwebtoken");
const { env } = require("../config/env");
const { getPool, sql } = require("../db/pool");

async function requireAuth(req, res, next) {
  const auth = req.headers.authorization || "";
  // Also accept ?token= query param so print pages opened in a new browser tab work
  const token = (auth.startsWith("Bearer ") ? auth.slice(7) : "") || req.query.token || "";
  if (!token) return res.status(401).json({ message: "Unauthorized" });

  try {
    const payload = jwt.verify(token, env.auth.jwtSecret);
    const pool = await getPool();
    const userResult = await pool
      .request()
      .input("id", sql.UniqueIdentifier, payload.sub)
      .query("SELECT id, email, school_id, is_active FROM dbo.users WHERE id = @id");
    const user = userResult.recordset[0];
    if (!user || !user.is_active) return res.status(401).json({ message: "Unauthorized" });

    const rolesResult = await pool
      .request()
      .input("id", sql.UniqueIdentifier, user.id)
      .query(`
        SELECT r.name
        FROM dbo.user_roles ur
        JOIN dbo.roles r ON r.id = ur.role_id
        WHERE ur.user_id = @id
      `);

    req.user = {
      id: user.id,
      email: user.email,
      schoolId: user.school_id,
      roles: rolesResult.recordset.map((r) => r.name),
    };
    next();
  } catch (_e) {
    return res.status(401).json({ message: "Unauthorized" });
  }
}

function requireRole(...allowed) {
  return (req, res, next) => {
    const roles = req.user?.roles || [];
    const ok = allowed.some((r) => roles.includes(r));
    if (!ok) return res.status(403).json({ message: "Forbidden" });
    next();
  };
}

module.exports = { requireAuth, requireRole };
