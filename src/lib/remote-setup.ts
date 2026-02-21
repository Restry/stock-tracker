const API_URL = 'https://db.dora.restry.cn';
const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJzZXJ2aWNlX3JvbGUiLAogICAgImlzcyI6ICJzdXBhYmFzZS1kZW1vIiwKICAgICJpYXQiOiAxNjQxNzY5MjAwLAogICAgImV4cCI6IDE3OTk1MzU2MDAKfQ.DaYlNEoUrrEn2Ig7tqibS-PHK5vgusbcbo7X36XVt4Q';

async function setup() {
  const tables = [
    `CREATE TABLE IF NOT EXISTS "st-holdings" (
      id SERIAL PRIMARY KEY,
      symbol VARCHAR(20) NOT NULL UNIQUE,
      name VARCHAR(100) NOT NULL,
      shares NUMERIC NOT NULL DEFAULT 0,
      cost_price NUMERIC,
      cost_currency VARCHAR(10) DEFAULT 'USD',
      current_price NUMERIC,
      price_currency VARCHAR(10) DEFAULT 'USD',
      exchange VARCHAR(20),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS "st-trades" (
      id SERIAL PRIMARY KEY,
      symbol VARCHAR(20) NOT NULL,
      action VARCHAR(10) NOT NULL,
      shares NUMERIC NOT NULL,
      price NUMERIC,
      currency VARCHAR(10) DEFAULT 'USD',
      reason TEXT,
      source VARCHAR(20) DEFAULT 'ai',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS "st-decisions" (
      id SERIAL PRIMARY KEY,
      symbol VARCHAR(20) NOT NULL,
      action VARCHAR(10) NOT NULL,
      confidence NUMERIC,
      reasoning TEXT,
      market_data JSONB,
      news_summary TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS "st-daily-reports" (
      id SERIAL PRIMARY KEY,
      report_date DATE NOT NULL DEFAULT CURRENT_DATE,
      total_value NUMERIC,
      holdings_snapshot JSONB,
      decisions_summary JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`
  ];

  for (const sql of tables) {
    console.log('Creating table...');
    const r = await fetch(`${API_URL}/pg/query`, {
      method: 'POST',
      headers: {
        'apikey': API_KEY,
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query: sql })
    });
    console.log(r.status, await r.text());
  }

  console.log('Seeding...');
  const seedSql = `
    INSERT INTO "st-holdings" (symbol, name, shares, cost_price, cost_currency, exchange)
    VALUES
      ('MSFT', 'Microsoft Corporation', 200, 200, 'USD', 'NASDAQ'),
      ('01810.HK', 'Xiaomi Corporation', 8000, 48, 'CNY', 'HKEX')
    ON CONFLICT (symbol) DO NOTHING
  `;
  const sr = await fetch(`${API_URL}/pg/query`, {
    method: 'POST',
    headers: {
      'apikey': API_KEY,
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query: seedSql })
  });
  console.log(sr.status, await sr.text());
}

setup();
