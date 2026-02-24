import pool, { logAction, toSqlVal } from "./db";
import { getQuote, type Quote } from "./prices";
import {
  getGlobalAutoTrade,
  getSymbolSettings,
  type SymbolSetting,
} from "./trader-settings";

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

interface HoldingRow {
  symbol: string;
  name?: string | null;
  current_price: number | string | null;
  cost_price: number | string | null;
  shares: number | string | null;
  price_currency: string | null;
}

interface PriceHistoryRow {
  price: number | string | null;
  change_percent: number | string | null;
  created_at: string;
}

interface DecisionContext {
  symbol: string;
  companyName: string;
  quote: {
    price: number;
    currency: string;
    changePercent: number;
    pe: number | null;
    marketCap: number | null;
    dividendYield: number | null;
    fiftyTwoWeekHigh: number | null;
    fiftyTwoWeekLow: number | null;
  };
  position: {
    shares: number;
    costPrice: number | null;
    pnlPct: number | null;
  };
  sentiment: {
    score: number;
    positiveHits: string[];
    negativeHits: string[];
  };
  recentPriceHistory: Array<{
    price: number;
    changePercent: number;
    timestamp: string;
  }>;
  newsSummary: string;
  strategyBias: string;
}

interface DeepSeekDecisionPayload {
  action?: string;
  confidence?: number | string;
  reasoning?: string;
}

interface DeepSeekApiResponse {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string } | string;
}

const XIAOMI_SYMBOL = "01810.HK";
const isTradingDay = (d: Date): boolean => ![0, 6].includes(d.getDay());
const DEEPSEEK_API_URL = process.env.DEEPSEEK_API_URL || "https://api.deepseek.com/chat/completions";
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-chat";
const toNumber = (value: number | string | null | undefined): number => {
  if (typeof value === "number") return value;
  if (typeof value === "string") return parseFloat(value) || 0;
  return 0;
};
const clampConfidence = (value: number): number => Math.max(0, Math.min(100, Math.round(value)));

// Friendly names for search queries
const SYMBOL_NAMES: Record<string, string> = {
  MSFT: "Microsoft",
  "01810.HK": "Xiaomi",
};

// Search market news via Tavily deep search
async function searchMarketNews(symbol: string): Promise<string> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    await logAction("tavily", `Skipping news search for ${symbol}: no API key configured`);
    return "No Tavily API key configured. Using technical signals only.";
  }

  const companyName = SYMBOL_NAMES[symbol] || symbol;
  const currentYear = new Date().getFullYear();

  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query: `${companyName} ${symbol} stock market news latest financial analysis ${currentYear}`,
        search_depth: "advanced",
        max_results: 8,
      }),
      signal: AbortSignal.timeout(25000),
    });

    if (!res.ok) {
      const statusText = `${res.status} ${res.statusText}`;
      if (res.status === 401 || res.status === 403) {
        await logAction("tavily", `Auth error for ${symbol}: ${statusText}`);
      } else if (res.status === 429) {
        await logAction("tavily", `Rate limited for ${symbol}: ${statusText}`);
      } else {
        await logAction("tavily", `Search failed for ${symbol}: ${statusText}`);
      }
      return `Tavily search failed (${res.status}). Using technical signals only.`;
    }

    const data = await res.json();
    const summaries = (data.results || [])
      .map((r: { title: string; content: string; url: string }) =>
        `• ${r.title}: ${r.content?.substring(0, 300)}`
      )
      .join("\n");
    return summaries || "No relevant news found.";
  } catch (err) {
    const isTimeout = err instanceof DOMException && err.name === "TimeoutError";
    const errMsg = isTimeout ? "Request timed out" : String(err);
    await logAction("tavily", `Search error for ${symbol}: ${errMsg}`);
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

async function getRecentPriceHistory(symbol: string): Promise<DecisionContext["recentPriceHistory"]> {
  const sql = `SELECT price, change_percent, created_at
    FROM "st-price-history"
    WHERE symbol = ${toSqlVal(symbol)}
    ORDER BY created_at DESC
    LIMIT 12`;
  const { rows } = await pool.query(sql);
  return (rows as PriceHistoryRow[]).map((row) => ({
    price: toNumber(row.price),
    changePercent: toNumber(row.change_percent),
    timestamp: row.created_at,
  }));
}

async function buildDecisionContext(
  symbol: string,
  currentPrice: number,
  currency: string,
  costPrice: number | null,
  shares: number,
  quote: Quote | null,
  news: string
): Promise<DecisionContext> {
  const sentiment = computeSentimentScore(news);
  const pnlPct = costPrice && costPrice > 0 && currentPrice > 0
    ? ((currentPrice - costPrice) / costPrice) * 100
    : null;
  const recentPriceHistory = await getRecentPriceHistory(symbol);

  return {
    symbol,
    companyName: SYMBOL_NAMES[symbol] || symbol,
    quote: {
      price: currentPrice,
      currency,
      changePercent: quote?.changePercent ? Number(quote.changePercent) : 0,
      pe: quote?.pe ?? null,
      marketCap: quote?.marketCap ?? null,
      dividendYield: quote?.dividendYield ?? null,
      fiftyTwoWeekHigh: quote?.fiftyTwoWeekHigh ?? null,
      fiftyTwoWeekLow: quote?.fiftyTwoWeekLow ?? null,
    },
    position: {
      shares,
      costPrice,
      pnlPct,
    },
    sentiment,
    recentPriceHistory,
    newsSummary: news.substring(0, 2000),
    strategyBias: symbol === XIAOMI_SYMBOL
      ? "Xiaomi continuous monitoring: output explicit BUY/SELL/HOLD every trading day."
      : "General multi-factor swing/position management.",
  };
}

function parseDeepSeekContent(content: string): DeepSeekDecisionPayload {
  const jsonFence = content.match(/```json\s*([\s\S]*?)```/i);
  const raw = jsonFence?.[1]?.trim();
  if (raw) return JSON.parse(raw) as DeepSeekDecisionPayload;

  const firstBrace = content.indexOf("{");
  const lastBrace = content.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const candidate = content.substring(firstBrace, lastBrace + 1);
    return JSON.parse(candidate) as DeepSeekDecisionPayload;
  }
  throw new Error("DeepSeek response did not contain JSON payload");
}

