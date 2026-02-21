import pool from "./db";

export interface Quote {
  symbol: string;
  price: number;
  currency: string;
  change?: number;
  changePercent?: number;
  previousClose?: number;
  // Enhanced indicators
  pe?: number;
  marketCap?: number;
  dividendYield?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  averageVolume?: number;
}

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// Normalize HKEX symbols: Yahoo uses 1810.HK, not 01810.HK
function yahooSymbol(symbol: string): string {
  const hkMatch = symbol.match(/^0*(\d+)\.HK$/i);
  if (hkMatch) return `${hkMatch[1]}.HK`;
  return symbol;
}

// Primary: Yahoo Finance v8 chart API
async function fetchYahooQuote(symbol: string): Promise<Quote | null> {
  try {
    const ySym = yahooSymbol(symbol);
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ySym)}?range=2d&interval=1d`;
    const res = await fetch(url, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    const meta = result?.meta;
    if (!meta?.regularMarketPrice) return null;
    const price = meta.regularMarketPrice;
    const prevClose = meta.chartPreviousClose || meta.previousClose || price;
    
    return {
      symbol,
      price,
      currency: meta.currency || "USD",
      previousClose: prevClose,
      change: price - prevClose,
      changePercent: prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0,
      // Extracted from v8 chart meta/indicators
      pe: meta.trailingPE || meta.pe,
      marketCap: meta.marketCap,
      dividendYield: meta.dividendYield,
      fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh,
      fiftyTwoWeekLow: meta.fiftyTwoWeekLow,
      averageVolume: meta.averageVolume,
    };
  } catch {
    return null;
  }
}

// Fallback: Yahoo Finance v6 quote API
async function fetchYahooV6Quote(symbol: string): Promise<Quote | null> {
  try {
    const ySym = yahooSymbol(symbol);
    const url = `https://query2.finance.yahoo.com/v6/finance/quote?symbols=${encodeURIComponent(ySym)}`;
    const res = await fetch(url, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const q = data?.quoteResponse?.result?.[0];
    if (!q?.regularMarketPrice) return null;
    return {
      symbol,
      price: q.regularMarketPrice,
      currency: q.currency || "USD",
      previousClose: q.regularMarketPreviousClose,
      change: q.regularMarketChange,
      changePercent: q.regularMarketChangePercent,
      // Enhanced v6 indicators
      pe: q.trailingPE || q.forwardPE,
      marketCap: q.marketCap,
      dividendYield: q.dividendYield,
      fiftyTwoWeekHigh: q.fiftyTwoWeekHigh,
      fiftyTwoWeekLow: q.fiftyTwoWeekLow,
      averageVolume: q.averageVolume,
    };
  } catch {
    return null;
  }
}

// Fallback for HKEX: Google Finance scraping
async function fetchGoogleFinanceHK(symbol: string): Promise<Quote | null> {
  try {
    // Convert 01810.HK to HKG:01810 format for Google Finance
    const hkMatch = symbol.match(/^(\d{4,5})\.HK$/i);
    if (!hkMatch) return null;
    const code = hkMatch[1];
    const url = `https://www.google.com/finance/quote/${code}:HKG`;
    const res = await fetch(url, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    // Extract price from Google Finance page data attribute
    const priceMatch = html.match(/data-last-price="([0-9.]+)"/);
    const prevCloseMatch = html.match(/data-previous-close="([0-9.]+)"/);
    if (!priceMatch) return null;
    const price = parseFloat(priceMatch[1]);
    const prevClose = prevCloseMatch ? parseFloat(prevCloseMatch[1]) : price;
    if (isNaN(price) || price <= 0) return null;
    return {
      symbol,
      price,
      currency: "HKD",
      previousClose: prevClose,
      change: price - prevClose,
      changePercent: prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0,
    };
  } catch {
    return null;
  }
}

// Try multiple sources with fallback chain
async function fetchQuote(symbol: string): Promise<Quote | null> {
  const isHKEX = /\.HK$/i.test(symbol);

  // Try Yahoo v8 first
  let quote = await fetchYahooQuote(symbol);
  if (quote) return quote;

  // Try Yahoo v6
  quote = await fetchYahooV6Quote(symbol);
  if (quote) return quote;

  // For HKEX stocks, try Google Finance
  if (isHKEX) {
    quote = await fetchGoogleFinanceHK(symbol);
    if (quote) return quote;
  }

  return null;
}

// HKD to USD approximate conversion
const HKD_TO_USD = 0.128;

export function convertToUsd(price: number, currency: string): number {
  if (currency === "USD") return price;
  if (currency === "HKD") return price * HKD_TO_USD;
  if (currency === "CNY") return price * 0.138;
  return price;
}

export async function getQuote(symbol: string): Promise<Quote | null> {
  return await fetchQuote(symbol);
}

export async function updateAllPrices(): Promise<Quote[]> {
  const { rows } = await pool.query(`SELECT symbol FROM "st-holdings"`);
  const results: Quote[] = [];

  for (const row of rows) {
    const quote = await fetchQuote(row.symbol);
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
