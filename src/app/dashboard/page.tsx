"use client";

import { useDashboardData } from "./hooks/useDashboardData";
import { DashboardHeader } from "./components/DashboardHeader";
import { PriceMonitorPanel } from "./components/PriceMonitorPanel";
import { TechnicalIndicatorsGrid } from "./components/TechnicalIndicators";
import { PortfolioSummary } from "./components/PortfolioSummary";
import { DecisionsList } from "./components/DecisionsList";
import { HistoryPanel } from "./components/HistoryPanel";
import { LogsPanel } from "./components/LogsPanel";
import { HoldingsTable } from "./components/HoldingsTable";
import { SettingsModal } from "./components/SettingsModal";
import { BacktestPanel } from "./components/BacktestPanel";

export default function DashboardPage() {
  const data = useDashboardData();

  if (data.loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-muted text-sm">正在加载盯盘数据...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <DashboardHeader
        health={data.health}
        lastUpdate={data.lastUpdate}
        refreshCountdown={data.refreshCountdown}
        actionLoading={data.actionLoading}
        handleAction={data.handleAction}
        setShowSettings={data.setShowSettings}
      />

      <main className="w-full px-3 md:px-6 lg:px-8 py-4 md:py-6 space-y-4 md:space-y-5">
        {/* Primary Stock Monitoring Panel */}
        <PriceMonitorPanel
          monitoring={data.monitoring}
          chartData={data.chartData}
          quoteData={data.quoteData}
          techIndicators={data.techIndicators}
          primaryHolding={data.primaryHolding}
          priceFlash={data.priceFlash}
          priceFlashKey={data.priceFlashKey}
          editingPosition={data.editingPosition}
          setEditingPosition={data.setEditingPosition}
          savePosition={data.savePosition}
          selectedSymbol={data.selectedSymbol}
          setSelectedSymbol={data.setSelectedSymbol}
          holdings={data.holdings}
        />

        {/* Technical Indicators */}
        {data.techIndicators && data.techIndicators.dataPoints >= 5 && (
          <TechnicalIndicatorsGrid techIndicators={data.techIndicators} />
        )}

        {/* Portfolio Summary */}
        <PortfolioSummary
          totalValue={data.totalValue}
          totalPnl={data.totalPnl}
          totalPnlPct={data.totalPnlPct}
          holdingsCount={data.holdings.length}
          tradesCount={data.trades.length}
          decisions={data.decisions}
        />

        {/* Multi-tab Panel: Decisions / History / Logs */}
        <section className="bg-surface border border-border rounded-2xl overflow-hidden">
          <div className="flex items-center border-b border-border overflow-x-auto">
            {(["decisions", "history", "backtest", "logs"] as const).map(tab => (
              <button key={tab} onClick={() => data.setActiveTab(tab)} className={`px-4 md:px-5 py-3.5 text-sm font-medium transition-colors whitespace-nowrap ${data.activeTab === tab ? "text-accent border-b-2 border-accent -mb-px" : "text-muted-dark hover:text-muted"}`}>
                {tab === "decisions" ? "AI 决策" : tab === "history" ? "价格历史" : tab === "backtest" ? "策略回测" : "运行日志"}
              </button>
            ))}
          </div>
          <div className="p-3 md:p-5">
            {data.activeTab === "decisions" && <DecisionsList decisions={data.decisions} trades={data.trades} />}
            {data.activeTab === "history" && <HistoryPanel />}
            {data.activeTab === "backtest" && <BacktestPanel />}
            {data.activeTab === "logs" && <LogsPanel />}
          </div>
        </section>

        {/* Holdings Table */}
        <HoldingsTable holdings={data.holdings} onEdit={(symbol, shares, cost) => data.savePosition(symbol, shares, cost)} />
      </main>

      <footer className="border-t border-border mt-8">
        <div className="w-full px-3 md:px-6 lg:px-8 py-4 flex flex-col sm:flex-row items-center justify-between gap-1 text-xs text-muted-dark">
          <span>盯盘终端 v2.0 — 港股智能监控</span>
          <span className="font-mono">AI 驱动 · 实时行情 · 做T策略</span>
        </div>
      </footer>

      {/* Settings Modal */}
      {data.showSettings && <SettingsModal onClose={() => data.setShowSettings(false)} onResetComplete={data.fetchData} />}
    </div>
  );
}
