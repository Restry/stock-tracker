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

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// Normalize HKEX symbols: Yahoo uses 1810.HK, not 01810.HK
function yahooSymbol(symbol: string): string {
  const hkMatch = symbol.match(/^0*(\d+)\.HK$/i);
  if (hkMatch) return `${hkMatch[1]}.HK`;
  return symbol;
}

// Infer currency from symbol suffix
function inferCurrency(symbol: string): string {
  if (symbol.endsWith(".HK")) return "HKD";
  if (symbol.endsWith(".SS") || symbol.endsWith(".SZ")) return "CNY";
  if (symbol.endsWith(".L")) return "GBP";
  if (symbol.endsWith(".T")) return "JPY";
  return "USD";
}

/**
 * Parse a price number from free-form text. Handles:
 *  - "27.5", "1,234.56", "1234"
 *  - "$399.8", "HK$27.50", "¥1,234"
 *  - "27.5 HKD", "399.80 USD", "1234.00 CNY"
 *  - "price is 27.5" / "price: 27.5"
 */
function parsePriceFromText(text: string): number | null {
  // Currency-prefixed: HK$27.5, $399.8, ¥1,234.56, €100, £200
  const prefixed = text.match(/(?:HK\$|US\$|CA\$|A\$|[$¥€£])\s?([\d,]+\.?\d*)/i);
  if (prefixed) return parseFormattedNumber(prefixed[1]);

  // Currency-suffixed: 27.5 HKD, 399.80 USD, 1234 CNY
  const suffixed = text.match(/([\d,]+\.?\d*)\s*(?:HKD|USD|CNY|JPY|GBP|EUR|CAD|AUD)\b/i);
  if (suffixed) return parseFormattedNumber(suffixed[1]);

  // "price is 27.5" / "price: 27.5" / "price of 27.5"
  const contextual = text.match(/price[\s:]+(?:is\s+|of\s+)?(?:about\s+)?(?:HK\$|US\$|\$)?\s?([\d,]+\.?\d*)/i);
  if (contextual) return parseFormattedNumber(contextual[1]);

  // Bare number (first reasonable-looking price > 0)
  const bare = text.match(/\b(\d{1,3}(?:,\d{3})*\.?\d*)\b/);
  if (bare) {
    const n = parseFormattedNumber(bare[1]);
    if (n && n > 0) return n;
  }

  return null;
}

function parseFormattedNumber(s: string): number | null {
  const cleaned = s.replace(/,/g, "");
  const n = parseFloat(cleaned);
  return isFinite(n) && n > 0 ? n : null;
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
    if (!res.ok) {
      console.log(`Yahoo Finance v8 fetch failed for ${ySym}: ${res.status}`);
      return null;
    }
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    const meta = result?.meta;
    if (!meta?.regularMarketPrice) {
      console.log(`Yahoo Finance v8 no price data for ${ySym}`);
      return null;
    }
    const price = meta.regularMarketPrice;
    const prevClose = meta.chartPreviousClose || meta.previousClose || price;
    
    return {
      symbol,
      price,
      currency: meta.currency || inferCurrency(symbol),
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
  } catch (err) {
    console.log(`Yahoo Finance v8 error for ${symbol}:`, err);
    return null;
  }
}

