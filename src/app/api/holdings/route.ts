import { NextResponse } from "next/server";
import pool from "@/lib/db";

export async function GET() {
  try {
    const { rows: holdings } = await pool.query(`
      SELECT symbol, name, shares, cost_price, cost_currency,
             current_price, price_currency, exchange, updated_at
      FROM "st-holdings" ORDER BY symbol
    `);

    let totalValueUsd = 0;
    const enriched = holdings.map((h) => {
      const marketValue = (parseFloat(h.current_price) || 0) * parseFloat(h.shares);
      const costBasis = (parseFloat(h.cost_price) || 0) * parseFloat(h.shares);
      const pnl = costBasis > 0 ? marketValue - costBasis : null;
      const pnlPct = costBasis > 0 ? ((marketValue - costBasis) / costBasis) * 100 : null;
      totalValueUsd += marketValue;
      return { ...h, marketValue, costBasis, pnl, pnlPct };
    });

    return NextResponse.json({ holdings: enriched, totalValueUsd });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
