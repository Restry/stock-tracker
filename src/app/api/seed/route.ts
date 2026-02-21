import { NextResponse } from "next/server";
import pool, { initSchema } from "@/lib/db";

export async function POST() {
  try {
    await initSchema();

    // Seed initial holdings
    await pool.query(`
      INSERT INTO "st-holdings" (symbol, name, shares, cost_price, cost_currency, exchange)
      VALUES
        ('MSFT', 'Microsoft Corporation', 400, NULL, 'USD', 'NASDAQ'),
        ('01810.HK', 'Xiaomi Corporation', 8000, 48, 'CNY', 'HKEX')
      ON CONFLICT (symbol) DO NOTHING
    `);

    return NextResponse.json({ ok: true, message: "Schema created and data seeded." });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
