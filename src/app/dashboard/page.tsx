"use client";

import { useEffect, useState, useCallback } from "react";

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
  created_at: string;
}

export default function DashboardPage() {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [totalValue, setTotalValue] = useState(0);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState("");

  const fetchData = useCallback(async () => {
    try {
      const [hRes, dRes] = await Promise.all([
        fetch("/api/holdings"),
        fetch("/api/decisions"),
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
        action === "prices"
          ? "/api/prices"
          : action === "decisions"
            ? "/api/decisions"
            : "/api/report";
      await fetch(endpoint, { method: "POST" });
      await fetchData();
    } catch (err) {
      console.error(`Action ${action} failed:`, err);
    }
    setActionLoading("");
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-gray-400 text-lg">Loading portfolio...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">📈</span>
            <h1 className="text-xl font-bold">Stock Tracker</h1>
          </div>
          <div className="flex gap-2">
            <ActionButton
              label="Update Prices"
              loading={actionLoading === "prices"}
              onClick={() => handleAction("prices")}
            />
            <ActionButton
              label="Run AI Decisions"
              loading={actionLoading === "decisions"}
              onClick={() => handleAction("decisions")}
              variant="primary"
            />
            <ActionButton
              label="Generate Report"
              loading={actionLoading === "report"}
              onClick={() => handleAction("report")}
            />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* Portfolio Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <SummaryCard
            label="Total Portfolio Value"
            value={`$${totalValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            accent
          />
          <SummaryCard label="Holdings" value={String(holdings.length)} />
          <SummaryCard label="Recent Decisions" value={String(decisions.length)} />
        </div>

        {/* Holdings Table */}
        <section>
          <h2 className="text-lg font-semibold mb-4 text-gray-300">Holdings</h2>
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 text-xs uppercase tracking-wider border-b border-gray-800">
                  <th className="text-left px-6 py-3">Symbol</th>
                  <th className="text-left px-6 py-3">Name</th>
                  <th className="text-right px-6 py-3">Shares</th>
                  <th className="text-right px-6 py-3">Price</th>
                  <th className="text-right px-6 py-3">Market Value</th>
                  <th className="text-right px-6 py-3">P&L</th>
                  <th className="text-right px-6 py-3">Updated</th>
                </tr>
              </thead>
              <tbody>
                {holdings.map((h) => (
                  <tr key={h.symbol} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                    <td className="px-6 py-4 font-mono font-semibold text-blue-400">{h.symbol}</td>
                    <td className="px-6 py-4 text-gray-300">{h.name}</td>
                    <td className="px-6 py-4 text-right font-mono">{parseFloat(h.shares).toLocaleString()}</td>
                    <td className="px-6 py-4 text-right font-mono">
                      {h.current_price
                        ? `${parseFloat(h.current_price).toFixed(2)} ${h.price_currency}`
                        : "—"}
                    </td>
                    <td className="px-6 py-4 text-right font-mono">
                      {h.marketValue > 0
                        ? `$${h.marketValue.toLocaleString("en-US", { minimumFractionDigits: 2 })}`
                        : "—"}
                    </td>
                    <td className={`px-6 py-4 text-right font-mono ${h.pnl !== null ? (h.pnl >= 0 ? "text-green-400" : "text-red-400") : "text-gray-600"}`}>
                      {h.pnl !== null
                        ? `${h.pnl >= 0 ? "+" : ""}${h.pnl.toFixed(2)} (${h.pnlPct!.toFixed(1)}%)`
                        : "—"}
                    </td>
                    <td className="px-6 py-4 text-right text-gray-500 text-xs">
                      {h.updated_at ? new Date(h.updated_at).toLocaleDateString() : "—"}
                    </td>
                  </tr>
                ))}
                {holdings.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                      No holdings yet. Seed the database first.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* AI Decisions */}
        <section>
          <h2 className="text-lg font-semibold mb-4 text-gray-300">AI Decisions</h2>
          <div className="grid gap-3">
            {decisions.map((d) => (
              <div key={d.id} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-semibold text-blue-400">{d.symbol}</span>
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-bold ${
                        d.action === "BUY"
                          ? "bg-green-900/50 text-green-400"
                          : d.action === "SELL"
                            ? "bg-red-900/50 text-red-400"
                            : "bg-gray-800 text-gray-400"
                      }`}
                    >
                      {d.action}
                    </span>
                    <span className="text-gray-500 text-xs">
                      Confidence: {d.confidence}%
                    </span>
                  </div>
                  <span className="text-gray-600 text-xs">
                    {new Date(d.created_at).toLocaleString()}
                  </span>
                </div>
                <p className="text-gray-400 text-sm">{d.reasoning}</p>
              </div>
            ))}
            {decisions.length === 0 && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center text-gray-500">
                No decisions yet. Click &quot;Run AI Decisions&quot; to analyze your portfolio.
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

function SummaryCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl p-5 border ${accent ? "bg-blue-950/30 border-blue-800/50" : "bg-gray-900 border-gray-800"}`}>
      <div className="text-gray-500 text-xs uppercase tracking-wider mb-1">{label}</div>
      <div className={`text-2xl font-bold font-mono ${accent ? "text-blue-400" : "text-white"}`}>{value}</div>
    </div>
  );
}

function ActionButton({
  label,
  loading,
  onClick,
  variant,
}: {
  label: string;
  loading: boolean;
  onClick: () => void;
  variant?: "primary";
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${
        variant === "primary"
          ? "bg-blue-600 hover:bg-blue-500 text-white"
          : "bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700"
      }`}
    >
      {loading ? "..." : label}
    </button>
  );
}
