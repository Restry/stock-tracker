/**
 * Server-side trading scheduler.
 * Automatically triggers price updates and AI decisions during market hours.
 */

import { updateAllPrices } from "./prices";
import { runDecisions } from "./ai-decision";
import { logAction } from "./db";
import { getSymbolSettings } from "./trader-settings";

const weekdayMap: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

function clockInTimezone(timeZone: string): { weekday: number; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());

  const weekdayShort = parts.find((p) => p.type === "weekday")?.value || "Sun";
  const hour = parseInt(parts.find((p) => p.type === "hour")?.value || "0");
  const minute = parseInt(parts.find((p) => p.type === "minute")?.value || "0");
  return { weekday: weekdayMap[weekdayShort] ?? 0, minutes: hour * 60 + minute };
}

const inRange = (v: number, s: number, e: number) => v >= s && v < e;
const isWeekday = (w: number) => w >= 1 && w <= 5;

function isMarketOpenForSymbol(symbol: string): boolean {
  if (symbol.endsWith(".HK")) {
    const c = clockInTimezone("Asia/Hong_Kong");
    // HK: 09:30-12:00, 13:00-16:00
    return isWeekday(c.weekday) && (inRange(c.minutes, 570, 720) || inRange(c.minutes, 780, 960));
  }
  if (symbol.endsWith(".SS") || symbol.endsWith(".SZ") || symbol.endsWith(".SH")) {
    const c = clockInTimezone("Asia/Shanghai");
    return isWeekday(c.weekday) && (inRange(c.minutes, 570, 690) || inRange(c.minutes, 780, 900));
  }
  if (symbol.endsWith(".T")) {
    const c = clockInTimezone("Asia/Tokyo");
    return isWeekday(c.weekday) && (inRange(c.minutes, 540, 690) || inRange(c.minutes, 750, 900));
  }
  // US default
  const c = clockInTimezone("America/New_York");
  return isWeekday(c.weekday) && inRange(c.minutes, 570, 960);
}

function isAnyMarketOpen(symbols: string[]): boolean {
  return symbols.length > 0 && symbols.some(isMarketOpenForSymbol);
}

let schedulerTimer: ReturnType<typeof setInterval> | null = null;
let isRunning = false;

async function runTradingCycle(): Promise<void> {
  if (isRunning) {
    console.log("[Scheduler] Previous cycle still running, skipping.");
    return;
  }
  isRunning = true;
  const startTime = Date.now();

  try {
    // Check if any monitored market is open
    const settings = await getSymbolSettings(true);
    const symbols = settings.map((s) => s.symbol);
    
    if (!isAnyMarketOpen(symbols)) {
      console.log(`[Scheduler] No markets open. Monitored: ${symbols.join(", ")}`);
      return;
    }

    console.log(`[Scheduler] Market open — running trading cycle for ${symbols.join(", ")}`);
    
    // Step 1: Update all prices
    const updated = await updateAllPrices();
    console.log(`[Scheduler] Updated ${updated.length} prices.`);

    // Step 2: Run AI decisions + auto-trade
    const result = await runDecisions();
    console.log(`[Scheduler] Generated ${result.decisions.length} decisions, ${result.trades.length} trades.`);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    await logAction("scheduler", "Automated trading cycle completed", {
      action: "Scheduler Cycle",
      status: "success",
      summary: `Updated ${updated.length} prices, ${result.decisions.length} decisions, ${result.trades.length} trades in ${elapsed}s.`,
      pricesUpdated: updated.length,
      decisions: result.decisions.length,
      trades: result.trades.length,
      elapsedSec: elapsed,
    });
  } catch (error) {
    console.error("[Scheduler] Trading cycle failed:", error);
    await logAction("scheduler", "Automated trading cycle failed", {
      action: "Scheduler Cycle",
      status: "fail",
      summary: `Scheduler cycle failed: ${String(error).substring(0, 500)}`,
    }).catch(() => {});
  } finally {
    isRunning = false;
  }
}

export function startScheduler(): void {
  if (schedulerTimer) {
    console.log("[Scheduler] Already running.");
    return;
  }

  const intervalMin = Math.max(1, parseInt(process.env.SCHEDULER_INTERVAL_MIN || "5", 10));
  const intervalMs = intervalMin * 60 * 1000;

  console.log(`[Scheduler] Starting with ${intervalMin}-minute interval.`);

  // Run once on startup (with a short delay to let the server fully start)
  setTimeout(() => {
    runTradingCycle();
  }, 5000);

  // Then run on interval
  schedulerTimer = setInterval(() => {
    runTradingCycle();
  }, intervalMs);

  console.log(`[Scheduler] Active. Next cycle in ${intervalMin} minutes.`);
}

export function stopScheduler(): void {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
    console.log("[Scheduler] Stopped.");
  }
}
