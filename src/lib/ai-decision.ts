import pool from "./db";
import { getQuote, convertToUsd } from "./prices";

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
  news: string,
  quote?: any
): Decision {
  const { score: sentimentScore, positiveHits, negativeHits } = computeSentimentScore(news);

  let action: Decision["action"] = "HOLD";
  let confidence = 50;
  const reasons: string[] = [];

  // Technical analysis
  let pnlPct = 0;
  if (costPrice && costPrice > 0 && currentPrice > 0) {
    pnlPct = ((currentPrice - costPrice) / costPrice) * 100;
  }

  // --- MSFT Special Rules ---
  const isMSFT = symbol === "MSFT";
  const now = new Date();
  const isQuarterEndMonth = [2, 5, 8, 11].includes(now.getMonth()); // March, June, Sept, Dec
  const isQuarterEndDays = now.getDate() >= 25;
  const isQuarterEnd = isQuarterEndMonth && isQuarterEndDays;

  // Sentiment analysis
  if (positiveHits.length > 0) {
    reasons.push(`利好因素: ${positiveHits.slice(0, 4).join(", ")}`);
  }
  if (negativeHits.length > 0) {
    reasons.push(`风险因素: ${negativeHits.slice(0, 4).join(", ")}`);
  }

  // Decision logic with multi-factor scoring
  let signalStrength = 0;
  signalStrength += sentimentScore * 40;

  if (costPrice && costPrice > 0) {
    if (pnlPct > 30) signalStrength -= 15;
    else if (pnlPct > 10) signalStrength += 10;
    else if (pnlPct < -20) signalStrength += 15;
  }

  // --- Enhanced Indicator Scoring ---
  if (quote) {
    // 估值因子: 低PE且有盈利增长利好时加分
    if (quote.pe && quote.pe < 25 && sentimentScore > 0) {
      signalStrength += 10;
      reasons.push(`估值吸引力 (PE: ${quote.pe})`);
    }
    // 股息因子: 高股息加分
    if (quote.dividendYield && quote.dividendYield > 1.5) {
      signalStrength += 5;
      reasons.push(`股息支撑 (${quote.dividendYield.toFixed(2)}%)`);
    }
    // 价格区间因子: 接近52周低点且有基本面支撑时，视为抄底机会
    if (quote.low52 && currentPrice < quote.low52 * 1.15 && sentimentScore > 0) {
      signalStrength += 15;
      reasons.push("接近52周低位，存在超跌反弹空间");
    }
  }

  const newsVolume = positiveHits.length + negativeHits.length;
  if (newsVolume >= 5) signalStrength += sentimentScore > 0 ? 10 : -10;

  // Final Action Logic
  if (isMSFT) {
    if (isQuarterEnd && signalStrength > 0) {
      action = "BUY";
      confidence = 80;
      reasons.unshift("季度末自动定投触发：MSFT 仅在季度末进行常规买入。");
    } else {
      action = signalStrength < -25 ? "SELL" : "HOLD";
      confidence = 60;
      reasons.unshift(action === "SELL" ? "MSFT 卖出信号：基本面或技术面显著恶化。" : "MSFT 观察中：非季度末不执行自动买入。");
    }
  } else {
    // Xiaomi regular rules
    if (signalStrength > 15) {
      action = "BUY";
      confidence = Math.min(95, 55 + Math.floor(signalStrength));
      reasons.unshift(`${symbol} 强烈买入：多因子分析显示前景乐观。`);
    } else if (signalStrength < -15) {
      action = "SELL";
      confidence = Math.min(95, 55 + Math.floor(Math.abs(signalStrength)));
      reasons.unshift(`${symbol} 卖出：风险因素超过利好指标。`);
    } else {
      action = "HOLD";
      confidence = 50 + Math.floor(Math.abs(signalStrength));
      reasons.unshift(`${symbol} 中性持仓。`);
    }
  }

  const marketData = {
    currentPrice,
    costPrice,
    pnlPct: pnlPct.toFixed(2),
    sentimentScore: sentimentScore.toFixed(2),
    signalStrength: signalStrength.toFixed(1),
    pe: quote?.pe,
    marketCap: quote?.marketCap,
    divYield: quote?.dividendYield,
    high52: quote?.fiftyTwoWeekHigh,
    low52: quote?.fiftyTwoWeekLow,
    isQuarterEnd,
    analysisTimestamp: now.toISOString(),
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
    if (decision.symbol === "MSFT") {
      // MSFT: ~21,000 CNY = ~$2,900 USD
      const targetUsd = 2900;
      tradeShares = Math.floor(targetUsd / currentPrice);
    } else {
      // Xiaomi: scales by confidence (200-1000 shares)
      tradeShares = Math.max(200, Math.floor((decision.confidence / 100) * 1000));
    }
  } else if (decision.action === "SELL") {
    const sellPct = Math.min(0.25, decision.confidence / 400);
    tradeShares = Math.max(1, Math.floor(currentShares * sellPct));
  }

  if (tradeShares <= 0) return null;

  const trade: Trade = {
    symbol: decision.symbol,
    action: decision.action,
    shares: tradeShares,
    price: currentPrice,
    currency,
    reason: decision.reasoning,
  };

  // Record the trade
  await pool.query(
    `INSERT INTO "st-trades" (symbol, action, shares, price, currency, reason, source) VALUES ($1, $2, $3, $4, $5, $6, 'ai')`,
    [trade.symbol, trade.action, trade.shares, trade.price, trade.currency, trade.reason]
  );

  // Update holdings
  if (decision.action === "BUY") {
    await pool.query(
      `UPDATE "st-holdings" SET shares = shares + $1 WHERE symbol = $2`,
      [tradeShares, decision.symbol]
    );
  } else if (decision.action === "SELL") {
    await pool.query(
      `UPDATE "st-holdings" SET shares = GREATEST(0, shares - $1) WHERE symbol = $2`,
      [tradeShares, decision.symbol]
    );
  }

  return trade;
}

export async function runDecisions(): Promise<{ decisions: Decision[]; trades: Trade[] }> {
  // First, ensure prices are fresh
  const { rows: holdings } = await pool.query(
    `SELECT symbol, current_price, cost_price, shares, price_currency FROM "st-holdings"`
  );

  const decisions: Decision[] = [];
  const trades: Trade[] = [];

  for (const row of holdings) {
    // 1. Fetch REAL real-time quote
    const quote = await getQuote(row.symbol);
    const currentPrice = quote ? quote.price : (parseFloat(row.current_price) || 0);
    const currency = quote ? quote.currency : (row.price_currency || "USD");

    // 2. Search for REAL market news
    const news = await searchMarketNews(row.symbol);
    
    // 3. Perform REAL analysis with indicators
    const decision = analyzeSignals(
      row.symbol,
      currentPrice,
      row.cost_price ? parseFloat(row.cost_price) : null,
      parseFloat(row.shares) || 0,
      news,
      quote // Pass the full quote with PE, MarketCap, etc.
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
        JSON.stringify({ ...decision.marketData, source: "live_market" }),
      ]
    );

    decisions.push(decision);

    // 4. Execute REAL-market-based simulated trade
    if (currentPrice > 0) {
      const trade = await executeSimulatedTrade(
        decision,
        currentPrice,
        currency,
        parseFloat(row.shares) || 0
      );
      if (trade) trades.push(trade);
    }
  }

  return { decisions, trades };
}
