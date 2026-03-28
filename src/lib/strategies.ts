/**
 * Strategy Plugin Architecture
 *
 * Defines a common interface for trading strategies and provides three
 * built-in implementations:
 *   1. MeanReversion — Buy oversold, sell overbought (RSI + Bollinger)
 *   2. TrendFollowing — Trade in the direction of SMA/MACD trends
 *   3. EventDriven — News sentiment-weighted decisions
 *
 * Strategies return a StrategySignal, which the decision engine aggregates
 * (weighted by per-strategy confidence) to produce a final action.
 *
 * New strategies can be added by implementing TradingStrategy and
 * registering them with the StrategyRegistry.
 */

import type { TechnicalIndicators } from "./technical-indicators";

// ─── Core Interface ───

export interface StrategyContext {
  symbol: string;
  currentPrice: number;
  currency: string;
  costPrice: number | null;
  shares: number;
  technicalIndicators: TechnicalIndicators | null;
  sentimentScore: number;
  positiveHits: string[];
  negativeHits: string[];
  recentPriceHistory: Array<{
    price: number;
    changePercent: number;
    timestamp: string;
  }>;
  quote: {
    pe: number | null;
    dividendYield: number | null;
    changePercent: number;
    fiftyTwoWeekHigh: number | null;
    fiftyTwoWeekLow: number | null;
  } | null;
}

export interface StrategySignal {
  /** Strategy name for logging */
  strategyName: string;
  /** BUY (+), SELL (−), or HOLD (0) direction */
  direction: number; // -100 to +100
  /** How confident the strategy is in its signal (0–100) */
  confidence: number;
  /** Human-readable reasoning */
  reasoning: string;
  /** Strategy-specific metadata */
  metadata?: Record<string, unknown>;
}

export interface TradingStrategy {
  /** Unique name */
  name: string;
  /** Short description */
  description: string;
  /** Weight in the ensemble (0–1, normalised across all active strategies) */
  weight: number;
  /** Whether this strategy is active */
  enabled: boolean;
  /** Generate a signal for the given context */
  evaluate(context: StrategyContext): StrategySignal;
}

// ─── Built-in Strategies ───

/**
 * Mean Reversion Strategy (做 T)
 *
 * Buys when price is oversold (RSI < 30, Bollinger < 0.15) and sells
 * when overbought (RSI > 70, Bollinger > 0.85). Designed for intraday
 * mean-reversion trades.
 */
export class MeanReversionStrategy implements TradingStrategy {
  name = "mean_reversion";
  description = "均值回归策略：超卖买入，超买卖出";
  weight = 0.3;
  enabled = true;

  evaluate(ctx: StrategyContext): StrategySignal {
    const ti = ctx.technicalIndicators;
    if (!ti || ti.dataPoints < 10) {
      return {
        strategyName: this.name,
        direction: 0,
        confidence: 0,
        reasoning: "技术数据不足，无法评估",
      };
    }

    let direction = 0;
    let confidence = 30;
    const reasons: string[] = [];

    // RSI signals
    if (ti.rsi14 !== null) {
      if (ti.rsi14 < 25) {
        direction += 40;
        confidence += 25;
        reasons.push(`RSI 深度超卖 (${ti.rsi14.toFixed(0)})`);
      } else if (ti.rsi14 < 30) {
        direction += 25;
        confidence += 15;
        reasons.push(`RSI 超卖 (${ti.rsi14.toFixed(0)})`);
      } else if (ti.rsi14 > 75) {
        direction -= 40;
        confidence += 25;
        reasons.push(`RSI 深度超买 (${ti.rsi14.toFixed(0)})`);
      } else if (ti.rsi14 > 70) {
        direction -= 25;
        confidence += 15;
        reasons.push(`RSI 超买 (${ti.rsi14.toFixed(0)})`);
      }
    }

    // Bollinger Band signals
    if (ti.bollingerPosition !== null) {
      if (ti.bollingerPosition < 0.1) {
        direction += 30;
        confidence += 20;
        reasons.push(`触及布林下轨 (${(ti.bollingerPosition * 100).toFixed(0)}%)`);
      } else if (ti.bollingerPosition < 0.2) {
        direction += 15;
        confidence += 10;
        reasons.push(`接近布林下轨`);
      } else if (ti.bollingerPosition > 0.9) {
        direction -= 30;
        confidence += 20;
        reasons.push(`触及布林上轨 (${(ti.bollingerPosition * 100).toFixed(0)}%)`);
      } else if (ti.bollingerPosition > 0.8) {
        direction -= 15;
        confidence += 10;
        reasons.push(`接近布林上轨`);
      }
    }

    // Cost basis opportunity
    if (ctx.costPrice && ctx.costPrice > 0 && ctx.shares > 0) {
      const ratio = ctx.currentPrice / ctx.costPrice;
      if (ratio < 0.95 && direction > 0) {
        direction += 15;
        reasons.push(`价格低于成本 ${((1 - ratio) * 100).toFixed(1)}%，摊薄机会`);
      } else if (ratio > 1.05 && direction < 0) {
        direction -= 10;
        reasons.push(`价格高于成本 ${((ratio - 1) * 100).toFixed(1)}%，止盈机会`);
      }
    }

    return {
      strategyName: this.name,
      direction: Math.max(-100, Math.min(100, direction)),
      confidence: Math.min(95, confidence),
      reasoning: reasons.length > 0 ? reasons.join(" | ") : "无明显均值回归信号",
    };
  }
}

