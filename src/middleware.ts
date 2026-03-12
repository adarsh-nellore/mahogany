import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "mahogany_profile";

const PROTECTED = ["/feed", "/digest", "/profile", "/settings", "/signals"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const profileId = req.cookies.get(COOKIE_NAME)?.value;

  // Landing page (/) is shown to everyone as the hook; logged-in users can use "Go to my briefing" to reach /feed
  // if (pathname === "/" && profileId) { redirect to /feed } — removed so the new landing is always visible

  // Onboarding is always available; no redirect to profile so "Get started" leads to the flow

  // Legacy redirects
  if (pathname === "/dashboard") {
    return NextResponse.redirect(new URL(profileId ? "/feed" : "/", req.url));
  }
  if (pathname.startsWith("/digests")) {
    return NextResponse.redirect(new URL(profileId ? "/digest" : "/", req.url));
  }

  const isProtected = PROTECTED.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );

  if (isProtected && !profileId) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/onboarding",
    "/feed/:path*",
    "/digest/:path*",
    "/profile/:path*",
    "/signals/:path*",
    "/dashboard/:path*",
    "/settings/:path*",
    "/digests/:path*",
  ],
};
