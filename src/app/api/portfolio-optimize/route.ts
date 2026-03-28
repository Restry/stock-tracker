import { NextResponse } from "next/server";
import { analyzePortfolio } from "@/lib/portfolio-optimizer";

export async function GET() {
  try {
    const analysis = await analyzePortfolio();
    return NextResponse.json(analysis);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
