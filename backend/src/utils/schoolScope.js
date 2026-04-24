const { getPool, sql } = require("../db/pool");

async function resolveSchoolId(preferredSchoolId) {
  if (preferredSchoolId) return preferredSchoolId;
  const pool = await getPool();
  const row = await pool
    .request()
    .query("SELECT TOP 1 id FROM dbo.schools ORDER BY created_at ASC");
  if (!row.recordset[0]) {
    throw new Error("No school found. Create one school first.");
  }
  return row.recordset[0].id;
}

function addOptionalSchoolFilter(request, schoolId) {
  request.input("school_id", sql.UniqueIdentifier, schoolId || null);
  return "(@school_id IS NULL OR school_id = @school_id)";
}

module.exports = { resolveSchoolId, addOptionalSchoolFilter };
