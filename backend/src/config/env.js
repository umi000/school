const path = require("path");
const dotenv = require("dotenv");

// Always load backend/.env (not cwd). `override: true` so file wins over stale Windows/user env (e.g. DB_TRUSTED_CONNECTION=false would otherwise keep forcing tedious → localhost:1433).
dotenv.config({
  path: path.join(__dirname, "..", "..", ".env"),
  override: true,
});

function envBool(raw, defaultTrue) {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === "false" || v === "0" || v === "no") return false;
  if (v === "true" || v === "1" || v === "yes") return true;
  return defaultTrue;
}

const env = {
  port: Number(process.env.PORT || 4000),
  db: {
    server: (process.env.DB_SERVER || "localhost").trim(),
    /** Named instance, e.g. SQLEXPRESS (avoids backslash issues in .env vs DB_SERVER=host\\instance). */
    instanceName: (process.env.DB_INSTANCE || "").trim() || undefined,
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : undefined,
    database: (process.env.DB_NAME || "GBHSS").trim(),
    // Tedious cannot use Trusted_Connection; Windows auth uses msnodesqlv8 + ODBC.
    trustedConnection: envBool(process.env.DB_TRUSTED_CONNECTION, true),
    odbcDriver:
      (process.env.DB_ODBC_DRIVER || "ODBC Driver 17 for SQL Server").trim(),
    user: (process.env.DB_USER || "").trim(),
    password: process.env.DB_PASSWORD || "",
    encrypt: envBool(process.env.DB_ENCRYPT, false),
    trustServerCertificate: envBool(process.env.DB_TRUST_SERVER_CERT, true),
  },
  auth: {
    jwtSecret: process.env.JWT_SECRET || "change-me-super-secret",
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || "8h",
  },
};

module.exports = { env };
