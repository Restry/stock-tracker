"use client";

import { fmtCcy } from "../utils";
import type { Decision } from "../types";

export function PortfolioSummary({
  totalValue,
  totalPnl,
  totalPnlPct,
  holdingsCount,
  tradesCount,
  decisions,
}: {
  totalValue: number;
  totalPnl: number;
  totalPnlPct: number;
  holdingsCount: number;
  tradesCount: number;
  decisions: Decision[];
}) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <MetricCard label="组合总值" value={fmtCcy(totalValue, "USD")} icon="💼" accent />
      <MetricCard label="总盈亏" value={`${totalPnl >= 0 ? "+" : ""}${fmtCcy(totalPnl, "USD")}`} subtitle={`${totalPnlPct >= 0 ? "+" : ""}${totalPnlPct.toFixed(2)}%`} icon="📈" trend={totalPnl >= 0 ? "up" : "down"} />
      <MetricCard label="持仓数" value={String(holdingsCount)} subtitle={`${tradesCount} 笔交易`} icon="📊" />
      <MetricCard label="AI 决策" value={String(decisions.length)} subtitle={decisions[0] ? `最新: ${decisions[0].action} ${decisions[0].symbol}` : "暂无决策"} icon="🧠" />
    </div>
  );
}

export function MetricCard({ label, value, subtitle, icon, accent, trend }: { label: string; value: string; subtitle?: string; icon: string; accent?: boolean; trend?: "up" | "down" }) {
  return (
    <div className={`rounded-2xl p-3 md:p-4 border ${accent ? "bg-accent/5 border-accent/20" : "bg-surface border-border"}`}>
      <div className="flex items-start justify-between mb-2">
        <span className="text-[10px] uppercase font-bold text-muted-dark">{label}</span>
        <span>{icon}</span>
      </div>
      <div className={`text-xl font-mono font-bold ${trend === "up" ? "text-profit" : trend === "down" ? "text-loss" : ""}`}>{value}</div>
      {subtitle && <p className="text-[10px] text-muted-dark mt-1">{subtitle}</p>}
    </div>
  );
}
