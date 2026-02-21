import { NextResponse } from "next/server";
import { runDecisions } from "@/lib/ai-decision";

export async function POST() {
  try {
    const decisions = await runDecisions();
    return NextResponse.json({ decisions });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function GET() {
  try {
    const { default: pool } = await import("@/lib/db");
    const { rows } = await pool.query(
      `SELECT * FROM "st-decisions" ORDER BY created_at DESC LIMIT 20`
    );
    return NextResponse.json({ decisions: rows });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
