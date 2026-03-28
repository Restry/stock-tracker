/**
 * Backtesting Engine
 *
 * Replays historical price data from st-price-history through the
 * rule-based signal engine (analyzeSignals fallback) to evaluate
 * strategy performance against a buy-and-hold benchmark.
 *
 * Key metrics produced:
 *   - Total return (strategy vs buy-and-hold)
 *   - Sharpe ratio (annualized)
 *   - Max drawdown
 *   - Win rate
 *   - Trade count
 *   - Profit factor
 */

import pool, { toSqlVal, logAction } from "./db";
import { computeSentimentScore } from "./ai-decision";

// ─── Types ───

export interface BacktestConfig {
  symbol: string;
  /** Start date (ISO string). Defaults to earliest data. */
  startDate?: string;
  /** End date (ISO string). Defaults to latest data. */
  endDate?: string;
  /** Initial cash in USD (default: 100_000) */
  initialCash?: number;
  /** Trade size as fraction of portfolio (default: 0.1 = 10%) */
  tradeSize?: number;
  /** Stop-loss percentage (default: -15) */
  stopLossPct?: number;
  /** Take-profit percentage (default: 10) */
  takeProfitPct?: number;
  /** Commission per trade in USD (default: 5) */
  commission?: number;
}

export interface BacktestTrade {
  timestamp: string;
  action: "BUY" | "SELL";
  shares: number;
  price: number;
  value: number;
  reason: string;
  portfolioValue: number;
}

export interface BacktestResult {
  config: BacktestConfig;
  /** Strategy metrics */
  strategy: {
    totalReturn: number;      // as %
    annualizedReturn: number;  // as %
    sharpeRatio: number;
    maxDrawdown: number;       // as % (negative)
    maxDrawdownDate: string;
    winRate: number;           // as %
    totalTrades: number;
    profitFactor: number;
    finalValue: number;
  };
  /** Buy-and-hold benchmark */
  benchmark: {
    totalReturn: number;
    annualizedReturn: number;
    finalValue: number;
  };
  /** Alpha = strategy return - benchmark return */
  alpha: number;
  /** Period covered */
  dataPoints: number;
  startDate: string;
  endDate: string;
  durationDays: number;
  /** Trade log */
  trades: BacktestTrade[];
  /** Equity curve (sampled) for charting */
  equityCurve: Array<{ timestamp: string; strategy: number; benchmark: number }>;
}

interface PricePoint {
  price: number;
  changePct: number;
  timestamp: string;
}

// ─── Simplified RSI computation for backtesting ───

