/**
 * Next.js Instrumentation — runs once when the server starts.
 * We use it to kick off the automated trading scheduler.
 */
export async function register() {
  // Only run on the Node.js server runtime, not on Edge or during build
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startScheduler } = await import("@/lib/scheduler");
    startScheduler();
  }
}
