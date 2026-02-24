import { NextResponse } from 'next/server';
import pool from "@/lib/db";

export async function POST(req: Request) {
  const auth = req.headers.get('authorization');
  if (auth !== 'Bearer stock2026') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Fix table names to match st- prefix instead of st01-
    await pool.query('TRUNCATE TABLE "st-decisions" RESTART IDENTITY CASCADE');
    await pool.query('TRUNCATE TABLE "st-trades" RESTART IDENTITY CASCADE');
    return NextResponse.json({ ok: true, message: "Decisions and trades cleared." });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
