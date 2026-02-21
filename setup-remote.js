// const fetch = require('node-fetch'); // Use global fetch in Node 18+

const DB_CONFIG = {
  url: 'https://db.dora.restry.cn',
  apiKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJzZXJ2aWNlX3JvbGUiLAogICAgImlzcyI6ICJzdXBhYmFzZS1kZW1vIiwKICAgICJpYXQiOiAxNjQxNzY5MjAwLAogICAgImV4cCI6IDE3OTk1MzU2MDAKfQ.DaYlNEoUrrEn2Ig7tqibS-PHK5vgusbcbo7X36XVt4Q',
  tablePrefix: 'st-'
};

async function dbQuery(sql, params = []) {
  console.log('Executing:', sql.substring(0, 80) + '...');
  const res = await fetch(`${DB_CONFIG.url}/pg/query`, {
    method: 'POST',
    headers: {
      'apikey': DB_CONFIG.apiKey,
      'Authorization': `Bearer ${DB_CONFIG.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query: sql, params })
  });
  
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch (e) {
    console.error('Raw response:', text);
    throw new Error('Failed to parse JSON: ' + text.substring(0, 100));
  }
}

async function setup() {
  console.log("Creating tables with 'st-' prefix...");
  
  const tables = [
    `CREATE TABLE IF NOT EXISTS "st-holdings" (
      id SERIAL PRIMARY KEY,
      symbol TEXT UNIQUE NOT NULL,
      name TEXT,
      shares NUMERIC DEFAULT 0,
      cost_price NUMERIC DEFAULT 0,
      current_price NUMERIC DEFAULT 0,
      price_currency TEXT DEFAULT 'USD',
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS "st-trades" (
      id SERIAL PRIMARY KEY,
      symbol TEXT NOT NULL,
      action TEXT NOT NULL,
      shares NUMERIC NOT NULL,
      price NUMERIC NOT NULL,
      currency TEXT NOT NULL,
      reason TEXT,
      source TEXT DEFAULT 'manual',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS "st-decisions" (
      id SERIAL PRIMARY KEY,
      symbol TEXT NOT NULL,
      action TEXT NOT NULL,
      confidence NUMERIC NOT NULL,
      reasoning TEXT,
      news_summary TEXT,
      market_data JSONB,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )`
  ];

  for (const sql of tables) {
    await dbQuery(sql);
    console.log("Table check/creation OK");
  }

  console.log("Seeding holdings: MSFT (200), Xiaomi (8000)...");
  await dbQuery(`
    INSERT INTO "st-holdings" (symbol, name, shares, cost_price, price_currency)
    VALUES 
      ('MSFT', 'Microsoft Corp', 200, 200, 'USD'),
      ('01810.HK', 'Xiaomi Group', 8000, 48, 'CNY')
    ON CONFLICT (symbol) DO UPDATE SET
      shares = EXCLUDED.shares,
      cost_price = EXCLUDED.cost_price;
  `);
  console.log("Seed complete!");
}

setup().catch(err => {
  console.error('Setup error:', err);
  process.exit(1);
});
