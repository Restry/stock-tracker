import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { convertToUsd } from "@/lib/prices";

export async function GET() {
  try {
    const { rows: holdings } = await pool.query(`
      SELECT symbol, name, shares, cost_price,
             current_price, price_currency, updated_at
      FROM "st-holdings" ORDER BY symbol
    `);

    let totalValueUsd = 0;
    const enriched = holdings.map((h: any) => {
      const shares = parseFloat(h.shares) || 0;
      const currentPrice = parseFloat(h.current_price) || 0;
      const costPrice = parseFloat(h.cost_price) || 0;

      // Convert to USD for consistent comparisons
      const marketValueUsd = convertToUsd(currentPrice * shares, h.price_currency || "USD");
      const costBasisUsd = convertToUsd(costPrice * shares, h.price_currency || "USD");

      const pnl = costBasisUsd > 0 && marketValueUsd > 0 ? marketValueUsd - costBasisUsd : null;
      const pnlPct = costBasisUsd > 0 && marketValueUsd > 0 ? ((marketValueUsd - costBasisUsd) / costBasisUsd) * 100 : null;

      totalValueUsd += marketValueUsd;
      return { ...h, marketValue: marketValueUsd, costBasis: costBasisUsd, pnl, pnlPct };
    });

    return NextResponse.json({ holdings: enriched, totalValueUsd });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
