import { NextRequest, NextResponse } from "next/server";
import { getDefaultRegistry, evaluateEnsemble, type StrategyContext } from "@/lib/strategies";
import { getQuote } from "@/lib/prices";
import { computeSentimentScore } from "@/lib/ai-decision";
import { computeTechnicalIndicators } from "@/lib/technical-indicators";

/**
 * GET /api/strategies?symbol=01810.HK
 *
 * Returns the list of registered strategies and, if a symbol is provided,
 * evaluates the ensemble signal for that symbol.
 */
export async function GET(req: NextRequest) {
  try {
    const registry = getDefaultRegistry();
    const symbol = req.nextUrl.searchParams.get("symbol");

    const strategies = registry.getAll().map(s => ({
      name: s.name,
      description: s.description,
      weight: s.weight,
      enabled: s.enabled,
    }));

    if (!symbol) {
      return NextResponse.json({ strategies });
    }

    // Build context for evaluation
    const quote = await getQuote(symbol);
    const currentPrice = quote?.price ?? 0;
    if (currentPrice <= 0) {
      return NextResponse.json({
        strategies,
        error: `Could not fetch price for ${symbol}`,
      });
    }

    const ti = await computeTechnicalIndicators(
      symbol,
      currentPrice,
      quote?.fiftyTwoWeekHigh ?? null,
      quote?.fiftyTwoWeekLow ?? null,
    );

    // Minimal sentiment (no live news call to avoid rate limits)
    const sentiment = computeSentimentScore("");

    const context: StrategyContext = {
      symbol,
      currentPrice,
      currency: quote?.currency ?? "USD",
      costPrice: null,
      shares: 0,
      technicalIndicators: ti,
      sentimentScore: sentiment.score,
      positiveHits: sentiment.positiveHits,
      negativeHits: sentiment.negativeHits,
      recentPriceHistory: [],
      quote: quote ? {
        pe: quote.pe ?? null,
        dividendYield: quote.dividendYield ?? null,
        changePercent: quote.changePercent ?? 0,
        fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh ?? null,
        fiftyTwoWeekLow: quote.fiftyTwoWeekLow ?? null,
      } : null,
    };

    const ensemble = evaluateEnsemble(context, registry);

    return NextResponse.json({
      strategies,
      symbol,
      ensemble: {
        action: ensemble.action,
        direction: ensemble.direction,
        confidence: ensemble.confidence,
        reasoning: ensemble.reasoning,
        weights: ensemble.weights,
      },
      signals: ensemble.signals,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
