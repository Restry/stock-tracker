export const DB_CONFIG = {
  url: 'https://db.dora.restry.cn',
  // Public anon key for client-side / REST
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJhbm9uIiwKICAgICJpc3MiOiAic3VwYWJhc2UtZGVtbyIsCiAgICAiaWF0IjogMTY0MTc2OTIwMCwKICAgICJleHAiOiAxNzk5NTM1NjAwCn0.dc_X5iR_VP_qT0zsiyj_I_OZ2T9FtRU2BBNWN8Bu4GE',
  // Service role key for admin / SQL
  serviceKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJzZXJ2aWNlX3JvbGUiLAogICAgImlzcyI6ICJzdXBhYmFzZS1kZW1vIiwKICAgICJpYXQiOiAxNjQxNzY5MjAwLAogICAgImV4cCI6IDE3OTk1MzU2MDAKfQ.DaYlNEoUrrEn2Ig7tqibS-PHK5vgusbcbo7X36XVt4Q',
  tablePrefix: 'st-'
};

/**
 * Server-side ONLY: SQL Query using Service Role (pg-api /pg/query)
 */
async function dbQuery(sql: string, params: any[] = []) {
  console.log('Executing DB Admin Query (SQL):', sql.substring(0, 100));
  const res = await fetch(`${DB_CONFIG.url}/pg/query`, {
    method: 'POST',
    headers: {
      'apikey': DB_CONFIG.serviceKey,
      'Authorization': `Bearer ${DB_CONFIG.serviceKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query: sql, params })
  });
  
  if (!res.ok) {
    const text = await res.text();
    console.error('DB HTTP Error:', res.status, text);
    throw new Error(`DB HTTP ${res.status}: ${text}`);
  }
  
  const data = await res.json();
  if (data.error) {
    console.error('DB Response Error:', data.error);
    throw new Error(`DB Result Error: ${data.error}`);
  }
  return data;
}

/**
 * Standard pool-like object for server-side SQL execution
 */
const pool = {
  query: async (text: string, params: any[] = []) => {
    const result = await dbQuery(text, params);
    return { rows: Array.isArray(result) ? result : (result.rows || []) };
  }
};

export default pool;

export default pool;
