import { NextRequest, NextResponse } from "next/server";
import { updateAllPrices } from "@/lib/prices";
import pool, { logAction, toSqlVal } from "@/lib/db";

export async function POST() {
  const timestamp = new Date().toISOString();
  try {
    const results = await updateAllPrices();
    const summary = results.length
      ? results
          .slice(0, 5)
          .map((q) => `${q.symbol} price updated to ${q.price} ${q.currency}`)
          .join("; ")
      : "No symbols were updated";
    await logAction("price_update", "Price Update completed", {
      timestamp,
      action: "Price Update",
      status: "success",
      summary,
      updatedCount: results.length,
    });
    return NextResponse.json({ updated: results });
  } catch (error) {
    await logAction("price_update", "Price Update failed", {
      timestamp,
      action: "Price Update",
      status: "fail",
      summary: `Price update failed: ${String(error)}`,
    });
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const limit = Math.min(Math.max(parseInt(req.nextUrl.searchParams.get("limit") || "50"), 1), 500);
    const symbol = req.nextUrl.searchParams.get("symbol");
    const sql = symbol
      ? `SELECT symbol, price, currency, change, change_percent, created_at
         FROM "st-price-history"
         WHERE symbol = ${toSqlVal(symbol)}
         ORDER BY created_at DESC
         LIMIT ${toSqlVal(limit)}`
      : `SELECT symbol, price, currency, change, change_percent, created_at
         FROM "st-price-history"
         ORDER BY created_at DESC
         LIMIT ${toSqlVal(limit)}`;
    const { rows } = await pool.query(sql);
    return NextResponse.json({ prices: rows });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
