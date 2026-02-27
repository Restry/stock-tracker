import pool, { logAction, toSqlVal } from "./db";
import { getQuote, type Quote } from "./prices";
import {
  getGlobalAutoTrade,
  getSymbolSettings,
  type SymbolSetting,
} from "./trader-settings";
import {
  computeTechnicalIndicators,
  formatIndicatorsForPrompt,
  type TechnicalIndicators,
} from "./technical-indicators";

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
  technicalIndicators: {
    rsi14: number | null;
    rsiSignal: string | null;
    sma5: number | null;
    sma20: number | null;
    sma60: number | null;
    maShortAboveLong: boolean | null;
    maGoldenCross: boolean | null;
    priceAboveSma20: boolean | null;
    macdBullish: boolean | null;
    macdHistogram: number | null;
    bollingerPosition: number | null;
    atr14: number | null;
    volatilityPct: number | null;
    volumeRatio: number | null;
    volumeTrend: string | null;
    suddenVolumeSpike: boolean | null;
    roc5: number | null;
    roc20: number | null;
    consecutiveUp: number;
    consecutiveDown: number;
    technicalScore: number;
    technicalSignal: string;
    dataPoints: number;
  };
  riskConstraints: {
    stopLossTriggered: boolean;
    maxPositionReached: boolean;
    cooldownActive: boolean;
    dailyTradeCount: number;
    dailyTradeLimit: number;
  };
  recentPriceHistory: Array<{
    price: number;
    changePercent: number;
    timestamp: string;
  }>;
  previousDecisions: Array<{
    action: string;
    confidence: number;
    createdAt: string;
  }>;
  newsSummary: string;
  strategyBias: string;
  technicalSummary: string;
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
const IS_AZURE_OPENAI = DEEPSEEK_API_URL.includes(".openai.azure.com");
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

// ─── Enhanced Sentiment Analysis with Weighted Keywords ───

const POSITIVE_KEYWORDS: Array<{ word: string; weight: number }> = [
  // High impact (weight 3)
  { word: "beat expectations", weight: 3 }, { word: "record revenue", weight: 3 },
  { word: "record profit", weight: 3 }, { word: "upgrade", weight: 3 },
  { word: "buy rating", weight: 3 }, { word: "outperform", weight: 3 },
  { word: "breakthrough", weight: 3 }, { word: "strong buy", weight: 3 },
  // Medium impact (weight 2)
  { word: "revenue growth", weight: 2 }, { word: "beat", weight: 2 },
  { word: "surge", weight: 2 }, { word: "rally", weight: 2 },
  { word: "bullish", weight: 2 }, { word: "expansion", weight: 2 },
  { word: "partnership", weight: 2 }, { word: "innovation", weight: 2 },
  { word: "exceed", weight: 2 }, { word: "market share gain", weight: 2 },
  { word: "buyback", weight: 2 }, { word: "repurchas", weight: 2 },
  // Low impact (weight 1)
  { word: "growth", weight: 1 }, { word: "strong", weight: 1 },
  { word: "profit", weight: 1 }, { word: "dividend", weight: 1 },
  { word: "momentum", weight: 1 }, { word: "cloud", weight: 1 },
  { word: "ai", weight: 0.5 },  // Very common, low signal
];

const NEGATIVE_KEYWORDS: Array<{ word: string; weight: number }> = [
  // High impact (weight 3)
  { word: "downgrade", weight: 3 }, { word: "sell rating", weight: 3 },
  { word: "bankruptcy", weight: 3 }, { word: "fraud", weight: 3 },
  { word: "investigation", weight: 3 }, { word: "default", weight: 3 },
  { word: "profit warning", weight: 3 }, { word: "guidance cut", weight: 3 },
  // Medium impact (weight 2)
  { word: "miss", weight: 2 }, { word: "decline", weight: 2 },
  { word: "bearish", weight: 2 }, { word: "underperform", weight: 2 },
  { word: "layoff", weight: 2 }, { word: "lawsuit", weight: 2 },
  { word: "tariff", weight: 2 }, { word: "sanction", weight: 2 },
  { word: "recession", weight: 2 }, { word: "ban", weight: 2 },
  // Low impact (weight 1)
  { word: "drop", weight: 1 }, { word: "weak", weight: 1 },
  { word: "loss", weight: 1 }, { word: "warning", weight: 1 },
  { word: "cut", weight: 1 }, { word: "concern", weight: 1 },
  { word: "debt", weight: 1 }, { word: "pressure", weight: 1 },
];

