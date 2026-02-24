import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const auth = req.headers.get('authorization');
  if (auth !== 'Bearer stock2026') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const API_URL = 'https://db.dora.restry.cn';
  const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJzZXJ2aWNlX3JvbGUiLAogICAgImlzcyI6ICJzdXBhYmFzZS1kZW1vIiwKICAgICJpYXQiOiAxNjQxNzY5MjAwLAogICAgImV4cCI6IDE3OTk1MzU2MDAKfQ.DaYlNEoUrrEn2Ig7tqibS-PHK5vgusbcbo7X36XVt4Q';

  try {
    // 1. Create tables one by one to avoid 502/timeout issues with large batches
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
      )`,
      `CREATE TABLE IF NOT EXISTS "st-price-history" (
        id SERIAL PRIMARY KEY,
        symbol VARCHAR(20) NOT NULL,
        price NUMERIC NOT NULL,
        currency VARCHAR(10) DEFAULT 'USD',
        change NUMERIC,
        change_percent NUMERIC,
        previous_close NUMERIC,
        pe_ratio NUMERIC,
        market_cap NUMERIC,
        dividend_yield NUMERIC,
        fifty_two_week_high NUMERIC,
        fifty_two_week_low NUMERIC,
        average_volume NUMERIC,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )`,
      `CREATE TABLE IF NOT EXISTS "st-logs" (
        id SERIAL PRIMARY KEY,
        category VARCHAR(50) NOT NULL,
        message TEXT NOT NULL,
        details JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )`,
      `CREATE TABLE IF NOT EXISTS "st-symbol-settings" (
        symbol VARCHAR(20) PRIMARY KEY,
        name VARCHAR(100),
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        auto_trade BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )`,
      `CREATE TABLE IF NOT EXISTS "st-app-settings" (
        key VARCHAR(50) PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )`
    ];

    for (const sql of tables) {
      const r = await fetch(`${API_URL}/pg/query`, {
        method: 'POST',
        headers: {
          'apikey': API_KEY,
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query: sql })
      });
      if (!r.ok) {
        const text = await r.text();
        throw new Error(`SQL Fail (${r.status}): ${text}`);
      }
    }

    // 2. Seed data
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

    if (!sr.ok) {
        const text = await sr.text();
        throw new Error(`Seed Fail (${sr.status}): ${text}`);
    }

    const settingsSql = `
      INSERT INTO "st-symbol-settings" (symbol, name, enabled, auto_trade)
      SELECT symbol, name, TRUE, TRUE FROM "st-holdings"
      ON CONFLICT (symbol) DO NOTHING
    `;

    const appSettingsSql = `
      INSERT INTO "st-app-settings" (key, value)
      VALUES ('global_auto_trade', 'true')
      ON CONFLICT (key) DO NOTHING
    `;

    const [settingsRes, appSettingsRes] = await Promise.all([
      fetch(`${API_URL}/pg/query`, {
        method: 'POST',
        headers: {
          'apikey': API_KEY,
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query: settingsSql })
      }),
      fetch(`${API_URL}/pg/query`, {
        method: 'POST',
        headers: {
          'apikey': API_KEY,
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query: appSettingsSql })
      })
    ]);

    if (!settingsRes.ok || !appSettingsRes.ok) {
      const sText = await settingsRes.text();
      const aText = await appSettingsRes.text();
      throw new Error(`Settings seed failed: symbols(${settingsRes.status}) ${sText}; app(${appSettingsRes.status}) ${aText}`);
    }

    return NextResponse.json({ ok: true, message: "Remote DB initialized and seeded." });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
