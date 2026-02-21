import { NextRequest, NextResponse } from "next/server";

const AUTH_PASSWORD = "stock2026";
const COOKIE_NAME = "st-auth";

export function isAuthenticated(request: NextRequest): boolean {
  // Check cookie
  const cookie = request.cookies.get(COOKIE_NAME);
  if (cookie?.value === AUTH_PASSWORD) return true;

  // Check Authorization header (for API calls)
  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${AUTH_PASSWORD}`) return true;

  return false;
}

export function loginResponse() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(COOKIE_NAME, AUTH_PASSWORD, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
  return response;
}

export function unauthorizedResponse() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