// Fallback: Yahoo Finance HTML scraping (v6 API is deprecated)
async function fetchYahooHtmlQuote(symbol: string): Promise<Quote | null> {
  try {
    const ySym = yahooSymbol(symbol);
    const url = `https://finance.yahoo.com/quote/${encodeURIComponent(ySym)}/`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      console.log(`Yahoo HTML scrape failed for ${ySym}: ${res.status}`);
      return null;
    }
    const html = await res.text();

    // Try fin-streamer element: <fin-streamer ... data-field="regularMarketPrice" ... value="27.5">
    const finStreamer = html.match(
      /data-field="regularMarketPrice"[^>]*value="([\d,.]+)"/
    ) || html.match(
      /value="([\d,.]+)"[^>]*data-field="regularMarketPrice"/
    );

    // Try embedded JSON: "regularMarketPrice":{"raw":27.5
    const embeddedJson = html.match(
      /"regularMarketPrice"\s*:\s*\{\s*"raw"\s*:\s*([\d.]+)/
    );

    const priceStr = finStreamer?.[1] || embeddedJson?.[1];
    if (!priceStr) {
      console.log(`Yahoo HTML scrape: no price found for ${ySym}`);
      return null;
    }

    const price = parseFormattedNumber(priceStr);
    if (!price) return null;

    // Try to extract previous close
    const prevCloseMatch = html.match(
      /"regularMarketPreviousClose"\s*:\s*\{\s*"raw"\s*:\s*([\d.]+)/
    ) || html.match(
      /data-field="regularMarketPreviousClose"[^>]*value="([\d,.]+)"/
    );
    const prevClose = prevCloseMatch ? parseFormattedNumber(prevCloseMatch[1]) : undefined;

    const currency = inferCurrency(symbol);
    return {
      symbol,
      price,
      currency,
      previousClose: prevClose ?? undefined,
      change: prevClose ? price - prevClose : undefined,
      changePercent: prevClose && prevClose > 0
        ? ((price - prevClose) / prevClose) * 100
        : undefined,
    };
  } catch (err) {
    console.log(`Yahoo HTML scrape error for ${symbol}:`, err);
    return null;
  }
}

// Fallback: Google Finance scraping (improved multi-pattern)
async function fetchGoogleFinanceQuote(symbol: string): Promise<Quote | null> {
  try {
    // Build Google Finance ticker
    let gfTicker: string;
    const hkMatch = symbol.match(/^0*(\d+)\.HK$/i);
    if (hkMatch) {
      gfTicker = `${hkMatch[1].padStart(5, "0")}:HKG`;
    } else if (symbol.match(/\.(SS|SH)$/i)) {
      gfTicker = `${symbol.replace(/\.\w+$/, "")}:SHA`;
    } else if (symbol.endsWith(".SZ")) {
      gfTicker = `${symbol.replace(/\.SZ$/i, "")}:SHE`;
    } else {
      // US stocks: AAPL → AAPL:NASDAQ (try without exchange, Google redirects)
      gfTicker = symbol.replace(/\.\w+$/, "");
    }

    const url = `https://www.google.com/finance/quote/${encodeURIComponent(gfTicker)}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const html = await res.text();

    // Pattern 1: data-last-price attribute
    const p1 = html.match(/data-last-price="([\d,.]+)"/);
    // Pattern 2: JSON-LD structured data
    const p2 = html.match(/"price"\s*:\s*"?([\d,.]+)"?\s*,\s*"priceCurrency"/);
    // Pattern 3: Inline JSON array ["27.50",...]
    const p3 = html.match(/\["([\d,.]+)"\s*,\s*\d+\s*,\s*"(?:HKD|USD|CNY|JPY|GBP|EUR)"\]/);
    // Pattern 4: data-value attribute on price element
    const p4 = html.match(/data-value="([\d,.]+)"[^>]*class="[^"]*price/i);
    // Pattern 5: aria-label containing price
    const p5 = html.match(/aria-label="[^"]*?([\d,]+\.?\d+)\s*(?:HKD|USD|CNY|JPY|GBP|EUR)/);

    const priceStr = p1?.[1] || p2?.[1] || p3?.[1] || p4?.[1] || p5?.[1];
    if (!priceStr) {
      console.log(`Google Finance: no price found for ${gfTicker}`);
      return null;
    }

    const price = parseFormattedNumber(priceStr);
    if (!price) return null;

    return {
      symbol,
      price,
      currency: inferCurrency(symbol),
    };
  } catch (err) {
    console.log(`Google Finance error for ${symbol}:`, err);
    return null;
  }
}

// Fallback: Tavily AI Search
async function fetchTavilyQuote(symbol: string): Promise<Quote | null> {
  try {
    const { execSync } = require('child_process');
    const pythonPath = "C:\\Users\\micha\\.openclaw\\workspace\\skills\\tavily-search\\scripts\\tavily_search.py";
    const query = `current stock price of ${symbol} in its local currency`;
    const output = execSync(`python "${pythonPath}" --query "${query}"`, {
      timeout: 20000,
    }).toString();
    const data = JSON.parse(output);
    const text = data.answer || data.results?.[0]?.content || "";

    const price = parsePriceFromText(text);
    if (price) {
      return {
        symbol,
        price,
        currency: inferCurrency(symbol),
      };
    }
    console.log(`Tavily: could not parse price from response for ${symbol}`);
  } catch (err) {
    console.log(`Tavily fallback failed for ${symbol}:`, err);
  }
  return null;
}

// Try multiple sources with fallback chain
async function fetchQuote(symbol: string): Promise<Quote | null> {
  console.log(`Fetching quote for ${symbol}...`);

  // 1. Yahoo v8 chart API (primary)
  let quote = await fetchYahooQuote(symbol);
  if (quote) return quote;

  // 2. Yahoo Finance HTML scraping (replaces deprecated v6 API)
  quote = await fetchYahooHtmlQuote(symbol);
  if (quote) return quote;

  // 3. Google Finance (works for HK, US, CN, and other markets)
  quote = await fetchGoogleFinanceQuote(symbol);
  if (quote) return quote;

  // 4. Tavily AI Fallback (The ultimate backup)
  console.log(`Using Tavily AI fallback for ${symbol}`);
  quote = await fetchTavilyQuote(symbol);
  if (quote) return quote;

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

function escapeSqlString(str: string): string {
  return str.replace(/'/g, "''");
}

function toSqlVal(val: any): string {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return isFinite(val) ? val.toString() : 'NULL';
  if (typeof val === 'string') return `'${escapeSqlString(val)}'`;
  return 'NULL';
}

export async function updateAllPrices(): Promise<Quote[]> {
  const { rows } = await pool.query(`SELECT symbol FROM "st-holdings"`);
  const results: Quote[] = [];

  for (const row of rows) {
    const quote = await fetchQuote(row.symbol);
    if (quote) {
      // Direct SQL construction to bypass parameter binding issues in the custom DB gateway
      const updateSql = `UPDATE "st-holdings" SET current_price = ${toSqlVal(quote.price)}, price_currency = ${toSqlVal(quote.currency)}, updated_at = NOW() WHERE symbol = ${toSqlVal(row.symbol)}`;
      await pool.query(updateSql);

      const historySql = `INSERT INTO "st-price-history" (symbol, price, currency, change, change_percent, previous_close, pe_ratio, market_cap, dividend_yield, fifty_two_week_high, fifty_two_week_low, average_volume)
         VALUES (${toSqlVal(quote.symbol)}, ${toSqlVal(quote.price)}, ${toSqlVal(quote.currency)}, ${toSqlVal(quote.change)}, ${toSqlVal(quote.changePercent)}, ${toSqlVal(quote.previousClose)}, ${toSqlVal(quote.pe)}, ${toSqlVal(quote.marketCap)}, ${toSqlVal(quote.dividendYield)}, ${toSqlVal(quote.fiftyTwoWeekHigh)}, ${toSqlVal(quote.fiftyTwoWeekLow)}, ${toSqlVal(quote.averageVolume)})`;
      await pool.query(historySql);
      
      results.push(quote);
    }
  }

  return results;
}
