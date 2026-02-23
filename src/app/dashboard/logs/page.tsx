"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

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

export default function LogsPage() {
  const [logs, setLogs] = useState<TaskLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedTask, setExpandedTask] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
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
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

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
                <p className="text-[10px] text-muted-dark uppercase tracking-widest hidden sm:block">Task Logs</p>
              </div>
            </Link>
          </div>
          <nav className="flex items-center gap-1.5 md:gap-3">
            <NavLink href="/dashboard" label="Dashboard" />
            <NavLink href="/dashboard/history" label="History" />
            <NavLink href="/dashboard/logs" label="Logs" active />
          </nav>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-3 md:px-6 py-4 md:py-6 space-y-4 md:space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
          <div className="rounded-2xl p-3 md:p-5 border bg-surface border-border">
            <span className="text-[10px] uppercase font-bold text-muted-dark">Total Runs</span>
            <div className="text-xl font-mono font-bold mt-1">{logs.length}</div>
          </div>
          <div className="rounded-2xl p-3 md:p-5 border bg-surface border-border">
            <span className="text-[10px] uppercase font-bold text-muted-dark">Last Run</span>
            <div className="text-sm font-mono mt-1 text-muted">
              {logs[0] ? formatTimestamp(logs[0].timestamp) : "—"}
            </div>
          </div>
          <div className="rounded-2xl p-3 md:p-5 border bg-surface border-border col-span-2 md:col-span-1">
            <span className="text-[10px] uppercase font-bold text-muted-dark">Symbols Tracked</span>
            <div className="text-sm font-mono mt-1 text-muted">
              {logs[0] ? [...new Set(logs[0].symbols)].join(", ") : "—"}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="flex flex-col items-center gap-4">
              <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              <p className="text-muted text-sm">Loading logs...</p>
            </div>
          </div>
        ) : (
          <section className="bg-surface border border-border rounded-2xl overflow-hidden">
            <div className="px-4 md:px-5 py-3 md:py-4 border-b border-border flex items-center justify-between">
              <h2 className="text-sm font-semibold text-muted">Price Update Logs</h2>
              <span className="text-[11px] text-muted-dark font-mono">{logs.length} task runs</span>
            </div>

            {logs.length === 0 ? (
              <div className="py-12 text-center text-muted-dark text-sm">No logs found.</div>
            ) : (
              <div className="divide-y divide-border/50">
                {logs.map((log) => {
                  const isExpanded = expandedTask === log.timestamp;
                  const uniqueSymbols = [...new Set(log.symbols)];
                  const hasErrors = log.records.some((r) => !r.price || parseFloat(r.price) <= 0);

                  return (
                    <div key={log.timestamp}>
                      {/* Task header row */}
                      <button
                        onClick={() => setExpandedTask(isExpanded ? null : log.timestamp)}
                        className="w-full px-4 md:px-5 py-3 md:py-4 flex items-center justify-between table-row-hover text-left"
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-2.5 h-2.5 rounded-full ${hasErrors ? "bg-hold" : "bg-profit"}`} />
                          <div>
                            <span className="text-sm font-medium">{formatTimestamp(log.timestamp)}</span>
                            <span className="block text-[11px] text-muted-dark font-mono mt-0.5">
                              {uniqueSymbols.length} symbols: {uniqueSymbols.join(", ")}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                            hasErrors ? "text-hold border-hold" : "text-profit border-profit"
                          }`}>
                            {hasErrors ? "PARTIAL" : "SUCCESS"}
                          </span>
                          <span className="text-muted-dark text-sm">{isExpanded ? "▲" : "▼"}</span>
                        </div>
                      </button>

                      {/* Expanded details */}
                      {isExpanded && (
                        <div className="px-4 md:px-5 pb-4 bg-surface-elevated/50">
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-muted-dark uppercase tracking-wider border-b border-border">
                                  <th className="text-left px-3 py-2 font-medium">Symbol</th>
                                  <th className="text-right px-3 py-2 font-medium">Price</th>
                                  <th className="text-right px-3 py-2 font-medium">Change</th>
                                  <th className="text-right px-3 py-2 font-medium">PE</th>
                                  <th className="text-right px-3 py-2 font-medium">Market Cap</th>
                                </tr>
                              </thead>
                              <tbody>
                                {log.records.map((r, i) => {
                                  const chg = parseFloat(r.change || "0");
                                  return (
                                    <tr key={i} className="border-b border-border/30">
                                      <td className="px-3 py-2 font-mono font-semibold text-accent">{r.symbol}</td>
                                      <td className="px-3 py-2 text-right font-mono">
                                        {parseFloat(r.price).toLocaleString("en-US", { minimumFractionDigits: 2 })} {r.currency}
                                      </td>
                                      <td className={`px-3 py-2 text-right font-mono ${chg >= 0 ? "text-profit" : "text-loss"}`}>
                                        {r.change ? `${chg >= 0 ? "+" : ""}${parseFloat(r.change).toFixed(2)}` : "—"}
                                        {r.change_percent ? ` (${parseFloat(r.change_percent).toFixed(2)}%)` : ""}
                                      </td>
                                      <td className="px-3 py-2 text-right font-mono text-muted">
                                        {r.pe_ratio ? parseFloat(r.pe_ratio).toFixed(1) : "—"}
                                      </td>
                                      <td className="px-3 py-2 text-right font-mono text-muted">
                                        {formatMarketCap(r.market_cap)}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
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

function formatTimestamp(ts: string): string {
  return new Date(ts).toLocaleString("zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
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
