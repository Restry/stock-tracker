import { NextRequest, NextResponse } from "next/server";
import { computeTechnicalIndicators } from "@/lib/technical-indicators";
import { getQuote } from "@/lib/prices";

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol") || "01810.HK";

  try {
    const quote = await getQuote(symbol);
    if (!quote) {
      return NextResponse.json({ error: "Could not fetch quote" }, { status: 502 });
    }

    const ti = await computeTechnicalIndicators(
      symbol,
      quote.price,
      quote.fiftyTwoWeekHigh,
      quote.fiftyTwoWeekLow,
    );

    return NextResponse.json({
      symbol,
      quote: {
        price: quote.price,
        currency: quote.currency,
        change: quote.change,
        changePercent: quote.changePercent,
        previousClose: quote.previousClose,
        pe: quote.pe,
        marketCap: quote.marketCap,
        dividendYield: quote.dividendYield,
        fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh,
        fiftyTwoWeekLow: quote.fiftyTwoWeekLow,
        averageVolume: quote.averageVolume,
      },
      indicators: {
        rsi14: ti.rsi14,
        rsiSignal: ti.rsiSignal,
        sma5: ti.sma5,
        sma20: ti.sma20,
        sma60: ti.sma60,
        maShortAboveLong: ti.maShortAboveLong,
        maGoldenCross: ti.maGoldenCross,
        priceAboveSma20: ti.priceAboveSma20,
        macdLine: ti.macdLine,
        macdSignal: ti.macdSignal,
        macdHistogram: ti.macdHistogram,
        macdBullish: ti.macdBullish,
        bollingerUpper: ti.bollingerUpper,
        bollingerMiddle: ti.bollingerMiddle,
        bollingerLower: ti.bollingerLower,
        bollingerPosition: ti.bollingerPosition,
        atr14: ti.atr14,
        volatilityPct: ti.volatilityPct,
        volumeRatio: ti.volumeRatio,
        volumeTrend: ti.volumeTrend,
        suddenVolumeSpike: ti.suddenVolumeSpike,
        roc5: ti.roc5,
        roc20: ti.roc20,
        consecutiveUp: ti.consecutiveUp,
        consecutiveDown: ti.consecutiveDown,
        technicalScore: ti.technicalScore,
        technicalSignal: ti.technicalSignal,
        dataPoints: ti.dataPoints,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
