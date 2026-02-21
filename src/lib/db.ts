import { Pool } from "pg";

const pool = new Pool({
  connectionString:
    "postgresql://jarvis:9YMjTVB9EQYTRXzjSwHZP2k@52.175.79.6:25432/dashboard?connect_timeout=10&sslmode=disable",
});

export default pool;

export async function initSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "st-holdings" (
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
    );

    CREATE TABLE IF NOT EXISTS "st-trades" (
      id SERIAL PRIMARY KEY,
      symbol VARCHAR(20) NOT NULL,
      action VARCHAR(10) NOT NULL,
      shares NUMERIC NOT NULL,
      price NUMERIC,
      currency VARCHAR(10) DEFAULT 'USD',
      reason TEXT,
      source VARCHAR(20) DEFAULT 'ai',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS "st-decisions" (
      id SERIAL PRIMARY KEY,
      symbol VARCHAR(20) NOT NULL,
      action VARCHAR(10) NOT NULL,
      confidence NUMERIC,
      reasoning TEXT,
      market_data JSONB,
      news_summary TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS "st-daily-reports" (
      id SERIAL PRIMARY KEY,
      report_date DATE NOT NULL DEFAULT CURRENT_DATE,
      total_value NUMERIC,
      holdings_snapshot JSONB,
      decisions_summary JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
}
