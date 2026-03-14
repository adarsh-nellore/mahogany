import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { query } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "email and password are required" },
        { status: 400 }
      );
    }

    let response = NextResponse.json({ success: true });
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options)
            );
          },
        },
      }
    );

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    // If profile is missing or incomplete, tell client to redirect to onboarding.
    // Check by both id and email — profile may have been created with different id during onboarding.
    const body: { success: boolean; redirectTo?: string } = { success: true };
    const userId = data.user?.id;
    const userEmail = data.user?.email;
    if (userId || userEmail) {
      let rows: { regions: string[]; domains: string[] }[] = [];
      if (userId) {
        rows = await query<{ regions: string[]; domains: string[] }>(
          `SELECT regions, domains FROM profiles WHERE id = $1 LIMIT 1`,
          [userId]
        );
      }
      if (rows.length === 0 && userEmail) {
        rows = await query<{ regions: string[]; domains: string[] }>(
          `SELECT regions, domains FROM profiles WHERE email = $1 LIMIT 1`,
          [userEmail]
        );
      }
      const needsOnboarding =
        rows.length === 0 ||
        (Array.isArray(rows[0]?.regions) && rows[0].regions.length === 0 &&
         Array.isArray(rows[0]?.domains) && rows[0].domains.length === 0);
      if (needsOnboarding) {
        body.redirectTo = "/onboarding";
      }
    }

    response = NextResponse.json(body, {
      status: 200,
      headers: response.headers,
    });
    return response;
  } catch (err) {
    console.error("[api/auth/sign-in]", err);
    return NextResponse.json(
      { error: "Sign-in failed", details: String(err) },
      { status: 500 }
    );
  }
}
