import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase-server";
import { query } from "@/lib/db";

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

    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const userId = data.user?.id;
    if (!userId) {
      return NextResponse.json({ error: "Sign-up failed" }, { status: 500 });
    }

    // Create a minimal profile row with id = Supabase auth user id.
    // ON CONFLICT handles re-registration with the same email.
    await query(
      `INSERT INTO profiles (id, email, name, regions, domains, therapeutic_areas,
         product_types, tracked_products, role, organization, active_submissions,
         competitors, regulatory_frameworks, digest_cadence, digest_send_hour, timezone)
       VALUES ($1, $2, $3, '{}', '{}', '{}', '{}', '{}', '', '', '{}', '{}', '{}',
               'daily', 7, 'UTC')
       ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, updated_at = now()`,
      [userId, email.toLowerCase().trim(), name.trim()]
    );

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
