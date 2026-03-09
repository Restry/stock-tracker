import { NextRequest, NextResponse } from "next/server";

export const AUTH_PASSWORD = "stock2026";
export const COOKIE_NAME = "st-auth";
export const PUBLIC_PATHS = ["/api/auth"];

export function isAuthenticated(request: NextRequest): boolean {
  const cookie = request.cookies.get(COOKIE_NAME);
  if (cookie?.value === AUTH_PASSWORD) return true;

  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${AUTH_PASSWORD}`) return true;

  const tokenHeader = request.headers.get("token");
  if (tokenHeader === AUTH_PASSWORD) return true;

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
