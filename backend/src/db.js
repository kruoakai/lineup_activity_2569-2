const mysql = require('mysql2/promise');
const config = require('./config');

let pool;

function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      ...config.db,
      charset: 'utf8mb4',
      timezone: 'Z',          // DATETIME เก็บและอ่านเป็น UTC
      dateStrings: ['DATE'],  // คอลัมน์ DATE คืนค่าเป็น 'YYYY-MM-DD' ไม่แปลงเขตเวลา
      waitForConnections: true,
      connectionLimit: 15,
      multipleStatements: false,
    });
  }
  return pool;
}

async function query(sql, params) {
  const [rows] = await getPool().query(sql, params);
  return rows;
}

async function transaction(fn) {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn({
      query: async (sql, params) => (await conn.query(sql, params))[0],
    });
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function close() {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}

module.exports = { getPool, query, transaction, close };
