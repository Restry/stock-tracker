import pool from "./db";

export interface Decision {
  symbol: string;
  action: "BUY" | "SELL" | "HOLD";
  confidence: number;
  reasoning: string;
  newsSummary?: string;
  marketData?: Record<string, unknown>;
}

export interface Trade {
  symbol: string;
  action: string;
  shares: number;
  price: number;
  currency: string;
  reason: string;
}

// Friendly names for search queries
const SYMBOL_NAMES: Record<string, string> = {
  MSFT: "Microsoft",
  "01810.HK": "Xiaomi",
};

// Search market news via Tavily
async function searchMarketNews(symbol: string): Promise<string> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return "No Tavily API key configured. Using technical signals only.";

  const companyName = SYMBOL_NAMES[symbol] || symbol;

  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query: `${companyName} ${symbol} stock market news latest financial analysis 2024 2025`,
        search_depth: "advanced",
        max_results: 8,
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return "Tavily search failed. Using technical signals only.";
    const data = await res.json();
    const summaries = (data.results || [])
      .map((r: { title: string; content: string; url: string }) =>
        `• ${r.title}: ${r.content?.substring(0, 300)}`
      )
      .join("\n");
    return summaries || "No relevant news found.";
  } catch {
    return "Tavily search error. Using technical signals only.";
  }
}

// Sentiment keywords with weighted scoring
const POSITIVE_KEYWORDS = [
  "growth", "beat", "upgrade", "surge", "rally", "bullish", "outperform",
  "strong", "record", "innovation", "partnership", "expansion", "revenue growth",
  "profit", "dividend", "breakthrough", "exceed", "momentum", "buy rating",
  "ai", "cloud", "market share",
];

const NEGATIVE_KEYWORDS = [
  "decline", "miss", "downgrade", "drop", "bearish", "underperform",
  "weak", "lawsuit", "investigation", "layoff", "recession", "loss",
  "warning", "cut", "sell rating", "tariff", "sanction", "ban",
  "debt", "default", "concern",
];

function computeSentimentScore(news: string): { score: number; positiveHits: string[]; negativeHits: string[] } {
  const lower = news.toLowerCase();
  const positiveHits = POSITIVE_KEYWORDS.filter(kw => lower.includes(kw));
  const negativeHits = NEGATIVE_KEYWORDS.filter(kw => lower.includes(kw));
  const score = (positiveHits.length - negativeHits.length) / Math.max(positiveHits.length + negativeHits.length, 1);
  return { score, positiveHits, negativeHits };
}

// AI analysis: combine technical indicators with news sentiment
function analyzeSignals(
  symbol: string,
  currentPrice: number,
  costPrice: number | null,
  shares: number,
  news: string
): Decision {
  const { score: sentimentScore, positiveHits, negativeHits } = computeSentimentScore(news);

  let action: Decision["action"] = "HOLD";
  let confidence = 50;
  const reasons: string[] = [];

  // Technical analysis
  let pnlPct = 0;
  if (costPrice && costPrice > 0 && currentPrice > 0) {
    pnlPct = ((currentPrice - costPrice) / costPrice) * 100;
    reasons.push(`Position P&L: ${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(1)}%`);
  }

  // Sentiment analysis
  if (positiveHits.length > 0) {
    reasons.push(`Positive signals: ${positiveHits.slice(0, 4).join(", ")}`);
  }
  if (negativeHits.length > 0) {
    reasons.push(`Risk factors: ${negativeHits.slice(0, 4).join(", ")}`);
  }

  // Decision logic with multi-factor scoring
  let signalStrength = 0;

  // Factor 1: Sentiment (weight: 40%)
  signalStrength += sentimentScore * 40;

  // Factor 2: P&L momentum (weight: 30%)
  if (costPrice && costPrice > 0) {
    if (pnlPct > 30) signalStrength -= 15; // Take profits signal
    else if (pnlPct > 10) signalStrength += 10;
    else if (pnlPct < -20) signalStrength += 15; // Buy the dip
    else if (pnlPct < -10) signalStrength -= 5;
  }

  // Factor 3: News volume (weight: 15%)
  const newsVolume = positiveHits.length + negativeHits.length;
  if (newsVolume >= 5) signalStrength += sentimentScore > 0 ? 10 : -10;

  // Factor 4: Position size consideration (weight: 15%)
  if (shares > 0 && pnlPct > 25) {
    signalStrength -= 10;
    reasons.push("Large unrealized gains suggest profit-taking opportunity");
  }

  // Determine action
  if (signalStrength > 15) {
    action = "BUY";
    confidence = Math.min(85, 55 + Math.floor(signalStrength));
    reasons.unshift(`Strong buy signal for ${symbol}. Multi-factor analysis indicates positive outlook.`);
  } else if (signalStrength < -15) {
    action = "SELL";
    confidence = Math.min(85, 55 + Math.floor(Math.abs(signalStrength)));
    reasons.unshift(`Sell signal for ${symbol}. Risk factors outweigh positive indicators.`);
  } else {
    action = "HOLD";
    confidence = 50 + Math.floor(Math.abs(signalStrength));
    reasons.unshift(`Neutral outlook for ${symbol}. Maintaining current position.`);
  }

  const marketData = {
    currentPrice,
    costPrice,
    pnlPct: pnlPct.toFixed(2),
    sentimentScore: sentimentScore.toFixed(2),
    signalStrength: signalStrength.toFixed(1),
    positiveSignals: positiveHits.length,
    negativeSignals: negativeHits.length,
    analysisTimestamp: new Date().toISOString(),
  };

  return {
    symbol,
    action,
    confidence,
    reasoning: reasons.join(" | "),
    newsSummary: news.substring(0, 2000),
    marketData,
  };
}

