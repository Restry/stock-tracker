const DB_CONFIG = {
  url: 'https://db.dora.restry.cn',
  apiKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJzZXJ2aWNlX3JvbGUiLAogICAgImlzcyI6ICJzdXBhYmFzZS1kZW1vIiwKICAgICJpYXQiOiAxNjQxNzY5MjAwLAogICAgImV4cCI6IDE3OTk1MzU2MDAKfQ.DaYlNEoUrrEn2Ig7tqibS-PHK5vgusbcbo7X36XVt4Q'
};

async function listTables() {
  const sql = "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name;";
  try {
    const res = await fetch(`${DB_CONFIG.url}/pg/query`, {
      method: 'POST',
      headers: {
        'apikey': DB_CONFIG.apiKey,
        'Authorization': `Bearer ${DB_CONFIG.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query: sql })
    });
    const text = await res.text();
    try {
        const data = JSON.parse(text);
        console.log('Tables in public schema:');
        if (Array.isArray(data)) {
            data.forEach(t => console.log(`- ${t.table_name}`));
        } else if (data.rows) {
            data.rows.forEach(t => console.log(`- ${t.table_name}`));
        } else {
            console.log(JSON.stringify(data, null, 2));
        }
    } catch (e) {
        console.error('Failed to parse JSON. Raw response:', text);
    }
  } catch (err) {
    console.error('Fetch Error:', err.message);
  }
}

listTables();
