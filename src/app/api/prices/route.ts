import { NextResponse } from "next/server";
import { updateAllPrices } from "@/lib/prices";

export async function POST() {
  try {
    const results = await updateAllPrices();
    return NextResponse.json({ updated: results });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