async function decideWithDeepSeek(context: DecisionContext): Promise<Decision> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error("DEEPSEEK_API_KEY is not configured");
  }

  const body = {
    model: DEEPSEEK_MODEL,
    temperature: 0.1,
    messages: [
      {
        role: "system",
        content:
          "You are a disciplined equity trader. Return ONLY JSON: {\"action\":\"BUY|SELL|HOLD\",\"confidence\":0-100,\"reasoning\":\"...\"}. Use provided technical, sentiment, and position context.",
      },
      {
        role: "user",
        content: `Make a trading decision for ${context.symbol} using this context:\n${JSON.stringify(context)}`,
      },
    ],
  };

  const res = await fetch(DEEPSEEK_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`DeepSeek API ${res.status}: ${errText}`);
  }

  const data = (await res.json()) as DeepSeekApiResponse;
  if (data.error) {
    const errMsg = typeof data.error === "string" ? data.error : (data.error.message || "unknown DeepSeek error");
    throw new Error(errMsg);
  }

  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("DeepSeek returned empty content");
  const payload = parseDeepSeekContent(content);

  const rawAction = String(payload.action || "").toUpperCase();
  if (!["BUY", "SELL", "HOLD"].includes(rawAction)) {
    throw new Error(`Invalid DeepSeek action: ${String(payload.action)}`);
  }

  const confidenceRaw = typeof payload.confidence === "string"
    ? parseFloat(payload.confidence)
    : Number(payload.confidence ?? 50);
  const confidence = clampConfidence(isFinite(confidenceRaw) ? confidenceRaw : 50);
  const reasoning = String(payload.reasoning || "No reasoning provided by DeepSeek.").substring(0, 1800);

  return {
    symbol: context.symbol,
    action: rawAction as Decision["action"],
    confidence,
    reasoning,
    newsSummary: context.newsSummary,
    marketData: {
      source: "deepseek",
      model: DEEPSEEK_MODEL,
      context,
      inferenceTimestamp: new Date().toISOString(),
    },
  };
}

