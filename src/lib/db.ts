// --- DB Configuration ---
// All credentials MUST come from environment variables.
// The app will fail to start if they are not set.

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
      `Set it in .env.local or your deployment environment.`
    );
  }
  return value;
}

export const DB_CONFIG = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://db.dora.restry.cn',
  get anonKey(): string {
    return requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  },
  get serviceKey(): string {
    return requireEnv('SUPABASE_SERVICE_KEY');
  },
  tablePrefix: 'st-'
};

// --- Utilities for Raw SQL Escaping ---
// NOTE: The DB REST endpoint (/pg/query) does not support parameterized queries ($1, $2...).
// We use client-side escaping as a mitigation. This is hardened to handle common
// injection vectors including single quotes, backslashes, null bytes, and unicode escapes.

function escapeSqlString(str: string): string {
  if (!str) return "";
  return str
    .replace(/\0/g, "")          // Remove null bytes
    .replace(/\\/g, "\\\\")      // Escape backslashes
    .replace(/'/g, "''")         // Escape single quotes (SQL standard)
    .replace(/\u2018/g, "''")    // Left single quotation mark
    .replace(/\u2019/g, "''")    // Right single quotation mark
    .replace(/\u0000/g, "");     // Additional null byte forms
}

export function toSqlVal(val: any): string {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return isFinite(val) ? val.toString() : 'NULL';
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
  if (typeof val === 'string') {
    // Reject strings that look like SQL injection attempts
    const suspicious = /;\s*(DROP|DELETE|UPDATE|INSERT|ALTER|CREATE|TRUNCATE|EXEC)\s/i;
    if (suspicious.test(val)) {
      console.warn('Suspicious SQL value rejected:', val.substring(0, 100));
      return 'NULL';
    }
    return `'${escapeSqlString(val)}'`;
  }
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
 * Includes timeout and exponential backoff retry for transient errors.
 */
async function dbQuery(sql: string, retries = 2): Promise<any> {
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
        // Retry on transient gateway errors with exponential backoff
        if (attempt < retries && [502, 503, 504, 429].includes(res.status)) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 8000);
          console.warn(`DB transient error ${res.status}, retrying in ${delay}ms...`);
          await new Promise(r => setTimeout(r, delay));
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
      if (attempt < retries) {
        const isTimeout = err instanceof DOMException && err.name === "TimeoutError";
        const isNetwork = err instanceof TypeError && (err as any).cause?.code === 'ECONNREFUSED';
        if (isTimeout || isNetwork) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 8000);
          console.warn(`DB query ${isTimeout ? 'timed out' : 'network error'}, retrying in ${delay}ms...`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
      }
      throw err;
    }
  }
}

/**
 * Log an action to the 'st-logs' table.
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
 * Uses toSqlVal for client-side escaping since the REST endpoint
 * does not support parameterized queries.
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
