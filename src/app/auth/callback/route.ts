import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Auth callback for Supabase email confirmation and OAuth.
 * Handles both PKCE (code) and OTP (token_hash + type) flows.
 * After successful verification, redirects to /onboarding (new users) or /feed.
 */
export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const token_hash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type");
  const next = requestUrl.searchParams.get("next") ?? "/onboarding";

  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );

  let error: Error | null = null;

  if (code) {
    const { error: exchangeError } =
      await supabase.auth.exchangeCodeForSession(code);
    error = exchangeError;
  } else if (token_hash && type) {
    const { error: verifyError } = await supabase.auth.verifyOtp({
      type: type as "email",
      token_hash,
    });
    error = verifyError;
  } else {
    error = new Error("Missing code or token_hash/type");
  }

  if (error) {
    console.error("[auth/callback]", error);
    return NextResponse.redirect(
      new URL(`/login?error=confirm_failed`, requestUrl.origin)
    );
  }

  return NextResponse.redirect(new URL(next, requestUrl.origin));
}
