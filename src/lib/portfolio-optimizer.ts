/**
 * Portfolio Optimizer
 *
 * Provides portfolio-level position sizing and rebalancing signals:
 *   1. Equal-weight target allocation with configurable max per-stock weight
 *   2. Volatility-adjusted (risk parity) position sizing using ATR
 *   3. Rebalancing signals when holdings drift beyond threshold
 *   4. Kelly-inspired confidence-weighted trade sizing
 *
 * All values normalised to USD for cross-currency comparisons.
 */

import pool, { toSqlVal, logAction } from "./db";
import { convertToUsdAsync } from "./prices";

// ─── Configuration ───

/** Maximum weight a single position may occupy in the portfolio */
const MAX_SINGLE_WEIGHT = 0.35; // 35%

/** Minimum weight floor — positions below this are flagged for removal */
const MIN_WEIGHT_FLOOR = 0.02; // 2%

/** Drift threshold: if actual weight differs from target by this much, flag rebalance */
const REBALANCE_DRIFT_PCT = 5; // 5 percentage-points

/** Maximum total portfolio value (USD) — soft cap for sizing */
const MAX_PORTFOLIO_USD = 200_000;

/** Minimum trade value (USD) — trades smaller than this are not worth executing */
const MIN_TRADE_VALUE_USD = 50;

// ─── Types ───

export interface PositionSnapshot {
  symbol: string;
  name: string;
  shares: number;
  currentPrice: number;
  costPrice: number;
  currency: string;
  marketValueUsd: number;
  costBasisUsd: number;
  pnlUsd: number;
  pnlPct: number;
  /** ATR-based volatility (annualised %). null if insufficient data */
  volatilityPct: number | null;
}

export interface AllocationTarget {
  symbol: string;
  /** Target weight (0–1) */
  targetWeight: number;
  /** Actual weight (0–1) */
  actualWeight: number;
  /** Drift: actual − target (percentage points) */
  driftPct: number;
  /** Suggested action based on drift */
  action: "overweight" | "underweight" | "on_target";
  /** Suggested USD delta to reach target (negative = sell, positive = buy) */
  suggestedDeltaUsd: number;
}

export interface PortfolioAnalysis {
  totalValueUsd: number;
  positions: PositionSnapshot[];
  allocations: AllocationTarget[];
  /** Concentration risk: Herfindahl–Hirschman Index (0–10000) */
  hhi: number;
  /** Portfolio diversification rating */
  diversificationRating: "poor" | "moderate" | "good" | "excellent";
  /** Symbols that need rebalancing (drift > threshold) */
  rebalanceNeeded: string[];
  /** Overall portfolio risk level */
  riskLevel: "low" | "moderate" | "high";
  /** Timestamp */
  analysedAt: string;
}

export interface PositionSizeRecommendation {
  symbol: string;
  action: "BUY" | "SELL";
  /** Recommended number of shares */
  shares: number;
  /** USD value of recommended trade */
  valueUsd: number;
  /** Reasoning */
  reasoning: string;
}

// ─── Helpers ───

interface HoldingRow {
  symbol: string;
  name: string | null;
  shares: number | string;
  cost_price: number | string | null;
  current_price: number | string | null;
  price_currency: string | null;
}

interface PriceHistoryRow {
  price: number | string;
  created_at: string;
}

const toNum = (v: number | string | null | undefined): number => {
  if (typeof v === "number") return v;
  if (typeof v === "string") return parseFloat(v) || 0;
  return 0;
};

/**
 * Compute annualised volatility from recent daily price changes.
 * Uses standard deviation of log-returns × sqrt(252).
 */
async function computeVolatility(symbol: string): Promise<number | null> {
  try {
    const sql = `SELECT price, created_at FROM "st-price-history"
      WHERE symbol = ${toSqlVal(symbol)}
      ORDER BY created_at DESC LIMIT 60`;
    const { rows } = await pool.query(sql);
    const prices = (rows as PriceHistoryRow[])
      .map(r => toNum(r.price))
      .filter(p => p > 0)
      .reverse();

    if (prices.length < 10) return null;

    // Compute log-returns
    const returns: number[] = [];
    for (let i = 1; i < prices.length; i++) {
      returns.push(Math.log(prices[i] / prices[i - 1]));
    }

    const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
    const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1);
    const dailyStdDev = Math.sqrt(variance);

    // Annualise: assume ~6 data points per trading day (5-min intervals)
    // so daily vol = stddev * sqrt(points_per_day). Since our data spacing
    // varies, we use a conservative multiplier.
    // With 5-min data: ~78 points/day for US, ~60 for HK.
    // A rough estimate: treat each row as ~30 min apart → ~13 per day
    const pointsPerDay = 13;
    const dailyVol = dailyStdDev * Math.sqrt(pointsPerDay);
    const annualisedVol = dailyVol * Math.sqrt(252);

    return Math.round(annualisedVol * 10000) / 100; // percentage with 2 decimals
  } catch {
    return null;
  }
}

