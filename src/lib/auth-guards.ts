import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

/** Read the Supabase session from request cookies and return the authenticated user, or null. */
export async function getAuthUser(
  req: NextRequest
): Promise<{ id: string; email: string } | null> {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll() {
          // read-only in auth validation
        },
      },
    }
  );

  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) return null;
    return { id: user.id, email: user.email ?? "" };
  } catch {
    return null;
  }
}

/** Return the authenticated user or a 401 NextResponse. */
export async function requireAuthUser(
  req: NextRequest
): Promise<{ id: string; email: string } | NextResponse> {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return user;
}
