import pool from "./db";

interface Quote {
  symbol: string;
  price: number;
  currency: string;
}

// Fetch price from Yahoo Finance unofficial API
async function fetchYahooQuote(symbol: string): Promise<Quote | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta) return null;
    return {
      symbol,
      price: meta.regularMarketPrice,
      currency: meta.currency || "USD",
    };
  } catch {
    return null;
  }
}

export async function updateAllPrices(): Promise<Quote[]> {
  const { rows } = await pool.query(`SELECT symbol FROM "st-holdings"`);
  const results: Quote[] = [];

  for (const row of rows) {
    const quote = await fetchYahooQuote(row.symbol);
    if (quote) {
      await pool.query(
        `UPDATE "st-holdings" SET current_price = $1, price_currency = $2, updated_at = NOW() WHERE symbol = $3`,
        [quote.price, quote.currency, quote.symbol]
      );
      results.push(quote);
    }
  }

  return results;
}
