import { describe, it, expect } from "vitest";
import {
  MeanReversionStrategy,
  TrendFollowingStrategy,
  EventDrivenStrategy,
  StrategyRegistry,
  evaluateEnsemble,
  type StrategyContext,
} from "../strategies";
import type { TechnicalIndicators } from "../technical-indicators";

function makeTI(overrides: Partial<TechnicalIndicators> = {}): TechnicalIndicators {
  return {
    sma5: null, sma20: null, sma60: null, ema12: null, ema26: null,
    maShortAboveLong: null, maGoldenCross: null, priceAboveSma20: null, priceAboveSma60: null,
    rsi14: null, rsiSignal: null,
    macdLine: null, macdSignal: null, macdHistogram: null, macdBullish: null,
    bollingerUpper: null, bollingerMiddle: null, bollingerLower: null, bollingerPosition: null,
    atr14: null, volatilityPct: null, dailyReturnStdDev: null,
    volumeRatio: null, volumeTrend: null, suddenVolumeSpike: null,
    roc5: null, roc20: null,
    consecutiveUp: 0, consecutiveDown: 0,
    distanceFrom52wHigh: null, distanceFrom52wLow: null,
    technicalScore: 0, technicalSignal: "neutral",
    dataPoints: 30,
    ...overrides,
  };
}

function makeCtx(overrides: Partial<StrategyContext> = {}): StrategyContext {
  return {
    symbol: "TEST",
    currentPrice: 100,
    currency: "USD",
    costPrice: null,
    shares: 0,
    technicalIndicators: makeTI(),
    sentimentScore: 0,
    positiveHits: [],
    negativeHits: [],
    recentPriceHistory: [],
    quote: null,
    ...overrides,
  };
}

describe("MeanReversionStrategy", () => {
  const strategy = new MeanReversionStrategy();

  it("generates buy signal when RSI oversold + Bollinger low", () => {
    const ctx = makeCtx({
      technicalIndicators: makeTI({ rsi14: 22, bollingerPosition: 0.05 }),
    });
    const signal = strategy.evaluate(ctx);
    expect(signal.direction).toBeGreaterThan(40);
    expect(signal.confidence).toBeGreaterThan(50);
  });

  it("generates sell signal when RSI overbought + Bollinger high", () => {
    const ctx = makeCtx({
      technicalIndicators: makeTI({ rsi14: 78, bollingerPosition: 0.92 }),
    });
    const signal = strategy.evaluate(ctx);
    expect(signal.direction).toBeLessThan(-40);
  });

  it("returns neutral when no extreme signals", () => {
    const ctx = makeCtx({
      technicalIndicators: makeTI({ rsi14: 50, bollingerPosition: 0.5 }),
    });
    const signal = strategy.evaluate(ctx);
    expect(signal.direction).toBe(0);
  });

  it("returns low confidence when insufficient data", () => {
    const ctx = makeCtx({
      technicalIndicators: makeTI({ dataPoints: 5 }),
    });
    const signal = strategy.evaluate(ctx);
    expect(signal.confidence).toBe(0);
  });
});

describe("TrendFollowingStrategy", () => {
  const strategy = new TrendFollowingStrategy();

  it("generates buy signal on bullish trend alignment", () => {
    const ctx = makeCtx({
      technicalIndicators: makeTI({
        dataPoints: 30,
        maShortAboveLong: true,
        maGoldenCross: true,
        priceAboveSma20: true,
        macdBullish: true,
        roc5: 5,
      }),
    });
    const signal = strategy.evaluate(ctx);
    expect(signal.direction).toBeGreaterThan(40);
  });

  it("generates sell signal on bearish trend alignment", () => {
    const ctx = makeCtx({
      technicalIndicators: makeTI({
        dataPoints: 30,
        maShortAboveLong: false,
        maGoldenCross: false,
        priceAboveSma20: false,
        macdBullish: false,
        roc5: -5,
      }),
    });
    const signal = strategy.evaluate(ctx);
    expect(signal.direction).toBeLessThan(-40);
  });

  it("amplifies signal on volume spike", () => {
    const withSpike = makeCtx({
      technicalIndicators: makeTI({
        dataPoints: 30,
        maShortAboveLong: true,
        roc5: 3,
        suddenVolumeSpike: true,
      }),
    });
    const withoutSpike = makeCtx({
      technicalIndicators: makeTI({
        dataPoints: 30,
        maShortAboveLong: true,
        roc5: 3,
        suddenVolumeSpike: false,
      }),
    });
    const spikeSignal = strategy.evaluate(withSpike);
    const noSpikeSignal = strategy.evaluate(withoutSpike);
    expect(spikeSignal.direction).toBeGreaterThan(noSpikeSignal.direction);
  });
});

