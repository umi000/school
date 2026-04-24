require('dotenv').config({ override: true });
const sql = require('mssql/msnodesqlv8');
const inst = process.env.DB_INSTANCE || '';
const srv  = process.env.DB_SERVER   || 'localhost';
const db   = process.env.DB_NAME     || 'gbhss';
const drv  = process.env.DB_ODBC_DRIVER || 'ODBC Driver 17 for SQL Server';
const odbcSrv = inst ? `${srv}\\${inst}` : srv;
const conn = `Driver={${drv}};Server=${odbcSrv};Database=${db};Trusted_Connection=yes;Encrypt=yes;TrustServerCertificate=yes;`;
sql.connect({ connectionString: conn }).then(async p => {
  const r = await p.request().query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='sections' ORDER BY ORDINAL_POSITION");
  console.log('sections cols:', r.recordset.map(c => c.COLUMN_NAME).join(', '));
  // also check teachers table
  const t = await p.request().query("SELECT TOP 5 id, first_name, last_name FROM dbo.teachers ORDER BY first_name");
  console.log('teachers sample:', JSON.stringify(t.recordset));
  await p.close();
}).catch(e => console.error(e.message));
