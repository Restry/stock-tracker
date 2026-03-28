"use client";

import { useEffect, useState } from "react";
import { fmtCcy } from "../utils";

interface Position {
  symbol: string;
  name: string;
  shares: number;
  currentPrice: number;
  costPrice: number;
  currency: string;
  marketValueUsd: number;
  costBasisUsd: number;
  pnlUsd: number;
  pnlPct: number;
  volatilityPct: number | null;
}

interface Allocation {
  symbol: string;
  targetWeight: number;
  actualWeight: number;
  driftPct: number;
  action: "overweight" | "underweight" | "on_target";
  suggestedDeltaUsd: number;
}

interface PortfolioAnalysis {
  totalValueUsd: number;
  positions: Position[];
  allocations: Allocation[];
  hhi: number;
  diversificationRating: "poor" | "moderate" | "good" | "excellent";
  rebalanceNeeded: string[];
  riskLevel: "low" | "moderate" | "high";
  analysedAt: string;
}

const ratingLabels: Record<string, string> = {
  poor: "集中度高",
  moderate: "一般分散",
  good: "良好分散",
  excellent: "充分分散",
};

const ratingColors: Record<string, string> = {
  poor: "text-loss",
  moderate: "text-amber-400",
  good: "text-profit",
  excellent: "text-profit",
};

const riskLabels: Record<string, string> = {
  low: "低风险",
  moderate: "中风险",
  high: "高风险",
};

const riskColors: Record<string, string> = {
  low: "text-profit",
  moderate: "text-amber-400",
  high: "text-loss",
};

const actionLabels: Record<string, string> = {
  overweight: "超配",
  underweight: "低配",
  on_target: "达标",
};

const actionBadgeColors: Record<string, string> = {
  overweight: "bg-loss/15 text-loss border-loss/30",
  underweight: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  on_target: "bg-profit/15 text-profit border-profit/30",
};

