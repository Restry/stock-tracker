"use client";

import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import type { MonitoringData, QuoteData, TechIndicators, Holding, ChartDataPoint } from "../types";
import { PRIMARY_SYMBOL } from "../types";
import { fmtCcy } from "../utils";
import { useState } from "react";

export function PriceMonitorPanel({
  monitoring,
  chartData,
  quoteData,
  techIndicators,
  primaryHolding,
  priceFlash,
  priceFlashKey,
  editingPosition,
  setEditingPosition,
  savePosition,
}: {
  monitoring: MonitoringData;
  chartData: ChartDataPoint[];
  quoteData: QuoteData | null;
  techIndicators: TechIndicators | null;
  primaryHolding: Holding | undefined;
  priceFlash: boolean;
  priceFlashKey: React.RefObject<number>;
  editingPosition: boolean;
  setEditingPosition: (v: boolean) => void;
  savePosition: (symbol: string, shares: number, costPrice: number) => Promise<void>;
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
      {/* Price & Chart */}
      <div className="lg:col-span-8 bg-surface border border-border rounded-2xl p-4 md:p-5">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg font-bold font-mono text-accent">{PRIMARY_SYMBOL}</span>
              <span className="text-sm text-muted">{primaryHolding?.name || "小米集团"}</span>
            </div>
            <div className="flex items-baseline gap-3">
              <span key={priceFlashKey.current} className={`text-3xl md:text-4xl font-bold font-mono px-1 -mx-1 ${priceFlash ? "price-flash" : ""}`}>
                {fmtCcy(monitoring.currentPrice, monitoring.currency)}
              </span>
              {quoteData && (
                <span className={`text-lg font-mono font-semibold ${quoteData.changePercent >= 0 ? "text-profit" : "text-loss"}`}>
                  {quoteData.changePercent >= 0 ? "+" : ""}{quoteData.changePercent.toFixed(2)}%
                </span>
              )}
            </div>
            {quoteData && (
              <div className="flex items-center gap-3 mt-1 text-xs text-muted-dark font-mono">
                <span>涨跌: {quoteData.change >= 0 ? "+" : ""}{quoteData.change.toFixed(2)}</span>
                <span>前收: {quoteData.previousClose?.toFixed(2)}</span>
                {quoteData.pe && <span>PE: {quoteData.pe.toFixed(1)}</span>}
              </div>
            )}
          </div>
          <div className="flex gap-4 text-xs font-mono">
            {quoteData?.fiftyTwoWeekLow != null && (
              <div className="text-center">
                <div className="text-muted-dark">52周低</div>
                <div className="text-foreground">{quoteData.fiftyTwoWeekLow.toFixed(2)}</div>
              </div>
            )}
            {quoteData?.fiftyTwoWeekHigh != null && (
              <div className="text-center">
                <div className="text-muted-dark">52周高</div>
                <div className="text-foreground">{quoteData.fiftyTwoWeekHigh.toFixed(2)}</div>
              </div>
            )}
            {quoteData?.dividendYield != null && (
              <div className="text-center">
                <div className="text-muted-dark">股息率</div>
                <div className="text-foreground">{quoteData.dividendYield.toFixed(2)}%</div>
              </div>
            )}
          </div>
        </div>
        {/* Price Chart */}
        <div className="h-[200px] md:h-[280px]">
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#58a6ff" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#58a6ff" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" stroke="#30363d" tick={{ fill: "#484f58", fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis stroke="#30363d" tick={{ fill: "#484f58", fontSize: 10 }} axisLine={false} tickLine={false} domain={["auto", "auto"]} tickFormatter={(v: number) => v.toFixed(1)} width={50} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#161b22", border: "1px solid #30363d", borderRadius: "12px", fontSize: "12px", color: "#e8eaed" }}
                  formatter={(value: number | undefined) => [fmtCcy(value ?? 0, monitoring.currency), "价格"]}
                />
                {monitoring.costPrice > 0 && (
                  <ReferenceLine y={monitoring.costPrice} stroke="#d29922" strokeDasharray="4 4" label={{ value: `成本 ${monitoring.costPrice.toFixed(2)}`, fill: "#d29922", fontSize: 10, position: "insideTopRight" }} />
                )}
                <Area type="monotone" dataKey="value" stroke="#58a6ff" strokeWidth={2} fill="url(#colorPrice)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-muted-dark text-sm">暂无价格历史数据</div>
          )}
        </div>
      </div>

      {/* Position & Strategy Panel */}
      <div className="lg:col-span-4 space-y-4">
        {/* Position Card */}
        <div className="bg-surface border border-border rounded-2xl p-4 md:p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold text-muted-dark uppercase tracking-wider">持仓信息</h3>
            <button onClick={() => setEditingPosition(!editingPosition)} className="text-[10px] text-accent hover:text-accent-bright transition-colors">
              {editingPosition ? "取消" : "✏️ 编辑"}
            </button>
          </div>
          {editingPosition ? (
            <PositionEditor
              symbol={PRIMARY_SYMBOL}
              currentShares={monitoring.shares}
              currentCost={monitoring.costPrice}
              currency={monitoring.currency}
              onSave={(shares, cost) => savePosition(PRIMARY_SYMBOL, shares, cost)}
              onCancel={() => setEditingPosition(false)}
            />
          ) : (
            <div className="space-y-2.5">
              <InfoRow label="持仓" value={`${monitoring.shares.toLocaleString()} 股`} />
              <InfoRow label="成本价" value={fmtCcy(monitoring.costPrice, monitoring.currency)} />
              <InfoRow label="现价" value={fmtCcy(monitoring.currentPrice, monitoring.currency)} />
              <div className="border-t border-border my-2" />
              <InfoRow label="总成本" value={fmtCcy(monitoring.totalCost, monitoring.currency)} />
              <InfoRow label="市值" value={fmtCcy(monitoring.marketValue, monitoring.currency)} />
              <div className="flex justify-between text-sm font-semibold">
                <span className="text-muted">盈亏</span>
                <span className={`font-mono ${monitoring.pnl >= 0 ? "text-profit" : "text-loss"}`}>
                  {monitoring.pnl >= 0 ? "+" : ""}{fmtCcy(monitoring.pnl, monitoring.currency)}
                  <span className="text-xs ml-1 opacity-75">({monitoring.pnlPct >= 0 ? "+" : ""}{monitoring.pnlPct.toFixed(2)}%)</span>
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Break-even Card */}
        <div className={`rounded-2xl p-4 md:p-5 border ${monitoring.pnl >= 0 ? "bg-profit/5 border-profit/20" : "bg-loss/5 border-loss/20"}`}>
          <h3 className="text-xs font-bold text-muted-dark uppercase tracking-wider mb-3">回本分析</h3>
          <div className="space-y-2">
            <InfoRow label="回本价" value={fmtCcy(monitoring.breakEvenPrice, monitoring.currency)} bold />
            <div className="flex justify-between text-sm">
              <span className="text-muted">距回本</span>
              <span className={`font-mono font-semibold ${monitoring.priceToBreakEven <= 0 ? "text-profit" : "text-loss"}`}>
                {monitoring.priceToBreakEven <= 0
                  ? `已盈利 +${Math.abs(monitoring.pctToBreakEven).toFixed(2)}%`
                  : `需涨 +${monitoring.pctToBreakEven.toFixed(2)}%`}
              </span>
            </div>
          </div>
          {monitoring.priceToBreakEven > 0 && (
            <div className="mt-3 pt-3 border-t border-border/50">
              <div className="w-full bg-surface-elevated rounded-full h-2 overflow-hidden">
                <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${Math.min(100, (monitoring.currentPrice / monitoring.breakEvenPrice) * 100)}%` }} />
              </div>
              <div className="flex justify-between text-[10px] text-muted-dark mt-1 font-mono">
                <span>0</span>
                <span>{((monitoring.currentPrice / monitoring.breakEvenPrice) * 100).toFixed(1)}%</span>
                <span>回本</span>
              </div>
            </div>
          )}
        </div>

        {/* T-Trading Signals */}
        <div className="bg-surface border border-border rounded-2xl p-4 md:p-5">
          <h3 className="text-xs font-bold text-muted-dark uppercase tracking-wider mb-3">做 T 信号</h3>
          <div className="space-y-2">
            <SignalRow label="T-Buy (布林下轨+RSI超卖)" active={monitoring.tBuyActive} desc={monitoring.tBuyActive ? "信号触发：建议日内低吸" : "未触发"} type="buy" />
            <SignalRow label="摊薄成本机会" active={monitoring.averageDownOpportunity} desc={monitoring.averageDownOpportunity ? "价格低于成本+技术面支撑" : "未触发"} type="buy" />
            <SignalRow label="止盈降本信号" active={monitoring.profitTakingOpportunity} desc={monitoring.profitTakingOpportunity ? "价格高于成本3%+，可部分卖出" : "未触发"} type="sell" />
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted">{label}</span>
      <span className={`font-mono ${bold ? "font-bold" : "font-semibold"}`}>{value}</span>
    </div>
  );
}

function PositionEditor({ symbol, currentShares, currentCost, currency, onSave, onCancel }: {
  symbol: string; currentShares: number; currentCost: number; currency: string;
  onSave: (shares: number, cost: number) => void; onCancel: () => void;
}) {
  const [shares, setShares] = useState(String(currentShares));
  const [cost, setCost] = useState(String(currentCost));
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const s = parseFloat(shares);
    const c = parseFloat(cost);
    if (isNaN(s) || s < 0 || isNaN(c) || c < 0) return;
    setSaving(true);
    await onSave(s, c);
    setSaving(false);
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <div>
          <label className="text-[11px] text-muted-dark">持仓数量</label>
          <input value={shares} onChange={e => setShares(e.target.value)} className="w-full mt-1 bg-surface-elevated border border-border rounded-lg px-3 py-2 text-sm font-mono focus:border-accent focus:outline-none" />
        </div>
        <div>
          <label className="text-[11px] text-muted-dark">成本价 ({currency})</label>
          <input value={cost} onChange={e => setCost(e.target.value)} className="w-full mt-1 bg-surface-elevated border border-border rounded-lg px-3 py-2 text-sm font-mono focus:border-accent focus:outline-none" />
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={handleSave} disabled={saving} className="flex-1 px-3 py-2 rounded-lg text-xs font-medium bg-accent text-background">{saving ? "保存中..." : "保存"}</button>
        <button onClick={onCancel} className="px-3 py-2 rounded-lg text-xs font-medium bg-surface-elevated text-muted border border-border">取消</button>
      </div>
    </div>
  );
}

function SignalRow({ label, active, desc, type }: { label: string; active: boolean; desc: string; type: "buy" | "sell" }) {
  return (
    <div className={`flex items-center justify-between text-xs p-2 rounded-lg ${active ? (type === "buy" ? "bg-profit/10 border border-profit/20" : "bg-loss/10 border border-loss/20") : "bg-surface-elevated"}`}>
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${active ? (type === "buy" ? "bg-profit" : "bg-loss") : "bg-muted-dark"}`} />
        <span className={active ? "text-foreground font-medium" : "text-muted-dark"}>{label}</span>
      </div>
      <span className={`font-mono text-[10px] ${active ? (type === "buy" ? "text-profit" : "text-loss") : "text-muted-dark"}`}>{desc}</span>
    </div>
  );
}
