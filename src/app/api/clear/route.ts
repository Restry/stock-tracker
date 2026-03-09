import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated, unauthorizedResponse } from "@/lib/auth";
import pool from "@/lib/db";

export async function POST(req: NextRequest) {
  if (!isAuthenticated(req)) {
    return unauthorizedResponse();
  }

  try {
    // Fix table names to match st- prefix instead of st01-
    await pool.query('TRUNCATE TABLE "st-decisions" RESTART IDENTITY CASCADE');
    await pool.query('TRUNCATE TABLE "st-trades" RESTART IDENTITY CASCADE');
    return NextResponse.json({ ok: true, message: "Decisions and trades cleared." });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
