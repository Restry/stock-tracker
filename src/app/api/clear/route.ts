import { NextResponse } from 'next/server';
import pool from "../../../lib/db";

export async function POST(req: Request) {
  const auth = req.headers.get('authorization');
  if (auth !== 'Bearer stock2026') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await pool.query('TRUNCATE TABLE "st01-decisions" RESTART IDENTITY CASCADE');
    await pool.query('TRUNCATE TABLE "st01-trades" RESTART IDENTITY CASCADE');
    return NextResponse.json({ ok: true, message: "Decisions and trades cleared." });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
