import { describe, it, expect } from "vitest";
import {
  computeTargetAllocations,
  type PositionSnapshot,
} from "../portfolio-optimizer";

function makePosition(
  symbol: string,
  marketValueUsd: number,
  volatilityPct: number | null = null,
): PositionSnapshot {
  return {
    symbol,
    name: symbol,
    shares: 100,
    currentPrice: marketValueUsd / 100,
    costPrice: marketValueUsd / 100,
    currency: "USD",
    marketValueUsd,
    costBasisUsd: marketValueUsd,
    pnlUsd: 0,
    pnlPct: 0,
    volatilityPct,
  };
}

describe("computeTargetAllocations", () => {
  it("returns empty for no positions", () => {
    expect(computeTargetAllocations([], 0)).toEqual([]);
  });

  it("assigns equal weight when no volatility data", () => {
    const positions = [
      makePosition("AAPL", 5000),
      makePosition("MSFT", 5000),
    ];
    const allocs = computeTargetAllocations(positions, 10000);
    expect(allocs).toHaveLength(2);
    expect(allocs[0].targetWeight).toBeCloseTo(0.5, 2);
    expect(allocs[1].targetWeight).toBeCloseTo(0.5, 2);
  });

  it("assigns higher weight to lower volatility (risk parity)", () => {
    const positions = [
      makePosition("LOW_VOL", 5000, 20),  // low vol
      makePosition("HIGH_VOL", 5000, 60), // high vol
    ];
    const allocs = computeTargetAllocations(positions, 10000);
    const lowVol = allocs.find(a => a.symbol === "LOW_VOL")!;
    const highVol = allocs.find(a => a.symbol === "HIGH_VOL")!;
    expect(lowVol.targetWeight).toBeGreaterThan(highVol.targetWeight);
  });

  it("caps single position at MAX_SINGLE_WEIGHT (35%)", () => {
    const positions = [
      makePosition("A", 1000, 5),   // very low vol → would get very high weight
      makePosition("B", 1000, 100), // very high vol → low weight
      makePosition("C", 1000, 80),  // high vol → low weight
    ];
    const allocs = computeTargetAllocations(positions, 3000);
    for (const a of allocs) {
      expect(a.targetWeight).toBeLessThanOrEqual(0.35 + 0.01); // small float tolerance
    }
  });

  it("correctly identifies overweight positions", () => {
    const positions = [
      makePosition("BIG", 9000, 30),
      makePosition("SMALL", 1000, 30),
    ];
    const allocs = computeTargetAllocations(positions, 10000);
    const big = allocs.find(a => a.symbol === "BIG")!;
    // BIG has 90% weight but target should be ~50% → overweight
    expect(big.action).toBe("overweight");
    expect(big.driftPct).toBeGreaterThan(5);
  });

  it("correctly identifies underweight positions", () => {
    const positions = [
      makePosition("BIG", 9000, 30),
      makePosition("SMALL", 1000, 30),
    ];
    const allocs = computeTargetAllocations(positions, 10000);
    const small = allocs.find(a => a.symbol === "SMALL")!;
    expect(small.action).toBe("underweight");
    expect(small.driftPct).toBeLessThan(-5);
  });

  it("marks balanced positions as on_target", () => {
    const positions = [
      makePosition("A", 5000, 30),
      makePosition("B", 5000, 30),
    ];
    const allocs = computeTargetAllocations(positions, 10000);
    expect(allocs[0].action).toBe("on_target");
    expect(allocs[1].action).toBe("on_target");
  });

  it("provides correct suggestedDeltaUsd for rebalancing", () => {
    const positions = [
      makePosition("A", 7000, 30),
      makePosition("B", 3000, 30),
    ];
    const allocs = computeTargetAllocations(positions, 10000);
    // Sum of suggestedDeltaUsd should be approximately 0 (zero-sum rebalance)
    const totalDelta = allocs.reduce((s, a) => s + a.suggestedDeltaUsd, 0);
    expect(Math.abs(totalDelta)).toBeLessThan(1); // floating point tolerance
  });

  it("handles single position", () => {
    const positions = [makePosition("ONLY", 10000, 25)];
    const allocs = computeTargetAllocations(positions, 10000);
    expect(allocs).toHaveLength(1);
    // Single stock gets 100% weight (cap doesn't apply with 1 position)
    expect(allocs[0].targetWeight).toBeCloseTo(1.0, 2);
  });

  it("handles mixed vol/no-vol positions", () => {
    const positions = [
      makePosition("WITH_VOL", 5000, 30),
      makePosition("NO_VOL", 5000, null),
    ];
    const allocs = computeTargetAllocations(positions, 10000);
    expect(allocs).toHaveLength(2);
    // Both should have weights that sum to ~1
    const totalWeight = allocs.reduce((s, a) => s + a.targetWeight, 0);
    expect(totalWeight).toBeCloseTo(1.0, 1);
  });

  it("weights sum to approximately 1", () => {
    const positions = [
      makePosition("A", 3000, 25),
      makePosition("B", 4000, 35),
      makePosition("C", 3000, 45),
    ];
    const allocs = computeTargetAllocations(positions, 10000);
    const totalWeight = allocs.reduce((s, a) => s + a.targetWeight, 0);
    expect(totalWeight).toBeCloseTo(1.0, 1);
  });
});
