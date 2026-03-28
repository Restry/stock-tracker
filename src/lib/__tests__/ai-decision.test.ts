/**
 * Tests for pure functions in ai-decision.ts:
 * - computeSentimentScore (weighted keyword sentiment)
 * - checkIntradaySwingSignal (T-buy detection)
 * - checkProfitTaking (intraday profit taking)
 * - applyCostBasisProtection (cost averaging logic)
 * - parseDeepSeekContent (LLM response parsing)
 *
 * These tests use vitest.mock to stub the DB-dependent imports,
 * allowing us to test the pure logic without a live database.
 */
import { describe, it, expect, vi, beforeAll } from "vitest";

// Mock DB module to avoid env var requirement
vi.mock("../db", () => ({
  default: { query: vi.fn() },
  toSqlVal: vi.fn((v: unknown) => String(v)),
  logAction: vi.fn(),
}));

// Mock trader-settings to avoid DB calls
vi.mock("../trader-settings", () => ({
  getGlobalAutoTrade: vi.fn().mockResolvedValue(false),
  getSymbolSettings: vi.fn().mockResolvedValue([]),
}));

// Mock notifications to avoid side effects
vi.mock("../notifications", () => ({
  notifyTrade: vi.fn(),
  notifyStopLoss: vi.fn().mockResolvedValue(undefined),
  notifyPriceAlert: vi.fn(),
  notifyError: vi.fn(),
}));

// Mock technical-indicators to avoid DB calls
vi.mock("../technical-indicators", () => ({
  computeTechnicalIndicators: vi.fn(),
  formatIndicatorsForPrompt: vi.fn().mockReturnValue("mocked indicators"),
}));

import {
  computeSentimentScore,
  checkIntradaySwingSignal,
  checkProfitTaking,
  applyCostBasisProtection,
  parseDeepSeekContent,
} from "../ai-decision";

describe("computeSentimentScore", () => {
  it("returns 0 for empty/neutral text", () => {
    const result = computeSentimentScore("Nothing interesting happened today");
    expect(result.score).toBe(0);
    expect(result.positiveHits).toHaveLength(0);
    expect(result.negativeHits).toHaveLength(0);
  });

  it("detects positive keywords", () => {
    const result = computeSentimentScore("Company beat expectations with record revenue and strong growth");
    expect(result.score).toBeGreaterThan(0);
    expect(result.positiveHits).toContain("beat expectations");
    expect(result.positiveHits).toContain("record revenue");
  });

  it("detects negative keywords", () => {
    const result = computeSentimentScore("Analyst issued downgrade after company reported loss and weak guidance");
    expect(result.score).toBeLessThan(0);
    expect(result.negativeHits).toContain("downgrade");
    expect(result.negativeHits).toContain("loss");
    expect(result.negativeHits).toContain("weak");
  });

  it("balances positive and negative signals", () => {
    const result = computeSentimentScore(
      "Company showed growth but also faces recession concerns and lawsuit pressure"
    );
    // Should have both positive and negative hits
    expect(result.positiveHits.length).toBeGreaterThan(0);
    expect(result.negativeHits.length).toBeGreaterThan(0);
  });

  it("weights high-impact keywords more when mixed with negatives", () => {
    // When mixed with equal negative signal, the higher-weight positive should yield a higher score
    const highImpact = computeSentimentScore("beat expectations but some concern");
    const lowImpact = computeSentimentScore("growth but some concern");
    // "beat expectations" (weight 3) vs "growth" (weight 1), both against "concern" (weight 1)
    // High: (3-1)/(3+1) = 0.5, Low: (1-1)/(1+1) = 0
    expect(highImpact.score).toBeGreaterThan(lowImpact.score);
  });

  it("caps occurrences at 3 to prevent single-article bias", () => {
    const repeated = computeSentimentScore("growth growth growth growth growth growth growth growth");
    const once = computeSentimentScore("growth");
    // Score should be capped, not proportional to 8x occurrences
    expect(repeated.score).toBe(once.score); // both have max 3 capped
  });

  it("score is bounded between -1 and 1", () => {
    const veryPositive = computeSentimentScore(
      "beat expectations record revenue record profit upgrade buy rating outperform breakthrough strong buy"
    );
    expect(veryPositive.score).toBeLessThanOrEqual(1);
    expect(veryPositive.score).toBeGreaterThanOrEqual(-1);

    const veryNegative = computeSentimentScore(
      "downgrade sell rating bankruptcy fraud investigation default profit warning guidance cut"
    );
    expect(veryNegative.score).toBeLessThanOrEqual(1);
    expect(veryNegative.score).toBeGreaterThanOrEqual(-1);
  });
});

