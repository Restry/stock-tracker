import { NextRequest, NextResponse } from "next/server";
import pool, { logAction, toSqlVal } from "@/lib/db";

interface HoldingSnapshotRow {
  symbol: string;
  name: string;
  shares: number | string | null;
  current_price: number | string | null;
  price_currency: string | null;
}

interface DecisionRow {
  symbol: string;
  action: string;
  confidence: number | string | null;
  reasoning: string | null;
}

interface LogRow {
  category: string;
  message: string;
  details: unknown;
  created_at: string;
}

const toNumber = (value: number | string | null | undefined): number => {
  if (typeof value === "number") return value;
  if (typeof value === "string") return parseFloat(value) || 0;
  return 0;
};

function parseDetails(details: unknown): Record<string, unknown> | null {
  if (!details) return null;
  if (typeof details === "object" && details !== null) return details as Record<string, unknown>;
  if (typeof details === "string") {
    try {
      const parsed = JSON.parse(details) as unknown;
      if (typeof parsed === "object" && parsed !== null) return parsed as Record<string, unknown>;
    } catch {
      return { summary: details };
    }
  }
  return null;
}

function buildNarrative(logs: LogRow[]): string {
  const tradeLog = logs.find((l) => l.category === "trade");
  if (tradeLog) {
    const details = parseDetails(tradeLog.details);
    const action = String(details?.action || "HOLD").toLowerCase();
    const symbol = String(details?.symbol || "the watched stock");
    const price = details?.price ? `${details.price} ${String(details.currency || "").trim()}`.trim() : "market price";
    const reason = String(details?.reason || tradeLog.message || "current market signals");
    return `Dad, your AI trader just ${action} ${symbol} at ${price} because ${reason}.`;
  }

  const decisionLog = logs.find((l) => l.category === "ai_decision" || l.category === "decision");
  if (decisionLog) {
    const details = parseDetails(decisionLog.details);
    const xiaomiAction = details?.xiaomiAction ? String(details.xiaomiAction) : "HOLD";
    const summary = details?.summary ? String(details.summary) : decisionLog.message;
    return `Dad, latest AI cycle marked Xiaomi as ${xiaomiAction}. ${summary}`;
  }

  return "Dad, the automated trader is alive and monitoring the market, but no fresh trade log is available yet.";
}

export async function POST() {
  const timestamp = new Date().toISOString();
  try {
    const { rows } = await pool.query(
      `SELECT symbol, name, shares, current_price, price_currency FROM "st-holdings"`
    );
    const holdings = rows as HoldingSnapshotRow[];

    let totalValue = 0;
    const snapshot = holdings.map((h) => {
      const mv = toNumber(h.current_price) * toNumber(h.shares);
      totalValue += mv;
      return { ...h, marketValue: mv };
    });

    const { rows: decisionRows } = await pool.query(
      `SELECT symbol, action, confidence, reasoning FROM "st-decisions" WHERE created_at > NOW() - INTERVAL '1 day'`
    );
    const recentDecisions = decisionRows as DecisionRow[];

    const reportSql = `INSERT INTO "st-daily-reports" (total_value, holdings_snapshot, decisions_summary) 
      VALUES (
        ${toSqlVal(totalValue)}, 
        ${toSqlVal(JSON.stringify(snapshot))}, 
        ${toSqlVal(JSON.stringify(recentDecisions))}
      )`;
    await pool.query(reportSql);
    await logAction("report", "Daily report generated", {
      timestamp,
      action: "Daily Report",
      status: "success",
      summary: `Daily report stored with ${snapshot.length} holdings and ${recentDecisions.length} decisions.`,
      totalValue,
    });

    return NextResponse.json({ totalValue, holdings: snapshot.length, decisions: recentDecisions.length });
  } catch (error) {
    await logAction("report", "Daily report generation failed", {
      timestamp,
      action: "Daily Report",
      status: "fail",
      summary: `Report generation failed: ${String(error)}`,
    });
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const timestamp = new Date().toISOString();
  try {
    const limit = Math.min(Math.max(parseInt(req.nextUrl.searchParams.get("limit") || "15"), 1), 50);
    const [{ rows: logRows }, { rows: tradeCountRows }, { rows: decisionCountRows }] = await Promise.all([
      pool.query(
        `SELECT category, message, details, created_at
         FROM "st-logs"
         ORDER BY created_at DESC
         LIMIT ${toSqlVal(limit)}`
      ),
      pool.query(
        `SELECT COUNT(*) AS count FROM "st-trades" WHERE created_at > NOW() - INTERVAL '24 hours'`
      ),
      pool.query(
        `SELECT COUNT(*) AS count FROM "st-decisions" WHERE created_at > NOW() - INTERVAL '24 hours'`
      ),
    ]);

    const logs = logRows as LogRow[];
    const tradesIn24h = toNumber((tradeCountRows[0] as { count: number | string }).count);
    const decisionsIn24h = toNumber((decisionCountRows[0] as { count: number | string }).count);
    const narrative = buildNarrative(logs);

    await logAction("report", "Narrative report fetched", {
      timestamp,
      action: "Narrative Report",
      status: "success",
      summary: `Returned narrative from ${logs.length} logs. trades24h=${tradesIn24h}, decisions24h=${decisionsIn24h}`,
    });

    return NextResponse.json({
      timestamp,
      alive: true,
      trading: tradesIn24h > 0 || decisionsIn24h > 0,
      tradesIn24h,
      decisionsIn24h,
      narrative,
      logs,
    });
  } catch (error) {
    await logAction("report", "Narrative report failed", {
      timestamp,
      action: "Narrative Report",
      status: "fail",
      summary: `Narrative report failed: ${String(error)}`,
    });
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
