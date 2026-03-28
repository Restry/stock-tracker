import { NextRequest, NextResponse } from "next/server";
import pool, { logAction, toSqlVal } from "@/lib/db";
import { convertToUsdAsync } from "@/lib/prices";

/* ---------- Row types ---------- */

interface HoldingRow {
  symbol: string;
  name: string;
  shares: number | string | null;
  cost_price: number | string | null;
  current_price: number | string | null;
  price_currency: string | null;
}

interface TradeRow {
  symbol: string;
  action: string;
  shares: number | string | null;
  price: number | string | null;
  currency: string | null;
  reason: string | null;
  created_at: string;
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

interface DailyReportRow {
  total_value: number | string | null;
  created_at: string;
}

/* ---------- Helpers ---------- */

const toNum = (v: number | string | null | undefined): number => {
  if (typeof v === "number") return v;
  if (typeof v === "string") return parseFloat(v) || 0;
  return 0;
};

/* ---------- POST: Generate enhanced daily report ---------- */

export async function POST() {
  const timestamp = new Date().toISOString();
  try {
    // Parallel: holdings, recent decisions, today's trades, previous report
    const [holdingsRes, decisionsRes, tradesRes, prevReportRes] = await Promise.all([
      pool.query(`SELECT symbol, name, shares, cost_price, current_price, price_currency FROM "st-holdings"`),
      pool.query(`SELECT symbol, action, confidence, reasoning FROM "st-decisions" WHERE created_at > NOW() - INTERVAL '1 day'`),
      pool.query(`SELECT symbol, action, shares, price, currency, reason, created_at FROM "st-trades" WHERE created_at > NOW() - INTERVAL '1 day' ORDER BY created_at ASC`),
      pool.query(`SELECT total_value, created_at FROM "st-daily-reports" ORDER BY created_at DESC LIMIT 1`),
    ]);

    const holdings = holdingsRes.rows as HoldingRow[];
    const recentDecisions = decisionsRes.rows as DecisionRow[];
    const todayTrades = tradesRes.rows as TradeRow[];
    const prevReport = (prevReportRes.rows as DailyReportRow[])[0] ?? null;

    /* --- Per-symbol P&L --- */
    let totalValueUsd = 0;
    let totalCostUsd = 0;
    const symbolMetrics: Array<{
      symbol: string;
      name: string;
      shares: number;
      costPrice: number;
      currentPrice: number;
      currency: string;
      marketValueUsd: number;
      costBasisUsd: number;
      unrealizedPnl: number;
      unrealizedPnlPct: number;
    }> = [];

    for (const h of holdings) {
      const shares = toNum(h.shares);
      const costPrice = toNum(h.cost_price);
      const currentPrice = toNum(h.current_price);
      const currency = h.price_currency || "USD";
      if (shares <= 0) continue;

      const marketValueUsd = await convertToUsdAsync(currentPrice * shares, currency);
      const costBasisUsd = await convertToUsdAsync(costPrice * shares, currency);
      const unrealizedPnl = marketValueUsd - costBasisUsd;
      const unrealizedPnlPct = costBasisUsd > 0 ? (unrealizedPnl / costBasisUsd) * 100 : 0;

      totalValueUsd += marketValueUsd;
      totalCostUsd += costBasisUsd;

      symbolMetrics.push({
        symbol: h.symbol,
        name: h.name,
        shares,
        costPrice,
        currentPrice,
        currency,
        marketValueUsd,
        costBasisUsd,
        unrealizedPnl,
        unrealizedPnlPct,
      });
    }

    const totalUnrealizedPnl = totalValueUsd - totalCostUsd;
    const totalUnrealizedPnlPct = totalCostUsd > 0 ? (totalUnrealizedPnl / totalCostUsd) * 100 : 0;

    /* --- Daily change vs previous report --- */
    const prevTotalValue = prevReport ? toNum(prevReport.total_value) : null;
    const dailyChange = prevTotalValue != null && prevTotalValue > 0
      ? totalValueUsd - prevTotalValue
      : null;
    const dailyChangePct = prevTotalValue != null && prevTotalValue > 0
      ? ((totalValueUsd - prevTotalValue) / prevTotalValue) * 100
      : null;

    /* --- Trade performance (today) --- */
    let totalBuyCost = 0;
    let totalSellRevenue = 0;
    let buyCount = 0;
    let sellCount = 0;

    for (const t of todayTrades) {
      const shares = toNum(t.shares);
      const price = toNum(t.price);
      const value = shares * price;
      if (t.action === "BUY") {
        totalBuyCost += value;
        buyCount++;
      } else if (t.action === "SELL") {
        totalSellRevenue += value;
        sellCount++;
      }
    }

    const tradePerformance = {
      tradesTotal: todayTrades.length,
      buyCount,
      sellCount,
      totalBuyCost,
      totalSellRevenue,
      netTradeFlow: totalSellRevenue - totalBuyCost,
    };

    /* --- Decision summary --- */
    const decisionBreakdown: Record<string, number> = {};
    for (const d of recentDecisions) {
      const key = d.action || "UNKNOWN";
      decisionBreakdown[key] = (decisionBreakdown[key] || 0) + 1;
    }

    /* --- Build report payload --- */
    const reportData = {
      timestamp,
      portfolio: {
        totalValueUsd,
        totalCostUsd,
        unrealizedPnl: totalUnrealizedPnl,
        unrealizedPnlPct: totalUnrealizedPnlPct,
        dailyChange,
        dailyChangePct,
        holdingsCount: symbolMetrics.length,
      },
      holdings: symbolMetrics,
      trades: tradePerformance,
      decisions: {
        total: recentDecisions.length,
        breakdown: decisionBreakdown,
      },
    };

    /* --- Store to DB --- */
    const reportSql = `INSERT INTO "st-daily-reports" (total_value, holdings_snapshot, decisions_summary) 
      VALUES (
        ${toSqlVal(totalValueUsd)}, 
        ${toSqlVal(JSON.stringify(reportData))}, 
        ${toSqlVal(JSON.stringify(recentDecisions))}
      )`;
    await pool.query(reportSql);

    await logAction("report", "Enhanced daily report generated", {
      timestamp,
      action: "Daily Report",
      status: "success",
      summary: `Portfolio: $${totalValueUsd.toFixed(2)} | P&L: ${totalUnrealizedPnl >= 0 ? "+" : ""}$${totalUnrealizedPnl.toFixed(2)} (${totalUnrealizedPnlPct >= 0 ? "+" : ""}${totalUnrealizedPnlPct.toFixed(2)}%) | Trades today: ${todayTrades.length}`,
      totalValueUsd,
      unrealizedPnl: totalUnrealizedPnl,
      dailyChange,
    });

    return NextResponse.json(reportData);
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

/* ---------- GET: Narrative report with P&L context ---------- */

export async function GET(req: NextRequest) {
  const timestamp = new Date().toISOString();
  try {
    const limit = Math.min(Math.max(parseInt(req.nextUrl.searchParams.get("limit") || "15"), 1), 50);

    const [logsRes, tradeCountRes, decisionCountRes, holdingsRes, prevReportRes] = await Promise.all([
      pool.query(`SELECT category, message, details, created_at FROM "st-logs" ORDER BY created_at DESC LIMIT ${toSqlVal(limit)}`),
      pool.query(`SELECT COUNT(*) AS count FROM "st-trades" WHERE created_at > NOW() - INTERVAL '24 hours'`),
      pool.query(`SELECT COUNT(*) AS count FROM "st-decisions" WHERE created_at > NOW() - INTERVAL '24 hours'`),
      pool.query(`SELECT symbol, name, shares, cost_price, current_price, price_currency FROM "st-holdings"`),
      pool.query(`SELECT total_value, created_at FROM "st-daily-reports" ORDER BY created_at DESC LIMIT 1`),
    ]);

    const logs = logsRes.rows as LogRow[];
    const tradesIn24h = toNum((tradeCountRes.rows[0] as { count: number | string }).count);
    const decisionsIn24h = toNum((decisionCountRes.rows[0] as { count: number | string }).count);
    const holdings = holdingsRes.rows as HoldingRow[];
    const prevReport = (prevReportRes.rows as DailyReportRow[])[0] ?? null;

    /* --- Quick portfolio summary for narrative --- */
    let totalValue = 0;
    let totalCost = 0;
    for (const h of holdings) {
      const shares = toNum(h.shares);
      const currentPrice = toNum(h.current_price);
      const costPrice = toNum(h.cost_price);
      const currency = h.price_currency || "USD";
      if (shares <= 0) continue;
      totalValue += await convertToUsdAsync(currentPrice * shares, currency);
      totalCost += await convertToUsdAsync(costPrice * shares, currency);
    }
    const pnl = totalValue - totalCost;
    const pnlPct = totalCost > 0 ? (pnl / totalCost) * 100 : 0;

    const prevTotalValue = prevReport ? toNum(prevReport.total_value) : null;
    const dailyChange = prevTotalValue != null && prevTotalValue > 0
      ? totalValue - prevTotalValue
      : null;

    const narrative = buildNarrative(logs, {
      totalValue,
      pnl,
      pnlPct,
      dailyChange,
      holdingsCount: holdings.filter(h => toNum(h.shares) > 0).length,
    });

    await logAction("report", "Narrative report fetched", {
      timestamp,
      action: "Narrative Report",
      status: "success",
      summary: `Portfolio: $${totalValue.toFixed(2)}, P&L: ${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)}`,
    });

    return NextResponse.json({
      timestamp,
      alive: true,
      trading: tradesIn24h > 0 || decisionsIn24h > 0,
      tradesIn24h,
      decisionsIn24h,
      portfolio: {
        totalValueUsd: totalValue,
        unrealizedPnl: pnl,
        unrealizedPnlPct: pnlPct,
        dailyChange,
      },
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

/* ---------- Narrative builder ---------- */

function buildNarrative(
  logs: LogRow[],
  ctx: { totalValue: number; pnl: number; pnlPct: number; dailyChange: number | null; holdingsCount: number },
): string {
  const parts: string[] = [];

  // Portfolio summary
  const pnlSign = ctx.pnl >= 0 ? "+" : "";
  parts.push(
    `Portfolio: $${ctx.totalValue.toFixed(2)} across ${ctx.holdingsCount} position${ctx.holdingsCount !== 1 ? "s" : ""}. ` +
    `Unrealized P&L: ${pnlSign}$${ctx.pnl.toFixed(2)} (${pnlSign}${ctx.pnlPct.toFixed(1)}%).`
  );

  if (ctx.dailyChange != null) {
    const dcSign = ctx.dailyChange >= 0 ? "+" : "";
    parts.push(`Daily change: ${dcSign}$${ctx.dailyChange.toFixed(2)}.`);
  }

  // Latest trade context
  const tradeLog = logs.find(l => l.category === "trade");
  if (tradeLog) {
    const details = parseDetails(tradeLog.details);
    const action = String(details?.action || "HOLD").toLowerCase();
    const symbol = String(details?.symbol || "the watched stock");
    const price = details?.price ? `${details.price} ${String(details.currency || "").trim()}`.trim() : "market price";
    const reason = String(details?.reason || tradeLog.message || "current market signals");
    parts.push(`Latest trade: ${action} ${symbol} at ${price} — ${reason}.`);
  } else {
    const decisionLog = logs.find(l => l.category === "ai_decision" || l.category === "decision");
    if (decisionLog) {
      const details = parseDetails(decisionLog.details);
      const summary = details?.summary ? String(details.summary) : decisionLog.message;
      parts.push(`Latest AI decision: ${summary}`);
    } else {
      parts.push("No recent trade or decision activity.");
    }
  }

  return parts.join(" ");
}

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
