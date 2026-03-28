"use client";

import { useState, useCallback, useEffect } from "react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend,
} from "recharts";
import type { BacktestResult } from "@/lib/backtest";
import { fmtCcy } from "../utils";

export function BacktestPanel() {
  const [symbol, setSymbol] = useState("01810.HK");
  const [symbols, setSymbols] = useState<string[]>([]);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load available symbols
  useEffect(() => {
    fetch("/api/history")
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.symbols?.length) setSymbols(data.symbols); })
      .catch(() => {});
  }, []);

  const runBacktest = useCallback(async () => {
    if (!symbol) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/backtest?symbol=${encodeURIComponent(symbol)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Backtest failed");
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    setLoading(false);
  }, [symbol]);

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-xs text-muted font-medium">股票代码:</label>
        <select
          value={symbol}
          onChange={e => setSymbol(e.target.value)}
          className="bg-surface-elevated border border-border rounded-lg px-3 py-1.5 text-xs font-mono text-foreground focus:outline-none focus:border-accent"
        >
          {symbols.length > 0 ? (
            symbols.map(s => <option key={s} value={s}>{s}</option>)
          ) : (
            <option value={symbol}>{symbol}</option>
          )}
        </select>
        <button
          onClick={runBacktest}
          disabled={loading || !symbol}
          className="px-4 py-1.5 rounded-lg text-xs font-medium bg-accent text-background hover:bg-accent-bright transition-colors disabled:opacity-50"
        >
          {loading ? "回测中..." : "运行回测"}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="p-3 rounded-lg bg-loss/10 border border-loss/20 text-loss text-xs">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="flex flex-col items-center gap-3">
            <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            <span className="text-xs text-muted-dark">正在计算回测结果...</span>
          </div>
        </div>
      )}

      {/* Results */}
      {result && !loading && (
        <div className="space-y-4">
          {/* Key Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <BacktestMetric
              label="策略收益"
              value={`${result.strategy.totalReturn >= 0 ? "+" : ""}${result.strategy.totalReturn.toFixed(2)}%`}
              trend={result.strategy.totalReturn >= 0 ? "up" : "down"}
            />
            <BacktestMetric
              label="基准收益"
              value={`${result.benchmark.totalReturn >= 0 ? "+" : ""}${result.benchmark.totalReturn.toFixed(2)}%`}
              trend={result.benchmark.totalReturn >= 0 ? "up" : "down"}
            />
            <BacktestMetric
              label="Alpha"
              value={`${result.alpha >= 0 ? "+" : ""}${result.alpha.toFixed(2)}%`}
              trend={result.alpha >= 0 ? "up" : "down"}
            />
            <BacktestMetric
              label="Sharpe"
              value={result.strategy.sharpeRatio.toFixed(2)}
              trend={result.strategy.sharpeRatio >= 1 ? "up" : result.strategy.sharpeRatio >= 0 ? "neutral" : "down"}
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <BacktestMetric
              label="最大回撤"
              value={`${result.strategy.maxDrawdown.toFixed(2)}%`}
              trend={result.strategy.maxDrawdown > -10 ? "neutral" : "down"}
              subtitle={new Date(result.strategy.maxDrawdownDate).toLocaleDateString("zh-CN")}
            />
            <BacktestMetric
              label="胜率"
              value={`${result.strategy.winRate.toFixed(1)}%`}
              trend={result.strategy.winRate >= 50 ? "up" : "down"}
            />
            <BacktestMetric
              label="盈亏比"
              value={result.strategy.profitFactor >= 999 ? "N/A" : result.strategy.profitFactor.toFixed(2)}
              trend={result.strategy.profitFactor >= 1.5 ? "up" : result.strategy.profitFactor >= 1 ? "neutral" : "down"}
            />
            <BacktestMetric
              label="交易次数"
              value={String(result.strategy.totalTrades)}
              subtitle={`${result.durationDays} 天`}
            />
          </div>

          {/* Equity Curve Chart */}
          {result.equityCurve.length > 1 && (
            <div className="bg-surface border border-border rounded-xl p-4">
              <h4 className="text-xs font-bold text-muted-dark uppercase tracking-wider mb-3">
                净值曲线 (策略 vs 买入持有)
              </h4>
              <div className="h-[240px] md:h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={result.equityCurve.map(p => ({
                    date: new Date(p.timestamp).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" }),
                    strategy: Math.round(p.strategy * 100) / 100,
                    benchmark: Math.round(p.benchmark * 100) / 100,
                  }))}>
                    <defs>
                      <linearGradient id="colorStrategy" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#58a6ff" stopOpacity={0.2} />
                        <stop offset="100%" stopColor="#58a6ff" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="colorBenchmark" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#d29922" stopOpacity={0.15} />
                        <stop offset="100%" stopColor="#d29922" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                    <XAxis
                      dataKey="date" stroke="#30363d"
                      tick={{ fill: "#484f58", fontSize: 10 }}
                      axisLine={false} tickLine={false}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      stroke="#30363d"
                      tick={{ fill: "#484f58", fontSize: 10 }}
                      axisLine={false} tickLine={false}
                      domain={["auto", "auto"]}
                      width={70}
                      tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#161b22",
                        border: "1px solid #30363d",
                        borderRadius: "12px",
                        fontSize: "12px",
                        color: "#e8eaed",
                      }}
                      formatter={(value: number | undefined) => [
                        fmtCcy(value ?? 0, "USD"),
                        "",
                      ]}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: "11px", color: "#8b949e" }}
                      formatter={(value: string) => value === "strategy" ? "策略净值" : "买入持有"}
                    />
                    <Area
                      type="monotone" dataKey="strategy"
                      stroke="#58a6ff" strokeWidth={2}
                      fill="url(#colorStrategy)"
                    />
                    <Area
                      type="monotone" dataKey="benchmark"
                      stroke="#d29922" strokeWidth={1.5}
                      strokeDasharray="4 3"
                      fill="url(#colorBenchmark)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Summary Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="bg-surface border border-border rounded-xl p-4">
              <h4 className="text-xs font-bold text-muted-dark uppercase tracking-wider mb-2">策略表现</h4>
              <div className="space-y-1.5 text-xs">
                <SummaryRow label="初始资金" value={fmtCcy(result.config.initialCash ?? 100000, "USD")} />
                <SummaryRow label="最终净值" value={fmtCcy(result.strategy.finalValue, "USD")} />
                <SummaryRow
                  label="年化收益"
                  value={`${result.strategy.annualizedReturn >= 0 ? "+" : ""}${result.strategy.annualizedReturn.toFixed(2)}%`}
                  trend={result.strategy.annualizedReturn >= 0 ? "up" : "down"}
                />
                <SummaryRow label="数据点数" value={`${result.dataPoints.toLocaleString()}`} />
                <SummaryRow
                  label="回测期间"
                  value={`${new Date(result.startDate).toLocaleDateString("zh-CN")} - ${new Date(result.endDate).toLocaleDateString("zh-CN")}`}
                />
              </div>
            </div>
            <div className="bg-surface border border-border rounded-xl p-4">
              <h4 className="text-xs font-bold text-muted-dark uppercase tracking-wider mb-2">买入持有基准</h4>
              <div className="space-y-1.5 text-xs">
                <SummaryRow label="最终净值" value={fmtCcy(result.benchmark.finalValue, "USD")} />
                <SummaryRow
                  label="总收益"
                  value={`${result.benchmark.totalReturn >= 0 ? "+" : ""}${result.benchmark.totalReturn.toFixed(2)}%`}
                  trend={result.benchmark.totalReturn >= 0 ? "up" : "down"}
                />
                <SummaryRow
                  label="年化收益"
                  value={`${result.benchmark.annualizedReturn >= 0 ? "+" : ""}${result.benchmark.annualizedReturn.toFixed(2)}%`}
                  trend={result.benchmark.annualizedReturn >= 0 ? "up" : "down"}
                />
                <SummaryRow
                  label="策略超额"
                  value={`${result.alpha >= 0 ? "+" : ""}${result.alpha.toFixed(2)}%`}
                  trend={result.alpha >= 0 ? "up" : "down"}
                />
              </div>
            </div>
          </div>

          {/* Recent Trades */}
          {result.trades.length > 0 && (
            <div className="bg-surface border border-border rounded-xl p-4">
              <h4 className="text-xs font-bold text-muted-dark uppercase tracking-wider mb-3">
                回测交易记录 (最近 20 笔)
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-muted-dark uppercase tracking-wider border-b border-border">
                      <th className="text-left px-3 py-2 font-medium">时间</th>
                      <th className="text-left px-3 py-2 font-medium">操作</th>
                      <th className="text-right px-3 py-2 font-medium">股数</th>
                      <th className="text-right px-3 py-2 font-medium">价格</th>
                      <th className="text-right px-3 py-2 font-medium">金额</th>
                      <th className="text-right px-3 py-2 font-medium">组合净值</th>
                      <th className="text-left px-3 py-2 font-medium hidden lg:table-cell">原因</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.trades.slice(-20).reverse().map((t, i) => (
                      <tr key={i} className="border-b border-border/30 table-row-hover">
                        <td className="px-3 py-2 text-muted-dark font-mono">
                          {new Date(t.timestamp).toLocaleDateString("zh-CN", { month: "short", day: "numeric" })}
                        </td>
                        <td className="px-3 py-2">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${t.action === "BUY" ? "bg-profit/15 text-profit" : "bg-loss/15 text-loss"}`}>
                            {t.action === "BUY" ? "买入" : "卖出"}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right font-mono">{t.shares.toLocaleString()}</td>
                        <td className="px-3 py-2 text-right font-mono">{t.price.toFixed(2)}</td>
                        <td className="px-3 py-2 text-right font-mono">{fmtCcy(t.value, "USD")}</td>
                        <td className="px-3 py-2 text-right font-mono">{fmtCcy(t.portfolioValue, "USD")}</td>
                        <td className="px-3 py-2 text-muted-dark hidden lg:table-cell max-w-[200px] truncate" title={t.reason}>{t.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!result && !loading && !error && (
        <div className="py-12 text-center text-muted-dark text-sm">
          选择股票代码后点击"运行回测"查看策略历史表现
        </div>
      )}
    </div>
  );
}

function BacktestMetric({
  label,
  value,
  subtitle,
  trend,
}: {
  label: string;
  value: string;
  subtitle?: string;
  trend?: "up" | "down" | "neutral";
}) {
  return (
    <div className="bg-surface border border-border rounded-xl p-3">
      <div className="text-[10px] uppercase font-bold text-muted-dark mb-1">{label}</div>
      <div className={`text-lg font-mono font-bold ${trend === "up" ? "text-profit" : trend === "down" ? "text-loss" : ""}`}>
        {value}
      </div>
      {subtitle && <div className="text-[10px] text-muted-dark mt-0.5">{subtitle}</div>}
    </div>
  );
}

function SummaryRow({
  label,
  value,
  trend,
}: {
  label: string;
  value: string;
  trend?: "up" | "down";
}) {
  return (
    <div className="flex justify-between">
      <span className="text-muted">{label}</span>
      <span className={`font-mono font-semibold ${trend === "up" ? "text-profit" : trend === "down" ? "text-loss" : ""}`}>
        {value}
      </span>
    </div>
  );
}
