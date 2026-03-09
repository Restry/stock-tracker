import pool, { toSqlVal } from "./db";

const TRACKER_SCHEMA_SQL = [
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
  )`,
];

const DEFAULT_HOLDINGS = [
  {
    symbol: "MSFT",
    name: "Microsoft Corporation",
    shares: 200,
    costPrice: 200,
    costCurrency: "USD",
    exchange: "NASDAQ",
  },
  {
    symbol: "01810.HK",
    name: "Xiaomi Corporation",
    shares: 8000,
    costPrice: 48,
    costCurrency: "CNY",
    exchange: "HKEX",
  },
] as const;

const TRACKER_TABLES = [
  '"st-price-history"',
  '"st-daily-reports"',
  '"st-logs"',
  '"st-trades"',
  '"st-decisions"',
  '"st-symbol-settings"',
  '"st-app-settings"',
  '"st-holdings"',
];

export async function ensureTrackerSchema(): Promise<void> {
  for (const sql of TRACKER_SCHEMA_SQL) {
    await pool.query(sql);
  }
}

export async function seedTrackerDefaults(): Promise<{ symbols: string[] }> {
  await ensureTrackerSchema();

  const holdingsValues = DEFAULT_HOLDINGS.map((holding) =>
    `(${toSqlVal(holding.symbol)}, ${toSqlVal(holding.name)}, ${toSqlVal(holding.shares)}, ${toSqlVal(holding.costPrice)}, ${toSqlVal(holding.costCurrency)}, ${toSqlVal(holding.exchange)})`
  ).join(",\n        ");

  await pool.query(
    `INSERT INTO "st-holdings" (symbol, name, shares, cost_price, cost_currency, exchange)
     VALUES
       ${holdingsValues}
     ON CONFLICT (symbol) DO UPDATE
       SET name = EXCLUDED.name,
           shares = EXCLUDED.shares,
           cost_price = EXCLUDED.cost_price,
           cost_currency = EXCLUDED.cost_currency,
           exchange = EXCLUDED.exchange,
           updated_at = NOW()`
  );

  const symbolValues = DEFAULT_HOLDINGS.map((holding) =>
    `(${toSqlVal(holding.symbol)}, ${toSqlVal(holding.name)}, TRUE, TRUE, NOW())`
  ).join(",\n        ");

  await pool.query(
    `INSERT INTO "st-symbol-settings" (symbol, name, enabled, auto_trade, updated_at)
     VALUES
       ${symbolValues}
     ON CONFLICT (symbol) DO UPDATE
       SET name = EXCLUDED.name,
           enabled = EXCLUDED.enabled,
           auto_trade = EXCLUDED.auto_trade,
           updated_at = NOW()`
  );

  await pool.query(
    `INSERT INTO "st-app-settings" (key, value, updated_at)
     VALUES ('global_auto_trade', 'true', NOW())
     ON CONFLICT (key) DO UPDATE
       SET value = EXCLUDED.value,
           updated_at = NOW()`
  );

  return { symbols: DEFAULT_HOLDINGS.map((holding) => holding.symbol) };
}

export async function resetTrackerData(): Promise<{ symbols: string[] }> {
  await ensureTrackerSchema();
  await pool.query(`TRUNCATE TABLE ${TRACKER_TABLES.join(", ")} RESTART IDENTITY CASCADE`);
  return seedTrackerDefaults();
}
