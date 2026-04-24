const { env } = require("../config/env");

let poolPromise;
let sqlModule;

function resolveSqlModule() {
  if (!sqlModule) {
    sqlModule = env.db.trustedConnection
      ? require("mssql/msnodesqlv8")
      : require("mssql");
  }
  return sqlModule;
}

/** ODBC / tedious: host, optional instance, and full "host\\instance" for connection strings. */
function getServerParts() {
  const raw = (env.db.server || "localhost").trim();
  let host = raw;
  let instanceName = env.db.instanceName;
  if (raw.includes("\\") || raw.includes("/")) {
    const sep = raw.includes("\\") ? "\\" : "/";
    const i = raw.indexOf(sep);
    host = raw.slice(0, i).trim();
    instanceName = instanceName || raw.slice(i + 1).trim();
  }
  const odbcServer =
    instanceName && host ? `${host}\\${instanceName}` : host;
  return { host, instanceName, odbcServer };
}

function buildOdbcConnectionString() {
  const driver = env.db.odbcDriver.replace(/}/g, "}}");
  const { odbcServer } = getServerParts();
  const db = env.db.database;
  const serverSpec = env.db.port ? `${odbcServer},${env.db.port}` : odbcServer;
  const trust = env.db.trustServerCertificate ? "yes" : "no";
  const encrypt = env.db.encrypt ? "yes" : "no";
  // Mirrors SSMS: Integrated Security + Encrypt + TrustServerCertificate
  return `Driver={${driver}};Server=${serverSpec};Database=${db};Trusted_Connection=yes;Encrypt=${encrypt};TrustServerCertificate=${trust};`;
}

function getTediousConfig() {
  const { host, instanceName } = getServerParts();
  const cfg = {
    user: env.db.user,
    password: env.db.password,
    server: host,
    database: env.db.database,
    options: {
      encrypt: env.db.encrypt,
      trustServerCertificate: env.db.trustServerCertificate,
      enableArithAbort: true,
    },
  };
  if (instanceName) {
    cfg.options.instanceName = instanceName;
  }
  if (env.db.port) {
    cfg.port = env.db.port;
  }
  return cfg;
}

async function getPool() {
  if (!poolPromise) {
    const sql = resolveSqlModule();
    if (env.db.trustedConnection) {
      poolPromise = sql.connect({
        connectionString: buildOdbcConnectionString(),
      });
    } else {
      if (!env.db.user || !env.db.password) {
        throw new Error(
          "Set DB_TRUSTED_CONNECTION=true for Windows auth, or set DB_USER and DB_PASSWORD for SQL login."
        );
      }
      poolPromise = sql.connect(getTediousConfig());
    }
  }
  try {
    return await poolPromise;
  } catch (err) {
    poolPromise = undefined;
    throw err;
  }
}

module.exports = { getPool };
Object.defineProperty(module.exports, "sql", {
  enumerable: true,
  get() {
    return resolveSqlModule();
  },
});