describe("EventDrivenStrategy", () => {
  const strategy = new EventDrivenStrategy();

  it("generates buy signal on strong positive sentiment", () => {
    const ctx = makeCtx({
      sentimentScore: 0.5,
      positiveHits: ["beat expectations", "upgrade"],
    });
    const signal = strategy.evaluate(ctx);
    expect(signal.direction).toBeGreaterThan(20);
  });

  it("generates sell signal on strong negative sentiment", () => {
    const ctx = makeCtx({
      sentimentScore: -0.5,
      negativeHits: ["downgrade", "fraud"],
    });
    const signal = strategy.evaluate(ctx);
    expect(signal.direction).toBeLessThan(-20);
  });

  it("factors in PE valuation", () => {
    const lowPE = makeCtx({
      quote: { pe: 10, dividendYield: null, changePercent: 0, fiftyTwoWeekHigh: null, fiftyTwoWeekLow: null },
    });
    const highPE = makeCtx({
      quote: { pe: 50, dividendYield: null, changePercent: 0, fiftyTwoWeekHigh: null, fiftyTwoWeekLow: null },
    });
    const lowSignal = strategy.evaluate(lowPE);
    const highSignal = strategy.evaluate(highPE);
    expect(lowSignal.direction).toBeGreaterThan(highSignal.direction);
  });
});

describe("StrategyRegistry", () => {
  it("registers and retrieves strategies", () => {
    const reg = new StrategyRegistry();
    const s = new MeanReversionStrategy();
    reg.register(s);
    expect(reg.get("mean_reversion")).toBe(s);
    expect(reg.getAll()).toHaveLength(1);
  });

  it("filters enabled strategies", () => {
    const reg = new StrategyRegistry();
    reg.register(new MeanReversionStrategy());
    reg.register(new TrendFollowingStrategy());
    reg.setEnabled("mean_reversion", false);
    expect(reg.getEnabled()).toHaveLength(1);
    expect(reg.getEnabled()[0].name).toBe("trend_following");
  });

  it("unregisters strategies", () => {
    const reg = new StrategyRegistry();
    reg.register(new MeanReversionStrategy());
    reg.unregister("mean_reversion");
    expect(reg.getAll()).toHaveLength(0);
  });
});

describe("evaluateEnsemble", () => {
  it("aggregates signals with weighted average", () => {
    const reg = new StrategyRegistry();
    reg.register(new MeanReversionStrategy());
    reg.register(new TrendFollowingStrategy());
    reg.register(new EventDrivenStrategy());

    const ctx = makeCtx({
      technicalIndicators: makeTI({
        dataPoints: 30,
        rsi14: 22,
        bollingerPosition: 0.05,
        maShortAboveLong: true,
        macdBullish: true,
      }),
      sentimentScore: 0.4,
    });

    const result = evaluateEnsemble(ctx, reg);
    expect(result.action).toBe("BUY");
    expect(result.direction).toBeGreaterThan(15);
    expect(result.signals).toHaveLength(3);
    expect(Object.keys(result.weights)).toHaveLength(3);
  });

  it("returns HOLD for empty registry", () => {
    const reg = new StrategyRegistry();
    const ctx = makeCtx();
    const result = evaluateEnsemble(ctx, reg);
    expect(result.action).toBe("HOLD");
    expect(result.confidence).toBe(0);
  });

  it("returns SELL when all strategies are bearish", () => {
    const reg = new StrategyRegistry();
    reg.register(new MeanReversionStrategy());
    reg.register(new TrendFollowingStrategy());
    reg.register(new EventDrivenStrategy());

    const ctx = makeCtx({
      technicalIndicators: makeTI({
        dataPoints: 30,
        rsi14: 80,
        bollingerPosition: 0.95,
        maShortAboveLong: false,
        maGoldenCross: false,
        macdBullish: false,
        roc5: -5,
      }),
      sentimentScore: -0.5,
      negativeHits: ["downgrade"],
    });

    const result = evaluateEnsemble(ctx, reg);
    expect(result.action).toBe("SELL");
    expect(result.direction).toBeLessThan(-15);
  });
});
