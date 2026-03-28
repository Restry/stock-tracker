/**
 * Circuit Breaker Pattern
 *
 * Prevents repeated calls to degraded external services. Each named circuit
 * tracks consecutive failures. When failures exceed a threshold the circuit
 * "opens" and calls are short-circuited for a cool-down window. After the
 * window, a single probe request is allowed (half-open). Success resets the
 * circuit; failure re-opens it.
 *
 * Usage:
 *   const cb = getCircuit("yahoo-v8");
 *   if (!cb.isCallable()) return null; // circuit is open
 *   try {
 *     const result = await fetchYahooQuote(sym);
 *     cb.recordSuccess();
 *     return result;
 *   } catch (err) {
 *     cb.recordFailure();
 *     throw err;
 *   }
 */

export interface CircuitBreakerOptions {
  /** Number of consecutive failures before opening the circuit. Default: 5 */
  failureThreshold?: number;
  /** Cool-down window in ms while circuit is open. Default: 60_000 (1 min) */
  resetTimeoutMs?: number;
  /** Maximum cool-down cap in ms after repeated opens. Default: 300_000 (5 min) */
  maxResetTimeoutMs?: number;
}

type CircuitState = "closed" | "open" | "half-open";

class CircuitBreaker {
  readonly name: string;
  private state: CircuitState = "closed";
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime = 0;
  private openCount = 0; // how many times circuit has opened (for backoff)

  private readonly failureThreshold: number;
  private readonly baseResetTimeoutMs: number;
  private readonly maxResetTimeoutMs: number;

  constructor(name: string, opts?: CircuitBreakerOptions) {
    this.name = name;
    this.failureThreshold = opts?.failureThreshold ?? 5;
    this.baseResetTimeoutMs = opts?.resetTimeoutMs ?? 60_000;
    this.maxResetTimeoutMs = opts?.maxResetTimeoutMs ?? 300_000;
  }

  /** Current effective timeout with exponential backoff on repeated opens */
  private get currentResetTimeout(): number {
    const timeout = this.baseResetTimeoutMs * Math.pow(2, Math.min(this.openCount - 1, 4));
    return Math.min(timeout, this.maxResetTimeoutMs);
  }

  /** Whether a call should be attempted right now */
  isCallable(): boolean {
    if (this.state === "closed") return true;
    if (this.state === "open") {
      const elapsed = Date.now() - this.lastFailureTime;
      if (elapsed >= this.currentResetTimeout) {
        // Transition to half-open: allow one probe
        this.state = "half-open";
        return true;
      }
      return false;
    }
    // half-open: allow the probe
    return true;
  }

  /** Record a successful call — resets the circuit to closed */
  recordSuccess(): void {
    this.failureCount = 0;
    this.successCount++;
    if (this.state !== "closed") {
      console.log(`[circuit-breaker] ${this.name}: CLOSED (recovered after ${this.openCount} open cycles)`);
      this.openCount = 0;
    }
    this.state = "closed";
  }

  /** Record a failed call — may trip the circuit open */
  recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === "half-open") {
      // Probe failed — reopen
      this.state = "open";
      this.openCount++;
      console.warn(
        `[circuit-breaker] ${this.name}: RE-OPENED (probe failed, backoff ${this.currentResetTimeout}ms)`
      );
      return;
    }

    if (this.failureCount >= this.failureThreshold) {
      this.state = "open";
      this.openCount++;
      console.warn(
        `[circuit-breaker] ${this.name}: OPENED after ${this.failureCount} failures ` +
        `(cooldown ${this.currentResetTimeout}ms)`
      );
    }
  }

  /** Snapshot for monitoring / dashboard */
  getStatus(): {
    name: string;
    state: CircuitState;
    failureCount: number;
    successCount: number;
    openCount: number;
    lastFailureTime: number;
    nextRetryAt: number | null;
  } {
    return {
      name: this.name,
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      openCount: this.openCount,
      lastFailureTime: this.lastFailureTime,
      nextRetryAt:
        this.state === "open"
          ? this.lastFailureTime + this.currentResetTimeout
          : null,
    };
  }

  /** Force-reset for testing / admin */
  reset(): void {
    this.state = "closed";
    this.failureCount = 0;
    this.openCount = 0;
    this.lastFailureTime = 0;
  }
}

// ─── Global registry ───

const circuits = new Map<string, CircuitBreaker>();

/**
 * Get or create a named circuit breaker. Options are only used on first
 * creation; subsequent calls return the existing instance.
 */
export function getCircuit(name: string, opts?: CircuitBreakerOptions): CircuitBreaker {
  let cb = circuits.get(name);
  if (!cb) {
    cb = new CircuitBreaker(name, opts);
    circuits.set(name, cb);
  }
  return cb;
}

/** Return status of all circuits (for monitoring API) */
export function getAllCircuitStatuses() {
  return Array.from(circuits.values()).map((cb) => cb.getStatus());
}

/** Reset all circuits (for testing) */
export function resetAllCircuits(): void {
  for (const cb of circuits.values()) cb.reset();
}