// AI analysis: combine technical indicators with news sentiment
function analyzeSignals(
  symbol: string,
  currentPrice: number,
  costPrice: number | null,
  shares: number,
  news: string,
  quote?: Quote | null
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
  const isXiaomi = symbol === XIAOMI_SYMBOL;
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
    if (quote.fiftyTwoWeekLow && currentPrice < quote.fiftyTwoWeekLow * 1.15 && sentimentScore > 0) {
      signalStrength += 15;
      reasons.push("接近52周低位，存在超跌反弹空间");
    }
    if (quote.changePercent && Math.abs(quote.changePercent) > 3) {
      signalStrength += quote.changePercent > 0 ? 6 : -6;
      reasons.push(`价格动量信号 (${quote.changePercent.toFixed(2)}%)`);
    }
  }

  // Xiaomi continuous-monitoring bias
  if (isXiaomi) {
    reasons.unshift("Xiaomi 连续监控模式：每个交易日必须输出明确 BUY/SELL/HOLD。");
    signalStrength += sentimentScore * 12;
    if (shares <= 0 && sentimentScore >= 0) signalStrength += 8;
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
      if (action === "SELL") {
        reasons.unshift("MSFT 卖出信号：基本面或技术面显著恶化。");
      } else if (signalStrength > 15) {
        reasons.unshift("MSFT 建议增持：技术形态或市场情绪积极。");
      } else {
        reasons.unshift("MSFT 中性观察。");
      }
    }
  } else {
    // Xiaomi gets tighter thresholds for active daily actioning
    const buyThreshold = isXiaomi ? 8 : 15;
    const sellThreshold = isXiaomi ? -8 : -15;
    if (signalStrength > buyThreshold) {
      action = "BUY";
      confidence = Math.min(95, 55 + Math.floor(signalStrength));
      reasons.unshift(`${symbol} 强烈买入：多因子分析显示前景乐观。`);
    } else if (signalStrength < sellThreshold) {
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
    dailyMonitorBias: isXiaomi,
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
    if (currentShares <= 0) return null;
    const sellPct = Math.min(0.25, decision.confidence / 400);
    tradeShares = Math.min(currentShares, Math.max(1, Math.floor(currentShares * sellPct)));
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
  const tradeSql = `INSERT INTO "st-trades" (symbol, action, shares, price, currency, reason, source) 
    VALUES (
      ${toSqlVal(trade.symbol)}, 
      ${toSqlVal(trade.action)}, 
      ${toSqlVal(trade.shares)}, 
      ${toSqlVal(trade.price)}, 
      ${toSqlVal(trade.currency)}, 
      ${toSqlVal(trade.reason)}, 
      'ai'
    )`;
  await pool.query(tradeSql);

  // Update holdings (autonomous execution path)
  if (decision.action === "BUY") {
    const upsertSql = `INSERT INTO "st-holdings" (symbol, name, shares, cost_price, cost_currency, current_price, price_currency, exchange)
      VALUES (${toSqlVal(decision.symbol)}, ${toSqlVal(SYMBOL_NAMES[decision.symbol] || decision.symbol)}, 0, ${toSqlVal(currentPrice)}, ${toSqlVal(currency)}, ${toSqlVal(currentPrice)}, ${toSqlVal(currency)}, ${toSqlVal(decision.symbol.endsWith(".HK") ? "HKEX" : "AUTO")})
      ON CONFLICT (symbol) DO NOTHING`;
    await pool.query(upsertSql);
    const buySql = `UPDATE "st-holdings"
      SET shares = shares + ${toSqlVal(tradeShares)},
          current_price = ${toSqlVal(currentPrice)},
          price_currency = ${toSqlVal(currency)},
          updated_at = NOW()
      WHERE symbol = ${toSqlVal(decision.symbol)}`;
    await pool.query(buySql);
  } else if (decision.action === "SELL") {
    const sellSql = `UPDATE "st-holdings"
      SET shares = GREATEST(0, shares - ${toSqlVal(tradeShares)}),
          current_price = ${toSqlVal(currentPrice)},
          price_currency = ${toSqlVal(currency)},
          updated_at = NOW()
      WHERE symbol = ${toSqlVal(decision.symbol)}`;
    await pool.query(sellSql);
  }
  
  // Log trade execution
  await logAction("trade", `Executed ${trade.action} for ${trade.symbol}`, trade);

  return trade;
}

export async function runDecisions(): Promise<{ decisions: Decision[]; trades: Trade[] }> {
  await logAction("ai", "Starting daily AI decision cycle");

  const trackedSettings = await getSymbolSettings(true);
  const globalAutoTrade = await getGlobalAutoTrade();
  if (trackedSettings.length === 0) {
    await logAction("ai", "No enabled symbols in settings; skipping decision cycle.");
    return { decisions: [], trades: [] };
  }

  const { rows } = await pool.query(
    `SELECT symbol, name, current_price, cost_price, shares, price_currency FROM "st-holdings"`
  );
  const holdingsMap = new Map<string, HoldingRow>();
  for (const row of rows as HoldingRow[]) {
    holdingsMap.set(row.symbol, row);
  }

  const tradingDay = isTradingDay(new Date());

  const decisions: Decision[] = [];
  const trades: Trade[] = [];

  for (const setting of trackedSettings) {
    const row = holdingsMap.get(setting.symbol) || {
      symbol: setting.symbol,
      name: setting.name,
      current_price: null,
      cost_price: null,
      shares: 0,
      price_currency: setting.symbol.endsWith(".HK") ? "HKD" : "USD",
    };

    // 1. Fetch REAL real-time quote
    const quote = await getQuote(setting.symbol);
    const currentPrice = quote ? quote.price : toNumber(row.current_price);
    const currency = quote ? quote.currency : (row.price_currency || "USD");

    // 2. Search for REAL market news
    const news = await searchMarketNews(setting.symbol);
    const costPrice = toNumber(row.cost_price) > 0 ? toNumber(row.cost_price) : null;
    const shares = toNumber(row.shares);

    // 3. Assemble context and request DeepSeek decision
    const context = await buildDecisionContext(
      setting.symbol,
      currentPrice,
      currency,
      costPrice,
      shares,
      quote,
      news
    );

    let decision: Decision;
    let decisionSource = "deepseek";
    try {
      decision = await decideWithDeepSeek(context);
    } catch (err) {
      decisionSource = "fallback_rules";
      decision = analyzeSignals(
        setting.symbol,
        currentPrice,
        costPrice,
        shares,
        news,
        quote
      );
      decision.reasoning = `[Fallback due to DeepSeek failure] ${decision.reasoning}`;
      decision.marketData = {
        ...decision.marketData,
        source: decisionSource,
        deepseekError: String(err).substring(0, 300),
      };
      await logAction("deepseek", `Fallback decision used for ${setting.symbol}`, {
        action: "DEEPSEEK_FALLBACK",
        status: "fail",
        summary: `DeepSeek failed for ${setting.symbol}, used rules fallback.`,
        error: String(err).substring(0, 300),
      });
    }

    // Save decision
    const decisionSql = `INSERT INTO "st-decisions" (symbol, action, confidence, reasoning, news_summary, market_data) 
      VALUES (
        ${toSqlVal(decision.symbol)}, 
        ${toSqlVal(decision.action)}, 
        ${toSqlVal(decision.confidence)}, 
        ${toSqlVal(decision.reasoning)}, 
        ${toSqlVal(decision.newsSummary)}, 
        ${toSqlVal(JSON.stringify({
          ...decision.marketData,
          source: (decision.marketData?.source || decisionSource),
          enabled: setting.enabled,
          autoTrade: setting.autoTrade,
        }))}
      )`;
    await pool.query(decisionSql);
    
    // Log decision
    await logAction("decision", `Generated ${decision.action} signal for ${setting.symbol}`, {
      confidence: decision.confidence,
      source: decisionSource,
    });

    decisions.push(decision);

    // 4. Execute REAL-market-based simulated trade
    if (tradingDay && globalAutoTrade && setting.autoTrade && currentPrice > 0) {
      const trade = await executeSimulatedTrade(
        decision,
        currentPrice,
        currency,
        shares
      );
      if (trade) trades.push(trade);
    } else if (tradingDay && (!globalAutoTrade || !setting.autoTrade)) {
      await logAction("trade", `Skipped auto-trade for ${setting.symbol}`, {
        action: "AUTO_TRADE_SKIPPED",
        globalAutoTrade,
        symbolAutoTrade: setting.autoTrade,
      });
    }
  }

  await logAction("ai", `Decision cycle complete. Trading day=${tradingDay}. Generated ${decisions.length} decisions and ${trades.length} trades.`, {
    monitoredSymbols: trackedSettings.map((s: SymbolSetting) => s.symbol),
    globalAutoTrade,
  });
  return { decisions, trades };
}
