/**
 * Technical Indicators Module
 * Computes SMA, EMA, RSI, MACD, Bollinger Bands, ATR, and volume analysis
 * from st-price-history data.
 */

import pool, { toSqlVal } from "./db";

// ─── Raw data types ───

interface PriceRow {
  price: number | string | null;
  change_percent: number | string | null;
  average_volume: number | string | null;
  created_at: string;
}

// ─── Computed indicator types ───

export interface TechnicalIndicators {
  // Moving Averages
  sma5: number | null;
  sma20: number | null;
  sma60: number | null;
  ema12: number | null;
  ema26: number | null;

  // Trend signals
  maShortAboveLong: boolean | null;  // SMA5 > SMA20 (short-term bullish cross)
  maGoldenCross: boolean | null;     // SMA20 > SMA60 (medium-term bullish)
  priceAboveSma20: boolean | null;
  priceAboveSma60: boolean | null;

  // RSI
  rsi14: number | null;
  rsiSignal: "oversold" | "overbought" | "neutral" | null;

  // MACD
  macdLine: number | null;
  macdSignal: number | null;
  macdHistogram: number | null;
  macdBullish: boolean | null;

  // Bollinger Bands (20, 2)
  bollingerUpper: number | null;
  bollingerMiddle: number | null;
  bollingerLower: number | null;
  bollingerPosition: number | null; // 0-1, where in the band the price sits

  // Volatility
  atr14: number | null;                // Average True Range
  volatilityPct: number | null;        // ATR as % of price
  dailyReturnStdDev: number | null;    // Std deviation of daily returns

  // Volume
  volumeRatio: number | null;          // Recent vol / average vol
  volumeTrend: "increasing" | "decreasing" | "stable" | null;

  // Momentum
  roc5: number | null;   // Rate of Change 5 periods
  roc20: number | null;  // Rate of Change 20 periods

  // Price patterns
  consecutiveUp: number;    // Consecutive up days
  consecutiveDown: number;  // Consecutive down days
  distanceFrom52wHigh: number | null; // % below 52w high
  distanceFrom52wLow: number | null;  // % above 52w low

  // Summary score for fallback rules (-100 to +100)
  technicalScore: number;
  technicalSignal: "strong_buy" | "buy" | "neutral" | "sell" | "strong_sell";

  // Data quality
  dataPoints: number;
}

// ─── Helper math functions ───

const toNum = (v: number | string | null | undefined): number => {
  if (typeof v === "number") return v;
  if (typeof v === "string") return parseFloat(v) || 0;
  return 0;
};

function sma(prices: number[], period: number): number | null {
  if (prices.length < period) return null;
  const slice = prices.slice(0, period);
  return slice.reduce((s, p) => s + p, 0) / period;
}

function ema(prices: number[], period: number): number | null {
  if (prices.length < period) return null;
  const k = 2 / (period + 1);
  // Start EMA with SMA of first `period` values (oldest first for this calc)
  const reversed = prices.slice(0, Math.min(prices.length, period * 3)).reverse();
  let value = reversed.slice(0, period).reduce((s, p) => s + p, 0) / period;
  for (let i = period; i < reversed.length; i++) {
    value = reversed[i] * k + value * (1 - k);
  }
  return value;
}

