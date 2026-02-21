"use client";

import { useEffect, useState, useCallback } from "react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from "recharts";

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

const PIE_COLORS = ["#58a6ff", "#a855f7", "#3fb950", "#d29922", "#f85149", "#79c0ff"];

export default function DashboardPage() {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [totalValue, setTotalValue] = useState(0);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState("");
  const [activeTab, setActiveTab] = useState<"decisions" | "trades">("decisions");
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

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
      setLastUpdate(new Date());
    } catch (err) {
      console.error("Failed to fetch data:", err);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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

  // Allocation data for pie chart
  const allocationData = holdings
    .filter(h => h.marketValue > 0)
    .map(h => ({ name: h.symbol, value: h.marketValue }));

  // Simulated portfolio value history for area chart
  const chartData = generatePortfolioChart(totalValue);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-muted text-sm">Loading portfolio data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border bg-surface/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-[1400px] mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="w-4.5 h-4.5 text-accent" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2 20h20M5 20V9l3-3 4 4 4-8 4 6v12" />
              </svg>
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-tight">Stock Tracker</h1>
              <p className="text-[10px] text-muted-dark uppercase tracking-widest">Portfolio Intelligence</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {lastUpdate && (
              <span className="text-[11px] text-muted-dark mr-3 font-mono">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-profit mr-1.5 pulse-dot" />
                {lastUpdate.toLocaleTimeString()}
              </span>
            )}
            <HeaderButton
              label="Seed DB"
              loading={actionLoading === "seed"}
              onClick={() => handleAction("seed")}
              icon={<IconDatabase />}
            />
            <HeaderButton
              label="Update Prices"
              loading={actionLoading === "prices"}
              onClick={() => handleAction("prices")}
              icon={<IconRefresh />}
            />
            <HeaderButton
              label="AI Analysis"
              loading={actionLoading === "decisions"}
              onClick={() => handleAction("decisions")}
              variant="primary"
              icon={<IconBrain />}
            />
          </div>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-6 py-6 space-y-6">
        {/* Portfolio Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            label="Portfolio Value"
            value={formatCurrency(totalValue)}
            icon={<IconWallet />}
            accent
          />
          <MetricCard
            label="Total P&L"
            value={`${totalPnl >= 0 ? "+" : ""}${formatCurrency(totalPnl)}`}
            subtitle={`${totalPnlPct >= 0 ? "+" : ""}${totalPnlPct.toFixed(2)}%`}
            icon={<IconTrend />}
            trend={totalPnl >= 0 ? "up" : "down"}
          />
          <MetricCard
            label="Holdings"
            value={String(holdings.length)}
            subtitle={`${trades.length} trades executed`}
            icon={<IconPieChart />}
          />
          <MetricCard
            label="AI Decisions"
            value={String(decisions.length)}
            subtitle={decisions[0] ? `Last: ${decisions[0].action} ${decisions[0].symbol}` : "No decisions yet"}
            icon={<IconBrain />}
          />
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Portfolio Value Chart */}
          <div className="lg:col-span-2 bg-surface border border-border rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-muted">Portfolio Performance</h2>
              <span className="text-xs text-muted-dark font-mono">30 Day View</span>
            </div>
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#58a6ff" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="#58a6ff" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="date"
                    stroke="#30363d"
                    tick={{ fill: "#484f58", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    stroke="#30363d"
                    tick={{ fill: "#484f58", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
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
                    formatter={(value: number | undefined) => [`$${(value ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}`, "Value"]}
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="#58a6ff"
                    strokeWidth={2}
                    fill="url(#colorValue)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Allocation Pie */}
          <div className="bg-surface border border-border rounded-2xl p-5">
            <h2 className="text-sm font-semibold text-muted mb-4">Allocation</h2>
            {allocationData.length > 0 ? (
              <>
                <div className="h-[180px] flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={allocationData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={75}
                        paddingAngle={3}
                        dataKey="value"
                        strokeWidth={0}
                      >
                        {allocationData.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#161b22",
                          border: "1px solid #30363d",
                          borderRadius: "12px",
                          fontSize: "12px",
                          color: "#e8eaed",
                        }}
                        formatter={(value: number | undefined) => [`$${(value ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}`, "Value"]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-2 mt-2">
                  {allocationData.map((item, i) => {
                    const pct = totalValue > 0 ? (item.value / totalValue * 100) : 0;
                    return (
                      <div key={item.name} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                          <span className="font-mono text-muted">{item.name}</span>
                        </div>
                        <span className="font-mono text-foreground">{pct.toFixed(1)}%</span>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-muted-dark text-sm">
                No allocation data
              </div>
            )}
          </div>
        </div>

        {/* Holdings Table */}
        <section className="bg-surface border border-border rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <h2 className="text-sm font-semibold text-muted">Holdings</h2>
            <span className="text-[11px] text-muted-dark font-mono">{holdings.length} positions</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-dark text-[11px] uppercase tracking-wider border-b border-border">
                  <th className="text-left px-5 py-3 font-medium">Symbol</th>
                  <th className="text-left px-5 py-3 font-medium">Name</th>
                  <th className="text-right px-5 py-3 font-medium">Shares</th>
                  <th className="text-right px-5 py-3 font-medium">Price</th>
                  <th className="text-right px-5 py-3 font-medium">Cost</th>
                  <th className="text-right px-5 py-3 font-medium">Mkt Value</th>
                  <th className="text-right px-5 py-3 font-medium">P&L</th>
                  <th className="text-right px-5 py-3 font-medium">Updated</th>
                </tr>
              </thead>
              <tbody>
                {holdings.map((h) => (
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
                    <td className="px-5 py-3.5 text-right font-mono">
                      {h.current_price
                        ? <span>{parseFloat(h.current_price).toFixed(2)} <span className="text-muted-dark text-xs">{h.price_currency}</span></span>
                        : <span className="text-muted-dark">—</span>}
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono">
                      {h.cost_price
                        ? <span>{parseFloat(h.cost_price).toFixed(2)} <span className="text-muted-dark text-xs">{h.cost_currency}</span></span>
                        : <span className="text-muted-dark">—</span>}
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono font-medium">
                      {h.marketValue > 0
                        ? formatCurrency(h.marketValue)
                        : <span className="text-muted-dark">—</span>}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      {h.pnl !== null ? (
                        <div className={`font-mono ${h.pnl >= 0 ? "text-profit" : "text-loss"}`}>
                          <span className="font-medium">{h.pnl >= 0 ? "+" : ""}{formatCurrency(h.pnl)}</span>
                          <span className="block text-[11px] opacity-75">{h.pnlPct! >= 0 ? "+" : ""}{h.pnlPct!.toFixed(2)}%</span>
                        </div>
                      ) : <span className="text-muted-dark">—</span>}
                    </td>
                    <td className="px-5 py-3.5 text-right text-muted-dark text-xs font-mono">
                      {h.updated_at ? formatTime(h.updated_at) : "—"}
                    </td>
                  </tr>
                ))}
                {holdings.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-5 py-12 text-center text-muted-dark">
                      <div className="flex flex-col items-center gap-2">
                        <IconDatabase className="w-8 h-8 opacity-30" />
                        <p>No holdings. Click <strong>&quot;Seed DB&quot;</strong> to initialize.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* AI Decisions & Trades Tabs */}
        <section className="bg-surface border border-border rounded-2xl overflow-hidden">
          <div className="flex items-center border-b border-border">
            <button
              onClick={() => setActiveTab("decisions")}
              className={`px-5 py-3.5 text-sm font-medium transition-colors relative ${
                activeTab === "decisions" ? "text-accent" : "text-muted-dark hover:text-muted"
              }`}
            >
              AI Decisions
              {activeTab === "decisions" && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent rounded-full" />
              )}
            </button>
            <button
              onClick={() => setActiveTab("trades")}
              className={`px-5 py-3.5 text-sm font-medium transition-colors relative ${
                activeTab === "trades" ? "text-accent" : "text-muted-dark hover:text-muted"
              }`}
            >
              Trade Log
              {trades.length > 0 && (
                <span className="ml-2 text-[10px] bg-accent/15 text-accent px-1.5 py-0.5 rounded-full font-mono">
                  {trades.length}
                </span>
              )}
              {activeTab === "trades" && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent rounded-full" />
              )}
            </button>
          </div>

          <div className="p-5">
            {activeTab === "decisions" ? (
              <DecisionsList decisions={decisions} />
            ) : (
              <TradesList trades={trades} />
            )}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border mt-8">
        <div className="max-w-[1400px] mx-auto px-6 py-4 flex items-center justify-between text-xs text-muted-dark">
          <span>Stock Tracker v1.0 — Portfolio Intelligence</span>
          <span className="font-mono">Powered by AI · Real-time Market Data</span>
        </div>
      </footer>
    </div>
  );
}

/* =============== Sub-components =============== */

function DecisionsList({ decisions }: { decisions: Decision[] }) {
  if (decisions.length === 0) {
    return (
      <div className="py-8 text-center text-muted-dark">
        <IconBrain className="w-8 h-8 mx-auto opacity-30 mb-2" />
        <p>No AI decisions yet. Click &quot;AI Analysis&quot; to analyze your portfolio.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {decisions.map((d) => (
        <div key={d.id} className="bg-surface-elevated border border-border rounded-xl p-4 table-row-hover">
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center gap-3">
              <span className="font-mono font-bold text-accent text-sm">{d.symbol}</span>
              <ActionBadge action={d.action} />
              <ConfidenceBar confidence={d.confidence} />
            </div>
            <span className="text-muted-dark text-[11px] font-mono">
              {formatTime(d.created_at)}
            </span>
          </div>
          <p className="text-muted text-[13px] leading-relaxed">{d.reasoning}</p>
          {d.market_data && (
            <div className="flex gap-3 mt-2.5 flex-wrap">
              {Object.entries(d.market_data as Record<string, unknown>)
                .filter(([k]) => ["sentimentScore", "signalStrength", "pnlPct"].includes(k))
                .map(([k, v]) => (
                  <span key={k} className="text-[10px] font-mono text-muted-dark bg-background px-2 py-1 rounded-md">
                    {k}: {String(v)}
                  </span>
                ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function TradesList({ trades }: { trades: Trade[] }) {
  if (trades.length === 0) {
    return (
      <div className="py-8 text-center text-muted-dark">
        <IconTrend className="w-8 h-8 mx-auto opacity-30 mb-2" />
        <p>No trades executed yet. AI decisions will trigger simulated trades.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-muted-dark text-[11px] uppercase tracking-wider border-b border-border">
            <th className="text-left px-4 py-2.5 font-medium">Time</th>
            <th className="text-left px-4 py-2.5 font-medium">Symbol</th>
            <th className="text-left px-4 py-2.5 font-medium">Action</th>
            <th className="text-right px-4 py-2.5 font-medium">Shares</th>
            <th className="text-right px-4 py-2.5 font-medium">Price</th>
            <th className="text-right px-4 py-2.5 font-medium">Value</th>
            <th className="text-left px-4 py-2.5 font-medium">Source</th>
          </tr>
        </thead>
        <tbody>
          {trades.map((t) => {
            const shares = parseFloat(t.shares);
            const price = parseFloat(t.price);
            return (
              <tr key={t.id} className="border-b border-border/40 table-row-hover">
                <td className="px-4 py-2.5 font-mono text-muted-dark text-xs">{formatTime(t.created_at)}</td>
                <td className="px-4 py-2.5 font-mono font-semibold text-accent">{t.symbol}</td>
                <td className="px-4 py-2.5"><ActionBadge action={t.action} /></td>
                <td className="px-4 py-2.5 text-right font-mono">{shares.toLocaleString()}</td>
                <td className="px-4 py-2.5 text-right font-mono">
                  {price.toFixed(2)} <span className="text-muted-dark text-xs">{t.currency}</span>
                </td>
                <td className="px-4 py-2.5 text-right font-mono font-medium">
                  {formatCurrency(shares * price)}
                </td>
                <td className="px-4 py-2.5">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-muted-dark bg-background px-2 py-1 rounded-md">
                    {t.source}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function MetricCard({
  label,
  value,
  subtitle,
  icon,
  accent,
  trend,
}: {
  label: string;
  value: string;
  subtitle?: string;
  icon?: React.ReactNode;
  accent?: boolean;
  trend?: "up" | "down";
}) {
  return (
    <div className={`rounded-2xl p-5 border card-glow ${
      accent
        ? "bg-gradient-to-br from-accent/8 to-transparent border-accent/20"
        : "bg-surface border-border"
    }`}>
      <div className="flex items-start justify-between mb-3">
        <span className="text-[11px] font-medium text-muted-dark uppercase tracking-wider">{label}</span>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
          accent ? "bg-accent/15 text-accent" : "bg-surface-elevated text-muted"
        }`}>
          {icon}
        </div>
      </div>
      <div className={`text-2xl font-bold font-mono tracking-tight ${
        trend === "up" ? "text-profit" : trend === "down" ? "text-loss" : accent ? "text-accent" : "text-foreground"
      }`}>
        {value}
      </div>
      {subtitle && (
        <p className="text-[11px] text-muted-dark mt-1 font-mono">{subtitle}</p>
      )}
    </div>
  );
}

function ActionBadge({ action }: { action: string }) {
  const styles = {
    BUY: "bg-profit-bg text-profit border-profit/20",
    SELL: "bg-loss-bg text-loss border-loss/20",
    HOLD: "bg-hold-bg text-hold border-hold/20",
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold font-mono border ${
      styles[action as keyof typeof styles] || "bg-surface-elevated text-muted border-border"
    }`}>
      {action === "BUY" ? "▲" : action === "SELL" ? "▼" : "●"} {action}
    </span>
  );
}

function ConfidenceBar({ confidence }: { confidence: number }) {
  const color = confidence >= 70 ? "bg-profit" : confidence >= 50 ? "bg-hold" : "bg-loss";
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-16 h-1.5 bg-surface-elevated rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${confidence}%` }} />
      </div>
      <span className="text-[10px] font-mono text-muted-dark">{confidence}%</span>
    </div>
  );
}

function HeaderButton({
  label,
  loading,
  onClick,
  variant,
  icon,
}: {
  label: string;
  loading: boolean;
  onClick: () => void;
  variant?: "primary";
  icon?: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium transition-all duration-200 disabled:opacity-50 active:scale-[0.97] ${
        variant === "primary"
          ? "bg-accent hover:bg-accent-bright text-background shadow-lg shadow-accent/10"
          : "bg-surface-elevated hover:bg-border-light text-muted border border-border"
      }`}
    >
      {loading ? (
        <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
          <path d="M12 2a10 10 0 019.95 9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
      ) : icon}
      {label}
    </button>
  );
}

/* =============== Icons =============== */

function IconWallet() {
  return <svg viewBox="0 0 20 20" className="w-4 h-4" fill="currentColor"><path d="M14 6H6v8h8V6zm-1 7H7V7h6v6z" /><path d="M2 4v12a2 2 0 002 2h12a2 2 0 002-2V4a2 2 0 00-2-2H4a2 2 0 00-2 2zm14 0v12H4V4h12z" /></svg>;
}

function IconTrend({ className }: { className?: string }) {
  return <svg viewBox="0 0 20 20" className={className || "w-4 h-4"} fill="currentColor"><path fillRule="evenodd" d="M12 7a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0V8.414l-4.293 4.293a1 1 0 01-1.414 0L8 10.414l-4.293 4.293a1 1 0 01-1.414-1.414l5-5a1 1 0 011.414 0L11 10.586 14.586 7H12z" clipRule="evenodd" /></svg>;
}

function IconPieChart() {
  return <svg viewBox="0 0 20 20" className="w-4 h-4" fill="currentColor"><path d="M10 2a8 8 0 100 16 8 8 0 000-16zm0 2v6h6a6 6 0 11-6-6z" /></svg>;
}

function IconBrain({ className }: { className?: string }) {
  return <svg viewBox="0 0 20 20" className={className || "w-4 h-4"} fill="currentColor"><path d="M10 2C5.58 2 2 5.58 2 10s3.58 8 8 8 8-3.58 8-8-3.58-8-8-8zm1 13h-2v-2h2v2zm0-4h-2V7h2v4z" /></svg>;
}

function IconRefresh() {
  return <svg viewBox="0 0 20 20" className="w-3.5 h-3.5" fill="currentColor"><path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" /></svg>;
}

function IconDatabase({ className }: { className?: string }) {
  return <svg viewBox="0 0 20 20" className={className || "w-3.5 h-3.5"} fill="currentColor"><path d="M10 3c-4.418 0-8 1.343-8 3v8c0 1.657 3.582 3 8 3s8-1.343 8-3V6c0-1.657-3.582-3-8-3zm0 2c3.314 0 6 .895 6 2s-2.686 2-6 2-6-.895-6-2 2.686-2 6-2z" /></svg>;
}

/* =============== Helpers =============== */

function formatCurrency(value: number): string {
  return `$${Math.abs(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function generatePortfolioChart(currentValue: number): { date: string; value: number }[] {
  const data = [];
  const baseValue = currentValue > 0 ? currentValue * 0.85 : 100000;
  for (let i = 29; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const noise = (Math.sin(i * 0.5) * 0.03 + Math.cos(i * 0.3) * 0.02) * baseValue;
    const trend = ((29 - i) / 29) * (currentValue - baseValue);
    data.push({
      date: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      value: Math.round((baseValue + trend + noise) * 100) / 100,
    });
  }
  return data;
}
