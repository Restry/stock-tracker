import { NextRequest, NextResponse } from "next/server";
import { runDecisions } from "@/lib/ai-decision";
import pool, { logAction, toSqlVal } from "@/lib/db";

export async function POST() {
  const timestamp = new Date().toISOString();
  try {
    const result = await runDecisions();
    const xiaomiDecision = result.decisions.find((d) => d.symbol === "01810.HK");
    await logAction("ai_decision", "AI Decision cycle completed", {
      timestamp,
      action: "AI Decision",
      status: "success",
      summary: `Generated ${result.decisions.length} decisions and executed ${result.trades.length} trades.`,
      xiaomiAction: xiaomiDecision?.action || "N/A",
    });
    return NextResponse.json(result);
  } catch (error) {
    await logAction("ai_decision", "AI Decision cycle failed", {
      timestamp,
      action: "AI Decision",
      status: "fail",
      summary: `Decision run failed: ${String(error)}`,
    });
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const limit = Math.min(Math.max(parseInt(req.nextUrl.searchParams.get("limit") || "20"), 1), 200);
    const symbol = req.nextUrl.searchParams.get("symbol");
    const sql = symbol
      ? `SELECT * FROM "st-decisions" WHERE symbol = ${toSqlVal(symbol)} ORDER BY created_at DESC LIMIT ${toSqlVal(limit)}`
      : `SELECT * FROM "st-decisions" ORDER BY created_at DESC LIMIT ${toSqlVal(limit)}`;
    const { rows } = await pool.query(sql);
    return NextResponse.json({ decisions: rows });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
