// Apply Zod v4 strip-mode patch BEFORE any route files are loaded
require("./utils/zodStrip");
const { env } = require("./config/env");
const { app } = require("./app");

app.listen(env.port, () => {
  const inst = env.db.instanceName ? `\\${env.db.instanceName}` : "";
  const dbMode = env.db.trustedConnection ? "Windows_ODBC" : "SQL_login_tedious";
  // eslint-disable-next-line no-console
  console.log(
    `GBHSS backend http://localhost:${env.port} | DB ${dbMode} | target=${env.db.server}${inst} | db=${env.db.database}`
  );
});
