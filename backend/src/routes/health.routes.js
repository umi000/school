const { Router } = require("express");
const { env } = require("../config/env");
const { asyncHandler } = require("../utils/asyncHandler");
const { getPool, sql } = require("../db/pool");

function dbTargetLabel() {
  const inst = env.db.instanceName ? `\\${env.db.instanceName}` : "";
  return `${env.db.server}${inst}/${env.db.database}`;
}

function errorMessage(err) {
  if (err == null) return "Unknown error";
  if (typeof err === "string") return err;
  if (err instanceof Error && err.message) return err.message;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

const router = Router();

router.get(
  "/health",
  asyncHandler(async (_req, res) => {
    try {
      const pool = await getPool();
      const result = await pool.request().query("SELECT 1 AS ok");
      const row = result?.recordset?.[0];
      res.json({
        status: "ok",
        db: row?.ok === 1,
        driver: env.db.trustedConnection ? "msnodesqlv8-odbc" : "tedious-sql-auth",
        target: dbTargetLabel(),
      });
    } catch (err) {
      const msg = errorMessage(err);
      const tedious1433 = /localhost:1433/i.test(msg);
      res.status(200).json({
        status: "ok",
        db: false,
        driver: env.db.trustedConnection ? "msnodesqlv8-odbc" : "tedious-sql-auth",
        target: dbTargetLabel(),
        dbError: msg,
        hint: tedious1433
          ? 'That message is from the Tedious client (SQL auth, default port 1433). Put DB_TRUSTED_CONNECTION=true in backend/.env and restart — .env now overrides existing Windows/user env vars. If you use SQL Express, set DB_INSTANCE=SQLEXPRESS and start the SQL Server Browser service; or enable TCP/IP and port 1433 for your instance.'
          : env.db.trustedConnection
            ? "ODBC/Windows auth failed. Verify ODBC Driver 17/18 name (DB_ODBC_DRIVER), server matches SSMS, and SQL Server allows remote connections."
            : "Check DB_USER, DB_PASSWORD, DB_SERVER, and DB_INSTANCE.",
      });
    }
  })
);

router.get(
  "/metadata",
  asyncHandler(async (_req, res) => {
    const pool = await getPool();
    const years = await pool
      .request()
      .query("SELECT TOP 20 id, label, is_current FROM dbo.academic_years");
    const grades = await pool
      .request()
      .query("SELECT TOP 20 id, name, level_order FROM dbo.grades");
    res.json({ academicYears: years.recordset, grades: grades.recordset });
  })
);

module.exports = { healthRoutes: router };