// Execute a simulated trade based on the decision
async function executeSimulatedTrade(
  decision: Decision,
  currentPrice: number,
  currency: string,
  currentShares: number
): Promise<Trade | null> {
  if (decision.action === "HOLD") return null;

  let tradeShares = 0;
  if (decision.action === "BUY") {
    // Simulate buying 10-50 shares scaled by confidence
    tradeShares = Math.max(10, Math.floor((decision.confidence / 100) * 50));
  } else if (decision.action === "SELL") {
    // Sell 10-25% of position based on confidence
    const sellPct = Math.min(0.25, decision.confidence / 400);
    tradeShares = Math.max(1, Math.floor(currentShares * sellPct));
    if (tradeShares > currentShares) tradeShares = currentShares;
  }

  if (tradeShares <= 0) return null;

  const trade: Trade = {
    symbol: decision.symbol,
    action: decision.action,
    shares: tradeShares,
    price: currentPrice,
    currency,
    reason: `AI ${decision.action} @ ${decision.confidence}% confidence`,
  };

  // Record the trade
  await pool.query(
    `INSERT INTO "st-trades" (symbol, action, shares, price, currency, reason, source) VALUES ($1, $2, $3, $4, $5, $6, 'ai')`,
    [trade.symbol, trade.action, trade.shares, trade.price, trade.currency, trade.reason]
  );

  // Update holdings (simulated)
  if (decision.action === "BUY") {
    await pool.query(
      `UPDATE "st-holdings" SET shares = shares + $1 WHERE symbol = $2`,
      [tradeShares, decision.symbol]
    );
  } else if (decision.action === "SELL" && tradeShares > 0) {
    await pool.query(
      `UPDATE "st-holdings" SET shares = GREATEST(0, shares - $1) WHERE symbol = $2`,
      [tradeShares, decision.symbol]
    );
  }

  return trade;
}

export async function runDecisions(): Promise<{ decisions: Decision[]; trades: Trade[] }> {
  const { rows } = await pool.query(
    `SELECT symbol, current_price, cost_price, shares, price_currency FROM "st-holdings"`
  );

  const decisions: Decision[] = [];
  const trades: Trade[] = [];

  for (const row of rows) {
    const news = await searchMarketNews(row.symbol);
    const currentPrice = parseFloat(row.current_price) || 0;
    const decision = analyzeSignals(
      row.symbol,
      currentPrice,
      row.cost_price ? parseFloat(row.cost_price) : null,
      parseFloat(row.shares) || 0,
      news
    );

    // Save decision
    await pool.query(
      `INSERT INTO "st-decisions" (symbol, action, confidence, reasoning, news_summary, market_data) VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        decision.symbol,
        decision.action,
        decision.confidence,
        decision.reasoning,
        decision.newsSummary,
        JSON.stringify(decision.marketData),
      ]
    );

    decisions.push(decision);

    // Execute simulated trade
    if (currentPrice > 0) {
      const trade = await executeSimulatedTrade(
        decision,
        currentPrice,
        row.price_currency || "USD",
        parseFloat(row.shares) || 0
      );
      if (trade) trades.push(trade);
    }
  }

  return { decisions, trades };
}
