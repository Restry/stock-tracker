import { NextRequest, NextResponse } from "next/server";
import { runBacktest, type BacktestConfig } from "@/lib/backtest";

export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams;
    const symbol = params.get("symbol");
    if (!symbol) {
      return NextResponse.json({ error: "symbol parameter is required" }, { status: 400 });
    }

    const config: BacktestConfig = {
      symbol,
      startDate: params.get("startDate") || undefined,
      endDate: params.get("endDate") || undefined,
      initialCash: params.has("initialCash") ? Number(params.get("initialCash")) : undefined,
      tradeSize: params.has("tradeSize") ? Number(params.get("tradeSize")) : undefined,
      stopLossPct: params.has("stopLossPct") ? Number(params.get("stopLossPct")) : undefined,
      takeProfitPct: params.has("takeProfitPct") ? Number(params.get("takeProfitPct")) : undefined,
      commission: params.has("commission") ? Number(params.get("commission")) : undefined,
    };

    const result = await runBacktest(config);

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