// Negation phrases that flip sentiment
const NEGATION_PATTERNS = [
  /not\s+(?:a\s+)?declin/i, /no\s+(?:significant\s+)?loss/i,
  /not\s+weak/i, /avoid(?:ed|ing)?\s+loss/i,
  /despite\s+(?:the\s+)?(?:concern|drop|decline)/i,
  /not\s+(?:a\s+)?concern/i, /no\s+downgrade/i,
];

function computeSentimentScore(news: string): { score: number; positiveHits: string[]; negativeHits: string[] } {
  const lower = news.toLowerCase();

  // Detect negation patterns (reduce false negatives)
  let negationBonus = 0;
  for (const pat of NEGATION_PATTERNS) {
    if (pat.test(news)) negationBonus += 0.5;
  }

  let positiveScore = 0;
  let negativeScore = 0;
  const positiveHits: string[] = [];
  const negativeHits: string[] = [];

  for (const { word, weight } of POSITIVE_KEYWORDS) {
    // Count occurrences (cap at 3 to avoid single-article bias)
    const regex = new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    const matches = lower.match(regex);
    if (matches) {
      const count = Math.min(matches.length, 3);
      positiveScore += weight * count;
      positiveHits.push(word);
    }
  }

  for (const { word, weight } of NEGATIVE_KEYWORDS) {
    const regex = new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    const matches = lower.match(regex);
    if (matches) {
      const count = Math.min(matches.length, 3);
      negativeScore += weight * count;
      negativeHits.push(word);
    }
  }

  // Apply negation bonus (shifts score toward positive)
  positiveScore += negationBonus;

  const total = positiveScore + negativeScore;
  const score = total > 0 ? (positiveScore - negativeScore) / total : 0;

  return { score: Math.max(-1, Math.min(1, score)), positiveHits, negativeHits };
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

// ─── Risk Control Constants ───
const STOP_LOSS_PCT = -15;           // Force SELL if PnL drops below -15%
const MAX_POSITION_VALUE_USD = 50000; // Max single position value in USD
const DECISION_COOLDOWN_MIN = 30;     // Min minutes between decisions for same symbol
const DAILY_TRADE_LIMIT = 6;          // Max trades per symbol per day

// ─── Intraday Mean Reversion (做 T) & Cost Basis Protection ───

interface IntradaySwingResult {
  triggered: boolean;
  reason: string;
}

/** T-Buy: Bollinger lower band + RSI oversold → buy signal regardless of sentiment */
function checkIntradaySwingSignal(
  bollingerPosition: number | null,
  rsi14: number | null,
): IntradaySwingResult {
  if (
    bollingerPosition !== null &&
    rsi14 !== null &&
    bollingerPosition < 0.1 &&
    rsi14 < 30
  ) {
    return {
      triggered: true,
      reason: `T-Buy 信号：布林下轨(${(bollingerPosition * 100).toFixed(0)}%) + RSI超卖(${rsi14.toFixed(0)})`,
    };
  }
  return { triggered: false, reason: "" };
}

interface ProfitTakingResult {
  triggered: boolean;
  intradayGainPct: number;
  reason: string;
}

/** Profit-taking: SELL if intraday gain > 3% from daily low to reduce cost basis */
function checkProfitTaking(
  currentPrice: number,
  recentPriceHistory: DecisionContext["recentPriceHistory"],
  shares: number,
): ProfitTakingResult {
  if (shares <= 0 || recentPriceHistory.length === 0) {
    return { triggered: false, intradayGainPct: 0, reason: "" };
  }
  // Estimate daily low from recent intraday data points
  const todayPrices = recentPriceHistory.slice(0, 6).map((p) => p.price).filter((p) => p > 0);
  if (todayPrices.length === 0) {
    return { triggered: false, intradayGainPct: 0, reason: "" };
  }
  const dailyLow = Math.min(...todayPrices);
  const intradayGainPct = dailyLow > 0 ? ((currentPrice - dailyLow) / dailyLow) * 100 : 0;
  if (intradayGainPct > 3) {
    return {
      triggered: true,
      intradayGainPct,
      reason: `日内冲高 ${intradayGainPct.toFixed(1)}%（从低点 ${dailyLow.toFixed(2)} 回升），建议做T卖出降低成本`,
    };
  }
  return { triggered: false, intradayGainPct, reason: "" };
}

interface CostBasisAdjustment {
  signalDelta: number;
  reason: string;
}

/** Adjust signal strength to prioritize reducing cost_price for existing holdings */
function applyCostBasisProtection(
  currentPrice: number,
  costPrice: number | null,
  shares: number,
  bollingerPosition: number | null,
  rsi14: number | null,
): CostBasisAdjustment {
  if (!costPrice || costPrice <= 0 || shares <= 0) {
    return { signalDelta: 0, reason: "" };
  }
  const priceToCostRatio = currentPrice / costPrice;

  // Price well below cost & technicals support buying → boost BUY to average down
  if (priceToCostRatio < 0.95) {
    const techSupport =
      (bollingerPosition !== null && bollingerPosition < 0.3) ||
      (rsi14 !== null && rsi14 < 40);
    if (techSupport) {
      return {
        signalDelta: 15,
        reason: `成本保护：价格低于成本价 ${((1 - priceToCostRatio) * 100).toFixed(1)}%，技术面支撑加仓摊薄成本`,
      };
    }
  }

  // Price above cost with quick gain → boost SELL to lock profit and reduce basis
  if (priceToCostRatio > 1.03) {
    return {
      signalDelta: -10,
      reason: `成本保护：价格高于成本价 ${((priceToCostRatio - 1) * 100).toFixed(1)}%，建议部分止盈降低持仓成本`,
    };
  }

  return { signalDelta: 0, reason: "" };
}

// ─── Risk & Cooldown Checks ───

interface RiskCheckResult {
  stopLossTriggered: boolean;
  maxPositionReached: boolean;
  cooldownActive: boolean;
  dailyTradeCount: number;
  lastDecisionAction: string | null;
  lastDecisionTime: string | null;
}

async function checkRiskConstraints(
  symbol: string,
  currentPrice: number,
  currency: string,
  costPrice: number | null,
  shares: number,
): Promise<RiskCheckResult> {
  const pnlPct = costPrice && costPrice > 0 && currentPrice > 0
    ? ((currentPrice - costPrice) / costPrice) * 100
    : 0;

  // Stop-loss check
  const stopLossTriggered = shares > 0 && pnlPct < STOP_LOSS_PCT;

  // Max position size (approximate USD value)
  const fxRate = currency === "HKD" ? 0.128 : currency === "CNY" ? 0.138 : 1;
  const positionValueUsd = currentPrice * shares * fxRate;
  const maxPositionReached = positionValueUsd >= MAX_POSITION_VALUE_USD;

  // Decision cooldown — check time since last decision
  let cooldownActive = false;
  let lastDecisionAction: string | null = null;
  let lastDecisionTime: string | null = null;
  try {
    const cdSql = `SELECT action, created_at FROM "st-decisions"
      WHERE symbol = ${toSqlVal(symbol)}
      ORDER BY created_at DESC LIMIT 1`;
    const { rows: cdRows } = await pool.query(cdSql);
    if (cdRows.length > 0) {
      const lastDec = cdRows[0] as { action: string; created_at: string };
      lastDecisionAction = lastDec.action;
      lastDecisionTime = lastDec.created_at;
      const elapsed = (Date.now() - new Date(lastDec.created_at).getTime()) / 60000;
      cooldownActive = elapsed < DECISION_COOLDOWN_MIN;
    }
  } catch { /* ignore */ }

  // Daily trade count
  let dailyTradeCount = 0;
  try {
    const tcSql = `SELECT COUNT(*) as cnt FROM "st-trades"
      WHERE symbol = ${toSqlVal(symbol)}
      AND created_at > CURRENT_DATE`;
    const { rows: tcRows } = await pool.query(tcSql);
    dailyTradeCount = toNumber((tcRows[0] as { cnt: number | string })?.cnt);
  } catch { /* ignore */ }

  return { stopLossTriggered, maxPositionReached, cooldownActive, dailyTradeCount, lastDecisionAction, lastDecisionTime };
}

// ─── Previous decisions for context ───

async function getPreviousDecisions(symbol: string, limit: number = 5): Promise<DecisionContext["previousDecisions"]> {
  try {
    const sql = `SELECT action, confidence, created_at FROM "st-decisions"
      WHERE symbol = ${toSqlVal(symbol)}
      ORDER BY created_at DESC LIMIT ${toSqlVal(limit)}`;
    const { rows } = await pool.query(sql);
    return (rows as Array<{ action: string; confidence: number | string; created_at: string }>).map(r => ({
      action: r.action,
      confidence: toNumber(r.confidence),
      createdAt: r.created_at,
    }));
  } catch { return []; }
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

  // Compute technical indicators
  const ti = await computeTechnicalIndicators(
    symbol,
    currentPrice,
    quote?.fiftyTwoWeekHigh,
    quote?.fiftyTwoWeekLow
  );
  const technicalSummary = formatIndicatorsForPrompt(ti, currentPrice);

  // Risk constraints
  const risk = await checkRiskConstraints(symbol, currentPrice, currency, costPrice, shares);

  // Previous decisions for continuity
  const previousDecisions = await getPreviousDecisions(symbol);

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
    technicalIndicators: {
      rsi14: ti.rsi14,
      rsiSignal: ti.rsiSignal,
      sma5: ti.sma5,
      sma20: ti.sma20,
      sma60: ti.sma60,
      maShortAboveLong: ti.maShortAboveLong,
      maGoldenCross: ti.maGoldenCross,
      priceAboveSma20: ti.priceAboveSma20,
      macdBullish: ti.macdBullish,
      macdHistogram: ti.macdHistogram,
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
    riskConstraints: {
      stopLossTriggered: risk.stopLossTriggered,
      maxPositionReached: risk.maxPositionReached,
      cooldownActive: risk.cooldownActive,
      dailyTradeCount: risk.dailyTradeCount,
      dailyTradeLimit: DAILY_TRADE_LIMIT,
    },
    recentPriceHistory,
    previousDecisions,
    newsSummary: news.substring(0, 2000),
    strategyBias: symbol === XIAOMI_SYMBOL
      ? "Xiaomi continuous monitoring: output explicit BUY/SELL/HOLD every trading day."
      : "General multi-factor swing/position management.",
    technicalSummary,
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

  // Build enhanced system prompt with risk constraints
  const riskNotes: string[] = [];
  if (context.riskConstraints.stopLossTriggered) riskNotes.push("STOP-LOSS TRIGGERED: Position PnL is below -15%. Strongly consider SELL.");
  if (context.riskConstraints.maxPositionReached) riskNotes.push("MAX POSITION SIZE reached. Do NOT recommend BUY.");
  if (context.riskConstraints.dailyTradeCount >= context.riskConstraints.dailyTradeLimit) riskNotes.push(`DAILY TRADE LIMIT reached (${context.riskConstraints.dailyTradeCount}/${context.riskConstraints.dailyTradeLimit}). Recommend HOLD.`);

  // Intraday swing / T-trading signals
  const tBuy = checkIntradaySwingSignal(
    context.technicalIndicators.bollingerPosition,
    context.technicalIndicators.rsi14,
  );
  const profitTake = checkProfitTaking(
    context.quote.price,
    context.recentPriceHistory,
    context.position.shares,
  );
  const costBasis = applyCostBasisProtection(
    context.quote.price,
    context.position.costPrice,
    context.position.shares,
    context.technicalIndicators.bollingerPosition,
    context.technicalIndicators.rsi14,
  );

  const intradayNotes: string[] = [];
  if (tBuy.triggered) intradayNotes.push(`T-BUY SIGNAL ACTIVE: ${tBuy.reason}`);
  if (profitTake.triggered) intradayNotes.push(`PROFIT-TAKING SIGNAL: ${profitTake.reason}`);
  if (costBasis.signalDelta !== 0) intradayNotes.push(`COST BASIS PROTECTION: ${costBasis.reason}`);
  if (context.technicalIndicators.suddenVolumeSpike) intradayNotes.push("SUDDEN VOLUME SPIKE: 30-min volume >= 2x historical average (放量)");

  const prevDecStr = context.previousDecisions.length > 0
    ? `Recent decisions: ${context.previousDecisions.map(d => `${d.action}(${d.confidence}%) at ${d.createdAt}`).join(", ")}. Avoid unnecessary signal flipping.`
    : "";

  const systemPrompt = `You are a disciplined quantitative equity trader. Analyze the provided data and return ONLY valid JSON: {"action":"BUY|SELL|HOLD","confidence":0-100,"reasoning":"..."}.

DECISION FRAMEWORK:
1. Technical indicators (RSI, MACD, Moving Averages, Bollinger Bands) — weight 40%
2. News sentiment analysis — weight 25%  
3. Position P&L and risk management — weight 20%
4. Valuation fundamentals (PE, dividend yield) — weight 15%

INTRADAY T-TRADING RULES (做 T):
- If Bollinger Band position < 10% AND RSI < 30, this is a T-Buy opportunity. Recommend BUY even if sentiment is neutral. The goal is intraday mean reversion.
- If intraday gain from daily low exceeds 3%, recommend partial SELL to lock in the swing profit and reduce holding cost.
- Always prioritize reducing cost_price for existing holdings: favor buying below cost (to average down) and selling above cost (to lower cost basis).
- T-trading signals should increase your confidence in the recommended action.
- If SUDDEN VOLUME SPIKE is detected (30-min volume >= 2x average), this confirms the trend direction. Rising price + volume spike = strong BUY signal. Falling price + volume spike = strong SELL signal.

RISK RULES (MANDATORY — override other signals):
${riskNotes.length > 0 ? riskNotes.map(n => `- ${n}`).join("\n") : "- No risk overrides active."}

${intradayNotes.length > 0 ? `ACTIVE INTRADAY SIGNALS:\n${intradayNotes.map(n => `- ${n}`).join("\n")}` : ""}

${prevDecStr}

Keep reasoning concise (under 300 chars). Use the technical indicators summary provided to inform your analysis. 请用中文输出reasoning字段。`;

  const userPrompt = `Trading decision for ${context.symbol} (${context.companyName}):

MARKET DATA:
- Price: ${context.quote.price} ${context.quote.currency} (${context.quote.changePercent >= 0 ? "+" : ""}${context.quote.changePercent.toFixed(2)}%)
- PE: ${context.quote.pe ?? "N/A"}, DivYield: ${context.quote.dividendYield ?? "N/A"}%
- 52W Range: ${context.quote.fiftyTwoWeekLow ?? "?"} – ${context.quote.fiftyTwoWeekHigh ?? "?"}

POSITION:
- Shares: ${context.position.shares}, Cost: ${context.position.costPrice ?? "N/A"}, PnL: ${context.position.pnlPct !== null ? context.position.pnlPct.toFixed(1) + "%" : "N/A"}

${context.technicalSummary}

SENTIMENT: Score=${context.sentiment.score.toFixed(2)}
- Positive: ${context.sentiment.positiveHits.join(", ") || "none"}
- Negative: ${context.sentiment.negativeHits.join(", ") || "none"}

NEWS SUMMARY:
${context.newsSummary.substring(0, 1200)}

STRATEGY: ${context.strategyBias}`;

  const body = {
    model: DEEPSEEK_MODEL,
    temperature: 0.1,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  };

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (IS_AZURE_OPENAI) {
    headers["api-key"] = apiKey;
  } else {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  const res = await fetch(DEEPSEEK_API_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
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
  quote?: Quote | null,
  technicalIndicators?: TechnicalIndicators | null,
  riskCheck?: RiskCheckResult | null,
  recentPriceHistory?: DecisionContext["recentPriceHistory"],
): Decision {
  const { score: sentimentScore, positiveHits, negativeHits } = computeSentimentScore(news);

  let action: Decision["action"] = "HOLD";
  let confidence = 50;
  const reasons: string[] = [];

  // ─── Risk overrides (highest priority) ───
  if (riskCheck?.stopLossTriggered) {
    return {
      symbol, action: "SELL", confidence: 90,
      reasoning: `⚠️ 止损触发：PnL 低于 ${STOP_LOSS_PCT}%，强制卖出以控制风险。`,
      newsSummary: news.substring(0, 2000),
      marketData: { source: "fallback_rules", riskOverride: "stop_loss" },
    };
  }

  // Technical analysis
  let pnlPct = 0;
  if (costPrice && costPrice > 0 && currentPrice > 0) {
    pnlPct = ((currentPrice - costPrice) / costPrice) * 100;
  }

  const isMSFT = symbol === "MSFT";
  const isXiaomi = symbol === XIAOMI_SYMBOL;
  const now = new Date();
  const isQuarterEndMonth = [2, 5, 8, 11].includes(now.getMonth());
  const isQuarterEndDays = now.getDate() >= 25;
  const isQuarterEnd = isQuarterEndMonth && isQuarterEndDays;

  // Sentiment analysis
  if (positiveHits.length > 0) {
    reasons.push(`利好因素: ${positiveHits.slice(0, 4).join(", ")}`);
  }
  if (negativeHits.length > 0) {
    reasons.push(`风险因素: ${negativeHits.slice(0, 4).join(", ")}`);
  }

  // ─── Multi-factor scoring ───
  let signalStrength = 0;

  // Factor 1: Sentiment (weight ~25%)
  signalStrength += sentimentScore * 30;

  // Factor 2: Technical indicators (weight ~40%) — NEW
  if (technicalIndicators && technicalIndicators.dataPoints >= 10) {
    // Use composite technical score directly (already -100 to +100)
    signalStrength += technicalIndicators.technicalScore * 0.4;
    reasons.push(`技术评分: ${technicalIndicators.technicalScore} (${technicalIndicators.technicalSignal})`);

    // RSI-specific signals
    if (technicalIndicators.rsi14 !== null) {
      if (technicalIndicators.rsi14 < 30) {
        signalStrength += 12;
        reasons.push(`RSI超卖 (${technicalIndicators.rsi14.toFixed(0)})`);
      } else if (technicalIndicators.rsi14 > 70) {
        signalStrength -= 12;
        reasons.push(`RSI超买 (${technicalIndicators.rsi14.toFixed(0)})`);
      }
    }

    // MACD confirmation
    if (technicalIndicators.macdBullish === true && sentimentScore > 0) {
      signalStrength += 8;
    } else if (technicalIndicators.macdBullish === false && sentimentScore < 0) {
      signalStrength -= 8;
    }

    // Bollinger Bands
    if (technicalIndicators.bollingerPosition !== null) {
      if (technicalIndicators.bollingerPosition < 0.15) {
        signalStrength += 10;
        reasons.push("布林带下轨支撑");
      } else if (technicalIndicators.bollingerPosition > 0.85) {
        signalStrength -= 10;
        reasons.push("布林带上轨压力");
      }
    }

    // Volume confirmation
    if (technicalIndicators.volumeRatio !== null && technicalIndicators.roc5 !== null) {
      if (technicalIndicators.roc5 > 0 && technicalIndicators.volumeRatio > 1.3) {
        signalStrength += 6;
        reasons.push("放量上涨确认");
      } else if (technicalIndicators.roc5 < 0 && technicalIndicators.volumeRatio > 1.3) {
        signalStrength -= 6;
        reasons.push("放量下跌警告");
      }
    }

    // Sudden volume spike amplifies trend signal (放量)
    if (technicalIndicators.suddenVolumeSpike) {
      if (technicalIndicators.roc5 !== null && technicalIndicators.roc5 > 0) {
        signalStrength += 10;
        reasons.push("突然放量上涨，趋势确认");
      } else if (technicalIndicators.roc5 !== null && technicalIndicators.roc5 < 0) {
        signalStrength -= 10;
        reasons.push("突然放量下跌，风险加剧");
      } else {
        reasons.push("突然放量，关注方向突破");
      }
    }
  }

  // ─── Intraday Mean Reversion (做 T) ───
  const tBuy = checkIntradaySwingSignal(
    technicalIndicators?.bollingerPosition ?? null,
    technicalIndicators?.rsi14 ?? null,
  );
  if (tBuy.triggered) {
    signalStrength += 20;
    reasons.push(tBuy.reason);
  }

  // ─── Profit-Taking Logic ───
  const profitTake = checkProfitTaking(currentPrice, recentPriceHistory ?? [], shares);
  if (profitTake.triggered) {
    signalStrength -= 18;
    reasons.push(profitTake.reason);
  }

  // ─── Cost Basis Protection ───
  const costBasis = applyCostBasisProtection(
    currentPrice,
    costPrice,
    shares,
    technicalIndicators?.bollingerPosition ?? null,
    technicalIndicators?.rsi14 ?? null,
  );
  if (costBasis.signalDelta !== 0) {
    signalStrength += costBasis.signalDelta;
    reasons.push(costBasis.reason);
  }

  // Factor 3: Position P&L (weight ~20%)
  if (costPrice && costPrice > 0) {
    if (pnlPct > 30) signalStrength -= 15;
    else if (pnlPct > 10) signalStrength += 5;
    else if (pnlPct < -20) signalStrength += 10;
    else if (pnlPct < -10) signalStrength += 5;
  }

  // Factor 4: Valuation fundamentals (weight ~15%)
  if (quote) {
    if (quote.pe && quote.pe < 25 && sentimentScore > 0) {
      signalStrength += 8;
      reasons.push(`估值吸引力 (PE: ${quote.pe.toFixed(1)})`);
    }
    if (quote.dividendYield && quote.dividendYield > 1.5) {
      signalStrength += 4;
      reasons.push(`股息支撑 (${quote.dividendYield.toFixed(2)}%)`);
    }
    if (quote.fiftyTwoWeekLow && currentPrice < quote.fiftyTwoWeekLow * 1.15 && sentimentScore > 0) {
      signalStrength += 12;
      reasons.push("接近52周低位，超跌反弹空间");
    }
    if (quote.changePercent && Math.abs(quote.changePercent) > 3) {
      signalStrength += quote.changePercent > 0 ? 5 : -5;
    }
  }

  // Symbol-specific adjustments
  if (isXiaomi) {
    reasons.unshift("Xiaomi 连续监控模式");
    signalStrength += sentimentScore * 10;
    if (shares <= 0 && sentimentScore >= 0) signalStrength += 6;
  }

  const newsVolume = positiveHits.length + negativeHits.length;
  if (newsVolume >= 5) signalStrength += sentimentScore > 0 ? 8 : -8;

  // ─── Max position override ───
  if (riskCheck?.maxPositionReached && signalStrength > 0) {
    reasons.unshift("⚠️ 仓位已达上限，暂停加仓");
    signalStrength = Math.min(signalStrength, 0);
  }

  // ─── Final Action Logic ───
  if (isMSFT) {
    if (isQuarterEnd && signalStrength > 0) {
      action = "BUY";
      confidence = 80;
      reasons.unshift("季度末自动定投触发");
    } else {
      action = signalStrength < -25 ? "SELL" : "HOLD";
      confidence = 60;
      if (action === "SELL") reasons.unshift("MSFT 卖出信号：多因子恶化");
      else if (signalStrength > 15) reasons.unshift("MSFT 建议增持");
      else reasons.unshift("MSFT 中性观察");
    }
  } else {
    const buyThreshold = isXiaomi ? 8 : 15;
    const sellThreshold = isXiaomi ? -8 : -15;
    if (signalStrength > buyThreshold) {
      action = "BUY";
      confidence = Math.min(95, 55 + Math.floor(signalStrength));
      reasons.unshift(`${symbol} 买入：技术面+情绪面共振看多`);
    } else if (signalStrength < sellThreshold) {
      action = "SELL";
      confidence = Math.min(95, 55 + Math.floor(Math.abs(signalStrength)));
      reasons.unshift(`${symbol} 卖出：多因子共振看空`);
    } else {
      action = "HOLD";
      confidence = 50 + Math.floor(Math.abs(signalStrength));
      reasons.unshift(`${symbol} 中性持仓`);
    }
  }

  const marketData = {
    currentPrice,
    costPrice,
    pnlPct: pnlPct.toFixed(2),
    sentimentScore: sentimentScore.toFixed(2),
    signalStrength: signalStrength.toFixed(1),
    technicalScore: technicalIndicators?.technicalScore ?? "N/A",
    technicalSignal: technicalIndicators?.technicalSignal ?? "N/A",
    rsi14: technicalIndicators?.rsi14?.toFixed(1) ?? "N/A",
    macdBullish: technicalIndicators?.macdBullish ?? "N/A",
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
  currentShares: number,
  currentCostPrice: number | null,
): Promise<Trade | null> {
  if (decision.action === "HOLD") return null;

  let tradeShares = 0;
  if (decision.action === "BUY") {
    if (decision.symbol === "MSFT") {
      const targetUsd = 2900;
      tradeShares = Math.floor(targetUsd / currentPrice);
    } else {
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

  // Update holdings
  if (decision.action === "BUY") {
    // Ensure holding row exists
    const upsertSql = `INSERT INTO "st-holdings" (symbol, name, shares, cost_price, cost_currency, current_price, price_currency, exchange)
      VALUES (${toSqlVal(decision.symbol)}, ${toSqlVal(SYMBOL_NAMES[decision.symbol] || decision.symbol)}, 0, ${toSqlVal(currentPrice)}, ${toSqlVal(currency)}, ${toSqlVal(currentPrice)}, ${toSqlVal(currency)}, ${toSqlVal(decision.symbol.endsWith(".HK") ? "HKEX" : "AUTO")})
      ON CONFLICT (symbol) DO NOTHING`;
    await pool.query(upsertSql);

    // Compute new weighted average cost price
    // newCost = (oldShares * oldCost + newShares * newPrice) / (oldShares + newShares)
    const oldCost = currentCostPrice && currentCostPrice > 0 ? currentCostPrice : currentPrice;
    const newTotalShares = currentShares + tradeShares;
    const newAvgCost = newTotalShares > 0
      ? (currentShares * oldCost + tradeShares * currentPrice) / newTotalShares
      : currentPrice;

    const buySql = `UPDATE "st-holdings"
      SET shares = shares + ${toSqlVal(tradeShares)},
          cost_price = ${toSqlVal(Math.round(newAvgCost * 100) / 100)},
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

    // Extract risk and technical data from context for reuse
    const riskCheck = context.riskConstraints ? {
      stopLossTriggered: context.riskConstraints.stopLossTriggered,
      maxPositionReached: context.riskConstraints.maxPositionReached,
      cooldownActive: context.riskConstraints.cooldownActive,
      dailyTradeCount: context.riskConstraints.dailyTradeCount,
      lastDecisionAction: null,
      lastDecisionTime: null,
    } as RiskCheckResult : null;
    const dailyLimitReached = riskCheck ? riskCheck.dailyTradeCount >= DAILY_TRADE_LIMIT : false;
    const techIndicators = context.technicalIndicators
      ? context.technicalIndicators as unknown as import("./technical-indicators").TechnicalIndicators
      : null;

    // Risk gate: skip decision entirely if cooldown is active
    if (riskCheck?.cooldownActive) {
      await logAction("risk", `Cooldown active for ${setting.symbol}, skipping decision`, {
        action: "COOLDOWN_SKIP",
        symbol: setting.symbol,
      });
      continue;
    }

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
        quote,
        techIndicators,
        riskCheck,
        context.recentPriceHistory
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
          riskCheck,
          technicalScore: techIndicators?.technicalScore ?? null,
        }))}
      )`;
    await pool.query(decisionSql);
    
    // Log decision
    await logAction("decision", `Generated ${decision.action} signal for ${setting.symbol}`, {
      confidence: decision.confidence,
      source: decisionSource,
      technicalScore: techIndicators?.technicalScore ?? null,
    });

    decisions.push(decision);

    // 4. Execute trade with risk enforcement
    if (tradingDay && globalAutoTrade && setting.autoTrade && currentPrice > 0) {
      // Daily trade limit check
      if (dailyLimitReached) {
        await logAction("risk", `Daily trade limit reached (${riskCheck?.dailyTradeCount ?? 0}/${DAILY_TRADE_LIMIT}), skipping trade for ${setting.symbol}`, {
          action: "DAILY_LIMIT_SKIP",
          symbol: setting.symbol,
        });
      } else {
        const trade = await executeSimulatedTrade(
          decision,
          currentPrice,
          currency,
          shares,
          costPrice
        );
        if (trade) trades.push(trade);
      }
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
