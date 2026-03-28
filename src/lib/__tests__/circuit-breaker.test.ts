import { describe, it, expect, beforeEach } from "vitest";
import { getCircuit, resetAllCircuits, getAllCircuitStatuses } from "../circuit-breaker";

beforeEach(() => {
  resetAllCircuits();
});

describe("CircuitBreaker", () => {
  it("starts in closed state and allows calls", () => {
    const cb = getCircuit("test-a");
    expect(cb.isCallable()).toBe(true);
    expect(cb.getStatus().state).toBe("closed");
  });

  it("stays closed after fewer failures than threshold", () => {
    const cb = getCircuit("test-b", { failureThreshold: 3 });
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.isCallable()).toBe(true);
    expect(cb.getStatus().state).toBe("closed");
  });

  it("opens after reaching failure threshold", () => {
    const cb = getCircuit("test-c", { failureThreshold: 3 });
    cb.recordFailure();
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.isCallable()).toBe(false);
    expect(cb.getStatus().state).toBe("open");
  });

  it("resets failure count on success", () => {
    const cb = getCircuit("test-d", { failureThreshold: 3 });
    cb.recordFailure();
    cb.recordFailure();
    cb.recordSuccess();
    expect(cb.getStatus().failureCount).toBe(0);
    expect(cb.getStatus().state).toBe("closed");
    // Now needs 3 more failures to open
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.isCallable()).toBe(true);
  });

  it("transitions to half-open after reset timeout", () => {
    const cb = getCircuit("test-e", { failureThreshold: 1, resetTimeoutMs: 10 });
    cb.recordFailure(); // opens circuit
    expect(cb.isCallable()).toBe(false);

    // Simulate time passing by accessing internal state via status check
    // Wait slightly more than timeout
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(cb.isCallable()).toBe(true); // should be half-open now
        expect(cb.getStatus().state).toBe("half-open");
        resolve();
      }, 20);
    });
  });

  it("closes from half-open on success", () => {
    const cb = getCircuit("test-f", { failureThreshold: 1, resetTimeoutMs: 5 });
    cb.recordFailure();
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        cb.isCallable(); // transitions to half-open
        cb.recordSuccess();
        expect(cb.getStatus().state).toBe("closed");
        expect(cb.isCallable()).toBe(true);
        resolve();
      }, 15);
    });
  });

  it("re-opens from half-open on failure", () => {
    const cb = getCircuit("test-g", { failureThreshold: 1, resetTimeoutMs: 5 });
    cb.recordFailure();
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        cb.isCallable(); // transitions to half-open
        cb.recordFailure(); // probe failed
        expect(cb.getStatus().state).toBe("open");
        expect(cb.getStatus().openCount).toBe(2); // opened twice
        resolve();
      }, 15);
    });
  });

  it("returns same instance for same name", () => {
    const a = getCircuit("shared");
    const b = getCircuit("shared");
    expect(a).toBe(b);
    a.recordFailure();
    expect(b.getStatus().failureCount).toBe(1);
  });

  it("getAllCircuitStatuses returns all registered circuits", () => {
    getCircuit("alpha");
    getCircuit("beta");
    const statuses = getAllCircuitStatuses();
    expect(statuses.length).toBeGreaterThanOrEqual(2);
    const names = statuses.map((s) => s.name);
    expect(names).toContain("alpha");
    expect(names).toContain("beta");
  });

  it("reset restores to initial state", () => {
    const cb = getCircuit("test-reset", { failureThreshold: 1 });
    cb.recordFailure();
    expect(cb.getStatus().state).toBe("open");
    cb.reset();
    expect(cb.getStatus().state).toBe("closed");
    expect(cb.getStatus().failureCount).toBe(0);
  });
});