export function PortfolioOptimizerPanel() {
  const [data, setData] = useState<PortfolioAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const res = await fetch("/api/portfolio-optimize");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        setData(json);
      } catch (err) {
        setError(String(err));
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted text-sm">
        <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin mr-2" />
        正在分析组合...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-loss text-sm py-8 text-center">
        组合分析失败: {error || "无数据"}
      </div>
    );
  }

  if (data.positions.length === 0) {
    return (
      <div className="text-muted text-sm py-8 text-center">
        暂无持仓数据
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Risk Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-surface-secondary rounded-xl p-3 border border-border">
          <div className="text-[10px] uppercase font-bold text-muted-dark mb-1">组合总值</div>
          <div className="text-lg font-mono font-bold">{fmtCcy(data.totalValueUsd, "USD")}</div>
        </div>
        <div className="bg-surface-secondary rounded-xl p-3 border border-border">
          <div className="text-[10px] uppercase font-bold text-muted-dark mb-1">风险等级</div>
          <div className={`text-lg font-bold ${riskColors[data.riskLevel]}`}>
            {riskLabels[data.riskLevel]}
          </div>
        </div>
        <div className="bg-surface-secondary rounded-xl p-3 border border-border">
          <div className="text-[10px] uppercase font-bold text-muted-dark mb-1">分散度</div>
          <div className={`text-lg font-bold ${ratingColors[data.diversificationRating]}`}>
            {ratingLabels[data.diversificationRating]}
          </div>
          <div className="text-[10px] text-muted-dark mt-0.5 font-mono">HHI: {data.hhi}</div>
        </div>
        <div className="bg-surface-secondary rounded-xl p-3 border border-border">
          <div className="text-[10px] uppercase font-bold text-muted-dark mb-1">需调仓</div>
          <div className={`text-lg font-bold ${data.rebalanceNeeded.length > 0 ? "text-amber-400" : "text-profit"}`}>
            {data.rebalanceNeeded.length > 0 ? `${data.rebalanceNeeded.length} 只` : "均衡"}
          </div>
        </div>
      </div>

      {/* Allocation Table */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h4 className="text-xs font-bold text-muted-dark uppercase tracking-wider">目标配置 vs 实际配置</h4>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-muted-dark text-[10px] uppercase">
                <th className="text-left px-4 py-2">股票</th>
                <th className="text-right px-3 py-2">市值 (USD)</th>
                <th className="text-right px-3 py-2">波动率</th>
                <th className="text-right px-3 py-2">目标权重</th>
                <th className="text-right px-3 py-2">实际权重</th>
                <th className="text-right px-3 py-2">偏离</th>
                <th className="text-center px-3 py-2">状态</th>
                <th className="text-right px-3 py-2">建议调整</th>
              </tr>
            </thead>
            <tbody>
              {data.allocations.map((alloc) => {
                const pos = data.positions.find(p => p.symbol === alloc.symbol);
                return (
                  <tr key={alloc.symbol} className="border-b border-border/50 hover:bg-surface-secondary/50">
                    <td className="px-4 py-2.5">
                      <div className="font-mono font-medium">{alloc.symbol}</div>
                      <div className="text-[10px] text-muted-dark">{pos?.name}</div>
                    </td>
                    <td className="text-right px-3 py-2.5 font-mono text-xs">
                      {fmtCcy(pos?.marketValueUsd ?? 0, "USD")}
                    </td>
                    <td className="text-right px-3 py-2.5 font-mono text-xs">
                      {pos?.volatilityPct !== null && pos?.volatilityPct !== undefined
                        ? `${pos.volatilityPct.toFixed(1)}%`
                        : "—"}
                    </td>
                    <td className="text-right px-3 py-2.5 font-mono text-xs">
                      {(alloc.targetWeight * 100).toFixed(1)}%
                    </td>
                    <td className="text-right px-3 py-2.5 font-mono text-xs">
                      {(alloc.actualWeight * 100).toFixed(1)}%
                    </td>
                    <td className={`text-right px-3 py-2.5 font-mono text-xs ${
                      Math.abs(alloc.driftPct) > 5 ? "text-loss" : Math.abs(alloc.driftPct) > 2 ? "text-amber-400" : "text-muted"
                    }`}>
                      {alloc.driftPct >= 0 ? "+" : ""}{alloc.driftPct.toFixed(1)}pp
                    </td>
                    <td className="text-center px-3 py-2.5">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${actionBadgeColors[alloc.action]}`}>
                        {actionLabels[alloc.action]}
                      </span>
                    </td>
                    <td className={`text-right px-3 py-2.5 font-mono text-xs ${
                      alloc.suggestedDeltaUsd > 0 ? "text-profit" : alloc.suggestedDeltaUsd < 0 ? "text-loss" : "text-muted"
                    }`}>
                      {alloc.suggestedDeltaUsd > 0 ? "+" : ""}{fmtCcy(alloc.suggestedDeltaUsd, "USD")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Weight Visualization - Horizontal Bars */}
      <div className="bg-surface border border-border rounded-xl p-4">
        <h4 className="text-xs font-bold text-muted-dark uppercase tracking-wider mb-3">权重分布</h4>
        <div className="space-y-2">
          {data.allocations.map((alloc) => (
            <div key={alloc.symbol} className="flex items-center gap-3">
              <div className="w-20 text-xs font-mono text-muted-dark shrink-0">{alloc.symbol}</div>
              <div className="flex-1 h-5 bg-surface-secondary rounded-full overflow-hidden relative">
                {/* Target weight indicator */}
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-accent z-10"
                  style={{ left: `${Math.min(alloc.targetWeight * 100, 100)}%` }}
                  title={`目标: ${(alloc.targetWeight * 100).toFixed(1)}%`}
                />
                {/* Actual weight bar */}
                <div
                  className={`h-full rounded-full transition-all ${
                    alloc.action === "overweight" ? "bg-loss/40" : alloc.action === "underweight" ? "bg-amber-500/40" : "bg-profit/40"
                  }`}
                  style={{ width: `${Math.min(alloc.actualWeight * 100, 100)}%` }}
                />
              </div>
              <div className="w-14 text-xs font-mono text-right text-muted-dark">
                {(alloc.actualWeight * 100).toFixed(1)}%
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-4 mt-3 text-[10px] text-muted-dark">
          <span className="flex items-center gap-1">
            <span className="w-3 h-0.5 bg-accent inline-block" /> 目标权重
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 bg-profit/40 rounded inline-block" /> 实际权重
          </span>
        </div>
      </div>

      <div className="text-[10px] text-muted-dark text-right">
        分析时间: {new Date(data.analysedAt).toLocaleString("zh-CN")}
      </div>
    </div>
  );
}
