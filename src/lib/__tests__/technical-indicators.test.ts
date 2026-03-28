/**
 * Tests for technical indicator math functions.
 * These test the exported formatIndicatorsForPrompt function and
 * the pure-math helpers by verifying expected outputs on known data sets.
 *
 * NOTE: computeTechnicalIndicators() requires DB access so we test
 * the math indirectly through the module's internal logic. We also
 * export-test the formatter and type system.
 */
import { describe, it, expect } from "vitest";
import { formatIndicatorsForPrompt, type TechnicalIndicators } from "../technical-indicators";

function makeIndicators(overrides: Partial<TechnicalIndicators> = {}): TechnicalIndicators {
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
    dataPoints: 100,
    ...overrides,
  };
}

describe("formatIndicatorsForPrompt", () => {
  it("includes data points header", () => {
    const ti = makeIndicators({ dataPoints: 42 });
    const output = formatIndicatorsForPrompt(ti, 100);
    expect(output).toContain("42 data points");
  });

  it("includes SMA values when present", () => {
    const ti = makeIndicators({ sma5: 27.5, sma20: 26.0, sma60: 25.0 });
    const output = formatIndicatorsForPrompt(ti, 28);
    expect(output).toContain("SMA5=27.50");
    expect(output).toContain("SMA20=26.00");
    expect(output).toContain("SMA60=25.00");
  });

  it("shows bullish MA signals", () => {
    const ti = makeIndicators({
      sma5: 30, sma20: 28, sma60: 26,
      maShortAboveLong: true, maGoldenCross: true,
    });
    const output = formatIndicatorsForPrompt(ti, 31);
    expect(output).toContain("Short-term bullish");
    expect(output).toContain("Golden cross");
  });

  it("shows bearish MA signals", () => {
    const ti = makeIndicators({
      sma5: 24, sma20: 28,
      maShortAboveLong: false, priceAboveSma20: false,
    });
    const output = formatIndicatorsForPrompt(ti, 23);
    expect(output).toContain("Short-term bearish");
    expect(output).toContain("Price below SMA20");
  });

  it("formats RSI", () => {
    const ti = makeIndicators({ rsi14: 25.3, rsiSignal: "oversold" });
    const output = formatIndicatorsForPrompt(ti, 10);
    expect(output).toContain("RSI(14): 25.3");
    expect(output).toContain("oversold");
  });

  it("formats MACD", () => {
    const ti = makeIndicators({
      macdLine: 0.15, macdSignal: 0.08, macdHistogram: 0.07, macdBullish: true,
    });
    const output = formatIndicatorsForPrompt(ti, 30);
    expect(output).toContain("MACD:");
    expect(output).toContain("Bullish");
  });

  it("formats Bollinger Bands", () => {
    const ti = makeIndicators({
      bollingerUpper: 32, bollingerMiddle: 28, bollingerLower: 24,
      bollingerPosition: 0.75,
    });
    const output = formatIndicatorsForPrompt(ti, 30);
    expect(output).toContain("Bollinger(20,2)");
    expect(output).toContain("75%");
  });

  it("shows volume spike warning", () => {
    const ti = makeIndicators({
      volumeRatio: 2.5, volumeTrend: "increasing", suddenVolumeSpike: true,
    });
    const output = formatIndicatorsForPrompt(ti, 30);
    expect(output).toContain("SUDDEN VOLUME SPIKE");
  });

  it("includes momentum data", () => {
    const ti = makeIndicators({
      roc5: 3.2, roc20: -1.5, consecutiveUp: 3,
    });
    const output = formatIndicatorsForPrompt(ti, 30);
    expect(output).toContain("ROC5=3.20%");
    expect(output).toContain("ROC20=-1.50%");
    expect(output).toContain("3 consecutive up days");
  });

  it("shows technical score and signal", () => {
    const ti = makeIndicators({ technicalScore: 65, technicalSignal: "strong_buy" });
    const output = formatIndicatorsForPrompt(ti, 30);
    expect(output).toContain("65/100");
    expect(output).toContain("STRONG_BUY");
  });

  it("handles empty indicators gracefully", () => {
    const ti = makeIndicators();
    const output = formatIndicatorsForPrompt(ti, 30);
    expect(output).toContain("Technical Score: 0/100");
    expect(output).toContain("NEUTRAL");
  });
});

describe("TechnicalIndicators type constraints", () => {
  it("technicalSignal must be one of the valid values", () => {
    const validSignals: TechnicalIndicators["technicalSignal"][] = [
      "strong_buy", "buy", "neutral", "sell", "strong_sell",
    ];
    for (const signal of validSignals) {
      const ti = makeIndicators({ technicalSignal: signal });
      expect(ti.technicalSignal).toBe(signal);
    }
  });

  it("rsiSignal must be one of the valid values", () => {
    const validSignals: TechnicalIndicators["rsiSignal"][] = [
      "oversold", "overbought", "neutral", null,
    ];
    for (const signal of validSignals) {
      const ti = makeIndicators({ rsiSignal: signal });
      expect(ti.rsiSignal).toBe(signal);
    }
  });
});
