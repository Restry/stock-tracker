"use client";

import {
  useEffect, useState, useCallback, useMemo, useRef,
  FormEvent,
} from "react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceLine, LineChart, Line, CartesianGrid,
} from "recharts";

/* ============ Interfaces ============ */

interface Holding {
  symbol: string;
  name: string;
  shares: string;
  cost_price: string | null;
  cost_currency: string;
  current_price: string | null;
  price_currency: string;
  exchange: string;
  updated_at: string;
  marketValue: number;
  costBasis: number;
  pnl: number | null;
  pnlPct: number | null;
}

interface Decision {
  id: number;
  symbol: string;
  action: string;
  confidence: number;
  reasoning: string;
  news_summary: string;
  market_data: Record<string, unknown> | null;
  created_at: string;
}

interface Trade {
  id: number;
  symbol: string;
  action: string;
  shares: string;
  price: string;
  currency: string;
  reason: string;
  source: string;
  created_at: string;
}

interface HealthStatus {
  alive: boolean;
  trading: boolean;
  marketOpen: boolean;
  pricesFresh: boolean;
  schedulerAlive: boolean;
  latestPriceAt: string | null;
}

interface TechIndicators {
  rsi14: number | null;
  rsiSignal: string | null;
  sma5: number | null;
  sma20: number | null;
  sma60: number | null;
  maShortAboveLong: boolean | null;
  maGoldenCross: boolean | null;
  priceAboveSma20: boolean | null;
  macdLine: number | null;
  macdSignal: number | null;
  macdHistogram: number | null;
  macdBullish: boolean | null;
  bollingerUpper: number | null;
  bollingerMiddle: number | null;
  bollingerLower: number | null;
  bollingerPosition: number | null;
  atr14: number | null;
  volatilityPct: number | null;
  volumeRatio: number | null;
  volumeTrend: string | null;
  suddenVolumeSpike: boolean | null;
  roc5: number | null;
  roc20: number | null;
  consecutiveUp: number;
  consecutiveDown: number;
  technicalScore: number;
  technicalSignal: string;
  dataPoints: number;
}

interface QuoteData {
  price: number;
  currency: string;
  change: number;
  changePercent: number;
  previousClose: number;
  pe: number | null;
  marketCap: number | null;
  dividendYield: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  averageVolume: number | null;
}

interface PricePoint {
  symbol: string;
  price: string;
  change_percent: string;
  created_at: string;
}

interface HistoryRecord {
  id: number;
  symbol: string;
  price: string;
  currency: string;
  change: string | null;
  change_percent: string | null;
  previous_close: string | null;
  pe_ratio: string | null;
  market_cap: string | null;
  dividend_yield: string | null;
  fifty_two_week_high: string | null;
  fifty_two_week_low: string | null;
  average_volume: string | null;
  created_at: string;
}

interface LogRecord {
  symbol: string;
  price: string;
  currency: string;
  change: string | null;
  change_percent: string | null;
  pe_ratio: string | null;
  market_cap: string | null;
  created_at: string;
}

interface TaskLog {
  timestamp: string;
  symbols: string[];
  records: LogRecord[];
}

interface SymbolSetting {
  symbol: string;
  name: string;
  enabled: boolean;
  autoTrade: boolean;
  updatedAt: string | null;
}

const PRIMARY_SYMBOL = "01810.HK";

/* ============ Main Component ============ */

