"use client";

import { useState, useCallback, useEffect, type FormEvent } from "react";
import type { SymbolSetting } from "../types";
import { LoadingSpinner } from "./HistoryPanel";

export function SettingsModal({ onClose, onResetComplete }: { onClose: () => void; onResetComplete: () => Promise<void> }) {
  const [settings, setSettings] = useState<SymbolSetting[]>([]);
  const [globalAutoTrade, setGlobalAutoTradeState] = useState(true);
  const [symbol, setSymbol] = useState("");
  const [name, setName] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [autoTrade, setAutoTrade] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetConfirm, setResetConfirm] = useState("");
  const [resetting, setResetting] = useState(false);
  const [resetMessage, setResetMessage] = useState("");
  const [resetError, setResetError] = useState("");

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

  const busy = saving || resetting;
  const resetArmed = resetConfirm.trim().toUpperCase() === "RESET";

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

  async function handleFullReset() {
    if (!resetArmed) return;

    setResetting(true);
    setResetMessage("");
    setResetError("");
    try {
      const res = await fetch("/api/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: resetConfirm.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Reset failed");
      }

      setResetConfirm("");
      setResetMessage(typeof data.message === "string" ? data.message : "All tracker data reset.");
      await onResetComplete();
      await fetchSettings();
    } catch (err) {
      setResetError(err instanceof Error ? err.message : String(err));
    } finally {
      setResetting(false);
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
            <button onClick={() => updateSetting({ globalAutoTrade: !globalAutoTrade })} disabled={busy}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${globalAutoTrade ? "bg-accent text-background border-accent" : "bg-surface-elevated text-muted border-border"}`}>
              {globalAutoTrade ? "已开启" : "已关闭"}
            </button>
          </div>

          {/* Add Symbol Form */}
          <form onSubmit={addSymbol} className="space-y-2">
            <div className="text-xs font-medium text-muted mb-1">添加股票</div>
            <div className="grid grid-cols-2 gap-2">
              <input value={symbol} onChange={e => setSymbol(e.target.value)} placeholder="代码 (e.g. 01810.HK)" className="bg-surface-elevated border border-border rounded-lg px-3 py-2 text-xs font-mono" required disabled={busy} />
              <input value={name} onChange={e => setName(e.target.value)} placeholder="名称 (可选)" className="bg-surface-elevated border border-border rounded-lg px-3 py-2 text-xs" disabled={busy} />
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} disabled={busy} /> 启用</label>
              <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={autoTrade} onChange={e => setAutoTrade(e.target.checked)} disabled={busy} /> 自动交易</label>
              <button type="submit" disabled={busy} className="ml-auto px-3 py-1.5 rounded-lg text-xs font-medium bg-accent text-background disabled:opacity-50">{saving ? "保存中..." : "添加"}</button>
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
                      <input type="checkbox" checked={s.enabled} onChange={e => updateSetting({ symbol: s.symbol, enabled: e.target.checked })} disabled={busy} />
                      启用
                    </label>
                    <label className="text-[11px] flex items-center gap-1">
                      <input type="checkbox" checked={s.autoTrade} onChange={e => updateSetting({ symbol: s.symbol, autoTrade: e.target.checked })} disabled={busy} />
                      自动
                    </label>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="rounded-2xl border border-loss/40 bg-loss/10 p-4 space-y-3">
            <div>
              <h3 className="text-sm font-bold text-loss">危险操作：一键重置并恢复初始数据</h3>
              <p className="text-[11px] text-loss/90 mt-1 leading-relaxed">
                该操作会永久清空持仓、价格历史、交易、决策、日志、日报和交易设置，然后恢复默认初始持仓与自动交易配置。
              </p>
            </div>

            <div className="rounded-xl border border-loss/30 bg-black/10 px-3 py-2 text-[11px] text-muted space-y-1">
              <div>将被清空：`st-holdings`、`st-price-history`、`st-trades`、`st-decisions`、`st-logs`、`st-daily-reports`、`st-symbol-settings`、`st-app-settings`</div>
              <div>将被恢复：`MSFT`、`01810.HK`、`global_auto_trade=true`</div>
              <div className="font-semibold text-loss">此操作不可恢复。</div>
            </div>

            {resetMessage && (
              <div className="rounded-lg border border-profit/30 bg-profit/10 px-3 py-2 text-[11px] text-profit">
                {resetMessage}
              </div>
            )}
            {resetError && (
              <div className="rounded-lg border border-loss/40 bg-loss/10 px-3 py-2 text-[11px] text-loss">
                {resetError}
              </div>
            )}

            <div className="space-y-2">
              <label className="block text-[11px] font-medium text-loss">
                输入 `RESET` 以确认清空并重新开始
              </label>
              <input
                value={resetConfirm}
                onChange={(e) => setResetConfirm(e.target.value)}
                placeholder="RESET"
                className="w-full rounded-xl border border-loss/40 bg-surface-elevated px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-dark focus:border-loss focus:outline-none"
                disabled={busy}
              />
            </div>

            <button
              type="button"
              onClick={handleFullReset}
              disabled={!resetArmed || busy}
              className="w-full rounded-xl bg-loss px-4 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {resetting ? "重置中..." : "一键重置并恢复初始数据"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
