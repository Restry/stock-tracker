"use client";

import { useState } from "react";
import type { Holding } from "../types";
import { fmtCcy } from "../utils";

export function HoldingsTable({ holdings, onEdit }: { holdings: Holding[]; onEdit: (symbol: string, shares: number, cost: number) => void }) {
  const [editSymbol, setEditSymbol] = useState<string | null>(null);
  const [editShares, setEditShares] = useState("");
  const [editCost, setEditCost] = useState("");

  function startEdit(h: Holding) {
    setEditSymbol(h.symbol);
    setEditShares(h.shares);
    setEditCost(h.cost_price || "");
  }

  function handleSave() {
    if (!editSymbol) return;
    const s = parseFloat(editShares);
    const c = parseFloat(editCost);
    if (isNaN(s) || s < 0 || isNaN(c) || c < 0) return;
    onEdit(editSymbol, s, c);
    setEditSymbol(null);
  }

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
              <th className="text-right px-5 py-3 font-medium">操作</th>
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
                <td className="px-5 py-3.5 text-right font-mono">
                  {editSymbol === h.symbol ? (
                    <input value={editShares} onChange={e => setEditShares(e.target.value)} className="w-20 bg-surface-elevated border border-accent/40 rounded px-2 py-1 text-xs font-mono text-right" />
                  ) : parseFloat(h.shares).toLocaleString()}
                </td>
                <td className="px-5 py-3.5 text-right font-mono">{h.current_price ? fmtCcy(parseFloat(h.current_price), h.price_currency) : <span className="text-muted-dark">—</span>}</td>
                <td className="px-5 py-3.5 text-right font-mono">
                  {editSymbol === h.symbol ? (
                    <input value={editCost} onChange={e => setEditCost(e.target.value)} className="w-20 bg-surface-elevated border border-accent/40 rounded px-2 py-1 text-xs font-mono text-right" />
                  ) : h.cost_price ? fmtCcy(parseFloat(h.cost_price), h.price_currency) : <span className="text-muted-dark">—</span>}
                </td>
                <td className="px-5 py-3.5 text-right font-mono font-medium">{h.marketValue > 0 ? fmtCcy(h.marketValue, "USD") : <span className="text-muted-dark">—</span>}</td>
                <td className="px-5 py-3.5 text-right">
                  {h.pnl != null ? (
                    <div className={`font-mono ${h.pnl >= 0 ? "text-profit" : "text-loss"}`}>
                      <span className="font-medium">{h.pnl >= 0 ? "+" : ""}{fmtCcy(h.pnl, "USD")}</span>
                      <span className="block text-[11px] opacity-75">{h.pnlPct! >= 0 ? "+" : ""}{h.pnlPct!.toFixed(2)}%</span>
                    </div>
                  ) : <span className="text-muted-dark">—</span>}
                </td>
                <td className="px-5 py-3.5 text-right">
                  {editSymbol === h.symbol ? (
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={handleSave} className="text-[10px] px-2 py-1 rounded bg-accent text-background font-medium">保存</button>
                      <button onClick={() => setEditSymbol(null)} className="text-[10px] px-2 py-1 rounded bg-surface-elevated text-muted border border-border">取消</button>
                    </div>
                  ) : (
                    <button onClick={() => startEdit(h)} className="text-[10px] text-accent hover:text-accent-bright">✏️ 编辑</button>
                  )}
                </td>
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
              <div className="flex items-center gap-2">
                {h.pnl != null ? (
                  <div className={`text-right font-mono ${h.pnl >= 0 ? "text-profit" : "text-loss"}`}>
                    <span className="text-sm font-medium">{h.pnl >= 0 ? "+" : ""}{fmtCcy(h.pnl, "USD")}</span>
                    <span className="block text-[11px] opacity-75">{h.pnlPct! >= 0 ? "+" : ""}{h.pnlPct!.toFixed(2)}%</span>
                  </div>
                ) : <span className="text-muted-dark text-sm">—</span>}
                <button onClick={() => startEdit(h)} className="text-xs text-accent ml-1">✏️</button>
              </div>
            </div>
            {editSymbol === h.symbol ? (
              <div className="flex items-center gap-2 mt-2">
                <input value={editShares} onChange={e => setEditShares(e.target.value)} placeholder="股数" className="flex-1 bg-surface-elevated border border-accent/40 rounded px-2 py-1.5 text-xs font-mono" />
                <input value={editCost} onChange={e => setEditCost(e.target.value)} placeholder="成本" className="flex-1 bg-surface-elevated border border-accent/40 rounded px-2 py-1.5 text-xs font-mono" />
                <button onClick={handleSave} className="text-[10px] px-2 py-1.5 rounded bg-accent text-background font-medium">保存</button>
                <button onClick={() => setEditSymbol(null)} className="text-[10px] px-2 py-1.5 rounded bg-surface-elevated text-muted border border-border">取消</button>
              </div>
            ) : (
              <div className="flex items-center justify-between text-xs text-muted-dark font-mono">
                <span>{parseFloat(h.shares).toLocaleString()} 股</span>
                <span>{h.current_price ? fmtCcy(parseFloat(h.current_price), h.price_currency) : "—"}</span>
                <span>{h.marketValue > 0 ? fmtCcy(h.marketValue, "USD") : "—"}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
