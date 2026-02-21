import { NextResponse } from "next/server";
import pool from "@/lib/db";

export async function POST() {
  try {
    const { rows: holdings } = await pool.query(
      `SELECT symbol, name, shares, current_price, price_currency FROM "st-holdings"`
    );

    let totalValue = 0;
    const snapshot = holdings.map((h) => {
      const mv = (parseFloat(h.current_price) || 0) * parseFloat(h.shares);
      totalValue += mv;
      return { ...h, marketValue: mv };
    });

    const { rows: recentDecisions } = await pool.query(
      `SELECT symbol, action, confidence, reasoning FROM "st-decisions" WHERE created_at > NOW() - INTERVAL '1 day'`
    );

    await pool.query(
      `INSERT INTO "st-daily-reports" (total_value, holdings_snapshot, decisions_summary) VALUES ($1, $2, $3)`,
      [totalValue, JSON.stringify(snapshot), JSON.stringify(recentDecisions)]
    );

    return NextResponse.json({ totalValue, holdings: snapshot.length, decisions: recentDecisions.length });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
