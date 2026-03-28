"use client";

import { useEffect, useState, useMemo } from "react";
import {
  AreaChart, Area, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { fmtCcy } from "../utils";
import type { Decision } from "../types";

interface PortfolioPoint {
  date: string;
  totalValue: number;
  dailyChange: number | null;
  dailyChangePct: number | null;
}

interface PortfolioSummaryData {
  latestValue: number;
  earliestValue: number;
  totalReturn: number;
  peak: number;
  maxDrawdown: number;
  dataPoints: number;
}

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
  const [history, setHistory] = useState<PortfolioPoint[]>([]);
  const [summary, setSummary] = useState<PortfolioSummaryData | null>(null);

  useEffect(() => {
    async function fetchHistory() {
      try {
        const res = await fetch("/api/portfolio-history?days=30");
        if (!res.ok) return;
        const data = await res.json();
        if (data.reports) setHistory(data.reports);
        if (data.summary) setSummary(data.summary);
      } catch { /* ignore */ }
    }
    fetchHistory();
  }, []);

  const chartData = useMemo(() => {
    return history
      .filter(p => p.totalValue > 0)
      .map(p => ({
        date: new Date(p.date).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" }),
        value: p.totalValue,
      }));
  }, [history]);

  const trend = totalPnl >= 0 ? "up" : "down";

  return (
    <div className="space-y-3">
      {/* Metric Cards Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard label="组合总值" value={fmtCcy(totalValue, "USD")} icon="💼" accent />
        <MetricCard
          label="总盈亏"
          value={`${totalPnl >= 0 ? "+" : ""}${fmtCcy(totalPnl, "USD")}`}
          subtitle={`${totalPnlPct >= 0 ? "+" : ""}${totalPnlPct.toFixed(2)}%`}
          icon="📈"
          trend={trend}
        />
        <MetricCard label="持仓数" value={String(holdingsCount)} subtitle={`${tradesCount} 笔交易`} icon="📊" />
        <MetricCard
          label="AI 决策"
          value={String(decisions.length)}
          subtitle={decisions[0] ? `最新: ${decisions[0].action} ${decisions[0].symbol}` : "暂无决策"}
          icon="🧠"
        />
      </div>

      {/* Portfolio Value Chart */}
      {chartData.length >= 2 && (
        <div className="bg-surface border border-border rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold text-muted-dark uppercase tracking-wider">组合净值走势 (30天)</h3>
            {summary && (
              <div className="flex items-center gap-4 text-xs font-mono">
                <span className={summary.totalReturn >= 0 ? "text-profit" : "text-loss"}>
                  收益: {summary.totalReturn >= 0 ? "+" : ""}{summary.totalReturn.toFixed(2)}%
                </span>
                <span className="text-loss">
                  最大回撤: {summary.maxDrawdown.toFixed(2)}%
                </span>
                <span className="text-muted-dark">
                  {summary.dataPoints} 个数据点
                </span>
              </div>
            )}
          </div>
          <div className="h-[160px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="portfolioGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={trend === "up" ? "#3fb950" : "#f85149"} stopOpacity={0.2} />
                    <stop offset="100%" stopColor={trend === "up" ? "#3fb950" : "#f85149"} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="date"
                  stroke="#30363d"
                  tick={{ fill: "#484f58", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  stroke="#30363d"
                  tick={{ fill: "#484f58", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  domain={["auto", "auto"]}
                  tickFormatter={(v: number) => `$${(v / 1000).toFixed(1)}k`}
                  width={55}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#161b22",
                    border: "1px solid #30363d",
                    borderRadius: "12px",
                    fontSize: "12px",
                    color: "#e8eaed",
                  }}
                  formatter={(value: number | undefined) => [fmtCcy(value ?? 0, "USD"), "组合价值"]}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={trend === "up" ? "#3fb950" : "#f85149"}
                  strokeWidth={2}
                  fill="url(#portfolioGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}

export function MetricCard({ label, value, subtitle, icon, accent, trend }: {
  label: string;
  value: string;
  subtitle?: string;
  icon: string;
  accent?: boolean;
  trend?: "up" | "down";
}) {
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
