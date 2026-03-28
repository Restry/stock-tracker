"use client";

import type { TechIndicators } from "../types";

export function TechnicalIndicatorsGrid({ techIndicators }: { techIndicators: TechIndicators }) {
  if (techIndicators.dataPoints < 5) return null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      <IndCard label="RSI(14)" value={techIndicators.rsi14?.toFixed(1) ?? "—"} signal={techIndicators.rsiSignal === "oversold" ? "超卖" : techIndicators.rsiSignal === "overbought" ? "超买" : "中性"} sType={techIndicators.rsiSignal === "oversold" ? "buy" : techIndicators.rsiSignal === "overbought" ? "sell" : "neutral"} />
      <IndCard label="布林带位置" value={techIndicators.bollingerPosition != null ? `${(techIndicators.bollingerPosition * 100).toFixed(0)}%` : "—"} signal={techIndicators.bollingerPosition != null ? (techIndicators.bollingerPosition < 0.2 ? "下轨支撑" : techIndicators.bollingerPosition > 0.8 ? "上轨压力" : "通道中部") : "—"} sType={techIndicators.bollingerPosition != null ? (techIndicators.bollingerPosition < 0.2 ? "buy" : techIndicators.bollingerPosition > 0.8 ? "sell" : "neutral") : "neutral"} />
      <IndCard label="MACD" value={techIndicators.macdHistogram?.toFixed(3) ?? "—"} signal={techIndicators.macdBullish === true ? "多头" : techIndicators.macdBullish === false ? "空头" : "—"} sType={techIndicators.macdBullish === true ? "buy" : techIndicators.macdBullish === false ? "sell" : "neutral"} />
      <IndCard label="成交量" value={techIndicators.volumeRatio != null ? `${techIndicators.volumeRatio.toFixed(2)}x` : "—"} signal={techIndicators.suddenVolumeSpike ? "⚠️ 放量" : techIndicators.volumeTrend === "increasing" ? "量增" : techIndicators.volumeTrend === "decreasing" ? "缩量" : "平稳"} sType={techIndicators.suddenVolumeSpike ? "alert" : "neutral"} />
      <IndCard label="均线趋势" value={techIndicators.maShortAboveLong === true ? "多排" : techIndicators.maShortAboveLong === false ? "空排" : "—"} signal={techIndicators.maGoldenCross === true ? "金叉" : techIndicators.maGoldenCross === false ? "死叉" : "—"} sType={techIndicators.maShortAboveLong === true ? "buy" : techIndicators.maShortAboveLong === false ? "sell" : "neutral"} />
      <IndCard label="综合评分" value={`${techIndicators.technicalScore}`} signal={techIndicators.technicalSignal === "strong_buy" ? "强烈买入" : techIndicators.technicalSignal === "buy" ? "买入" : techIndicators.technicalSignal === "sell" ? "卖出" : techIndicators.technicalSignal === "strong_sell" ? "强烈卖出" : "中性"} sType={techIndicators.technicalSignal.includes("buy") ? "buy" : techIndicators.technicalSignal.includes("sell") ? "sell" : "neutral"} />
    </div>
  );
}

function IndCard({ label, value, signal, sType }: { label: string; value: string; signal: string; sType: "buy" | "sell" | "neutral" | "alert" }) {
  const border = sType === "buy" ? "border-profit/30" : sType === "sell" ? "border-loss/30" : sType === "alert" ? "border-hold/30" : "border-border";
  const bg = sType === "buy" ? "bg-profit/5" : sType === "sell" ? "bg-loss/5" : sType === "alert" ? "bg-hold/5" : "bg-surface";
  const color = sType === "buy" ? "text-profit" : sType === "sell" ? "text-loss" : sType === "alert" ? "text-hold" : "text-muted";
  return (
    <div className={`rounded-xl p-3 border ${border} ${bg}`}>
      <div className="text-[10px] text-muted-dark uppercase tracking-wider mb-1">{label}</div>
      <div className="text-lg font-mono font-bold">{value}</div>
      <div className={`text-[11px] font-medium mt-0.5 ${color}`}>{signal}</div>
    </div>
  );
}
