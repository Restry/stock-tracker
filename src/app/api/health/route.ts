import { NextRequest, NextResponse } from "next/server";
import pool, { logAction, toSqlVal } from "@/lib/db";
import { getSymbolSettings } from "@/lib/trader-settings";

const toNumber = (value: number | string | null | undefined): number => {
  if (typeof value === "number") return value;
  if (typeof value === "string") return parseFloat(value) || 0;
  return 0;
};

const weekdayMap: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
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

const inRange = (value: number, start: number, end: number): boolean => value >= start && value < end;
const isWeekday = (weekday: number): boolean => weekday >= 1 && weekday <= 5;

function isMarketOpenForSymbol(symbol: string): boolean {
  if (symbol.endsWith(".HK")) {
    const c = clockInTimezone("Asia/Hong_Kong");
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

  const c = clockInTimezone("America/New_York");
  return isWeekday(c.weekday) && inRange(c.minutes, 570, 960);
}

export async function GET(req: NextRequest) {
  const timestamp = new Date().toISOString();
  try {
    const hours = Math.min(Math.max(parseInt(req.nextUrl.searchParams.get("hours") || "24"), 1), 168);
    const intervalSql = `${toSqlVal(`${hours} hours`)}::interval`;

    const [
      { rows: tradeRows },
      { rows: decisionRows },
      { rows: priceRows },
      { rows: logRows },
      symbolSettings,
    ] = await Promise.all([
      pool.query(
        `SELECT COUNT(*) AS count, MAX(created_at) AS latest
         FROM "st-trades"
         WHERE created_at > NOW() - ${intervalSql}`
      ),
      pool.query(
        `SELECT COUNT(*) AS count, MAX(created_at) AS latest
         FROM "st-decisions"
         WHERE created_at > NOW() - ${intervalSql}`
      ),
      pool.query(
        `SELECT MAX(created_at) AS latest
         FROM "st-price-history"`
      ),
      pool.query(
        `SELECT MAX(created_at) AS latest
         FROM "st-logs"
         WHERE category IN ('sync', 'price_update', 'cron', 'ai_decision', 'health')`
      ),
      getSymbolSettings(true),
    ]);

    const trades = toNumber((tradeRows[0] as { count: number | string }).count);
    const decisions = toNumber((decisionRows[0] as { count: number | string }).count);
    const trading = trades > 0 || decisions > 0;
    const latestPriceAt = (priceRows[0] as { latest: string | null })?.latest || null;
    const latestLogAt = (logRows[0] as { latest: string | null })?.latest || null;
    const nowMs = Date.now();
    const latestPriceAgeMin = latestPriceAt ? Math.floor((nowMs - new Date(latestPriceAt).getTime()) / 60000) : null;
    const latestLogAgeMin = latestLogAt ? Math.floor((nowMs - new Date(latestLogAt).getTime()) / 60000) : null;
    const pricesFresh = latestPriceAgeMin !== null && latestPriceAgeMin <= 30;
    const schedulerAlive = latestLogAgeMin !== null && latestLogAgeMin <= 20;
    const monitoredSymbols = symbolSettings.map((s) => s.symbol);
    const marketOpen = monitoredSymbols.length > 0 && monitoredSymbols.some((symbol) => isMarketOpenForSymbol(symbol));

    await logAction("health", "Trader health checked", {
      timestamp,
      action: "Health Check",
      status: "success",
      summary: `Alive=true Trading=${trading} MarketOpen=${marketOpen} PriceFresh=${pricesFresh} SchedulerAlive=${schedulerAlive} (window=${hours}h)`,
    });

    return NextResponse.json({
      timestamp,
      alive: true,
      trading,
      marketOpen,
      pricesFresh,
      schedulerAlive,
      windowHours: hours,
      trades,
      decisions,
      latestTradeAt: (tradeRows[0] as { latest: string | null }).latest,
      latestDecisionAt: (decisionRows[0] as { latest: string | null }).latest,
      latestPriceAt,
      latestLogAt,
      monitoredSymbols,
    });
  } catch (error) {
    await logAction("health", "Trader health check failed", {
      timestamp,
      action: "Health Check",
      status: "fail",
      summary: `Health check failed: ${String(error)}`,
    });
    return NextResponse.json({ error: String(error), alive: false, trading: false }, { status: 500 });
  }
}
