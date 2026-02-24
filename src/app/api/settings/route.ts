import { NextRequest, NextResponse } from "next/server";
import { logAction } from "@/lib/db";
import {
  ensureTraderSettingsTables,
  getGlobalAutoTrade,
  getSymbolSettings,
  normalizeSymbol,
  setGlobalAutoTrade,
  upsertSymbolSetting,
  updateSymbolSetting,
} from "@/lib/trader-settings";

interface SettingsPostBody {
  symbol?: string;
  name?: string;
  enabled?: boolean;
  autoTrade?: boolean;
}

interface SettingsPatchBody {
  symbol?: string;
  name?: string;
  enabled?: boolean;
  autoTrade?: boolean;
  globalAutoTrade?: boolean;
}

export async function GET() {
  try {
    await ensureTraderSettingsTables();
    const [settings, globalAutoTrade] = await Promise.all([
      getSymbolSettings(false),
      getGlobalAutoTrade(),
    ]);
    return NextResponse.json({ settings, globalAutoTrade });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const timestamp = new Date().toISOString();
  try {
    const body = (await req.json()) as SettingsPostBody;
    if (!body.symbol || !body.symbol.trim()) {
      return NextResponse.json({ error: "symbol is required" }, { status: 400 });
    }

    const symbol = normalizeSymbol(body.symbol);
    await upsertSymbolSetting({
      symbol,
      name: body.name,
      enabled: body.enabled,
      autoTrade: body.autoTrade,
    });

    await logAction("settings", "Added or updated symbol setting", {
      timestamp,
      action: "Add Symbol Setting",
      status: "success",
      summary: `${symbol} setting saved`,
    });

    const settings = await getSymbolSettings(false);
    return NextResponse.json({ ok: true, settings });
  } catch (error) {
    await logAction("settings", "Failed to add symbol setting", {
      timestamp,
      action: "Add Symbol Setting",
      status: "fail",
      summary: String(error),
    });
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const timestamp = new Date().toISOString();
  try {
    const body = (await req.json()) as SettingsPatchBody;
    if (typeof body.globalAutoTrade === "boolean") {
      await setGlobalAutoTrade(body.globalAutoTrade);
      await logAction("settings", "Updated global auto trade setting", {
        timestamp,
        action: "Update Global Auto Trade",
        status: "success",
        summary: `global_auto_trade=${body.globalAutoTrade}`,
      });
      const [settings, globalAutoTrade] = await Promise.all([
        getSymbolSettings(false),
        getGlobalAutoTrade(),
      ]);
      return NextResponse.json({ ok: true, settings, globalAutoTrade });
    }

    if (!body.symbol || !body.symbol.trim()) {
      return NextResponse.json({ error: "symbol is required for symbol update" }, { status: 400 });
    }

    const symbol = normalizeSymbol(body.symbol);
    await updateSymbolSetting({
      symbol,
      name: body.name,
      enabled: body.enabled,
      autoTrade: body.autoTrade,
    });

    await logAction("settings", "Updated symbol setting", {
      timestamp,
      action: "Update Symbol Setting",
      status: "success",
      summary: `${symbol} setting updated`,
    });

    const settings = await getSymbolSettings(false);
    return NextResponse.json({ ok: true, settings });
  } catch (error) {
    await logAction("settings", "Failed to update setting", {
      timestamp,
      action: "Update Setting",
      status: "fail",
      summary: String(error),
    });
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
