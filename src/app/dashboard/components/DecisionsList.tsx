"use client";

import { useMemo } from "react";
import type { Decision, Trade } from "../types";
import { fmtCcy, fmtTime } from "../utils";

export function DecisionsList({ decisions, trades }: { decisions: Decision[]; trades: Trade[] }) {
  const timeline = useMemo(() => {
    const items: Array<{ type: "decision"; data: Decision; time: number } | { type: "trade"; data: Trade; time: number }> = [];
    decisions.forEach(d => items.push({ type: "decision", data: d, time: new Date(d.created_at).getTime() }));
    trades.forEach(t => items.push({ type: "trade", data: t, time: new Date(t.created_at).getTime() }));
    return items.sort((a, b) => b.time - a.time);
  }, [decisions, trades]);

  if (timeline.length === 0) return <div className="py-8 text-center text-muted-dark">暂无 AI 决策</div>;
  return (
    <div className="space-y-3">
      {timeline.map((item) => {
        if (item.type === "decision") {
          const d = item.data;
          return (
            <div key={`d-${d.id}`} className="bg-surface-elevated border border-border rounded-xl p-3 md:p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent font-medium">决策</span>
                  <span className="font-mono font-bold text-accent">{d.symbol}</span>
                  <ActionBadge action={d.action} />
                  <span className="text-xs text-muted-dark">{d.confidence}% 置信度</span>
                </div>
                <span className="text-muted-dark text-[11px] font-mono">{fmtTime(d.created_at)}</span>
              </div>
              <p className="text-muted text-[13px] leading-relaxed">{d.reasoning}</p>
            </div>
          );
        } else {
          const t = item.data;
          return (
            <div key={`t-${t.id}`} className="bg-surface-elevated border border-border rounded-xl p-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-hold/10 text-hold font-medium">交易</span>
                <span className="font-mono font-bold text-accent">{t.symbol}</span>
                <ActionBadge action={t.action} />
                <span className="text-xs text-muted">{t.shares} 股 @ {fmtCcy(parseFloat(t.price), t.currency)}</span>
              </div>
              <span className="text-muted-dark text-[11px] font-mono">{fmtTime(t.created_at)}</span>
            </div>
          );
        }
      })}
    </div>
  );
}

function ActionBadge({ action }: { action: string }) {
  const color = action === "BUY" ? "text-profit" : action === "SELL" ? "text-loss" : "text-hold";
  return <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border border-current ${color}`}>{action}</span>;
}