/**
 * Trend Following Strategy
 *
 * Trades in the direction of the prevailing trend as indicated by
 * moving average crossovers, MACD, and momentum.
 */
export class TrendFollowingStrategy implements TradingStrategy {
  name = "trend_following";
  description = "趋势跟踪策略：顺势交易";
  weight = 0.35;
  enabled = true;

  evaluate(ctx: StrategyContext): StrategySignal {
    const ti = ctx.technicalIndicators;
    if (!ti || ti.dataPoints < 20) {
      return {
        strategyName: this.name,
        direction: 0,
        confidence: 0,
        reasoning: "技术数据不足，无法评估趋势",
      };
    }

    let direction = 0;
    let confidence = 25;
    const reasons: string[] = [];

    // Moving average alignment
    if (ti.maShortAboveLong === true) {
      direction += 20;
      confidence += 10;
      reasons.push("短期均线上穿长期均线");
    } else if (ti.maShortAboveLong === false) {
      direction -= 20;
      confidence += 10;
      reasons.push("短期均线下穿长期均线");
    }

    if (ti.maGoldenCross === true) {
      direction += 15;
      confidence += 10;
      reasons.push("金叉形态");
    } else if (ti.maGoldenCross === false) {
      direction -= 15;
      confidence += 10;
      reasons.push("死叉形态");
    }

    // Price relative to SMA20
    if (ti.priceAboveSma20 === true) {
      direction += 10;
      reasons.push("价格在20日均线上方");
    } else if (ti.priceAboveSma20 === false) {
      direction -= 10;
      reasons.push("价格在20日均线下方");
    }

    // MACD
    if (ti.macdBullish === true) {
      direction += 15;
      confidence += 10;
      reasons.push("MACD 看多");
    } else if (ti.macdBullish === false) {
      direction -= 15;
      confidence += 10;
      reasons.push("MACD 看空");
    }

    // MACD histogram momentum
    if (ti.macdHistogram !== null) {
      if (ti.macdHistogram > 0) {
        direction += 5;
        reasons.push(`MACD柱体正值 (${ti.macdHistogram.toFixed(2)})`);
      } else {
        direction -= 5;
        reasons.push(`MACD柱体负值 (${ti.macdHistogram.toFixed(2)})`);
      }
    }

    // Momentum (ROC)
    if (ti.roc5 !== null) {
      if (ti.roc5 > 3) {
        direction += 10;
        reasons.push(`5期动量强劲 (+${ti.roc5.toFixed(1)}%)`);
      } else if (ti.roc5 < -3) {
        direction -= 10;
        reasons.push(`5期动量疲弱 (${ti.roc5.toFixed(1)}%)`);
      }
    }

    // Volume confirmation
    if (ti.suddenVolumeSpike && ti.roc5 !== null) {
      if (ti.roc5 > 0) {
        direction += 15;
        confidence += 10;
        reasons.push("放量上涨确认趋势");
      } else if (ti.roc5 < 0) {
        direction -= 15;
        confidence += 10;
        reasons.push("放量下跌确认趋势");
      }
    }

    // Consecutive days
    if (ti.consecutiveUp >= 3) {
      direction += 8;
      reasons.push(`连涨 ${ti.consecutiveUp} 天`);
    } else if (ti.consecutiveDown >= 3) {
      direction -= 8;
      reasons.push(`连跌 ${ti.consecutiveDown} 天`);
    }

    return {
      strategyName: this.name,
      direction: Math.max(-100, Math.min(100, direction)),
      confidence: Math.min(95, confidence),
      reasoning: reasons.length > 0 ? reasons.join(" | ") : "趋势不明确",
    };
  }
}

