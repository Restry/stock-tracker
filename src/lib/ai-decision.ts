import pool from "./db";

interface Decision {
  symbol: string;
  action: "BUY" | "SELL" | "HOLD";
  confidence: number;
  reasoning: string;
  newsSummary?: string;
}

// Search market news via Tavily
async function searchMarketNews(symbol: string): Promise<string> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return "No Tavily API key configured.";

  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query: `${symbol} stock market news analysis`,
        search_depth: "basic",
        max_results: 5,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return "Tavily search failed.";
    const data = await res.json();
    const summaries = (data.results || [])
      .map((r: { title: string; content: string }) => `• ${r.title}: ${r.content}`)
      .join("\n");
    return summaries || "No relevant news found.";
  } catch {
    return "Tavily search error.";
  }
}

// Simple momentum-based simulated decision engine
function analyzeSignals(
  symbol: string,
  currentPrice: number,
  costPrice: number | null,
  news: string
): Decision {
  const hasPositiveNews =
    news.toLowerCase().includes("growth") ||
    news.toLowerCase().includes("beat") ||
    news.toLowerCase().includes("upgrade") ||
    news.toLowerCase().includes("surge");
  const hasNegativeNews =
    news.toLowerCase().includes("decline") ||
    news.toLowerCase().includes("miss") ||
    news.toLowerCase().includes("downgrade") ||
    news.toLowerCase().includes("drop");

  let action: Decision["action"] = "HOLD";
  let confidence = 50;
  let reasoning = `Maintaining position in ${symbol}.`;

  if (costPrice && currentPrice > 0) {
    const pnlPct = ((currentPrice - costPrice) / costPrice) * 100;

    if (pnlPct > 20 && hasNegativeNews) {
      action = "SELL";
      confidence = 70;
      reasoning = `${symbol} is up ${pnlPct.toFixed(1)}% with negative sentiment. Consider taking profits.`;
    } else if (pnlPct < -15 && hasPositiveNews) {
      action = "BUY";
      confidence = 65;
      reasoning = `${symbol} is down ${pnlPct.toFixed(1)}% but positive news suggests recovery potential.`;
    } else if (hasPositiveNews) {
      action = "BUY";
      confidence = 55;
      reasoning = `Positive market signals for ${symbol}.`;
    } else if (hasNegativeNews) {
      action = "SELL";
      confidence = 55;
      reasoning = `Negative market signals for ${symbol}.`;
    }
  } else if (hasPositiveNews) {
    action = "BUY";
    confidence = 55;
    reasoning = `Positive sentiment detected for ${symbol}.`;
  }

  return { symbol, action, confidence, reasoning, newsSummary: news };
}

export async function runDecisions(): Promise<Decision[]> {
  const { rows } = await pool.query(
    `SELECT symbol, current_price, cost_price FROM "st-holdings"`
  );

  const decisions: Decision[] = [];

  for (const row of rows) {
    const news = await searchMarketNews(row.symbol);
    const decision = analyzeSignals(
      row.symbol,
      parseFloat(row.current_price) || 0,
      row.cost_price ? parseFloat(row.cost_price) : null,
      news
    );

    await pool.query(
      `INSERT INTO "st-decisions" (symbol, action, confidence, reasoning, news_summary) VALUES ($1, $2, $3, $4, $5)`,
      [decision.symbol, decision.action, decision.confidence, decision.reasoning, decision.newsSummary]
    );

    decisions.push(decision);
  }

  return decisions;
}
