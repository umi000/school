const { getPool, sql } = require("../db/pool");

async function writeAudit({ userId, action, entityTable, entityId, oldData, newData }) {
  const pool = await getPool();
  await pool
    .request()
    .input("user_id", sql.UniqueIdentifier, userId || null)
    .input("action", sql.NVarChar(32), action)
    .input("entity_table", sql.NVarChar(64), entityTable)
    .input("entity_id", sql.UniqueIdentifier, entityId || null)
    .input("old_data", sql.NVarChar(sql.MAX), oldData ? JSON.stringify(oldData) : null)
    .input("new_data", sql.NVarChar(sql.MAX), newData ? JSON.stringify(newData) : null)
    .query(`
      INSERT INTO dbo.audit_logs (user_id, action, entity_table, entity_id, old_data, new_data)
      VALUES (@user_id, @action, @entity_table, @entity_id, @old_data, @new_data)
    `);
}

module.exports = { writeAudit };
