import { NextRequest, NextResponse } from "next/server";
import pool, { toSqlVal } from "@/lib/db";
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

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { symbol, shares, cost_price } = body as {
      symbol?: string;
      shares?: number;
      cost_price?: number;
    };
    if (!symbol) {
      return NextResponse.json({ error: "symbol is required" }, { status: 400 });
    }

    const sets: string[] = [];
    if (shares != null) sets.push(`shares = ${toSqlVal(shares)}`);
    if (cost_price != null) sets.push(`cost_price = ${toSqlVal(cost_price)}`);
    if (sets.length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }
    sets.push("updated_at = NOW()");

    await pool.query(
      `UPDATE "st-holdings" SET ${sets.join(", ")} WHERE symbol = ${toSqlVal(symbol)}`
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
