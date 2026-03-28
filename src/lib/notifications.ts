import { logAction } from "./db";

/**
 * Notification system for stock-tracker.
 * Sends alerts via configurable webhook (Telegram Bot, Slack, Discord, or custom).
 * 
 * Supported webhook types:
 * - Telegram: set NOTIFY_TELEGRAM_BOT_TOKEN and NOTIFY_TELEGRAM_CHAT_ID
 * - Generic webhook: set NOTIFY_WEBHOOK_URL (POST JSON body)
 * 
 * All notifications are also logged to st-logs for auditability.
 */

export type NotifyLevel = "info" | "warning" | "critical";

export interface NotifyEvent {
  level: NotifyLevel;
  category: string;
  title: string;
  message: string;
  data?: Record<string, unknown>;
}

// --- Telegram ---

async function sendTelegram(event: NotifyEvent): Promise<boolean> {
  const token = process.env.NOTIFY_TELEGRAM_BOT_TOKEN;
  const chatId = process.env.NOTIFY_TELEGRAM_CHAT_ID;
  if (!token || !chatId) return false;

  const levelEmoji = event.level === "critical" ? "🔴" : event.level === "warning" ? "🟡" : "🔵";
  const text = `${levelEmoji} *${escapeMarkdownV2(event.title)}*\n\n${escapeMarkdownV2(event.message)}`;

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "MarkdownV2",
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      console.warn(`Telegram notification failed: ${res.status}`);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("Telegram notification error:", err);
    return false;
  }
}

function escapeMarkdownV2(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, "\\$&");
}

// --- Generic Webhook ---

async function sendWebhook(event: NotifyEvent): Promise<boolean> {
  const url = process.env.NOTIFY_WEBHOOK_URL;
  if (!url) return false;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        level: event.level,
        category: event.category,
        title: event.title,
        message: event.message,
        data: event.data,
        timestamp: new Date().toISOString(),
        source: "stock-tracker",
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      console.warn(`Webhook notification failed: ${res.status}`);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("Webhook notification error:", err);
    return false;
  }
}

// --- Main Notify Function ---

/**
 * Send a notification through all configured channels.
 * Always logs to st-logs regardless of channel success.
 * Never throws -- notification failures should not break trading flow.
 */
export async function notify(event: NotifyEvent): Promise<void> {
  // Always log
  await logAction(`notify:${event.category}`, event.title, {
    level: event.level,
    message: event.message,
    ...event.data,
  });

  // Send through configured channels (in parallel)
  const results = await Promise.allSettled([
    sendTelegram(event),
    sendWebhook(event),
  ]);

  const sent = results.filter(r => r.status === "fulfilled" && r.value === true).length;
  if (sent === 0 && (process.env.NOTIFY_TELEGRAM_BOT_TOKEN || process.env.NOTIFY_WEBHOOK_URL)) {
    console.warn(`Notification "${event.title}" was not delivered to any channel`);
  }
}

// --- Convenience Functions ---

/** Alert when a trade is executed */
export async function notifyTrade(symbol: string, action: string, shares: number, price: number, currency: string, reason: string): Promise<void> {
  await notify({
    level: action === "SELL" ? "warning" : "info",
    category: "trade",
    title: `${action} ${shares} ${symbol} @ ${price} ${currency}`,
    message: reason,
    data: { symbol, action, shares, price, currency },
  });
}

/** Alert when stop-loss is triggered */
export async function notifyStopLoss(symbol: string, currentPrice: number, costPrice: number, lossPct: number): Promise<void> {
  await notify({
    level: "critical",
    category: "risk",
    title: `Stop-loss triggered: ${symbol}`,
    message: `Price ${currentPrice} is ${lossPct.toFixed(1)}% below cost ${costPrice}. Position will be closed.`,
    data: { symbol, currentPrice, costPrice, lossPct },
  });
}

/** Alert on significant price movement */
export async function notifyPriceAlert(symbol: string, price: number, changePct: number, direction: "up" | "down"): Promise<void> {
  const threshold = Math.abs(changePct);
  if (threshold < 3) return; // Only alert on 3%+ moves

  await notify({
    level: threshold >= 5 ? "critical" : "warning",
    category: "price",
    title: `${symbol} ${direction === "up" ? "surged" : "dropped"} ${changePct.toFixed(1)}%`,
    message: `Current price: ${price}. Significant ${direction === "up" ? "upward" : "downward"} movement detected.`,
    data: { symbol, price, changePct, direction },
  });
}

/** Alert on system errors */
export async function notifyError(component: string, error: string): Promise<void> {
  await notify({
    level: "critical",
    category: "system",
    title: `System error in ${component}`,
    message: error.substring(0, 500),
  });
}

/** Daily summary notification */
export async function notifyDailySummary(
  totalPnl: number,
  tradesCount: number,
  topMover: { symbol: string; changePct: number } | null
): Promise<void> {
  const pnlStr = totalPnl >= 0 ? `+$${totalPnl.toFixed(2)}` : `-$${Math.abs(totalPnl).toFixed(2)}`;
  const moverStr = topMover ? `Top mover: ${topMover.symbol} (${topMover.changePct > 0 ? "+" : ""}${topMover.changePct.toFixed(1)}%)` : "No significant movers";

  await notify({
    level: "info",
    category: "daily",
    title: `Daily Summary: P&L ${pnlStr}, ${tradesCount} trades`,
    message: moverStr,
    data: { totalPnl, tradesCount, topMover },
  });
}
