import { NextRequest, NextResponse } from "next/server";
import pool, { toSqlVal } from "@/lib/db";

interface ReportRow {
  report_date: string;
  total_value: number | string | null;
  holdings_snapshot: string | object | null;
  created_at: string;
}

const toNum = (v: number | string | null | undefined): number => {
  if (typeof v === "number") return v;
  if (typeof v === "string") return parseFloat(v) || 0;
  return 0;
};

export async function GET(req: NextRequest) {
  try {
    const days = Math.min(Math.max(parseInt(req.nextUrl.searchParams.get("days") || "30"), 1), 365);

    const { rows } = await pool.query(
      `SELECT report_date, total_value, holdings_snapshot, created_at
       FROM "st-daily-reports"
       WHERE created_at > NOW() - INTERVAL '${days} days'
       ORDER BY created_at ASC`
    );

    const reports = (rows as ReportRow[]).map(r => {
      const totalValue = toNum(r.total_value);

      // Try to extract per-symbol breakdown from holdings_snapshot
      let holdings: Array<{ symbol: string; marketValueUsd: number; unrealizedPnl: number }> = [];
      try {
        const snap = typeof r.holdings_snapshot === "string"
          ? JSON.parse(r.holdings_snapshot)
          : r.holdings_snapshot;

        if (snap && typeof snap === "object") {
          // New format: { portfolio: ..., holdings: [...] }
          const holdingsArr = Array.isArray(snap) ? snap : (snap as Record<string, unknown>).holdings;
          if (Array.isArray(holdingsArr)) {
            holdings = holdingsArr.map((h: Record<string, unknown>) => ({
              symbol: String(h.symbol || ""),
              marketValueUsd: toNum(h.marketValueUsd as number) || toNum(h.marketValue as number),
              unrealizedPnl: toNum(h.unrealizedPnl as number) || 0,
            }));
          }
        }
      } catch { /* ignore parse errors */ }

      return {
        date: r.report_date,
        totalValue,
        holdings,
        createdAt: r.created_at,
      };
    });

    // Compute daily changes
    const withChanges = reports.map((r, i) => {
      const prev = i > 0 ? reports[i - 1] : null;
      const dailyChange = prev ? r.totalValue - prev.totalValue : null;
      const dailyChangePct = prev && prev.totalValue > 0
        ? ((r.totalValue - prev.totalValue) / prev.totalValue) * 100
        : null;
      return { ...r, dailyChange, dailyChangePct };
    });

    // Summary stats
    const values = reports.map(r => r.totalValue).filter(v => v > 0);
    const latest = values.length > 0 ? values[values.length - 1] : 0;
    const earliest = values.length > 0 ? values[0] : 0;
    const totalReturn = earliest > 0 ? ((latest - earliest) / earliest) * 100 : 0;
    const peak = values.length > 0 ? Math.max(...values) : 0;
    const trough = values.length > 0 ? Math.min(...values) : 0;
    const maxDrawdown = peak > 0 ? ((trough - peak) / peak) * 100 : 0;

    return NextResponse.json({
      days,
      reports: withChanges,
      summary: {
        latestValue: latest,
        earliestValue: earliest,
        totalReturn,
        peak,
        trough,
        maxDrawdown,
        dataPoints: reports.length,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