// ─── Core Functions ───

/**
 * Load all current holdings and enrich with USD values and volatility.
 */
export async function getPositionSnapshots(): Promise<PositionSnapshot[]> {
  const { rows } = await pool.query(
    `SELECT symbol, name, shares, cost_price, current_price, price_currency
     FROM "st-holdings" WHERE shares > 0 ORDER BY symbol`
  );

  const snapshots: PositionSnapshot[] = [];
  for (const row of rows as HoldingRow[]) {
    const shares = toNum(row.shares);
    if (shares <= 0) continue;

    const currentPrice = toNum(row.current_price);
    const costPrice = toNum(row.cost_price);
    const currency = row.price_currency || "USD";

    const marketValueUsd = await convertToUsdAsync(currentPrice * shares, currency);
    const costBasisUsd = await convertToUsdAsync(costPrice * shares, currency);
    const pnlUsd = marketValueUsd - costBasisUsd;
    const pnlPct = costBasisUsd > 0 ? (pnlUsd / costBasisUsd) * 100 : 0;

    const volatilityPct = await computeVolatility(row.symbol);

    snapshots.push({
      symbol: row.symbol,
      name: row.name || row.symbol,
      shares,
      currentPrice,
      costPrice,
      currency,
      marketValueUsd,
      costBasisUsd,
      pnlUsd,
      pnlPct,
      volatilityPct,
    });
  }

  return snapshots;
}

/**
 * Compute target allocations using inverse-volatility weighting (risk parity lite).
 * Positions without volatility data fall back to equal-weight.
 */
export function computeTargetAllocations(
  positions: PositionSnapshot[],
  totalValueUsd: number,
): AllocationTarget[] {
  if (positions.length === 0 || totalValueUsd <= 0) return [];

  // Step 1: compute raw inverse-vol weights
  const volData = positions.map(p => ({
    symbol: p.symbol,
    invVol: p.volatilityPct && p.volatilityPct > 0 ? 1 / p.volatilityPct : null,
  }));

  const hasVol = volData.filter(v => v.invVol !== null);
  const noVol = volData.filter(v => v.invVol === null);

  let weights: Map<string, number>;

  if (hasVol.length >= 2) {
    // Risk parity: weight proportional to 1/volatility
    const totalInvVol = hasVol.reduce((s, v) => s + (v.invVol as number), 0);
    weights = new Map();

    for (const v of hasVol) {
      weights.set(v.symbol, (v.invVol as number) / totalInvVol);
    }
    // Positions without vol data get the average of computed weights
    if (noVol.length > 0) {
      const avgWeight = 1 / positions.length;
      for (const v of noVol) {
        weights.set(v.symbol, avgWeight);
      }
      // Renormalise
      const totalW = Array.from(weights.values()).reduce((s, w) => s + w, 0);
      for (const [k, v] of weights) {
        weights.set(k, v / totalW);
      }
    }
  } else {
    // Not enough vol data → equal weight
    const eqWeight = 1 / positions.length;
    weights = new Map(positions.map(p => [p.symbol, eqWeight]));
  }

  // Step 2: cap at MAX_SINGLE_WEIGHT and redistribute excess.
  // Only apply the cap when the portfolio has enough positions that
  // equal-weight is below the cap (otherwise every position gets clipped).
  const equalWeight = 1 / positions.length;
  if (equalWeight < MAX_SINGLE_WEIGHT) {
    let redistributed = true;
    // Iterate until stable (convergence usually in 2-3 passes)
    for (let round = 0; round < 5 && redistributed; round++) {
      redistributed = false;
      let excess = 0;
      let uncappedTotal = 0;
      const capped = new Set<string>();
      for (const [sym, w] of weights) {
        if (w > MAX_SINGLE_WEIGHT) {
          excess += w - MAX_SINGLE_WEIGHT;
          weights.set(sym, MAX_SINGLE_WEIGHT);
          capped.add(sym);
          redistributed = true;
        } else {
          uncappedTotal += w;
        }
      }
      if (excess > 0 && uncappedTotal > 0) {
        for (const [sym, w] of weights) {
          if (!capped.has(sym)) {
            weights.set(sym, w + (excess * (w / uncappedTotal)));
          }
        }
      }
    }
  }

  // Normalise weights to exactly sum to 1
  const totalWFinal = Array.from(weights.values()).reduce((s, w) => s + w, 0);
  if (totalWFinal > 0 && Math.abs(totalWFinal - 1) > 0.001) {
    for (const [k, v] of weights) {
      weights.set(k, v / totalWFinal);
    }
  }

  // Step 3: compute actual weights and drift
  const allocations: AllocationTarget[] = positions.map(p => {
    const targetWeight = weights.get(p.symbol) || 0;
    const actualWeight = totalValueUsd > 0 ? p.marketValueUsd / totalValueUsd : 0;
    const driftPct = (actualWeight - targetWeight) * 100;

    let action: AllocationTarget["action"] = "on_target";
    if (driftPct > REBALANCE_DRIFT_PCT) action = "overweight";
    else if (driftPct < -REBALANCE_DRIFT_PCT) action = "underweight";

    const targetValueUsd = targetWeight * totalValueUsd;
    const suggestedDeltaUsd = targetValueUsd - p.marketValueUsd;

    return {
      symbol: p.symbol,
      targetWeight,
      actualWeight,
      driftPct,
      action,
      suggestedDeltaUsd,
    };
  });

  return allocations;
}

