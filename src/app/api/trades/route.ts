import { NextResponse } from "next/server";
import pool from "@/lib/db";

export async function GET() {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM "st-trades" ORDER BY created_at DESC LIMIT 50`
    );
    return NextResponse.json({ trades: rows });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
