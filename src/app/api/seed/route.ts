import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated, unauthorizedResponse } from "@/lib/auth";
import { seedTrackerDefaults } from "@/lib/tracker-admin";

export async function POST(req: NextRequest) {
  if (!isAuthenticated(req)) {
    return unauthorizedResponse();
  }

  try {
    const seeded = await seedTrackerDefaults();
    return NextResponse.json({
      ok: true,
      message: "Tracker defaults ensured.",
      symbols: seeded.symbols,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
