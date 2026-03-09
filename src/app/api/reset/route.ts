import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated, unauthorizedResponse } from "@/lib/auth";
import { resetTrackerData } from "@/lib/tracker-admin";

interface ResetBody {
  confirmation?: string;
}

export async function POST(req: NextRequest) {
  if (!isAuthenticated(req)) {
    return unauthorizedResponse();
  }

  const body = (await req.json().catch(() => ({}))) as ResetBody;
  if ((body.confirmation || "").trim().toUpperCase() !== "RESET") {
    return NextResponse.json(
      { error: 'Type "RESET" to confirm full reset.' },
      { status: 400 }
    );
  }

  try {
    const seeded = await resetTrackerData();
    return NextResponse.json({
      ok: true,
      message: "All tracker data cleared and default symbols restored.",
      symbols: seeded.symbols,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
