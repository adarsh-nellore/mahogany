import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase-server";

/**
 * Sign-up creates the auth user only. Profile is created when user completes onboarding.
 * For the desired flow (sign up → sign in → onboarding), disable email confirmation in
 * Supabase Dashboard: Authentication → Providers → Email → turn off "Confirm email".
 * If confirmation is enabled, the email link redirects to /auth/callback?next=/onboarding.
 */
export async function POST(request: NextRequest) {
  try {
    const { email, password, name } = await request.json();

    if (!email || !password || !name) {
      return NextResponse.json(
        { error: "email, password, and name are required" },
        { status: 400 }
      );
    }

    const supabase = createSupabaseAdminClient();
    const origin = request.nextUrl.origin;
    const emailRedirectTo = `${origin}/auth/callback?next=/onboarding`;

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo,
        data: { name: name.trim() },
      },
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (!data.user?.id) {
      return NextResponse.json({ error: "Sign-up failed" }, { status: 500 });
    }

    // Profile is created when user completes onboarding (POST /api/profiles).
    // No stub profile here — avoids showing an empty "default" profile.
    return NextResponse.json({
      success: true,
      requiresEmailConfirmation: !data.session,
    });
  } catch (err) {
    console.error("[api/auth/sign-up]", err);
    return NextResponse.json(
      { error: "Sign-up failed", details: String(err) },
      { status: 500 }
    );
  }
}