describe("checkIntradaySwingSignal (T-Buy)", () => {
  it("triggers when Bollinger < 10% and RSI < 30", () => {
    const result = checkIntradaySwingSignal(0.05, 25);
    expect(result.triggered).toBe(true);
    expect(result.reason).toContain("T-Buy");
  });

  it("does not trigger when Bollinger is above threshold", () => {
    const result = checkIntradaySwingSignal(0.5, 25);
    expect(result.triggered).toBe(false);
  });

  it("does not trigger when RSI is above threshold", () => {
    const result = checkIntradaySwingSignal(0.05, 45);
    expect(result.triggered).toBe(false);
  });

  it("handles null values gracefully", () => {
    expect(checkIntradaySwingSignal(null, 25).triggered).toBe(false);
    expect(checkIntradaySwingSignal(0.05, null).triggered).toBe(false);
    expect(checkIntradaySwingSignal(null, null).triggered).toBe(false);
  });
});

describe("checkProfitTaking", () => {
  const history = [
    { price: 30, changePercent: 2, timestamp: "2026-01-01T10:00" },
    { price: 29, changePercent: 1, timestamp: "2026-01-01T09:55" },
    { price: 28, changePercent: 0, timestamp: "2026-01-01T09:50" },
    { price: 27, changePercent: -1, timestamp: "2026-01-01T09:45" },
  ];

  it("triggers when intraday gain > 3%", () => {
    // Daily low from recent = 27, current = 30 → 11.1% gain
    const result = checkProfitTaking(30, history, 1000);
    expect(result.triggered).toBe(true);
    expect(result.intradayGainPct).toBeGreaterThan(3);
  });

  it("does not trigger when gain is small", () => {
    const flatHistory = [
      { price: 28.5, changePercent: 0.5, timestamp: "2026-01-01T10:00" },
      { price: 28.3, changePercent: 0.3, timestamp: "2026-01-01T09:55" },
      { price: 28, changePercent: 0, timestamp: "2026-01-01T09:50" },
    ];
    const result = checkProfitTaking(28.5, flatHistory, 1000);
    expect(result.triggered).toBe(false);
    expect(result.intradayGainPct).toBeLessThanOrEqual(3);
  });

  it("does not trigger with zero shares", () => {
    const result = checkProfitTaking(30, history, 0);
    expect(result.triggered).toBe(false);
  });

  it("does not trigger with empty history", () => {
    const result = checkProfitTaking(30, [], 1000);
    expect(result.triggered).toBe(false);
  });
});

describe("applyCostBasisProtection", () => {
  it("boosts buy signal when price far below cost with tech support", () => {
    // Price 90, cost 100 (10% below), RSI 35 (support)
    const result = applyCostBasisProtection(90, 100, 500, 0.25, 35);
    expect(result.signalDelta).toBe(15);
    expect(result.reason).toContain("成本保护");
  });

  it("no boost when price below cost but no tech support", () => {
    // Price 90, cost 100, but RSI 55 (no support)
    const result = applyCostBasisProtection(90, 100, 500, 0.5, 55);
    expect(result.signalDelta).toBe(0);
  });

  it("boosts sell signal when price above cost", () => {
    // Price 105, cost 100 (5% above)
    const result = applyCostBasisProtection(105, 100, 500, null, null);
    expect(result.signalDelta).toBe(-10);
    expect(result.reason).toContain("止盈");
  });

  it("returns zero delta when near cost price", () => {
    // Price 100, cost 100 (at cost)
    const result = applyCostBasisProtection(100, 100, 500, null, null);
    expect(result.signalDelta).toBe(0);
  });

  it("returns zero delta with no shares", () => {
    const result = applyCostBasisProtection(90, 100, 0, null, null);
    expect(result.signalDelta).toBe(0);
  });

  it("returns zero delta with no cost price", () => {
    const result = applyCostBasisProtection(90, null, 500, null, null);
    expect(result.signalDelta).toBe(0);
  });
});

describe("parseDeepSeekContent", () => {
  it("parses JSON from markdown fence", () => {
    const content = 'Here is my analysis:\n```json\n{"action":"BUY","confidence":75,"reasoning":"Strong signal"}\n```';
    const result = parseDeepSeekContent(content);
    expect(result.action).toBe("BUY");
    expect(result.confidence).toBe(75);
    expect(result.reasoning).toBe("Strong signal");
  });

  it("parses bare JSON object", () => {
    const content = '{"action":"SELL","confidence":60,"reasoning":"Weak outlook"}';
    const result = parseDeepSeekContent(content);
    expect(result.action).toBe("SELL");
    expect(result.confidence).toBe(60);
  });

  it("parses JSON embedded in text", () => {
    const content = 'Based on my analysis, I recommend: {"action":"HOLD","confidence":50,"reasoning":"Neutral"} for now.';
    const result = parseDeepSeekContent(content);
    expect(result.action).toBe("HOLD");
  });

  it("throws on non-JSON content", () => {
    expect(() => parseDeepSeekContent("No JSON here at all")).toThrow();
  });

  it("throws on malformed JSON", () => {
    expect(() => parseDeepSeekContent("{action: BUY}")).toThrow();
  });
});
