"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import type {
  Holding,
  Decision,
  Trade,
  HealthStatus,
  TechIndicators,
  QuoteData,
  PricePoint,
  MonitoringData,
  ChartDataPoint,
} from "../types";
import { PRIMARY_SYMBOL } from "../types";

export interface DashboardData {
  holdings: Holding[];
  totalValue: number;
  decisions: Decision[];
  trades: Trade[];
  loading: boolean;
  actionLoading: string;
  activeTab: "decisions" | "history" | "logs" | "backtest";
  setActiveTab: (tab: "decisions" | "history" | "logs" | "backtest") => void;
  lastUpdate: Date | null;
  health: HealthStatus | null;
  techIndicators: TechIndicators | null;
  quoteData: QuoteData | null;
  showSettings: boolean;
  setShowSettings: (v: boolean) => void;
  priceFlash: boolean;
  priceFlashKey: React.RefObject<number>;
  refreshCountdown: number;
  dataAge: number;
  editingPosition: boolean;
  setEditingPosition: (v: boolean) => void;
  monitoring: MonitoringData | null;
  chartData: ChartDataPoint[];
  primaryHolding: Holding | undefined;
  totalPnl: number;
  totalPnlPct: number;
  handleAction: (action: string) => Promise<void>;
  savePosition: (symbol: string, shares: number, costPrice: number) => Promise<void>;
  fetchData: () => Promise<void>;
}

