"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
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

interface HealthStatus {
  alive: boolean;
  trading: boolean;
  marketOpen: boolean;
  pricesFresh: boolean;
  schedulerAlive: boolean;
  latestPriceAt: string | null;
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
  const [health, setHealth] = useState<HealthStatus | null>(null);

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
      await fetchHealth();
      setLastUpdate(new Date());
    } catch (err) {
      console.error("Failed to fetch data:", err);
    }
    setLoading(false);
  }, [fetchHealth]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const timer = setInterval(() => {
      fetchHealth();
    }, 30000);
    return () => clearInterval(timer);
  }, [fetchHealth]);

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
        <div className="max-w-[1400px] mx-auto px-3 md:px-6 h-14 md:h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 md:gap-3">
            <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="w-4.5 h-4.5 text-accent" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2 20h20M5 20V9l3-3 4 4 4-8 4 6v12" />
              </svg>
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-tight">Stock Tracker</h1>
              <p className="text-[10px] text-muted-dark uppercase tracking-widest hidden sm:block">Portfolio Intelligence</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 md:gap-2">
            <nav className="hidden md:flex items-center gap-1 mr-2 border-r border-border pr-3">
              <Link href="/dashboard" className="px-3 py-1.5 rounded-lg text-xs font-medium bg-accent/10 text-accent">Dashboard</Link>
              <Link href="/dashboard/history" className="px-3 py-1.5 rounded-lg text-xs font-medium text-muted-dark hover:text-muted hover:bg-surface-elevated transition-colors">History</Link>
              <Link href="/dashboard/logs" className="px-3 py-1.5 rounded-lg text-xs font-medium text-muted-dark hover:text-muted hover:bg-surface-elevated transition-colors">Logs</Link>
              <Link href="/dashboard/settings" className="px-3 py-1.5 rounded-lg text-xs font-medium text-muted-dark hover:text-muted hover:bg-surface-elevated transition-colors">Settings</Link>
            </nav>
            {lastUpdate && (
              <span className="text-[11px] text-muted-dark mr-1 md:mr-3 font-mono hidden sm:inline-flex items-center">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-profit mr-1.5 pulse-dot" />
                {lastUpdate.toLocaleTimeString()}
              </span>
            )}
            <SystemLiveBadge health={health} />
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

      <main className="max-w-[1400px] mx-auto px-3 md:px-6 py-4 md:py-6 space-y-4 md:space-y-6">
        {/* Portfolio Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          <MetricCard
            label="Portfolio Value"
            value={formatCurrency(totalValue, "USD")}
            icon={<IconWallet />}
            accent
          />
          <MetricCard
            label="Total P&L"
            value={`${totalPnl >= 0 ? "+" : ""}${formatCurrency(totalPnl, "USD")}`}
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
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 md:gap-4">
          {/* Portfolio Value Chart */}
          <div className="lg:col-span-2 bg-surface border border-border rounded-2xl p-4 md:p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-muted">Portfolio Performance</h2>
              <span className="text-xs text-muted-dark font-mono">30 Day View</span>
            </div>
            <div className="h-[180px] md:h-[220px]">
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
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    stroke="#30363d"
                    tick={{ fill: "#484f58", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                    width={45}
                    hide={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#161b22",
                      border: "1px solid #30363d",
                      borderRadius: "12px",
                      fontSize: "12px",
                      color: "#e8eaed",
                    }}
                    formatter={(value: number | undefined) => [formatCurrency(value ?? 0, "USD"), "Value"]}
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
          <div className="bg-surface border border-border rounded-2xl p-4 md:p-5">
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
                        formatter={(value: number | undefined) => [formatCurrency(value ?? 0, "USD"), "Value"]}
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
          <div className="px-4 md:px-5 py-3 md:py-4 border-b border-border flex items-center justify-between">
            <h2 className="text-sm font-semibold text-muted">Holdings</h2>
            <span className="text-[11px] text-muted-dark font-mono">{holdings.length} positions</span>
          </div>

          {/* Desktop table — hidden on mobile */}
          <div className="hidden md:block overflow-x-auto">
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
                {holdings.map((h) => {
                  const isXiaomi = h.symbol.includes("01810");
                  const displayCurrency = isXiaomi ? "CNY" : "USD";
                  return (
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
                          ? <span>{formatCurrency(parseFloat(h.current_price), h.price_currency)}</span>
                          : <span className="text-muted-dark">—</span>}
                      </td>
                      <td className="px-5 py-3.5 text-right font-mono">
                        {h.cost_price
                          ? <span>{formatCurrency(parseFloat(h.cost_price), h.price_currency)}</span>
                          : <span className="text-muted-dark">—</span>}
                      </td>
                      <td className="px-5 py-3.5 text-right font-mono font-medium">
                        {h.marketValue > 0
                          ? formatCurrency(h.marketValue, "USD")
                          : <span className="text-muted-dark">—</span>}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        {h.pnl !== null ? (
                          <div className={`font-mono ${h.pnl >= 0 ? "text-profit" : "text-loss"}`}>
                            <span className="font-medium">{h.pnl >= 0 ? "+" : ""}{formatCurrency(h.pnl, "USD")}</span>
                            <span className="block text-[11px] opacity-75">{h.pnlPct! >= 0 ? "+" : ""}{h.pnlPct!.toFixed(2)}%</span>
                          </div>
                        ) : <span className="text-muted-dark">—</span>}
                      </td>
                      <td className="px-5 py-3.5 text-right text-muted-dark text-xs font-mono">
                        {h.updated_at ? formatTime(h.updated_at) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile card list — visible only on mobile */}
          <div className="md:hidden divide-y divide-border/50">
            {holdings.map((h) => (
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
                  {h.pnl !== null ? (
                    <div className={`text-right font-mono ${h.pnl >= 0 ? "text-profit" : "text-loss"}`}>
                      <span className="text-sm font-medium">{h.pnl >= 0 ? "+" : ""}{formatCurrency(h.pnl, "USD")}</span>
                      <span className="block text-[11px] opacity-75">{h.pnlPct! >= 0 ? "+" : ""}{h.pnlPct!.toFixed(2)}%</span>
                    </div>
                  ) : <span className="text-muted-dark text-sm">—</span>}
                </div>
                <div className="flex items-center justify-between text-xs text-muted-dark font-mono">
                  <span>{parseFloat(h.shares).toLocaleString()} shares</span>
                  <span>
                    {h.current_price
                      ? formatCurrency(parseFloat(h.current_price), h.price_currency)
                      : "—"}
                  </span>
                  <span>
                    {h.marketValue > 0 ? formatCurrency(h.marketValue, "USD") : "—"}
                  </span>
                </div>
              </div>
            ))}
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
            </button>
            <button
              onClick={() => setActiveTab("trades")}
              className={`px-5 py-3.5 text-sm font-medium transition-colors relative ${
                activeTab === "trades" ? "text-accent" : "text-muted-dark hover:text-muted"
              }`}
            >
              Trade Log
            </button>
          </div>

          <div className="p-3 md:p-5">
            {activeTab === "decisions" ? (
              <DecisionsList decisions={decisions} />
            ) : (
              <TradesList trades={trades} />
            )}
          </div>
        </section>
      </main>

      <footer className="border-t border-border mt-8">
        <div className="max-w-[1400px] mx-auto px-3 md:px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-1 text-xs text-muted-dark">
          <span>Stock Tracker v1.0 — Portfolio Intelligence</span>
          <span className="font-mono">Powered by AI · Real-time Market Data</span>
        </div>
      </footer>
    </div>
  );
}

/* =============== Sub-components =============== */

function DecisionsList({ decisions }: { decisions: Decision[] }) {
  if (decisions.length === 0) return <div className="py-8 text-center text-muted-dark">No decisions yet.</div>;
  return (
    <div className="space-y-3">
      {decisions.map((d) => (
        <div key={d.id} className="bg-surface-elevated border border-border rounded-xl p-3 md:p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold text-accent">{d.symbol}</span>
              <ActionBadge action={d.action} />
              <span className="text-xs text-muted-dark">{d.confidence}% Confidence</span>
            </div>
            <span className="text-muted-dark text-[11px] font-mono">{formatTime(d.created_at)}</span>
          </div>
          <p className="text-muted text-[13px] leading-relaxed">{d.reasoning}</p>
        </div>
      ))}
    </div>
  );
}

function TradesList({ trades }: { trades: Trade[] }) {
  if (trades.length === 0) return <div className="py-8 text-center text-muted-dark">No trades yet.</div>;
  return (
    <div className="space-y-2">
      {trades.map((t) => (
        <div key={t.id} className="bg-surface-elevated border border-border rounded-xl p-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="font-mono font-bold text-accent">{t.symbol}</span>
            <ActionBadge action={t.action} />
            <span className="text-xs text-muted">{t.shares} shares @ {formatCurrency(parseFloat(t.price), t.currency)}</span>
          </div>
          <span className="text-muted-dark text-[11px] font-mono">{formatTime(t.created_at)}</span>
        </div>
      ))}
    </div>
  );
}

function MetricCard({ label, value, subtitle, icon, accent, trend }: any) {
  return (
    <div className={`rounded-2xl p-3 md:p-5 border ${accent ? "bg-accent/5 border-accent/20" : "bg-surface border-border"}`}>
      <div className="flex items-start justify-between mb-2">
        <span className="text-[10px] uppercase font-bold text-muted-dark">{label}</span>
        <div className="text-muted">{icon}</div>
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

function HeaderButton({ label, loading, onClick, variant, icon }: any) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-opacity ${variant === "primary" ? "bg-accent text-background" : "bg-surface-elevated text-muted border border-border"}`}
    >
      {loading ? <span className="animate-spin text-lg">◌</span> : icon}
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
      <span>{live ? "LIVE" : "OFFLINE"}</span>
      <span className="text-muted-dark">·</span>
      <span>{marketOpen ? "MARKET OPEN" : "MARKET CLOSED"}</span>
      <span className="text-muted-dark">·</span>
      <span>{trading ? "TRADING" : "WATCHING"}</span>
      <span className="text-muted-dark">·</span>
      <span>{pricesFresh ? "PRICE FRESH" : "PRICE STALE"}</span>
    </div>
  );
}

/* Icons */
function IconWallet() { return <span>💼</span>; }
function IconTrend() { return <span>📈</span>; }
function IconPieChart() { return <span>📊</span>; }
function IconBrain() { return <span>🧠</span>; }
function IconRefresh() { return <span>↻</span>; }
function IconDatabase() { return <span>💾</span>; }

/* Helpers */
function formatCurrency(value: number, currency: string): string {
  const sym = currency === "USD" ? "$" : currency === "CNY" ? "¥" : currency === "HKD" ? "HK$" : currency;
  return `${sym}${Math.abs(value).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString("zh-CN", { hour: '2-digit', minute: '2-digit', hour12: false });
}

function generatePortfolioChart(currentValue: number) {
  return Array.from({ length: 15 }, (_, i) => ({
    date: `${i + 1} Feb`,
    value: currentValue * (0.9 + Math.random() * 0.2),
  }));
}