/**
 * Compute Herfindahl–Hirschman Index for portfolio concentration.
 * HHI ranges from 1/N × 10000 (perfectly diversified) to 10000 (single stock).
 */
function computeHHI(positions: PositionSnapshot[], totalValueUsd: number): number {
  if (positions.length === 0 || totalValueUsd <= 0) return 10000;
  let hhi = 0;
  for (const p of positions) {
    const weight = p.marketValueUsd / totalValueUsd;
    hhi += (weight * 100) ** 2;
  }
  return Math.round(hhi);
}

function getDiversificationRating(hhi: number, count: number): PortfolioAnalysis["diversificationRating"] {
  if (count <= 1) return "poor";
  if (hhi > 5000) return "poor";
  if (hhi > 3000) return "moderate";
  if (hhi > 1800) return "good";
  return "excellent";
}

function getRiskLevel(
  hhi: number,
  positions: PositionSnapshot[],
): PortfolioAnalysis["riskLevel"] {
  // High concentration = high risk
  if (hhi > 5000) return "high";

  // Check if any single position has > 50% drawdown
  const deepLoss = positions.some(p => p.pnlPct < -30);
  if (deepLoss) return "high";

  // Check average volatility
  const vols = positions.map(p => p.volatilityPct).filter((v): v is number => v !== null);
  const avgVol = vols.length > 0 ? vols.reduce((s, v) => s + v, 0) / vols.length : 0;
  if (avgVol > 60) return "high";
  if (avgVol > 35) return "moderate";

  if (hhi > 3000) return "moderate";
  return "low";
}

/**
 * Full portfolio analysis: positions, allocations, risk metrics.
 */
export async function analyzePortfolio(): Promise<PortfolioAnalysis> {
  const positions = await getPositionSnapshots();
  const totalValueUsd = positions.reduce((s, p) => s + p.marketValueUsd, 0);
  const allocations = computeTargetAllocations(positions, totalValueUsd);
  const hhi = computeHHI(positions, totalValueUsd);
  const rebalanceNeeded = allocations
    .filter(a => a.action !== "on_target")
    .map(a => a.symbol);

  return {
    totalValueUsd,
    positions,
    allocations,
    hhi,
    diversificationRating: getDiversificationRating(hhi, positions.length),
    rebalanceNeeded,
    riskLevel: getRiskLevel(hhi, positions),
    analysedAt: new Date().toISOString(),
  };
}

// ─── Position Sizing for Trade Decisions ───

