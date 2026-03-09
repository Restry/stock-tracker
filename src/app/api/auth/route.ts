import { NextRequest, NextResponse } from "next/server";
import { AUTH_PASSWORD, loginResponse } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const body = await request.json();

  if (body.password === AUTH_PASSWORD) {
    return loginResponse();
  }

  return NextResponse.json({ error: "Invalid password" }, { status: 401 });
}
