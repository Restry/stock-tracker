import { NextRequest, NextResponse } from "next/server";

const AUTH_PASSWORD = "stock2026";
const COOKIE_NAME = "st-auth";

export async function POST(request: NextRequest) {
  const body = await request.json();

  if (body.password === AUTH_PASSWORD) {
    const response = NextResponse.json({ ok: true });
    response.cookies.set(COOKIE_NAME, AUTH_PASSWORD, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return response;
  }

  return NextResponse.json({ error: "Invalid password" }, { status: 401 });
}
