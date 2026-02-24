import { NextRequest, NextResponse } from "next/server";
import pool, { toSqlVal } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const symbol = req.nextUrl.searchParams.get("symbol");
    const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") || "500"), 1000);

    let query: string;

    if (symbol) {
      query = `
        SELECT id, symbol, price, currency, change, change_percent,
               previous_close, pe_ratio, market_cap, dividend_yield,
               fifty_two_week_high, fifty_two_week_low, average_volume,
               created_at
        FROM "st-price-history"
        WHERE symbol = ${toSqlVal(symbol)}
        ORDER BY created_at DESC
        LIMIT ${toSqlVal(limit)}
      `;
    } else {
      query = `
        SELECT id, symbol, price, currency, change, change_percent,
               previous_close, pe_ratio, market_cap, dividend_yield,
               fifty_two_week_high, fifty_two_week_low, average_volume,
               created_at
        FROM "st-price-history"
        ORDER BY created_at DESC
        LIMIT ${toSqlVal(limit)}
      `;
    }

    const { rows } = await pool.query(query);

    // Get distinct symbols for filter dropdown
    const { rows: symbols } = await pool.query(
      `SELECT DISTINCT symbol FROM "st-price-history" ORDER BY symbol`
    );

    return NextResponse.json({
      history: rows,
      symbols: symbols.map((s: any) => s.symbol),
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
