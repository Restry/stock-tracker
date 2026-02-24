export const DB_CONFIG = {
  url: 'https://db.dora.restry.cn',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJhbm9uIiwKICAgICJpc3MiOiAic3VwYWJhc2UtZGVtbyIsCiAgICAiaWF0IjogMTY0MTc2OTIwMCwKICAgICJleHAiOiAxNzk5NTM1NjAwCn0.dc_X5iR_VP_qT0zsiyj_I_OZ2T9FtRU2BBNWN8Bu4GE',
  serviceKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJzZXJ2aWNlX3JvbGUiLAogICAgImlzcyI6ICJzdXBhYmFzZS1kZW1vIiwKICAgICJpYXQiOiAxNjQxNzY5MjAwLAogICAgImV4cCI6IDE3OTk1MzU2MDAKfQ.DaYlNEoUrrEn2Ig7tqibS-PHK5vgusbcbo7X36XVt4Q',
  tablePrefix: 'st-'
};

// --- Utilities for Raw SQL Escaping (Fixing 42P02) ---

function escapeSqlString(str: string): string {
  if (!str) return "";
  return str.replace(/'/g, "''");
}

export function toSqlVal(val: any): string {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return isFinite(val) ? val.toString() : 'NULL';
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
  if (typeof val === 'string') return `'${escapeSqlString(val)}'`;
  // Handle objects/arrays as JSON strings
  if (typeof val === 'object') return `'${escapeSqlString(JSON.stringify(val))}'`;
  return 'NULL';
}

let logsTableReady = false;
async function ensureLogsTable(): Promise<void> {
  if (logsTableReady) return;
  await dbQuery(`CREATE TABLE IF NOT EXISTS "st-logs" (
    id SERIAL PRIMARY KEY,
    category VARCHAR(50) NOT NULL,
    message TEXT NOT NULL,
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`, 0);
  logsTableReady = true;
}

/**
 * Server-side ONLY: SQL Query using Service Role.
 * Includes timeout and single retry for transient Supabase errors.
 */
async function dbQuery(sql: string, retries = 1): Promise<any> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(`${DB_CONFIG.url}/pg/query`, {
        method: 'POST',
        headers: {
          'apikey': DB_CONFIG.serviceKey,
          'Authorization': `Bearer ${DB_CONFIG.serviceKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query: sql }),
        signal: AbortSignal.timeout(15000),
      });
      
      if (!res.ok) {
        const text = await res.text();
        // Retry on 502/503/504 (transient gateway errors)
        if (attempt < retries && [502, 503, 504].includes(res.status)) {
          console.warn(`DB transient error ${res.status}, retrying...`);
          await new Promise(r => setTimeout(r, 1000));
          continue;
        }
        console.error('DB HTTP Error:', res.status, text, 'SQL:', sql.substring(0, 200));
        throw new Error(`DB HTTP ${res.status}: ${text}`);
      }
      
      const data = await res.json();
      if (data.error) {
        console.error('DB Response Error:', data.error, 'SQL:', sql.substring(0, 200));
        throw new Error(`DB Result Error: ${data.error}`);
      }
      return data;
    } catch (err: unknown) {
      if (attempt < retries && err instanceof DOMException && err.name === "TimeoutError") {
        console.warn('DB query timed out, retrying...');
        continue;
      }
      throw err;
    }
  }
}

/**
 * Log an action to the 'st-logs' table.
 * This is "Internalization" requirement #3.
 */
export async function logAction(category: string, message: string, details?: any) {
  console.log(`[${category}] ${message}`);
  try {
    await ensureLogsTable();
    const sql = `INSERT INTO "st-logs" (category, message, details) VALUES (${toSqlVal(category)}, ${toSqlVal(message)}, ${toSqlVal(details)})`;
    await dbQuery(sql);
  } catch (err) {
    console.error("Failed to write to st-logs:", err);
    // Don't throw, just log to console so we don't break the main flow
  }
}

/**
 * Standard pool-like object.
 * NOTE: We ignore `params` and assume the caller uses `toSqlVal` for safety.
 * This fixes the 42P02 parameter binding errors by enforcing client-side interpolation.
 */
const pool = {
  query: async (text: string) => {
    const result = await dbQuery(text);
    return { rows: Array.isArray(result) ? result : (result.rows || []) };
  },
  escape: toSqlVal,
  log: logAction
};

export default pool;
