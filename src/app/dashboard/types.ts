export interface Holding {
  symbol: string;
  name: string;
  shares: string;
  cost_price: string | null;
  cost_currency: string;
  current_price: string | null;
  price_currency: string;
  exchange: string;
  updated_at: string;
  marketValue: number;
  costBasis: number;
  pnl: number | null;
  pnlPct: number | null;
}

export interface Decision {
  id: number;
  symbol: string;
  action: string;
  confidence: number;
  reasoning: string;
  news_summary: string;
  market_data: Record<string, unknown> | null;
  created_at: string;
}

export interface Trade {
  id: number;
  symbol: string;
  action: string;
  shares: string;
  price: string;
  currency: string;
  reason: string;
  source: string;
  created_at: string;
}

export interface HealthStatus {
  alive: boolean;
  trading: boolean;
  marketOpen: boolean;
  pricesFresh: boolean;
  schedulerAlive: boolean;
  latestPriceAt: string | null;
}

export interface TechIndicators {
  rsi14: number | null;
  rsiSignal: string | null;
  sma5: number | null;
  sma20: number | null;
  sma60: number | null;
  maShortAboveLong: boolean | null;
  maGoldenCross: boolean | null;
  priceAboveSma20: boolean | null;
  macdLine: number | null;
  macdSignal: number | null;
  macdHistogram: number | null;
  macdBullish: boolean | null;
  bollingerUpper: number | null;
  bollingerMiddle: number | null;
  bollingerLower: number | null;
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
}

export interface QuoteData {
  price: number;
  currency: string;
  change: number;
  changePercent: number;
  previousClose: number;
  pe: number | null;
  marketCap: number | null;
  dividendYield: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  averageVolume: number | null;
}

export interface PricePoint {
  symbol: string;
  price: string;
  change_percent: string;
  created_at: string;
}

export interface HistoryRecord {
  id: number;
  symbol: string;
  price: string;
  currency: string;
  change: string | null;
  change_percent: string | null;
  previous_close: string | null;
  pe_ratio: string | null;
  market_cap: string | null;
  dividend_yield: string | null;
  fifty_two_week_high: string | null;
  fifty_two_week_low: string | null;
  average_volume: string | null;
  created_at: string;
}

export interface LogRecord {
  symbol: string;
  price: string;
  currency: string;
  change: string | null;
  change_percent: string | null;
  pe_ratio: string | null;
  market_cap: string | null;
  created_at: string;
}

export interface TaskLog {
  timestamp: string;
  symbols: string[];
  records: LogRecord[];
}

export interface SymbolSetting {
  symbol: string;
  name: string;
  enabled: boolean;
  autoTrade: boolean;
  updatedAt: string | null;
}

export interface MonitoringData {
  shares: number;
  costPrice: number;
  currentPrice: number;
  currency: string;
  totalCost: number;
  marketValue: number;
  pnl: number;
  pnlPct: number;
  breakEvenPrice: number;
  priceToBreakEven: number;
  pctToBreakEven: number;
  tBuyActive: boolean;
  averageDownOpportunity: boolean;
  profitTakingOpportunity: boolean;
}

export interface ChartDataPoint {
  date: string;
  time: string;
  value: number;
}

export const PRIMARY_SYMBOL = "01810.HK";
