import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminAuthClient } from "@/lib/supabase-server";

/**
 * Sign-up creates the auth user only. Profile is created when user completes onboarding.
 * We auto-confirm the user so they can sign in immediately — no email confirmation gate.
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

    const supabase = createSupabaseAdminAuthClient();
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

    // Auto-confirm so user can sign in immediately (no email confirmation gate)
    let requiresEmailConfirmation = !data.session;
    if (!data.session) {
      const { error: confirmErr } = await supabase.auth.admin.updateUserById(data.user.id, {
        email_confirm: true,
      });
      if (!confirmErr) {
        requiresEmailConfirmation = false; // User can now sign in
      } else {
        console.warn("[api/auth/sign-up] auto-confirm failed, user must confirm via email:", confirmErr);
      }
    }

    return NextResponse.json({
      success: true,
      requiresEmailConfirmation,
    });
  } catch (err) {
    console.error("[api/auth/sign-up]", err);
    return NextResponse.json(
      { error: "Sign-up failed", details: String(err) },
      { status: 500 }
    );
  }
}
