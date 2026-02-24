import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { toSqlVal } from "@/lib/prices";

export async function POST() {
  try {
    const { rows: holdings } = await pool.query(
      `SELECT symbol, name, shares, current_price, price_currency FROM "st-holdings"`
    );

    let totalValue = 0;
    const snapshot = (holdings as any[]).map((h: any) => {
      const mv = (parseFloat(h.current_price) || 0) * parseFloat(h.shares);
      totalValue += mv;
      return { ...h, marketValue: mv };
    });

    const { rows: recentDecisions } = await pool.query(
      `SELECT symbol, action, confidence, reasoning FROM "st-decisions" WHERE created_at > NOW() - INTERVAL '1 day'`
    );

    const reportSql = `INSERT INTO "st-daily-reports" (total_value, holdings_snapshot, decisions_summary) 
      VALUES (
        ${toSqlVal(totalValue)}, 
        ${toSqlVal(JSON.stringify(snapshot))}, 
        ${toSqlVal(JSON.stringify(recentDecisions))}
      )`;
    await pool.query(reportSql);

    return NextResponse.json({ totalValue, holdings: snapshot.length, decisions: recentDecisions.length });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
