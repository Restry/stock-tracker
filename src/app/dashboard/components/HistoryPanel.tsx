"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import type { HistoryRecord } from "../types";
import { formatNum, formatMarketCap } from "../utils";

export function HistoryPanel() {
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

export function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-8">
      <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
