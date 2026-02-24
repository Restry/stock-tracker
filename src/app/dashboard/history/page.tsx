"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";

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

export default function HistoryPage() {
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

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  useEffect(() => {
    if (selectedSymbol) {
      fetchHistory(selectedSymbol);
    } else {
      fetchHistory();
    }
  }, [selectedSymbol, fetchHistory]);

  // Prepare chart data (reverse for chronological order)
  const chartData = [...history]
    .filter((h) => selectedSymbol ? h.symbol === selectedSymbol : true)
    .reverse()
    .map((h) => ({
      date: new Date(h.created_at).toLocaleDateString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
      price: parseFloat(h.price),
      symbol: h.symbol,
    }));

  // If no symbol selected, show the first symbol's chart data
  const chartSymbol = selectedSymbol || symbols[0] || "";
  const filteredChartData = chartSymbol
    ? chartData.filter((d) => d.symbol === chartSymbol)
    : chartData;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border bg-surface/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-[1400px] mx-auto px-3 md:px-6 h-14 md:h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 md:gap-3">
            <Link href="/dashboard" className="flex items-center gap-2 md:gap-3 hover:opacity-80 transition-opacity">
              <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
                <svg viewBox="0 0 24 24" className="w-4.5 h-4.5 text-accent" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2 20h20M5 20V9l3-3 4 4 4-8 4 6v12" />
                </svg>
              </div>
              <div>
                <h1 className="text-sm font-bold tracking-tight">Stock Tracker</h1>
                <p className="text-[10px] text-muted-dark uppercase tracking-widest hidden sm:block">Price History</p>
              </div>
            </Link>
          </div>
          <nav className="flex items-center gap-1.5 md:gap-3">
            <NavLink href="/dashboard" label="Dashboard" />
            <NavLink href="/dashboard/history" label="History" active />
            <NavLink href="/dashboard/logs" label="Logs" />
            <NavLink href="/dashboard/settings" label="Settings" />
          </nav>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-3 md:px-6 py-4 md:py-6 space-y-4 md:space-y-6">
        {/* Symbol Filter */}
        <div className="flex items-center gap-3">
          <label className="text-sm text-muted font-medium">Symbol:</label>
          <select
            value={selectedSymbol}
            onChange={(e) => setSelectedSymbol(e.target.value)}
            className="bg-surface-elevated border border-border rounded-lg px-3 py-1.5 text-sm font-mono text-foreground focus:outline-none focus:border-accent"
          >
            <option value="">All Symbols</option>
            {symbols.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="flex flex-col items-center gap-4">
              <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              <p className="text-muted text-sm">Loading history...</p>
            </div>
          </div>
        ) : (
          <>
            {/* Price Chart */}
            {filteredChartData.length > 0 && (
              <div className="bg-surface border border-border rounded-2xl p-4 md:p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold text-muted">
                    Price Trend {chartSymbol && <span className="text-accent ml-1">— {chartSymbol}</span>}
                  </h2>
                  <span className="text-xs text-muted-dark font-mono">{filteredChartData.length} data points</span>
                </div>
                <div className="h-[250px] md:h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={filteredChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
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
                        width={60}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#161b22",
                          border: "1px solid #30363d",
                          borderRadius: "12px",
                          fontSize: "12px",
                          color: "#e8eaed",
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="price"
                        stroke="#58a6ff"
                        strokeWidth={2}
                        dot={{ r: 3, fill: "#58a6ff" }}
                        activeDot={{ r: 5, fill: "#79c0ff" }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Metrics Table */}
            <section className="bg-surface border border-border rounded-2xl overflow-hidden">
              <div className="px-4 md:px-5 py-3 md:py-4 border-b border-border flex items-center justify-between">
                <h2 className="text-sm font-semibold text-muted">Historical Metrics</h2>
                <span className="text-[11px] text-muted-dark font-mono">{history.length} records</span>
              </div>

              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-muted-dark text-[11px] uppercase tracking-wider border-b border-border">
                      <th className="text-left px-4 py-3 font-medium">Time</th>
                      <th className="text-left px-4 py-3 font-medium">Symbol</th>
                      <th className="text-right px-4 py-3 font-medium">Price</th>
                      <th className="text-right px-4 py-3 font-medium">Change</th>
                      <th className="text-right px-4 py-3 font-medium">Change %</th>
                      <th className="text-right px-4 py-3 font-medium">PE</th>
                      <th className="text-right px-4 py-3 font-medium">Market Cap</th>
                      <th className="text-right px-4 py-3 font-medium">Div Yield</th>
                      <th className="text-right px-4 py-3 font-medium">52W High</th>
                      <th className="text-right px-4 py-3 font-medium">52W Low</th>
                      <th className="text-right px-4 py-3 font-medium">Avg Volume</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((h) => {
                      const chg = parseFloat(h.change || "0");
                      return (
                        <tr key={h.id} className="border-b border-border/50 table-row-hover">
                          <td className="px-4 py-3 text-muted-dark text-xs font-mono">
                            {new Date(h.created_at).toLocaleString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                          </td>
                          <td className="px-4 py-3 font-mono font-semibold text-accent">{h.symbol}</td>
                          <td className="px-4 py-3 text-right font-mono">{formatNum(h.price)}</td>
                          <td className={`px-4 py-3 text-right font-mono ${chg >= 0 ? "text-profit" : "text-loss"}`}>
                            {h.change ? `${chg >= 0 ? "+" : ""}${formatNum(h.change)}` : "—"}
                          </td>
                          <td className={`px-4 py-3 text-right font-mono ${chg >= 0 ? "text-profit" : "text-loss"}`}>
                            {h.change_percent ? `${parseFloat(h.change_percent) >= 0 ? "+" : ""}${parseFloat(h.change_percent).toFixed(2)}%` : "—"}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-muted">{h.pe_ratio ? parseFloat(h.pe_ratio).toFixed(1) : "—"}</td>
                          <td className="px-4 py-3 text-right font-mono text-muted">{formatMarketCap(h.market_cap)}</td>
                          <td className="px-4 py-3 text-right font-mono text-muted">{h.dividend_yield ? `${parseFloat(h.dividend_yield).toFixed(2)}%` : "—"}</td>
                          <td className="px-4 py-3 text-right font-mono text-muted">{h.fifty_two_week_high ? formatNum(h.fifty_two_week_high) : "—"}</td>
                          <td className="px-4 py-3 text-right font-mono text-muted">{h.fifty_two_week_low ? formatNum(h.fifty_two_week_low) : "—"}</td>
                          <td className="px-4 py-3 text-right font-mono text-muted">{formatVolume(h.average_volume)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden divide-y divide-border/50">
                {history.map((h) => {
                  const chg = parseFloat(h.change || "0");
                  return (
                    <div key={h.id} className="px-4 py-3 table-row-hover">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-semibold text-accent text-sm">{h.symbol}</span>
                          <span className="text-[11px] text-muted-dark font-mono">
                            {new Date(h.created_at).toLocaleString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                        <span className="font-mono font-medium">{formatNum(h.price)} {h.currency}</span>
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-dark font-mono">
                        {h.change && (
                          <span className={chg >= 0 ? "text-profit" : "text-loss"}>
                            {chg >= 0 ? "+" : ""}{formatNum(h.change)} ({parseFloat(h.change_percent || "0").toFixed(2)}%)
                          </span>
                        )}
                        {h.pe_ratio && <span>PE: {parseFloat(h.pe_ratio).toFixed(1)}</span>}
                        {h.market_cap && <span>MCap: {formatMarketCap(h.market_cap)}</span>}
                        {h.fifty_two_week_high && <span>52WH: {formatNum(h.fifty_two_week_high)}</span>}
                        {h.fifty_two_week_low && <span>52WL: {formatNum(h.fifty_two_week_low)}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>

              {history.length === 0 && (
                <div className="py-12 text-center text-muted-dark text-sm">No history records found.</div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function NavLink({ href, label, active }: { href: string; label: string; active?: boolean }) {
  return (
    <Link
      href={href}
      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
        active
          ? "bg-accent/10 text-accent"
          : "text-muted-dark hover:text-muted hover:bg-surface-elevated"
      }`}
    >
      {label}
    </Link>
  );
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

function formatVolume(val: string | null): string {
  if (!val) return "—";
  const n = parseFloat(val);
  if (isNaN(n)) return "—";
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return n.toLocaleString();
}
