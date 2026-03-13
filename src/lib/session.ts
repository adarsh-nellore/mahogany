import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const COOKIE_NAME = "mahogany_profile";
const MAX_AGE = 60 * 60 * 24 * 365; // 1 year

/**
 * @deprecated Use `getAuthUser(req)` from `@/lib/auth-guards` instead.
 * This legacy helper reads the old email-only session cookie and is kept
 * only as a transitional shim during migration to Supabase Auth.
 */
export async function getSessionProfileId(): Promise<string | null> {
  const store = await cookies();
  return store.get(COOKIE_NAME)?.value ?? null;
}

export function setSessionCookie(res: NextResponse, profileId: string): void {
  res.cookies.set(COOKIE_NAME, profileId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
    secure: process.env.NODE_ENV === "production",
  });
}

export function clearSessionCookie(res: NextResponse): void {
  res.cookies.delete(COOKIE_NAME);
}

export { COOKIE_NAME };
