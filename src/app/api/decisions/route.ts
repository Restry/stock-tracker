import { NextResponse } from "next/server";
import { runDecisions } from "@/lib/ai-decision";
import pool from "@/lib/db";

export async function POST() {
  try {
    const result = await runDecisions();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function GET() {
  try {
    // 42P02 fix: Use raw SQL string instead of relying on parameterized query for this simple fetch
    const { rows } = await pool.query(
      `SELECT * FROM "st-decisions" ORDER BY created_at DESC LIMIT 20`
    );
    return NextResponse.json({ decisions: rows });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