/**
 * Event-Driven Strategy
 *
 * Weights decisions based on news sentiment, fundamental valuation,
 * and significant price movements (earnings surprises, etc.).
 */
export class EventDrivenStrategy implements TradingStrategy {
  name = "event_driven";
  description = "事件驱动策略：新闻情绪+基本面";
  weight = 0.35;
  enabled = true;

  evaluate(ctx: StrategyContext): StrategySignal {
    let direction = 0;
    let confidence = 20;
    const reasons: string[] = [];

    // Sentiment score (-1 to +1)
    if (ctx.sentimentScore > 0.3) {
      direction += 30;
      confidence += 20;
      reasons.push(`情绪强烈看多 (${ctx.sentimentScore.toFixed(2)})`);
    } else if (ctx.sentimentScore > 0.1) {
      direction += 15;
      confidence += 10;
      reasons.push(`情绪偏多 (${ctx.sentimentScore.toFixed(2)})`);
    } else if (ctx.sentimentScore < -0.3) {
      direction -= 30;
      confidence += 20;
      reasons.push(`情绪强烈看空 (${ctx.sentimentScore.toFixed(2)})`);
    } else if (ctx.sentimentScore < -0.1) {
      direction -= 15;
      confidence += 10;
      reasons.push(`情绪偏空 (${ctx.sentimentScore.toFixed(2)})`);
    }

    if (ctx.positiveHits.length > 0) {
      reasons.push(`利好: ${ctx.positiveHits.slice(0, 3).join(", ")}`);
    }
    if (ctx.negativeHits.length > 0) {
      reasons.push(`利空: ${ctx.negativeHits.slice(0, 3).join(", ")}`);
    }

    // Fundamental valuation
    if (ctx.quote) {
      if (ctx.quote.pe !== null && ctx.quote.pe > 0) {
        if (ctx.quote.pe < 15) {
          direction += 12;
          confidence += 5;
          reasons.push(`低估值 (PE: ${ctx.quote.pe.toFixed(1)})`);
        } else if (ctx.quote.pe > 40) {
          direction -= 8;
          confidence += 5;
          reasons.push(`高估值 (PE: ${ctx.quote.pe.toFixed(1)})`);
        }
      }

      if (ctx.quote.dividendYield && ctx.quote.dividendYield > 2) {
        direction += 8;
        reasons.push(`高股息 (${ctx.quote.dividendYield.toFixed(2)}%)`);
      }

      // 52-week range context
      if (ctx.quote.fiftyTwoWeekLow && ctx.currentPrice < ctx.quote.fiftyTwoWeekLow * 1.1) {
        direction += 15;
        confidence += 10;
        reasons.push("接近52周低位，反弹概率高");
      }
      if (ctx.quote.fiftyTwoWeekHigh && ctx.currentPrice > ctx.quote.fiftyTwoWeekHigh * 0.95) {
        direction -= 10;
        confidence += 5;
        reasons.push("接近52周高位，谨慎追高");
      }

      // Significant daily move
      if (Math.abs(ctx.quote.changePercent) > 5) {
        if (ctx.quote.changePercent > 0) {
          direction += 10;
          reasons.push(`大幅上涨 (+${ctx.quote.changePercent.toFixed(1)}%)`);
        } else {
          direction -= 10;
          reasons.push(`大幅下跌 (${ctx.quote.changePercent.toFixed(1)}%)`);
        }
      }
    }

    return {
      strategyName: this.name,
      direction: Math.max(-100, Math.min(100, direction)),
      confidence: Math.min(95, confidence),
      reasoning: reasons.length > 0 ? reasons.join(" | ") : "无显著事件驱动信号",
    };
  }
}