export default function DashboardPage() {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [totalValue, setTotalValue] = useState(0);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState("");
  const [activeTab, setActiveTab] = useState<"decisions" | "trades" | "history" | "logs">("decisions");
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [techIndicators, setTechIndicators] = useState<TechIndicators | null>(null);
  const [quoteData, setQuoteData] = useState<QuoteData | null>(null);
  const [priceHistory, setPriceHistory] = useState<PricePoint[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [priceFlash, setPriceFlash] = useState(false);
  const priceFlashKey = useRef(0);

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch("/api/health");
      if (!res.ok) return;
      const data = await res.json();
      setHealth({
        alive: Boolean(data.alive),
        trading: Boolean(data.trading),
        marketOpen: Boolean(data.marketOpen),
        pricesFresh: Boolean(data.pricesFresh),
        schedulerAlive: Boolean(data.schedulerAlive),
        latestPriceAt: (data.latestPriceAt as string | null) || null,
      });
    } catch (err) {
      console.error("Failed to fetch health:", err);
    }
  }, []);

  const fetchIndicators = useCallback(async () => {
    try {
      const res = await fetch(`/api/indicators?symbol=${PRIMARY_SYMBOL}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.indicators) setTechIndicators(data.indicators);
      if (data.quote) {
        setQuoteData(prev => {
          // Trigger flash if price changed
          if (prev && prev.price !== data.quote.price) {
            priceFlashKey.current += 1;
            setPriceFlash(true);
            setTimeout(() => setPriceFlash(false), 1200);
          }
          return data.quote;
        });
      }
    } catch (err) {
      console.error("Failed to fetch indicators:", err);
    }
  }, []);

  const fetchPriceHistory = useCallback(async () => {
    try {
      const res = await fetch(`/api/prices?symbol=${PRIMARY_SYMBOL}&limit=100`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.prices) setPriceHistory(data.prices);
    } catch (err) {
      console.error("Failed to fetch price history:", err);
    }
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const [hRes, dRes, tRes] = await Promise.all([
        fetch("/api/holdings"),
        fetch("/api/decisions"),
        fetch("/api/trades"),
      ]);
      if (hRes.ok) {
        const hData = await hRes.json();
        setHoldings(hData.holdings || []);
        setTotalValue(hData.totalValueUsd || 0);
      }
      if (dRes.ok) {
        const dData = await dRes.json();
        setDecisions(dData.decisions || []);
      }
      if (tRes.ok) {
        const tData = await tRes.json();
        setTrades(tData.trades || []);
      }
      await Promise.all([fetchHealth(), fetchIndicators(), fetchPriceHistory()]);
      setLastUpdate(new Date());
    } catch (err) {
      console.error("Failed to fetch data:", err);
    }
    setLoading(false);
  }, [fetchHealth, fetchIndicators, fetchPriceHistory]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh: health 30s, indicators+prices 30s
  useEffect(() => {
    const healthTimer = setInterval(fetchHealth, 30000);
    const indicatorTimer = setInterval(() => {
      fetchIndicators();
      fetchPriceHistory();
    }, 30000);
    return () => {
      clearInterval(healthTimer);
      clearInterval(indicatorTimer);
    };
  }, [fetchHealth, fetchIndicators, fetchPriceHistory]);

  async function handleAction(action: string) {
    setActionLoading(action);
    try {
      const endpoint =
        action === "prices" ? "/api/prices"
          : action === "decisions" ? "/api/decisions"
            : action === "seed" ? "/api/seed"
              : "/api/report";
      await fetch(endpoint, { method: "POST" });
      await fetchData();
    } catch (err) {
      console.error(`Action ${action} failed:`, err);
    }
    setActionLoading("");
  }

  const totalPnl = holdings.reduce((sum, h) => sum + (h.pnl || 0), 0);
  const totalCost = holdings.reduce((sum, h) => sum + (h.costBasis || 0), 0);
  const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;

  const primaryHolding = holdings.find(h => h.symbol === PRIMARY_SYMBOL || h.symbol.includes("01810"));

  const monitoring = useMemo(() => {
    if (!primaryHolding) return null;
    const shares = parseFloat(primaryHolding.shares) || 0;
    const costPrice = primaryHolding.cost_price ? parseFloat(primaryHolding.cost_price) : null;
    const currentPrice = quoteData?.price ?? (primaryHolding.current_price ? parseFloat(primaryHolding.current_price) : null);
    const currency = quoteData?.currency ?? primaryHolding.price_currency ?? "HKD";

    if (!currentPrice || !costPrice || shares <= 0) return null;

    const totalCostVal = shares * costPrice;
    const marketValue = shares * currentPrice;
    const pnl = marketValue - totalCostVal;
    const pnlPct = (pnl / totalCostVal) * 100;
    const breakEvenPrice = costPrice;
    const priceToBreakEven = costPrice - currentPrice;
    const pctToBreakEven = currentPrice > 0 ? (priceToBreakEven / currentPrice) * 100 : 0;

    const tBuyActive =
      techIndicators?.bollingerPosition != null &&
      techIndicators?.rsi14 != null &&
      techIndicators.bollingerPosition < 0.1 &&
      techIndicators.rsi14 < 30;

    const averageDownOpportunity = currentPrice < costPrice * 0.95 &&
      ((techIndicators?.bollingerPosition ?? 1) < 0.3 || (techIndicators?.rsi14 ?? 100) < 40);

    const profitTakingOpportunity = currentPrice > costPrice * 1.03;

    return {
      shares, costPrice, currentPrice, currency,
      totalCost: totalCostVal, marketValue, pnl, pnlPct,
      breakEvenPrice, priceToBreakEven, pctToBreakEven,
      tBuyActive, averageDownOpportunity, profitTakingOpportunity,
    };
  }, [primaryHolding, quoteData, techIndicators]);

  const chartData = useMemo(() => {
    if (priceHistory.length === 0) return [];
    return [...priceHistory]
      .reverse()
      .map(p => ({
        date: new Date(p.created_at).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" }),
        time: new Date(p.created_at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }),
        value: parseFloat(p.price) || 0,
      }))
      .filter(p => p.value > 0);
  }, [priceHistory]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-muted text-sm">正在加载盯盘数据...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border bg-surface/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="w-full px-3 md:px-6 lg:px-8 h-14 md:h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 md:gap-3">
            <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="w-4.5 h-4.5 text-accent" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2 20h20M5 20V9l3-3 4 4 4-8 4 6v12" />
              </svg>
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-tight">盯盘终端</h1>
              <p className="text-[10px] text-muted-dark uppercase tracking-widest hidden sm:block">STOCK MONITOR</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 md:gap-2">
            {lastUpdate && (
              <span className="text-[11px] text-muted-dark mr-1 md:mr-3 font-mono hidden sm:inline-flex items-center">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-profit mr-1.5 pulse-dot" />
                {lastUpdate.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}
              </span>
            )}
            <SystemLiveBadge health={health} />
            <HeaderButton label="更新价格" loading={actionLoading === "prices"} onClick={() => handleAction("prices")} icon="↻" />
            <HeaderButton label="AI 分析" loading={actionLoading === "decisions"} onClick={() => handleAction("decisions")} variant="primary" icon="🧠" />
            <button
              onClick={() => setShowSettings(true)}
              className="px-2 py-1.5 rounded-lg text-xs font-medium bg-surface-elevated text-muted border border-border hover:border-accent/40 transition-colors"
              title="设置"
            >
              ⚙️
            </button>
          </div>
        </div>
      </header>

      <main className="w-full px-3 md:px-6 lg:px-8 py-4 md:py-6 space-y-4 md:space-y-5">
        {/* Primary Stock Monitoring Panel */}
        {monitoring && (
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
                <h3 className="text-xs font-bold text-muted-dark uppercase tracking-wider mb-3">持仓信息</h3>
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
        )}

        {/* Technical Indicators */}
        {techIndicators && techIndicators.dataPoints >= 5 && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <IndCard label="RSI(14)" value={techIndicators.rsi14?.toFixed(1) ?? "—"} signal={techIndicators.rsiSignal === "oversold" ? "超卖" : techIndicators.rsiSignal === "overbought" ? "超买" : "中性"} sType={techIndicators.rsiSignal === "oversold" ? "buy" : techIndicators.rsiSignal === "overbought" ? "sell" : "neutral"} />
            <IndCard label="布林带位置" value={techIndicators.bollingerPosition != null ? `${(techIndicators.bollingerPosition * 100).toFixed(0)}%` : "—"} signal={techIndicators.bollingerPosition != null ? (techIndicators.bollingerPosition < 0.2 ? "下轨支撑" : techIndicators.bollingerPosition > 0.8 ? "上轨压力" : "通道中部") : "—"} sType={techIndicators.bollingerPosition != null ? (techIndicators.bollingerPosition < 0.2 ? "buy" : techIndicators.bollingerPosition > 0.8 ? "sell" : "neutral") : "neutral"} />
            <IndCard label="MACD" value={techIndicators.macdHistogram?.toFixed(3) ?? "—"} signal={techIndicators.macdBullish === true ? "多头" : techIndicators.macdBullish === false ? "空头" : "—"} sType={techIndicators.macdBullish === true ? "buy" : techIndicators.macdBullish === false ? "sell" : "neutral"} />
            <IndCard label="成交量" value={techIndicators.volumeRatio != null ? `${techIndicators.volumeRatio.toFixed(2)}x` : "—"} signal={techIndicators.suddenVolumeSpike ? "⚠️ 放量" : techIndicators.volumeTrend === "increasing" ? "量增" : techIndicators.volumeTrend === "decreasing" ? "缩量" : "平稳"} sType={techIndicators.suddenVolumeSpike ? "alert" : "neutral"} />
            <IndCard label="均线趋势" value={techIndicators.maShortAboveLong === true ? "多排" : techIndicators.maShortAboveLong === false ? "空排" : "—"} signal={techIndicators.maGoldenCross === true ? "金叉" : techIndicators.maGoldenCross === false ? "死叉" : "—"} sType={techIndicators.maShortAboveLong === true ? "buy" : techIndicators.maShortAboveLong === false ? "sell" : "neutral"} />
            <IndCard label="综合评分" value={`${techIndicators.technicalScore}`} signal={techIndicators.technicalSignal === "strong_buy" ? "强烈买入" : techIndicators.technicalSignal === "buy" ? "买入" : techIndicators.technicalSignal === "sell" ? "卖出" : techIndicators.technicalSignal === "strong_sell" ? "强烈卖出" : "中性"} sType={techIndicators.technicalSignal.includes("buy") ? "buy" : techIndicators.technicalSignal.includes("sell") ? "sell" : "neutral"} />
          </div>
        )}

        {/* Portfolio Summary */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MetricCard label="组合总值" value={fmtCcy(totalValue, "USD")} icon="💼" accent />
          <MetricCard label="总盈亏" value={`${totalPnl >= 0 ? "+" : ""}${fmtCcy(totalPnl, "USD")}`} subtitle={`${totalPnlPct >= 0 ? "+" : ""}${totalPnlPct.toFixed(2)}%`} icon="📈" trend={totalPnl >= 0 ? "up" : "down"} />
          <MetricCard label="持仓数" value={String(holdings.length)} subtitle={`${trades.length} 笔交易`} icon="📊" />
          <MetricCard label="AI 决策" value={String(decisions.length)} subtitle={decisions[0] ? `最新: ${decisions[0].action} ${decisions[0].symbol}` : "暂无决策"} icon="🧠" />
        </div>

        {/* Holdings Table */}
        <HoldingsTable holdings={holdings} />

        {/* Multi-tab Panel: Decisions / Trades / History / Logs */}
        <section className="bg-surface border border-border rounded-2xl overflow-hidden">
          <div className="flex items-center border-b border-border overflow-x-auto">
            {(["decisions", "trades", "history", "logs"] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)} className={`px-4 md:px-5 py-3.5 text-sm font-medium transition-colors whitespace-nowrap ${activeTab === tab ? "text-accent border-b-2 border-accent -mb-px" : "text-muted-dark hover:text-muted"}`}>
                {tab === "decisions" ? "AI 决策" : tab === "trades" ? "交易记录" : tab === "history" ? "价格历史" : "运行日志"}
              </button>
            ))}
          </div>
          <div className="p-3 md:p-5">
            {activeTab === "decisions" && <DecisionsList decisions={decisions} />}
            {activeTab === "trades" && <TradesList trades={trades} />}
            {activeTab === "history" && <HistoryPanel />}
            {activeTab === "logs" && <LogsPanel />}
          </div>
        </section>
      </main>

      <footer className="border-t border-border mt-8">
        <div className="w-full px-3 md:px-6 lg:px-8 py-4 flex flex-col sm:flex-row items-center justify-between gap-1 text-xs text-muted-dark">
          <span>盯盘终端 v2.0 — 港股智能监控</span>
          <span className="font-mono">AI 驱动 · 实时行情 · 做T策略</span>
        </div>
      </footer>

      {/* Settings Modal */}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
}

/* ============ History Panel (lazy-loaded data) ============ */

function HistoryPanel() {
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [symbols, setSymbols] = useState<string[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const fetchHistory = useCallback(async (symbol?: string) => {
    setLoading(true);
    try {
      const url = symbol ? `/api/history?symbol=${encodeURIComponent(symbol)}` : "/api/history";
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setHistory(data.history || []);
        if (data.symbols?.length) setSymbols(data.symbols);
      }
    } catch (err) {
      console.error("Failed to fetch history:", err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchHistory(selectedSymbol || undefined); }, [selectedSymbol, fetchHistory]);

  const chartData = useMemo(() => {
    const src = selectedSymbol ? history.filter(h => h.symbol === selectedSymbol) : history;
    return [...src].reverse().map(h => ({
      date: new Date(h.created_at).toLocaleDateString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
      price: parseFloat(h.price),
      symbol: h.symbol,
    }));
  }, [history, selectedSymbol]);

  const chartSymbol = selectedSymbol || symbols[0] || "";
  const filteredChartData = chartSymbol ? chartData.filter(d => d.symbol === chartSymbol) : chartData;

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <label className="text-xs text-muted font-medium">代码筛选:</label>
        <select value={selectedSymbol} onChange={e => setSelectedSymbol(e.target.value)} className="bg-surface-elevated border border-border rounded-lg px-3 py-1.5 text-xs font-mono text-foreground focus:outline-none focus:border-accent">
          <option value="">全部</option>
          {symbols.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {filteredChartData.length > 0 && (
        <div className="h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={filteredChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
              <XAxis dataKey="date" stroke="#30363d" tick={{ fill: "#484f58", fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis stroke="#30363d" tick={{ fill: "#484f58", fontSize: 10 }} axisLine={false} tickLine={false} domain={["auto", "auto"]} width={60} />
              <Tooltip contentStyle={{ backgroundColor: "#161b22", border: "1px solid #30363d", borderRadius: "12px", fontSize: "12px", color: "#e8eaed" }} />
              <Line type="monotone" dataKey="price" stroke="#58a6ff" strokeWidth={2} dot={{ r: 2, fill: "#58a6ff" }} activeDot={{ r: 4, fill: "#79c0ff" }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {history.length === 0 ? (
        <div className="py-6 text-center text-muted-dark text-sm">暂无历史记录</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted-dark uppercase tracking-wider border-b border-border">
                <th className="text-left px-3 py-2 font-medium">时间</th>
                <th className="text-left px-3 py-2 font-medium">代码</th>
                <th className="text-right px-3 py-2 font-medium">价格</th>
                <th className="text-right px-3 py-2 font-medium">涨跌</th>
                <th className="text-right px-3 py-2 font-medium">涨跌%</th>
                <th className="text-right px-3 py-2 font-medium hidden lg:table-cell">PE</th>
                <th className="text-right px-3 py-2 font-medium hidden lg:table-cell">市值</th>
              </tr>
            </thead>
            <tbody>
              {history.slice(0, 50).map(h => {
                const chg = parseFloat(h.change || "0");
                return (
                  <tr key={h.id} className="border-b border-border/30 table-row-hover">
                    <td className="px-3 py-2 text-muted-dark font-mono">{new Date(h.created_at).toLocaleString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
                    <td className="px-3 py-2 font-mono font-semibold text-accent">{h.symbol}</td>
                    <td className="px-3 py-2 text-right font-mono">{formatNum(h.price)}</td>
                    <td className={`px-3 py-2 text-right font-mono ${chg >= 0 ? "text-profit" : "text-loss"}`}>{h.change ? `${chg >= 0 ? "+" : ""}${formatNum(h.change)}` : "—"}</td>
                    <td className={`px-3 py-2 text-right font-mono ${chg >= 0 ? "text-profit" : "text-loss"}`}>{h.change_percent ? `${parseFloat(h.change_percent) >= 0 ? "+" : ""}${parseFloat(h.change_percent).toFixed(2)}%` : "—"}</td>
                    <td className="px-3 py-2 text-right font-mono text-muted hidden lg:table-cell">{h.pe_ratio ? parseFloat(h.pe_ratio).toFixed(1) : "—"}</td>
                    <td className="px-3 py-2 text-right font-mono text-muted hidden lg:table-cell">{formatMarketCap(h.market_cap)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ============ Logs Panel (lazy-loaded data) ============ */

function LogsPanel() {
  const [logs, setLogs] = useState<TaskLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedTask, setExpandedTask] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/logs");
        if (res.ok) {
          const data = await res.json();
          setLogs(data.logs || []);
        }
      } catch (err) {
        console.error("Failed to fetch logs:", err);
      }
      setLoading(false);
    })();
  }, []);

  if (loading) return <LoadingSpinner />;
  if (logs.length === 0) return <div className="py-6 text-center text-muted-dark text-sm">暂无运行日志</div>;

  return (
    <div className="space-y-3">
      {/* Summary */}
      <div className="flex items-center gap-4 text-xs text-muted-dark font-mono">
        <span>共 {logs.length} 次运行</span>
        {logs[0] && <span>最近: {formatTimestamp(logs[0].timestamp)}</span>}
      </div>

      <div className="divide-y divide-border/50 border border-border rounded-xl overflow-hidden">
        {logs.map(log => {
          const isExpanded = expandedTask === log.timestamp;
          const uniqueSymbols = [...new Set(log.symbols)];
          const hasErrors = log.records.some(r => !r.price || parseFloat(r.price) <= 0);
          return (
            <div key={log.timestamp}>
              <button onClick={() => setExpandedTask(isExpanded ? null : log.timestamp)} className="w-full px-4 py-3 flex items-center justify-between table-row-hover text-left">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${hasErrors ? "bg-hold" : "bg-profit"}`} />
                  <div>
                    <span className="text-xs font-medium">{formatTimestamp(log.timestamp)}</span>
                    <span className="block text-[10px] text-muted-dark font-mono">{uniqueSymbols.join(", ")}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${hasErrors ? "text-hold border-hold" : "text-profit border-profit"}`}>
                    {hasErrors ? "PARTIAL" : "OK"}
                  </span>
                  <span className="text-muted-dark text-xs">{isExpanded ? "▲" : "▼"}</span>
                </div>
              </button>
              {isExpanded && (
                <div className="px-4 pb-3 bg-surface-elevated/50">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-muted-dark uppercase tracking-wider border-b border-border">
                        <th className="text-left px-2 py-1.5 font-medium">代码</th>
                        <th className="text-right px-2 py-1.5 font-medium">价格</th>
                        <th className="text-right px-2 py-1.5 font-medium">涨跌</th>
                      </tr>
                    </thead>
                    <tbody>
                      {log.records.map((r, i) => {
                        const chg = parseFloat(r.change || "0");
                        return (
                          <tr key={i} className="border-b border-border/30">
                            <td className="px-2 py-1.5 font-mono text-accent">{r.symbol}</td>
                            <td className="px-2 py-1.5 text-right font-mono">{parseFloat(r.price).toFixed(2)} {r.currency}</td>
                            <td className={`px-2 py-1.5 text-right font-mono ${chg >= 0 ? "text-profit" : "text-loss"}`}>
                              {r.change ? `${chg >= 0 ? "+" : ""}${parseFloat(r.change).toFixed(2)}` : "—"}
                              {r.change_percent ? ` (${parseFloat(r.change_percent).toFixed(2)}%)` : ""}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ============ Settings Modal ============ */

function SettingsModal({ onClose }: { onClose: () => void }) {
  const [settings, setSettings] = useState<SymbolSetting[]>([]);
  const [globalAutoTrade, setGlobalAutoTradeState] = useState(true);
  const [symbol, setSymbol] = useState("");
  const [name, setName] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [autoTrade, setAutoTrade] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settings");
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setSettings(data.settings || []);
      setGlobalAutoTradeState(Boolean(data.globalAutoTrade));
    } catch (err) {
      console.error("Failed to fetch settings:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  async function addSymbol(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!symbol.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: symbol.trim().toUpperCase(), name: name.trim(), enabled, autoTrade }),
      });
      if (!res.ok) throw new Error(await res.text());
      setSymbol(""); setName("");
      await fetchSettings();
    } catch (err) {
      console.error("Failed to add symbol:", err);
    } finally {
      setSaving(false);
    }
  }

  async function updateSetting(payload: Record<string, unknown>) {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error(await res.text());
      await fetchSettings();
    } catch (err) {
      console.error("Failed to update setting:", err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-surface border border-border rounded-2xl w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-surface z-10">
          <h2 className="text-sm font-bold">交易设置</h2>
          <button onClick={onClose} className="text-muted-dark hover:text-foreground text-lg">✕</button>
        </div>
        <div className="p-5 space-y-4">
          {/* Global Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm font-medium">全局自动交易</span>
              <p className="text-[11px] text-muted-dark mt-0.5">开启后符合条件的股票将自动模拟交易</p>
            </div>
            <button onClick={() => updateSetting({ globalAutoTrade: !globalAutoTrade })} disabled={saving}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${globalAutoTrade ? "bg-accent text-background border-accent" : "bg-surface-elevated text-muted border-border"}`}>
              {globalAutoTrade ? "已开启" : "已关闭"}
            </button>
          </div>

          {/* Add Symbol Form */}
          <form onSubmit={addSymbol} className="space-y-2">
            <div className="text-xs font-medium text-muted mb-1">添加股票</div>
            <div className="grid grid-cols-2 gap-2">
              <input value={symbol} onChange={e => setSymbol(e.target.value)} placeholder="代码 (e.g. 01810.HK)" className="bg-surface-elevated border border-border rounded-lg px-3 py-2 text-xs font-mono" required />
              <input value={name} onChange={e => setName(e.target.value)} placeholder="名称 (可选)" className="bg-surface-elevated border border-border rounded-lg px-3 py-2 text-xs" />
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} /> 启用</label>
              <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={autoTrade} onChange={e => setAutoTrade(e.target.checked)} /> 自动交易</label>
              <button type="submit" disabled={saving} className="ml-auto px-3 py-1.5 rounded-lg text-xs font-medium bg-accent text-background">{saving ? "保存中..." : "添加"}</button>
            </div>
          </form>

          {/* Symbol List */}
          {loading ? <LoadingSpinner /> : settings.length === 0 ? (
            <div className="text-xs text-muted-dark py-3">暂无配置的股票</div>
          ) : (
            <div className="divide-y divide-border/50 border border-border rounded-xl overflow-hidden">
              {settings.map(s => (
                <div key={s.symbol} className="px-4 py-2.5 flex items-center justify-between">
                  <div>
                    <div className="font-mono text-xs text-accent">{s.symbol}</div>
                    <div className="text-[10px] text-muted-dark">{s.name}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="text-[11px] flex items-center gap-1">
                      <input type="checkbox" checked={s.enabled} onChange={e => updateSetting({ symbol: s.symbol, enabled: e.target.checked })} disabled={saving} />
                      启用
                    </label>
                    <label className="text-[11px] flex items-center gap-1">
                      <input type="checkbox" checked={s.autoTrade} onChange={e => updateSetting({ symbol: s.symbol, autoTrade: e.target.checked })} disabled={saving} />
                      自动
                    </label>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============ Sub-components ============ */

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-8">
      <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function HoldingsTable({ holdings }: { holdings: Holding[] }) {
  return (
    <section className="bg-surface border border-border rounded-2xl overflow-hidden">
      <div className="px-4 md:px-5 py-3 md:py-4 border-b border-border flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted">全部持仓</h2>
        <span className="text-[11px] text-muted-dark font-mono">{holdings.length} 只</span>
      </div>
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted-dark text-[11px] uppercase tracking-wider border-b border-border">
              <th className="text-left px-5 py-3 font-medium">代码</th>
              <th className="text-left px-5 py-3 font-medium">名称</th>
              <th className="text-right px-5 py-3 font-medium">持仓</th>
              <th className="text-right px-5 py-3 font-medium">现价</th>
              <th className="text-right px-5 py-3 font-medium">成本</th>
              <th className="text-right px-5 py-3 font-medium">市值</th>
              <th className="text-right px-5 py-3 font-medium">盈亏</th>
              <th className="text-right px-5 py-3 font-medium">更新</th>
            </tr>
          </thead>
          <tbody>
            {holdings.map(h => (
              <tr key={h.symbol} className="border-b border-border/50 table-row-hover">
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-accent/10 flex items-center justify-center">
                      <span className="text-[10px] font-bold text-accent">{h.symbol.substring(0, 2)}</span>
                    </div>
                    <span className="font-mono font-semibold text-accent">{h.symbol}</span>
                  </div>
                </td>
                <td className="px-5 py-3.5 text-muted">{h.name}</td>
                <td className="px-5 py-3.5 text-right font-mono">{parseFloat(h.shares).toLocaleString()}</td>
                <td className="px-5 py-3.5 text-right font-mono">{h.current_price ? fmtCcy(parseFloat(h.current_price), h.price_currency) : <span className="text-muted-dark">—</span>}</td>
                <td className="px-5 py-3.5 text-right font-mono">{h.cost_price ? fmtCcy(parseFloat(h.cost_price), h.price_currency) : <span className="text-muted-dark">—</span>}</td>
                <td className="px-5 py-3.5 text-right font-mono font-medium">{h.marketValue > 0 ? fmtCcy(h.marketValue, "USD") : <span className="text-muted-dark">—</span>}</td>
                <td className="px-5 py-3.5 text-right">
                  {h.pnl != null ? (
                    <div className={`font-mono ${h.pnl >= 0 ? "text-profit" : "text-loss"}`}>
                      <span className="font-medium">{h.pnl >= 0 ? "+" : ""}{fmtCcy(h.pnl, "USD")}</span>
                      <span className="block text-[11px] opacity-75">{h.pnlPct! >= 0 ? "+" : ""}{h.pnlPct!.toFixed(2)}%</span>
                    </div>
                  ) : <span className="text-muted-dark">—</span>}
                </td>
                <td className="px-5 py-3.5 text-right text-muted-dark text-xs font-mono">{h.updated_at ? fmtTime(h.updated_at) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Mobile */}
      <div className="md:hidden divide-y divide-border/50">
        {holdings.map(h => (
          <div key={h.symbol} className="px-4 py-3 table-row-hover">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-accent/10 flex items-center justify-center">
                  <span className="text-[10px] font-bold text-accent">{h.symbol.substring(0, 2)}</span>
                </div>
                <div>
                  <span className="font-mono font-semibold text-accent text-sm">{h.symbol}</span>
                  <span className="block text-[11px] text-muted truncate max-w-[140px]">{h.name}</span>
                </div>
              </div>
              {h.pnl != null ? (
                <div className={`text-right font-mono ${h.pnl >= 0 ? "text-profit" : "text-loss"}`}>
                  <span className="text-sm font-medium">{h.pnl >= 0 ? "+" : ""}{fmtCcy(h.pnl, "USD")}</span>
                  <span className="block text-[11px] opacity-75">{h.pnlPct! >= 0 ? "+" : ""}{h.pnlPct!.toFixed(2)}%</span>
                </div>
              ) : <span className="text-muted-dark text-sm">—</span>}
            </div>
            <div className="flex items-center justify-between text-xs text-muted-dark font-mono">
              <span>{parseFloat(h.shares).toLocaleString()} 股</span>
              <span>{h.current_price ? fmtCcy(parseFloat(h.current_price), h.price_currency) : "—"}</span>
              <span>{h.marketValue > 0 ? fmtCcy(h.marketValue, "USD") : "—"}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
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

function IndCard({ label, value, signal, sType }: { label: string; value: string; signal: string; sType: "buy" | "sell" | "neutral" | "alert" }) {
  const border = sType === "buy" ? "border-profit/30" : sType === "sell" ? "border-loss/30" : sType === "alert" ? "border-hold/30" : "border-border";
  const bg = sType === "buy" ? "bg-profit/5" : sType === "sell" ? "bg-loss/5" : sType === "alert" ? "bg-hold/5" : "bg-surface";
  const color = sType === "buy" ? "text-profit" : sType === "sell" ? "text-loss" : sType === "alert" ? "text-hold" : "text-muted";
  return (
    <div className={`rounded-xl p-3 border ${border} ${bg}`}>
      <div className="text-[10px] text-muted-dark uppercase tracking-wider mb-1">{label}</div>
      <div className="text-lg font-mono font-bold">{value}</div>
      <div className={`text-[11px] font-medium mt-0.5 ${color}`}>{signal}</div>
    </div>
  );
}

function DecisionsList({ decisions }: { decisions: Decision[] }) {
  if (decisions.length === 0) return <div className="py-8 text-center text-muted-dark">暂无 AI 决策</div>;
  return (
    <div className="space-y-3">
      {decisions.map(d => (
        <div key={d.id} className="bg-surface-elevated border border-border rounded-xl p-3 md:p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold text-accent">{d.symbol}</span>
              <ActionBadge action={d.action} />
              <span className="text-xs text-muted-dark">{d.confidence}% 置信度</span>
            </div>
            <span className="text-muted-dark text-[11px] font-mono">{fmtTime(d.created_at)}</span>
          </div>
          <p className="text-muted text-[13px] leading-relaxed">{d.reasoning}</p>
        </div>
      ))}
    </div>
  );
}

function TradesList({ trades }: { trades: Trade[] }) {
  if (trades.length === 0) return <div className="py-8 text-center text-muted-dark">暂无交易记录</div>;
  return (
    <div className="space-y-2">
      {trades.map(t => (
        <div key={t.id} className="bg-surface-elevated border border-border rounded-xl p-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="font-mono font-bold text-accent">{t.symbol}</span>
            <ActionBadge action={t.action} />
            <span className="text-xs text-muted">{t.shares} 股 @ {fmtCcy(parseFloat(t.price), t.currency)}</span>
          </div>
          <span className="text-muted-dark text-[11px] font-mono">{fmtTime(t.created_at)}</span>
        </div>
      ))}
    </div>
  );
}

function MetricCard({ label, value, subtitle, icon, accent, trend }: { label: string; value: string; subtitle?: string; icon: string; accent?: boolean; trend?: "up" | "down" }) {
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

function ActionBadge({ action }: { action: string }) {
  const color = action === "BUY" ? "text-profit" : action === "SELL" ? "text-loss" : "text-hold";
  return <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border border-current ${color}`}>{action}</span>;
}

function HeaderButton({ label, loading, onClick, variant, icon }: { label: string; loading: boolean; onClick: () => void; variant?: string; icon: string }) {
  return (
    <button onClick={onClick} disabled={loading} className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-opacity ${variant === "primary" ? "bg-accent text-background" : "bg-surface-elevated text-muted border border-border"}`}>
      {loading ? <span className="animate-spin text-lg">◌</span> : <span>{icon}</span>}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function SystemLiveBadge({ health }: { health: HealthStatus | null }) {
  const live = health?.alive ?? false;
  const marketOpen = health?.marketOpen ?? false;
  const pricesFresh = health?.pricesFresh ?? false;
  const schedulerAlive = health?.schedulerAlive ?? false;
  const trading = health?.trading ?? false;
  const dotClass = live && schedulerAlive ? "bg-profit" : "bg-hold";
  const ringClass = live && schedulerAlive ? "bg-profit/50" : "bg-hold/50";
  const textClass = live && schedulerAlive ? "text-profit border-profit/30" : "text-hold border-hold/40";
  return (
    <div className={`hidden lg:inline-flex items-center gap-2 px-2.5 py-1 rounded-full border text-[10px] font-mono mr-1 ${textClass}`}>
      <span className="relative inline-flex h-2.5 w-2.5">
        <span className={`absolute inline-flex h-full w-full rounded-full ${ringClass} animate-ping`} />
        <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${dotClass}`} />
      </span>
      <span>{live ? "在线" : "离线"}</span>
      <span className="text-muted-dark">·</span>
      <span>{marketOpen ? "开市" : "休市"}</span>
      <span className="text-muted-dark">·</span>
      <span>{trading ? "交易中" : "监控中"}</span>
      <span className="text-muted-dark">·</span>
      <span>{pricesFresh ? "价格最新" : "价格过期"}</span>
    </div>
  );
}

/* ============ Helpers ============ */

function fmtCcy(value: number, currency: string): string {
  const sym = currency === "USD" ? "$" : currency === "CNY" ? "¥" : currency === "HKD" ? "HK$" : currency;
  return `${sym}${Math.abs(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function formatTimestamp(ts: string): string {
  return new Date(ts).toLocaleString("zh-CN", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatNum(val: string | null): string {
  if (!val) return "—";
  const n = parseFloat(val);
  return isNaN(n) ? "—" : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatMarketCap(val: string | null): string {
  if (!val) return "—";
  const n = parseFloat(val);
  if (isNaN(n)) return "—";
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  return `$${n.toLocaleString()}`;
}
