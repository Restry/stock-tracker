function appBaseUrl() {
  if (process.env.TRADER_APP_URL) return process.env.TRADER_APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`.replace(/\/$/, "");
  return "http://localhost:3001";
}

async function fetchJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} from ${url}`);
  }
  return res.json();
}

async function main() {
  const baseUrl = appBaseUrl();
  const [health, report] = await Promise.all([
    fetchJson(`${baseUrl}/api/health`),
    fetchJson(`${baseUrl}/api/report?limit=8`),
  ]);

  const summary = {
    timestamp: new Date().toISOString(),
    observerRole: "OpenClaw Observer",
    target: baseUrl,
    status: health.alive ? (health.trading ? "Alive and Trading" : "Alive but Waiting") : "Offline",
    narrative: report.narrative || "No narrative available.",
    tradesIn24h: health.trades ?? 0,
    decisionsIn24h: health.decisions ?? 0,
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    observerRole: "OpenClaw Observer",
    status: "Health check failed",
    error: String(error),
  }, null, 2));
  process.exit(1);
});