// ─── Strategy Registry ───

export class StrategyRegistry {
  private strategies: Map<string, TradingStrategy> = new Map();

  register(strategy: TradingStrategy): void {
    this.strategies.set(strategy.name, strategy);
  }

  unregister(name: string): void {
    this.strategies.delete(name);
  }

  get(name: string): TradingStrategy | undefined {
    return this.strategies.get(name);
  }

  getAll(): TradingStrategy[] {
    return Array.from(this.strategies.values());
  }

  getEnabled(): TradingStrategy[] {
    return this.getAll().filter(s => s.enabled);
  }

  setEnabled(name: string, enabled: boolean): void {
    const strategy = this.strategies.get(name);
    if (strategy) strategy.enabled = enabled;
  }

  setWeight(name: string, weight: number): void {
    const strategy = this.strategies.get(name);
    if (strategy) strategy.weight = Math.max(0, Math.min(1, weight));
  }
}

// ─── Default Registry ───

const defaultRegistry = new StrategyRegistry();
defaultRegistry.register(new MeanReversionStrategy());
defaultRegistry.register(new TrendFollowingStrategy());
defaultRegistry.register(new EventDrivenStrategy());

export function getDefaultRegistry(): StrategyRegistry {
  return defaultRegistry;
}

// ─── Ensemble Signal Aggregation ───

export interface EnsembleResult {
  /** Aggregated direction (-100 to +100) */
  direction: number;
  /** Final action */
  action: "BUY" | "SELL" | "HOLD";
  /** Aggregated confidence (0–100) */
  confidence: number;
  /** Combined reasoning */
  reasoning: string;
  /** Per-strategy signals */
  signals: StrategySignal[];
  /** Strategy weights used */
  weights: Record<string, number>;
}

/**
 * Run all enabled strategies and aggregate signals using weighted average.
 */
export function evaluateEnsemble(
  context: StrategyContext,
  registry?: StrategyRegistry,
): EnsembleResult {
  const reg = registry || defaultRegistry;
  const strategies = reg.getEnabled();

  if (strategies.length === 0) {
    return {
      direction: 0,
      action: "HOLD",
      confidence: 0,
      reasoning: "无活跃策略",
      signals: [],
      weights: {},
    };
  }

  // Normalise weights
  const totalWeight = strategies.reduce((s, st) => s + st.weight, 0);
  const normWeights = new Map(
    strategies.map(s => [s.name, totalWeight > 0 ? s.weight / totalWeight : 1 / strategies.length]),
  );

  // Evaluate each strategy
  const signals: StrategySignal[] = [];
  let weightedDirection = 0;
  let weightedConfidence = 0;
  const weights: Record<string, number> = {};

  for (const strategy of strategies) {
    const signal = strategy.evaluate(context);
    signals.push(signal);
    const w = normWeights.get(strategy.name) || 0;
    weights[strategy.name] = w;
    weightedDirection += signal.direction * w;
    weightedConfidence += signal.confidence * w;
  }

  // Determine action from aggregated direction
  const direction = Math.max(-100, Math.min(100, Math.round(weightedDirection)));
  const confidence = Math.min(95, Math.round(weightedConfidence));

  let action: "BUY" | "SELL" | "HOLD";
  if (direction > 15) action = "BUY";
  else if (direction < -15) action = "SELL";
  else action = "HOLD";

  // Build combined reasoning
  const reasoningParts = signals
    .filter(s => s.confidence > 0)
    .map(s => `[${s.strategyName}] ${s.reasoning}`)
    .join(" || ");

  return {
    direction,
    action,
    confidence,
    reasoning: reasoningParts || "综合评估无明确信号",
    signals,
    weights,
  };
}