/**
 * Compute portfolio-aware position size for a BUY or SELL decision.
 *
 * Uses a simplified Kelly fraction:
 *   fraction = confidence% × (1 − currentWeight / maxWeight)
 *
 * Returns recommended shares and USD value.
 */
export async function computePositionSize(
  symbol: string,
  action: "BUY" | "SELL",
  confidence: number,
  currentPrice: number,
  currency: string,
  currentShares: number,
): Promise<PositionSizeRecommendation> {
  const positions = await getPositionSnapshots();
  const totalValueUsd = positions.reduce((s, p) => s + p.marketValueUsd, 0);
  const effectivePortfolioValue = Math.max(totalValueUsd, 10_000); // assume min $10k portfolio

  const currentPosition = positions.find(p => p.symbol === symbol);
  const currentWeight = currentPosition
    ? currentPosition.marketValueUsd / effectivePortfolioValue
    : 0;

  const allocations = computeTargetAllocations(positions, effectivePortfolioValue);
  const alloc = allocations.find(a => a.symbol === symbol);
  const targetWeight = alloc?.targetWeight ?? (1 / Math.max(positions.length, 1));

  const priceUsd = await convertToUsdAsync(currentPrice, currency);

  if (action === "BUY") {
    // Available room = target weight − current weight, capped at MAX_SINGLE_WEIGHT
    const roomWeight = Math.max(0, Math.min(MAX_SINGLE_WEIGHT, targetWeight * 1.2) - currentWeight);
    if (roomWeight <= 0) {
      return {
        symbol,
        action: "BUY",
        shares: 0,
        valueUsd: 0,
        reasoning: `仓位已达目标权重上限 (${(currentWeight * 100).toFixed(1)}%)，暂不加仓`,
      };
    }

    // Kelly-lite: fraction = (confidence/100) × roomWeight
    const fraction = (confidence / 100) * roomWeight;
    const targetTradeUsd = Math.min(
      fraction * effectivePortfolioValue,
      MAX_PORTFOLIO_USD * MAX_SINGLE_WEIGHT - (currentPosition?.marketValueUsd ?? 0),
    );

    if (targetTradeUsd < MIN_TRADE_VALUE_USD) {
      return {
        symbol,
        action: "BUY",
        shares: 0,
        valueUsd: 0,
        reasoning: `建议买入金额过小 ($${targetTradeUsd.toFixed(0)})，低于最低交易阈值`,
      };
    }

    const shares = Math.max(1, Math.floor(targetTradeUsd / priceUsd));
    const valueUsd = shares * priceUsd;

    return {
      symbol,
      action: "BUY",
      shares,
      valueUsd,
      reasoning: `组合优化：目标权重 ${(targetWeight * 100).toFixed(1)}%，当前 ${(currentWeight * 100).toFixed(1)}%，信心 ${confidence}%，建议买入 ${shares} 股 (~$${valueUsd.toFixed(0)})`,
    };
  } else {
    // SELL sizing: sell proportional to confidence and overweight amount
    const overweightUsd = Math.max(0, (currentWeight - targetWeight) * effectivePortfolioValue);
    const confidenceFraction = Math.min(0.5, confidence / 200); // max 50% of position per trade

    let targetSellUsd: number;
    if (overweightUsd > MIN_TRADE_VALUE_USD) {
      // If overweight, sell at least the overweight amount (confidence-adjusted)
      targetSellUsd = overweightUsd * confidenceFraction * 2;
    } else {
      // Not overweight: use pure confidence-based sizing
      targetSellUsd = (currentPosition?.marketValueUsd ?? 0) * confidenceFraction;
    }

    if (targetSellUsd < MIN_TRADE_VALUE_USD) {
      return {
        symbol,
        action: "SELL",
        shares: 0,
        valueUsd: 0,
        reasoning: `建议卖出金额过小 ($${targetSellUsd.toFixed(0)})，低于最低交易阈值`,
      };
    }

    const shares = Math.min(currentShares, Math.max(1, Math.floor(targetSellUsd / priceUsd)));
    const valueUsd = shares * priceUsd;

    return {
      symbol,
      action: "SELL",
      shares,
      valueUsd,
      reasoning: `组合优化：目标权重 ${(targetWeight * 100).toFixed(1)}%，当前 ${(currentWeight * 100).toFixed(1)}%，信心 ${confidence}%，建议卖出 ${shares} 股 (~$${valueUsd.toFixed(0)})`,
    };
  }
}
