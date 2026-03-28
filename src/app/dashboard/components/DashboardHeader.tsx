"use client";

import type { HealthStatus } from "../types";

export function DashboardHeader({
  health,
  lastUpdate,
  refreshCountdown,
  actionLoading,
  handleAction,
  setShowSettings,
}: {
  health: HealthStatus | null;
  lastUpdate: Date | null;
  refreshCountdown: number;
  actionLoading: string;
  handleAction: (action: string) => void;
  setShowSettings: (v: boolean) => void;
}) {
  return (
    <header className="border-b border-border bg-surface/80 backdrop-blur-xl sticky top-0 z-50">
      <div className="w-full px-3 md:px-6 lg:px-8 h-14 md:h-16 flex items-center justify-between">
        <div className="flex items-center gap-2 md:gap-3">
          <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
            <svg viewBox="0 0 24 24" className="w-4.5 h-4.5 text-accent" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2 20h20M5 20V9l3-3 4 4 4-8 4 6v12" />
            </svg>
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight">盯盘终端</h1>
            <p className="text-[10px] text-muted-dark uppercase tracking-widest hidden sm:block">STOCK MONITOR</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 md:gap-2">
          {lastUpdate && (
            <span className="text-[11px] text-muted-dark mr-1 md:mr-3 font-mono hidden sm:inline-flex items-center gap-2">
              <span className="inline-flex items-center">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-profit mr-1.5 pulse-dot" />
                {lastUpdate.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}
              </span>
              <span className="text-muted-dark/60">{refreshCountdown}s</span>
            </span>
          )}
          <SystemLiveBadge health={health} />
          <HeaderButton label="更新价格" loading={actionLoading === "prices"} onClick={() => handleAction("prices")} icon="↻" />
          <HeaderButton label="AI 分析" loading={actionLoading === "decisions"} onClick={() => handleAction("decisions")} variant="primary" icon="🧠" />
          <button
            onClick={() => setShowSettings(true)}
            className="px-2 py-1.5 rounded-lg text-xs font-medium bg-surface-elevated text-muted border border-border hover:border-accent/40 transition-colors"
            title="设置"
          >
            ⚙️
          </button>
        </div>
      </div>
    </header>
  );
}

function HeaderButton({ label, loading, onClick, variant, icon }: { label: string; loading: boolean; onClick: () => void; variant?: string; icon: string }) {
  return (
    <button onClick={onClick} disabled={loading} className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-opacity ${variant === "primary" ? "bg-accent text-background" : "bg-surface-elevated text-muted border border-border"}`}>
      {loading ? <span className="animate-spin text-lg">◌</span> : <span>{icon}</span>}
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
      <span>{live ? "在线" : "离线"}</span>
      <span className="text-muted-dark">·</span>
      <span>{marketOpen ? "开市" : "休市"}</span>
      <span className="text-muted-dark">·</span>
      <span>{trading ? "交易中" : "监控中"}</span>
      <span className="text-muted-dark">·</span>
      <span>{pricesFresh ? "价格最新" : "价格过期"}</span>
    </div>
  );
}