function computeRSI(prices: number[], period: number = 14): number | null {
  if (prices.length < period + 1) return null;
  const changes: number[] = [];
  for (let i = 0; i < prices.length - 1; i++) {
    changes.push(prices[i + 1] - prices[i]); // older to newer
  }

  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 0; i < period; i++) {
    if (changes[i] > 0) avgGain += changes[i];
    else avgLoss += Math.abs(changes[i]);
  }
  avgGain /= period;
  avgLoss /= period;

  for (let i = period; i < changes.length; i++) {
    const c = changes[i];
    avgGain = (avgGain * (period - 1) + (c > 0 ? c : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (c < 0 ? Math.abs(c) : 0)) / period;
  }

  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

function computeSMA(prices: number[], period: number): number | null {
  if (prices.length < period) return null;
  const slice = prices.slice(prices.length - period);
  return slice.reduce((s, p) => s + p, 0) / period;
}

// ─── Signal generator for backtesting ───

interface BacktestSignal {
  action: "BUY" | "SELL" | "HOLD";
  confidence: number;
  reason: string;
}

function generateSignal(
  prices: number[],   // oldest to newest
  currentPrice: number,
  costPrice: number | null,
  shares: number,
  stopLossPct: number,
): BacktestSignal {
  if (prices.length < 20) return { action: "HOLD", confidence: 30, reason: "Insufficient data" };

  const rsi = computeRSI(prices, 14);
  const sma5 = computeSMA(prices, 5);
  const sma20 = computeSMA(prices, 20);

  let score = 0;
  const reasons: string[] = [];

  // RSI signals
  if (rsi !== null) {
    if (rsi < 30) { score += 25; reasons.push(`RSI oversold (${rsi.toFixed(0)})`); }
    else if (rsi < 40) { score += 10; }
    else if (rsi > 70) { score -= 25; reasons.push(`RSI overbought (${rsi.toFixed(0)})`); }
    else if (rsi > 60) { score -= 10; }
  }

  // Moving average crossover
  if (sma5 !== null && sma20 !== null) {
    if (sma5 > sma20) { score += 15; reasons.push("SMA5 > SMA20"); }
    else { score -= 15; reasons.push("SMA5 < SMA20"); }

    if (currentPrice > sma20) score += 8;
    else score -= 8;
  }

  // P&L-based risk
  if (costPrice && costPrice > 0 && shares > 0) {
    const pnl = ((currentPrice - costPrice) / costPrice) * 100;
    if (pnl <= stopLossPct) {
      return { action: "SELL", confidence: 90, reason: `Stop-loss triggered (${pnl.toFixed(1)}%)` };
    }
    if (pnl > 10) { score -= 12; reasons.push(`Take profit zone (${pnl.toFixed(1)}%)`); }
    if (pnl < -5) { score += 8; reasons.push(`Averaging opportunity (${pnl.toFixed(1)}%)`); }
  }

  // Momentum (5-period rate of change)
  if (prices.length >= 6) {
    const roc = ((prices[prices.length - 1] - prices[prices.length - 6]) / prices[prices.length - 6]) * 100;
    if (roc > 5) { score += 8; }
    else if (roc < -5) { score -= 8; }
  }

  // Decision thresholds
  if (score > 15) {
    return { action: "BUY", confidence: Math.min(90, 55 + score), reason: reasons.join("; ") };
  } else if (score < -15) {
    return { action: "SELL", confidence: Math.min(90, 55 + Math.abs(score)), reason: reasons.join("; ") };
  }
  return { action: "HOLD", confidence: 50, reason: reasons.join("; ") || "Neutral" };
}

// ─── Main backtest runner ───

export async function runBacktest(config: BacktestConfig): Promise<BacktestResult> {
  const {
    symbol,
    initialCash = 100_000,
    tradeSize = 0.1,
    stopLossPct = -15,
    takeProfitPct = 10,
    commission = 5,
  } = config;

  // Fetch price history (oldest first)
  let dateSql = "";
  if (config.startDate) dateSql += ` AND created_at >= ${toSqlVal(config.startDate)}`;
  if (config.endDate) dateSql += ` AND created_at <= ${toSqlVal(config.endDate)}`;

  const sql = `SELECT price, change_percent, created_at
    FROM "st-price-history"
    WHERE symbol = ${toSqlVal(symbol)} ${dateSql}
    ORDER BY created_at ASC`;

  const { rows } = await pool.query(sql);

  const toNum = (v: unknown): number => {
    if (typeof v === "number") return v;
    if (typeof v === "string") return parseFloat(v) || 0;
    return 0;
  };

  const priceData: PricePoint[] = (rows as Array<{ price: unknown; change_percent: unknown; created_at: string }>)
    .map(r => ({ price: toNum(r.price), changePct: toNum(r.change_percent), timestamp: r.created_at }))
    .filter(p => p.price > 0);

  if (priceData.length < 20) {
    throw new Error(`Insufficient data for backtesting ${symbol}: only ${priceData.length} data points (need 20+)`);
  }

  // ─── State tracking ───
  let cash = initialCash;
  let shares = 0;
  let costPrice: number | null = null;
  const trades: BacktestTrade[] = [];
  const equityCurve: BacktestResult["equityCurve"] = [];
  let peakValue = initialCash;
  let maxDrawdown = 0;
  let maxDrawdownDate = priceData[0].timestamp;
  let wins = 0;
  let losses = 0;
  let grossProfit = 0;
  let grossLoss = 0;

  // Benchmark: buy at first price with all cash
  const firstPrice = priceData[0].price;
  const benchmarkShares = Math.floor(initialCash / firstPrice);
  const benchmarkCash = initialCash - benchmarkShares * firstPrice;

  // Rolling price window (oldest to newest)
  const priceWindow: number[] = [];

  // Sample rate for equity curve (keep ~200 points max)
  const sampleRate = Math.max(1, Math.floor(priceData.length / 200));

  for (let i = 0; i < priceData.length; i++) {
    const { price, timestamp } = priceData[i];
    priceWindow.push(price);

    // Strategy portfolio value
    const portfolioValue = cash + shares * price;

    // Benchmark portfolio value
    const benchmarkValue = benchmarkCash + benchmarkShares * price;

    // Track drawdown
    if (portfolioValue > peakValue) peakValue = portfolioValue;
    const dd = ((portfolioValue - peakValue) / peakValue) * 100;
    if (dd < maxDrawdown) {
      maxDrawdown = dd;
      maxDrawdownDate = timestamp;
    }

    // Equity curve sampling
    if (i % sampleRate === 0 || i === priceData.length - 1) {
      equityCurve.push({ timestamp, strategy: portfolioValue, benchmark: benchmarkValue });
    }

    // Skip first 20 data points for signal warmup
    if (i < 20) continue;

    // Generate signal
    const signal = generateSignal(priceWindow, price, costPrice, shares, stopLossPct);

    if (signal.action === "BUY" && cash > price * 10) {
      const investAmount = portfolioValue * tradeSize;
      const buyShares = Math.floor(investAmount / price);
      if (buyShares > 0) {
        const cost = buyShares * price + commission;
        if (cost <= cash) {
          // Update weighted average cost
          if (costPrice && shares > 0) {
            costPrice = (costPrice * shares + price * buyShares) / (shares + buyShares);
          } else {
            costPrice = price;
          }
          shares += buyShares;
          cash -= cost;

          trades.push({
            timestamp, action: "BUY", shares: buyShares, price,
            value: cost, reason: signal.reason,
            portfolioValue: cash + shares * price,
          });
        }
      }
    } else if (signal.action === "SELL" && shares > 0) {
      const sellShares = Math.max(1, Math.floor(shares * 0.25)); // sell 25%
      const proceeds = sellShares * price - commission;
      
      // Track win/loss
      if (costPrice) {
        const pnl = (price - costPrice) * sellShares;
        if (pnl > 0) { wins++; grossProfit += pnl; }
        else { losses++; grossLoss += Math.abs(pnl); }
      }

      shares -= sellShares;
      cash += proceeds;
      if (shares === 0) costPrice = null;

      trades.push({
        timestamp, action: "SELL", shares: sellShares, price,
        value: proceeds, reason: signal.reason,
        portfolioValue: cash + shares * price,
      });
    }
  }

  // ─── Final calculations ───
  const lastPrice = priceData[priceData.length - 1].price;
  const finalValue = cash + shares * lastPrice;
  const totalReturn = ((finalValue - initialCash) / initialCash) * 100;

  const benchmarkFinal = benchmarkCash + benchmarkShares * lastPrice;
  const benchmarkReturn = ((benchmarkFinal - initialCash) / initialCash) * 100;

  const startDate = priceData[0].timestamp;
  const endDate = priceData[priceData.length - 1].timestamp;
  const durationMs = new Date(endDate).getTime() - new Date(startDate).getTime();
  const durationDays = Math.max(1, durationMs / (86400 * 1000));
  const durationYears = durationDays / 365.25;

  const annualizedReturn = durationYears > 0
    ? (Math.pow(finalValue / initialCash, 1 / durationYears) - 1) * 100
    : totalReturn;

  const benchmarkAnnualized = durationYears > 0
    ? (Math.pow(benchmarkFinal / initialCash, 1 / durationYears) - 1) * 100
    : benchmarkReturn;

  // Sharpe ratio (approximate using daily returns)
  const dailyReturns: number[] = [];
  for (let i = 1; i < equityCurve.length; i++) {
    const prev = equityCurve[i - 1].strategy;
    if (prev > 0) dailyReturns.push((equityCurve[i].strategy - prev) / prev);
  }
  const avgReturn = dailyReturns.length > 0
    ? dailyReturns.reduce((s, r) => s + r, 0) / dailyReturns.length
    : 0;
  const stdReturn = dailyReturns.length > 1
    ? Math.sqrt(dailyReturns.reduce((s, r) => s + (r - avgReturn) ** 2, 0) / (dailyReturns.length - 1))
    : 1;
  const sharpeRatio = stdReturn > 0 ? (avgReturn / stdReturn) * Math.sqrt(252) : 0;

  const winRate = (wins + losses) > 0 ? (wins / (wins + losses)) * 100 : 0;
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

  const result: BacktestResult = {
    config: { symbol, initialCash, tradeSize, stopLossPct, takeProfitPct, commission, startDate: config.startDate, endDate: config.endDate },
    strategy: {
      totalReturn: Math.round(totalReturn * 100) / 100,
      annualizedReturn: Math.round(annualizedReturn * 100) / 100,
      sharpeRatio: Math.round(sharpeRatio * 100) / 100,
      maxDrawdown: Math.round(maxDrawdown * 100) / 100,
      maxDrawdownDate,
      winRate: Math.round(winRate * 100) / 100,
      totalTrades: trades.length,
      profitFactor: isFinite(profitFactor) ? Math.round(profitFactor * 100) / 100 : 999,
      finalValue: Math.round(finalValue * 100) / 100,
    },
    benchmark: {
      totalReturn: Math.round(benchmarkReturn * 100) / 100,
      annualizedReturn: Math.round(benchmarkAnnualized * 100) / 100,
      finalValue: Math.round(benchmarkFinal * 100) / 100,
    },
    alpha: Math.round((totalReturn - benchmarkReturn) * 100) / 100,
    dataPoints: priceData.length,
    startDate,
    endDate,
    durationDays: Math.round(durationDays),
    trades,
    equityCurve,
  };

  await logAction("backtest", `Backtest complete for ${symbol}`, {
    totalReturn: result.strategy.totalReturn,
    benchmarkReturn: result.benchmark.totalReturn,
    alpha: result.alpha,
    sharpe: result.strategy.sharpeRatio,
    maxDrawdown: result.strategy.maxDrawdown,
    trades: result.strategy.totalTrades,
    dataPoints: result.dataPoints,
    durationDays: result.durationDays,
  });

  return result;
}