export function useDashboardData(): DashboardData {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [totalValue, setTotalValue] = useState(0);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState("");
  const [activeTab, setActiveTab] = useState<"decisions" | "history" | "logs" | "backtest">("decisions");
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [techIndicators, setTechIndicators] = useState<TechIndicators | null>(null);
  const [quoteData, setQuoteData] = useState<QuoteData | null>(null);
  const [priceHistory, setPriceHistory] = useState<PricePoint[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [priceFlash, setPriceFlash] = useState(false);
  const priceFlashKey = useRef(0);
  const [refreshCountdown, setRefreshCountdown] = useState(30);
  const [dataAge, setDataAge] = useState(0);
  const [editingPosition, setEditingPosition] = useState(false);

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch("/api/health");
      if (!res.ok) return;
      const data = await res.json();
      setHealth({
        alive: Boolean(data.alive),
        trading: Boolean(data.trading),
        marketOpen: Boolean(data.marketOpen),
        pricesFresh: Boolean(data.pricesFresh),
        schedulerAlive: Boolean(data.schedulerAlive),
        latestPriceAt: (data.latestPriceAt as string | null) || null,
      });
    } catch (err) {
      console.error("Failed to fetch health:", err);
    }
  }, []);

  const fetchIndicators = useCallback(async () => {
    try {
      const res = await fetch(`/api/indicators?symbol=${PRIMARY_SYMBOL}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.indicators) setTechIndicators(data.indicators);
      if (data.quote) {
        setQuoteData(prev => {
          if (prev && prev.price !== data.quote.price) {
            priceFlashKey.current += 1;
            setPriceFlash(true);
            setTimeout(() => setPriceFlash(false), 1200);
          }
          return data.quote;
        });
      }
    } catch (err) {
      console.error("Failed to fetch indicators:", err);
    }
  }, []);

  const fetchPriceHistory = useCallback(async () => {
    try {
      const res = await fetch(`/api/prices?symbol=${PRIMARY_SYMBOL}&limit=100`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.prices) setPriceHistory(data.prices);
    } catch (err) {
      console.error("Failed to fetch price history:", err);
    }
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const [hRes, dRes, tRes] = await Promise.all([
        fetch("/api/holdings"),
        fetch("/api/decisions"),
        fetch("/api/trades"),
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
      if (tRes.ok) {
        const tData = await tRes.json();
        setTrades(tData.trades || []);
      }
      await Promise.all([fetchHealth(), fetchIndicators(), fetchPriceHistory()]);
      setLastUpdate(new Date());
    } catch (err) {
      console.error("Failed to fetch data:", err);
    }
    setLoading(false);
  }, [fetchHealth, fetchIndicators, fetchPriceHistory]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh: health 30s, indicators+prices 30s
  useEffect(() => {
    const healthTimer = setInterval(fetchHealth, 30000);
    const indicatorTimer = setInterval(() => {
      fetchIndicators();
      fetchPriceHistory();
      setRefreshCountdown(30);
    }, 30000);
    const countdownTimer = setInterval(() => {
      setRefreshCountdown(c => Math.max(0, c - 1));
      setDataAge(a => a + 1);
    }, 1000);
    return () => {
      clearInterval(healthTimer);
      clearInterval(indicatorTimer);
      clearInterval(countdownTimer);
    };
  }, [fetchHealth, fetchIndicators, fetchPriceHistory]);

  async function handleAction(action: string) {
    setActionLoading(action);
    try {
      const endpoint =
        action === "prices" ? "/api/prices"
          : action === "decisions" ? "/api/decisions"
            : action === "seed" ? "/api/seed"
              : "/api/report";
      await fetch(endpoint, { method: "POST" });
      await fetchData();
    } catch (err) {
      console.error(`Action ${action} failed:`, err);
    }
    setActionLoading("");
  }

  async function savePosition(symbol: string, shares: number, costPrice: number) {
    try {
      const res = await fetch("/api/holdings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, shares, cost_price: costPrice }),
      });
      if (!res.ok) throw new Error(await res.text());
      setEditingPosition(false);
      await fetchData();
    } catch (err) {
      console.error("Failed to save position:", err);
    }
  }

  const totalPnl = holdings.reduce((sum, h) => sum + (h.pnl || 0), 0);
  const totalCost = holdings.reduce((sum, h) => sum + (h.costBasis || 0), 0);
  const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;

  const primaryHolding = holdings.find(h => h.symbol === PRIMARY_SYMBOL || h.symbol.includes("01810"));

  const monitoring = useMemo(() => {
    if (!primaryHolding) return null;
    const shares = parseFloat(primaryHolding.shares) || 0;
    const costPrice = primaryHolding.cost_price ? parseFloat(primaryHolding.cost_price) : null;
    const currentPrice = quoteData?.price ?? (primaryHolding.current_price ? parseFloat(primaryHolding.current_price) : null);
    const currency = quoteData?.currency ?? primaryHolding.price_currency ?? "HKD";

    if (!currentPrice || !costPrice || shares <= 0) return null;

    const totalCostVal = shares * costPrice;
    const marketValue = shares * currentPrice;
    const pnl = marketValue - totalCostVal;
    const pnlPct = (pnl / totalCostVal) * 100;
    const breakEvenPrice = costPrice;
    const priceToBreakEven = costPrice - currentPrice;
    const pctToBreakEven = currentPrice > 0 ? (priceToBreakEven / currentPrice) * 100 : 0;

    const tBuyActive =
      techIndicators?.bollingerPosition != null &&
      techIndicators?.rsi14 != null &&
      techIndicators.bollingerPosition < 0.1 &&
      techIndicators.rsi14 < 30;

    const averageDownOpportunity = currentPrice < costPrice * 0.95 &&
      ((techIndicators?.bollingerPosition ?? 1) < 0.3 || (techIndicators?.rsi14 ?? 100) < 40);

    const profitTakingOpportunity = currentPrice > costPrice * 1.03;

    return {
      shares, costPrice, currentPrice, currency,
      totalCost: totalCostVal, marketValue, pnl, pnlPct,
      breakEvenPrice, priceToBreakEven, pctToBreakEven,
      tBuyActive, averageDownOpportunity, profitTakingOpportunity,
    };
  }, [primaryHolding, quoteData, techIndicators]);

  const chartData = useMemo(() => {
    if (priceHistory.length === 0) return [];
    return [...priceHistory]
      .reverse()
      .map(p => ({
        date: new Date(p.created_at).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" }),
        time: new Date(p.created_at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }),
        value: parseFloat(p.price) || 0,
      }))
      .filter(p => p.value > 0);
  }, [priceHistory]);

  return {
    holdings,
    totalValue,
    decisions,
    trades,
    loading,
    actionLoading,
    activeTab,
    setActiveTab,
    lastUpdate,
    health,
    techIndicators,
    quoteData,
    showSettings,
    setShowSettings,
    priceFlash,
    priceFlashKey,
    refreshCountdown,
    dataAge,
    editingPosition,
    setEditingPosition,
    monitoring,
    chartData,
    primaryHolding,
    totalPnl,
    totalPnlPct,
    handleAction,
    savePosition,
    fetchData,
  };
}
