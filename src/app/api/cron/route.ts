import { NextRequest, NextResponse } from "next/server";
import { updateAllPrices } from "@/lib/prices";
import { runDecisions } from "@/lib/ai-decision";
import pool, { logAction } from "@/lib/db";

const toNumber = (value: number | string | null | undefined): number => {
  if (typeof value === "number") return value;
  if (typeof value === "string") return parseFloat(value) || 0;
  return 0;
};

function authorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return true;
  return req.headers.get("x-cron-secret") === expected;
}

export async function POST(req: NextRequest) {
  const timestamp = new Date().toISOString();
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const task = (req.nextUrl.searchParams.get("task") || "full").toLowerCase();
  try {
    if (task === "prices") {
      const updated = await updateAllPrices();
      await logAction("cron", "Cron price task completed", {
        timestamp,
        action: "Cron Prices",
        status: "success",
        summary: `Updated ${updated.length} prices.`,
      });
      return NextResponse.json({ ok: true, task, updated: updated.length });
    }

    if (task === "decisions") {
      const result = await runDecisions();
      await logAction("cron", "Cron decision task completed", {
        timestamp,
        action: "Cron Decisions",
        status: "success",
        summary: `Generated ${result.decisions.length} decisions and ${result.trades.length} trades.`,
      });
      return NextResponse.json({ ok: true, task, decisions: result.decisions.length, trades: result.trades.length });
    }

    if (task === "health") {
      const [{ rows: tradeRows }, { rows: decisionRows }] = await Promise.all([
        pool.query(`SELECT COUNT(*) AS count FROM "st-trades" WHERE created_at > NOW() - INTERVAL '24 hours'`),
        pool.query(`SELECT COUNT(*) AS count FROM "st-decisions" WHERE created_at > NOW() - INTERVAL '24 hours'`),
      ]);
      const trades = toNumber((tradeRows[0] as { count: number | string }).count);
      const decisions = toNumber((decisionRows[0] as { count: number | string }).count);
      return NextResponse.json({ ok: true, task, alive: true, trading: trades > 0 || decisions > 0, trades, decisions });
    }

    const updated = await updateAllPrices();
    const result = await runDecisions();
    await logAction("cron", "Cron full trading cycle completed", {
      timestamp,
      action: "Cron Full Cycle",
      status: "success",
      summary: `Updated ${updated.length} prices, generated ${result.decisions.length} decisions, executed ${result.trades.length} trades.`,
    });
    return NextResponse.json({
      ok: true,
      task: "full",
      updated: updated.length,
      decisions: result.decisions.length,
      trades: result.trades.length,
    });
  } catch (error) {
    await logAction("cron", "Cron task failed", {
      timestamp,
      action: `Cron ${task}`,
      status: "fail",
      summary: `Cron task failed: ${String(error)}`,
    });
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
