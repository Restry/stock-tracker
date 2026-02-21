import { NextRequest, NextResponse } from "next/server";

const AUTH_PASSWORD = "stock2026";
const COOKIE_NAME = "st-auth";

const PUBLIC_PATHS = ["/api/auth"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Check auth for all other routes
  const cookie = request.cookies.get(COOKIE_NAME);
  const authHeader = request.headers.get("authorization");

  if (
    cookie?.value === AUTH_PASSWORD ||
    authHeader === `Bearer ${AUTH_PASSWORD}`
  ) {
    return NextResponse.next();
  }

  // Redirect pages to login, return 401 for API
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // For page requests, redirect to login
  const loginUrl = new URL("/", request.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/dashboard/:path*", "/api/((?!auth).*)"],
};
