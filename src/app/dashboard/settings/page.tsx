"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";

interface SymbolSetting {
  symbol: string;
  name: string;
  enabled: boolean;
  autoTrade: boolean;
  updatedAt: string | null;
}

interface SettingsResponse {
  settings: SymbolSetting[];
  globalAutoTrade: boolean;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<SymbolSetting[]>([]);
  const [globalAutoTrade, setGlobalAutoTradeState] = useState(true);
  const [symbol, setSymbol] = useState("");
  const [name, setName] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [autoTrade, setAutoTrade] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settings");
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as SettingsResponse;
      setSettings(data.settings || []);
      setGlobalAutoTradeState(Boolean(data.globalAutoTrade));
    } catch (err) {
      console.error("Failed to fetch settings:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  async function addSymbol(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!symbol.trim()) return;

    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: symbol.trim().toUpperCase(),
          name: name.trim(),
          enabled,
          autoTrade,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setSymbol("");
      setName("");
      setEnabled(true);
      setAutoTrade(true);
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
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());
      await fetchSettings();
    } catch (err) {
      console.error("Failed to update setting:", err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-surface/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-[1400px] mx-auto px-3 md:px-6 h-14 md:h-16 flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-2 md:gap-3 hover:opacity-80 transition-opacity">
            <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
              <span className="text-accent text-sm">⚙</span>
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-tight">Stock Tracker</h1>
              <p className="text-[10px] text-muted-dark uppercase tracking-widest hidden sm:block">Trading Settings</p>
            </div>
          </Link>
          <nav className="flex items-center gap-1.5 md:gap-3">
            <NavLink href="/dashboard" label="Dashboard" />
            <NavLink href="/dashboard/history" label="History" />
            <NavLink href="/dashboard/logs" label="Logs" />
            <NavLink href="/dashboard/settings" label="Settings" active />
          </nav>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-3 md:px-6 py-4 md:py-6 space-y-4 md:space-y-6">
        <section className="bg-surface border border-border rounded-2xl p-4 md:p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-muted">Global Auto Trading</h2>
            <button
              onClick={() => updateSetting({ globalAutoTrade: !globalAutoTrade })}
              disabled={saving}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${
                globalAutoTrade ? "bg-accent text-background border-accent" : "bg-surface-elevated text-muted border-border"
              }`}
            >
              {globalAutoTrade ? "Enabled" : "Disabled"}
            </button>
          </div>
          <p className="text-xs text-muted-dark">
            Enabled symbols are always analyzed; simulated trades run only when global and symbol auto-trade are both enabled.
          </p>
        </section>

        <section className="bg-surface border border-border rounded-2xl p-4 md:p-5">
          <h2 className="text-sm font-semibold text-muted mb-3">Add Symbol</h2>
          <form onSubmit={addSymbol} className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <input
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              placeholder="Symbol (e.g. 01810.HK)"
              className="bg-surface-elevated border border-border rounded-lg px-3 py-2 text-sm font-mono"
              required
            />
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name (optional)"
              className="bg-surface-elevated border border-border rounded-lg px-3 py-2 text-sm"
            />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
              Enabled
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={autoTrade} onChange={(e) => setAutoTrade(e.target.checked)} />
              Auto Trade
            </label>
            <button
              type="submit"
              disabled={saving}
              className="px-3 py-2 rounded-lg text-xs font-medium bg-accent text-background"
            >
              {saving ? "Saving..." : "Add / Update"}
            </button>
          </form>
        </section>

        <section className="bg-surface border border-border rounded-2xl overflow-hidden">
          <div className="px-4 md:px-5 py-3 md:py-4 border-b border-border flex items-center justify-between">
            <h2 className="text-sm font-semibold text-muted">Symbol Settings</h2>
            <span className="text-[11px] text-muted-dark font-mono">{settings.length} symbols</span>
          </div>
          {loading ? (
            <div className="p-5 text-sm text-muted-dark">Loading settings...</div>
          ) : settings.length === 0 ? (
            <div className="p-5 text-sm text-muted-dark">No symbols configured yet.</div>
          ) : (
            <div className="divide-y divide-border/50">
              {settings.map((s) => (
                <div key={s.symbol} className="px-4 md:px-5 py-3 flex items-center justify-between">
                  <div>
                    <div className="font-mono text-sm text-accent">{s.symbol}</div>
                    <div className="text-xs text-muted-dark">{s.name}</div>
                  </div>
                  <div className="flex items-center gap-4">
                    <label className="text-xs flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={s.enabled}
                        onChange={(e) => updateSetting({ symbol: s.symbol, enabled: e.target.checked })}
                        disabled={saving}
                      />
                      Enabled
                    </label>
                    <label className="text-xs flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={s.autoTrade}
                        onChange={(e) => updateSetting({ symbol: s.symbol, autoTrade: e.target.checked })}
                        disabled={saving}
                      />
                      Auto Trade
                    </label>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
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
