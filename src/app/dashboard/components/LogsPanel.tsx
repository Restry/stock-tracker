"use client";

import { useState, useEffect } from "react";
import type { TaskLog } from "../types";
import { formatTimestamp } from "../utils";
import { LoadingSpinner } from "./HistoryPanel";

export function LogsPanel() {
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
