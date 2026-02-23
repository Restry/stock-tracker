import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") || "100"), 500);

    // Group price-history records by created_at timestamp to form "task logs"
    // Each batch of updates (same approximate timestamp) represents one task run
    const { rows } = await pool.query(
      `
      SELECT symbol, price, currency, change, change_percent,
             pe_ratio, market_cap, created_at
      FROM "st-price-history"
      ORDER BY created_at DESC
      LIMIT $1
      `,
      [limit]
    );

    // Group records into task runs by rounding created_at to the nearest minute
    const taskMap = new Map<string, any>();
    for (const row of rows) {
      const ts = new Date(row.created_at);
      const key = new Date(
        ts.getFullYear(), ts.getMonth(), ts.getDate(),
        ts.getHours(), ts.getMinutes()
      ).toISOString();

      if (!taskMap.has(key)) {
        taskMap.set(key, {
          timestamp: key,
          symbols: [],
          records: [],
        });
      }
      const task = taskMap.get(key)!;
      task.symbols.push(row.symbol);
      task.records.push(row);
    }

    const logs = Array.from(taskMap.values()).sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    return NextResponse.json({ logs });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
