import pool from "./db";

export async function setupDb() {
  console.log("Setting up tables with 'st-' prefix...");
  
  const tables = [
    `CREATE TABLE IF NOT EXISTS "st-holdings" (
      id SERIAL PRIMARY KEY,
      symbol TEXT UNIQUE NOT NULL,
      name TEXT,
      quantity NUMERIC DEFAULT 0,
      cost_basis NUMERIC DEFAULT 0,
      current_price NUMERIC DEFAULT 0,
      currency TEXT DEFAULT 'USD',
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
    )`,
    `CREATE TABLE IF NOT EXISTS "st-daily-reports" (
      id SERIAL PRIMARY KEY,
      report_date DATE UNIQUE NOT NULL,
      total_value_usd NUMERIC,
      pnl_usd NUMERIC,
      summary TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS "st-price-history" (
      id SERIAL PRIMARY KEY,
      symbol TEXT NOT NULL,
      price NUMERIC NOT NULL,
      currency TEXT DEFAULT 'USD',
      change NUMERIC,
      change_percent NUMERIC,
      previous_close NUMERIC,
      pe_ratio NUMERIC,
      market_cap NUMERIC,
      dividend_yield NUMERIC,
      fifty_two_week_high NUMERIC,
      fifty_two_week_low NUMERIC,
      average_volume NUMERIC,
      recorded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )`
  ];

  for (const sql of tables) {
    try {
      await pool.query(sql);
      console.log("Executed:", sql.substring(0, 50) + "...");
    } catch (err) {
      console.error("Error executing SQL:", err.message);
    }
  }

  // Initial Seed
  console.log("Seeding initial holdings...");
  const seedSql = `
    INSERT INTO "st-holdings" (symbol, name, quantity, cost_basis, currency)
    VALUES 
      ('MSFT', 'Microsoft Corp', 200, 200, 'USD'),
      ('01810.HK', 'Xiaomi Group', 8000, 48, 'CNY')
    ON CONFLICT (symbol) DO UPDATE SET
      quantity = EXCLUDED.quantity,
      cost_basis = EXCLUDED.cost_basis;
  `;
  await pool.query(seedSql);
  console.log("Seed complete.");
}

if (require.main === module) {
  setupDb().then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
  });
}