function computeRSI(prices: number[], period: number = 14): number | null {
  if (prices.length < period + 1) return null;
  // prices[0] = most recent
  const changes: number[] = [];
  for (let i = 0; i < Math.min(prices.length - 1, period * 3); i++) {
    changes.push(prices[i] - prices[i + 1]); // newer - older
  }

  if (changes.length < period) return null;

  // Initial averages
  let avgGain = 0;
  let avgLoss = 0;
  const startSlice = changes.slice(changes.length - period);
  for (const c of startSlice) {
    if (c > 0) avgGain += c;
    else avgLoss += Math.abs(c);
  }
  avgGain /= period;
  avgLoss /= period;

  // Smooth with remaining data
  for (let i = changes.length - period - 1; i >= 0; i--) {
    const c = changes[i];
    avgGain = (avgGain * (period - 1) + (c > 0 ? c : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (c < 0 ? Math.abs(c) : 0)) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function computeATR(prices: number[], period: number = 14): number | null {
  if (prices.length < period + 1) return null;
  // True Range = max(high-low, |high-prevClose|, |low-prevClose|)
  // Since we only have close prices, approximate TR = |close - prevClose|
  const trs: number[] = [];
  for (let i = 0; i < Math.min(prices.length - 1, period * 2); i++) {
    trs.push(Math.abs(prices[i] - prices[i + 1]));
  }
  if (trs.length < period) return null;

  // Simple ATR = SMA of TR
  let atr = trs.slice(0, period).reduce((s, v) => s + v, 0) / period;
  for (let i = period; i < trs.length; i++) {
    atr = (atr * (period - 1) + trs[i]) / period;
  }
  return atr;
}

// ─── Main computation ───

export async function computeTechnicalIndicators(
  symbol: string,
  currentPrice: number,
  fiftyTwoWeekHigh?: number | null,
  fiftyTwoWeekLow?: number | null
): Promise<TechnicalIndicators> {
  // Fetch up to 200 recent price points (enough for SMA60 + buffer)
  const sql = `SELECT price, change_percent, average_volume, created_at
    FROM "st-price-history"
    WHERE symbol = ${toSqlVal(symbol)}
    ORDER BY created_at DESC
    LIMIT 200`;
  const { rows } = await pool.query(sql);

  const prices = (rows as PriceRow[]).map((r) => toNum(r.price)).filter((p) => p > 0);
  const volumes = (rows as PriceRow[]).map((r) => toNum(r.average_volume)).filter((v) => v > 0);
  const dataPoints = prices.length;

  // If not enough data, return mostly null indicators
  if (dataPoints < 5) {
    return emptyIndicators(currentPrice, dataPoints, fiftyTwoWeekHigh, fiftyTwoWeekLow);
  }

  // Prepend current price if it differs from most recent stored
  if (currentPrice > 0 && Math.abs(currentPrice - prices[0]) / prices[0] > 0.001) {
    prices.unshift(currentPrice);
  }

  // ─── Moving Averages ───
  const sma5 = sma(prices, 5);
  const sma20 = sma(prices, 20);
  const sma60 = sma(prices, 60);
  const ema12 = ema(prices, 12);
  const ema26 = ema(prices, 26);

  const maShortAboveLong = sma5 !== null && sma20 !== null ? sma5 > sma20 : null;
  const maGoldenCross = sma20 !== null && sma60 !== null ? sma20 > sma60 : null;
  const priceAboveSma20 = sma20 !== null ? currentPrice > sma20 : null;
  const priceAboveSma60 = sma60 !== null ? currentPrice > sma60 : null;

  // ─── RSI ───
  const rsi14 = computeRSI(prices, 14);
  let rsiSignal: TechnicalIndicators["rsiSignal"] = null;
  if (rsi14 !== null) {
    if (rsi14 < 30) rsiSignal = "oversold";
    else if (rsi14 > 70) rsiSignal = "overbought";
    else rsiSignal = "neutral";
  }

  // ─── MACD (12, 26, 9) ───
  let macdLine: number | null = null;
  let macdSignalLine: number | null = null;
  let macdHistogram: number | null = null;
  let macdBullish: boolean | null = null;

  if (ema12 !== null && ema26 !== null) {
    macdLine = ema12 - ema26;
    // Approximate signal line: would need history of MACD values
    // Use EMA(9) of recent MACD-like diffs as approximation
    const macdValues: number[] = [];
    for (let i = 0; i < Math.min(prices.length - 26, 30); i++) {
      const slice = prices.slice(i);
      const e12 = ema(slice, 12);
      const e26 = ema(slice, 26);
      if (e12 !== null && e26 !== null) macdValues.push(e12 - e26);
    }
    if (macdValues.length >= 9) {
      // Signal line = EMA(9) of MACD values
      const k = 2 / 10;
      let sig = macdValues.slice(macdValues.length - 9).reduce((s, v) => s + v, 0) / 9;
      for (let i = macdValues.length - 10; i >= 0; i--) {
        sig = macdValues[i] * k + sig * (1 - k);
      }
      macdSignalLine = sig;
      macdHistogram = macdLine - sig;
      macdBullish = macdHistogram > 0;
    }
  }

  // ─── Bollinger Bands (20, 2) ───
  let bollingerUpper: number | null = null;
  let bollingerMiddle: number | null = null;
  let bollingerLower: number | null = null;
  let bollingerPosition: number | null = null;

  if (sma20 !== null && prices.length >= 20) {
    const std = stdDev(prices.slice(0, 20));
    bollingerMiddle = sma20;
    bollingerUpper = sma20 + 2 * std;
    bollingerLower = sma20 - 2 * std;
    if (bollingerUpper !== bollingerLower) {
      bollingerPosition = (currentPrice - bollingerLower) / (bollingerUpper - bollingerLower);
    }
  }

  // ─── ATR & Volatility ───
  const atr14 = computeATR(prices, 14);
  const volatilityPct = atr14 !== null && currentPrice > 0 ? (atr14 / currentPrice) * 100 : null;

  // Daily returns standard deviation
  const returns: number[] = [];
  for (let i = 0; i < Math.min(prices.length - 1, 20); i++) {
    if (prices[i + 1] > 0) {
      returns.push((prices[i] - prices[i + 1]) / prices[i + 1]);
    }
  }
  const dailyReturnStdDev = returns.length >= 5 ? stdDev(returns) * 100 : null; // as %

  // ─── Volume ───
  let volumeRatio: number | null = null;
  let volumeTrend: TechnicalIndicators["volumeTrend"] = null;
  if (volumes.length >= 5) {
    const recentVol = volumes.slice(0, 5).reduce((s, v) => s + v, 0) / 5;
    const avgVol = volumes.reduce((s, v) => s + v, 0) / volumes.length;
    if (avgVol > 0) {
      volumeRatio = recentVol / avgVol;
      if (volumeRatio > 1.3) volumeTrend = "increasing";
      else if (volumeRatio < 0.7) volumeTrend = "decreasing";
      else volumeTrend = "stable";
    }
  }

  // ─── Momentum: Rate of Change ───
  const roc5 = prices.length > 5 && prices[5] > 0
    ? ((currentPrice - prices[5]) / prices[5]) * 100
    : null;
  const roc20 = prices.length > 20 && prices[20] > 0
    ? ((currentPrice - prices[20]) / prices[20]) * 100
    : null;

  // ─── Price Patterns ───
  let consecutiveUp = 0;
  let consecutiveDown = 0;
  for (let i = 0; i < prices.length - 1; i++) {
    if (prices[i] > prices[i + 1]) {
      if (consecutiveDown === 0) consecutiveUp++;
      else break;
    } else if (prices[i] < prices[i + 1]) {
      if (consecutiveUp === 0) consecutiveDown++;
      else break;
    } else break;
  }

  // 52-week distance
  const distanceFrom52wHigh = fiftyTwoWeekHigh && fiftyTwoWeekHigh > 0
    ? ((currentPrice - fiftyTwoWeekHigh) / fiftyTwoWeekHigh) * 100
    : null;
  const distanceFrom52wLow = fiftyTwoWeekLow && fiftyTwoWeekLow > 0
    ? ((currentPrice - fiftyTwoWeekLow) / fiftyTwoWeekLow) * 100
    : null;

  // ─── Composite Technical Score (-100 to +100) ───
  let score = 0;
  let factors = 0;

  // RSI factor
  if (rsi14 !== null) {
    if (rsi14 < 30) score += 20;        // Oversold = buy signal
    else if (rsi14 < 40) score += 10;
    else if (rsi14 > 70) score -= 20;    // Overbought = sell signal
    else if (rsi14 > 60) score -= 5;
    factors++;
  }

  // MA trend factor
  if (maShortAboveLong !== null) {
    score += maShortAboveLong ? 15 : -15;
    factors++;
  }
  if (maGoldenCross !== null) {
    score += maGoldenCross ? 10 : -10;
    factors++;
  }
  if (priceAboveSma20 !== null) {
    score += priceAboveSma20 ? 8 : -8;
    factors++;
  }

  // MACD factor
  if (macdBullish !== null) {
    score += macdBullish ? 12 : -12;
    factors++;
  }

  // Bollinger position factor
  if (bollingerPosition !== null) {
    if (bollingerPosition < 0.1) score += 15;       // Near lower band = oversold
    else if (bollingerPosition < 0.3) score += 8;
    else if (bollingerPosition > 0.9) score -= 15;   // Near upper band = overbought
    else if (bollingerPosition > 0.7) score -= 8;
    factors++;
  }

  // Momentum factor
  if (roc5 !== null) {
    if (roc5 > 5) score += 8;
    else if (roc5 > 2) score += 4;
    else if (roc5 < -5) score -= 8;
    else if (roc5 < -2) score -= 4;
    factors++;
  }

  // Volume confirmation
  if (volumeRatio !== null && roc5 !== null) {
    // Rising price + increasing volume = confirmed trend
    if (roc5 > 0 && volumeRatio > 1.3) score += 8;
    // Falling price + increasing volume = confirmed downtrend
    else if (roc5 < 0 && volumeRatio > 1.3) score -= 8;
    factors++;
  }

  // Consecutive days factor
  if (consecutiveUp >= 4) score -= 5;   // Overextended
  if (consecutiveDown >= 4) score += 5;  // Oversold bounce potential

  // Normalize score to -100 to +100 range
  const maxPossible = factors > 0 ? factors * 20 : 1;
  const normalizedScore = Math.max(-100, Math.min(100, Math.round((score / maxPossible) * 100)));

  let technicalSignal: TechnicalIndicators["technicalSignal"];
  if (normalizedScore > 40) technicalSignal = "strong_buy";
  else if (normalizedScore > 15) technicalSignal = "buy";
  else if (normalizedScore < -40) technicalSignal = "strong_sell";
  else if (normalizedScore < -15) technicalSignal = "sell";
  else technicalSignal = "neutral";

  return {
    sma5, sma20, sma60, ema12, ema26,
    maShortAboveLong, maGoldenCross, priceAboveSma20, priceAboveSma60,
    rsi14, rsiSignal,
    macdLine, macdSignal: macdSignalLine, macdHistogram, macdBullish,
    bollingerUpper, bollingerMiddle, bollingerLower, bollingerPosition,
    atr14, volatilityPct, dailyReturnStdDev,
    volumeRatio, volumeTrend,
    roc5, roc20,
    consecutiveUp, consecutiveDown,
    distanceFrom52wHigh, distanceFrom52wLow,
    technicalScore: normalizedScore,
    technicalSignal,
    dataPoints,
  };
}

/** Format indicators as concise text for AI prompt injection */
export function formatIndicatorsForPrompt(ti: TechnicalIndicators, price: number): string {
  const lines: string[] = [];

  lines.push(`=== Technical Indicators (${ti.dataPoints} data points) ===`);

  // Moving Averages
  if (ti.sma5 !== null) {
    const smaLine = [
      `SMA5=${ti.sma5.toFixed(2)}`,
      ti.sma20 !== null ? `SMA20=${ti.sma20.toFixed(2)}` : null,
      ti.sma60 !== null ? `SMA60=${ti.sma60.toFixed(2)}` : null,
    ].filter(Boolean).join(", ");
    lines.push(`Moving Averages: ${smaLine}`);
    
    const signals: string[] = [];
    if (ti.maShortAboveLong === true) signals.push("Short-term bullish (SMA5>SMA20)");
    if (ti.maShortAboveLong === false) signals.push("Short-term bearish (SMA5<SMA20)");
    if (ti.maGoldenCross === true) signals.push("Golden cross (SMA20>SMA60)");
    if (ti.maGoldenCross === false) signals.push("Death cross (SMA20<SMA60)");
    if (ti.priceAboveSma20 === false) signals.push("Price below SMA20");
    if (signals.length > 0) lines.push(`  MA Signals: ${signals.join("; ")}`);
  }

  // RSI
  if (ti.rsi14 !== null) {
    lines.push(`RSI(14): ${ti.rsi14.toFixed(1)} — ${ti.rsiSignal}`);
  }

  // MACD
  if (ti.macdLine !== null) {
    lines.push(`MACD: Line=${ti.macdLine.toFixed(3)}, Signal=${ti.macdSignal?.toFixed(3) ?? "N/A"}, Histogram=${ti.macdHistogram?.toFixed(3) ?? "N/A"} — ${ti.macdBullish ? "Bullish" : "Bearish"}`);
  }

  // Bollinger
  if (ti.bollingerUpper !== null) {
    lines.push(`Bollinger(20,2): [${ti.bollingerLower!.toFixed(2)} — ${ti.bollingerMiddle!.toFixed(2)} — ${ti.bollingerUpper.toFixed(2)}], Position=${(ti.bollingerPosition! * 100).toFixed(0)}%`);
  }

  // Volatility
  if (ti.atr14 !== null) {
    lines.push(`Volatility: ATR(14)=${ti.atr14.toFixed(2)} (${ti.volatilityPct!.toFixed(1)}% of price)${ti.dailyReturnStdDev !== null ? `, DailyStdDev=${ti.dailyReturnStdDev.toFixed(2)}%` : ""}`);
  }

  // Volume
  if (ti.volumeRatio !== null) {
    lines.push(`Volume: Ratio=${ti.volumeRatio.toFixed(2)}x avg — ${ti.volumeTrend}`);
  }

  // Momentum
  const momParts: string[] = [];
  if (ti.roc5 !== null) momParts.push(`ROC5=${ti.roc5.toFixed(2)}%`);
  if (ti.roc20 !== null) momParts.push(`ROC20=${ti.roc20.toFixed(2)}%`);
  if (ti.consecutiveUp > 0) momParts.push(`${ti.consecutiveUp} consecutive up days`);
  if (ti.consecutiveDown > 0) momParts.push(`${ti.consecutiveDown} consecutive down days`);
  if (momParts.length > 0) lines.push(`Momentum: ${momParts.join(", ")}`);

  // 52-week
  const weekParts: string[] = [];
  if (ti.distanceFrom52wHigh !== null) weekParts.push(`${ti.distanceFrom52wHigh.toFixed(1)}% from 52w high`);
  if (ti.distanceFrom52wLow !== null) weekParts.push(`+${ti.distanceFrom52wLow.toFixed(1)}% above 52w low`);
  if (weekParts.length > 0) lines.push(`52-Week Range: ${weekParts.join(", ")}`);

  // Overall
  lines.push(`Technical Score: ${ti.technicalScore}/100 — Signal: ${ti.technicalSignal.toUpperCase()}`);

  return lines.join("\n");
}

/** Empty indicators for insufficient data */
function emptyIndicators(
  price: number,
  dataPoints: number,
  high52?: number | null,
  low52?: number | null
): TechnicalIndicators {
  return {
    sma5: null, sma20: null, sma60: null, ema12: null, ema26: null,
    maShortAboveLong: null, maGoldenCross: null, priceAboveSma20: null, priceAboveSma60: null,
    rsi14: null, rsiSignal: null,
    macdLine: null, macdSignal: null, macdHistogram: null, macdBullish: null,
    bollingerUpper: null, bollingerMiddle: null, bollingerLower: null, bollingerPosition: null,
    atr14: null, volatilityPct: null, dailyReturnStdDev: null,
    volumeRatio: null, volumeTrend: null,
    roc5: null, roc20: null,
    consecutiveUp: 0, consecutiveDown: 0,
    distanceFrom52wHigh: high52 && high52 > 0 ? ((price - high52) / high52) * 100 : null,
    distanceFrom52wLow: low52 && low52 > 0 ? ((price - low52) / low52) * 100 : null,
    technicalScore: 0,
    technicalSignal: "neutral",
    dataPoints,
  };
}
