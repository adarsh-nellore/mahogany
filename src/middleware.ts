import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

const PROTECTED = ["/feed", "/digest", "/profile", "/settings", "/signals", "/onboarding"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  let response = NextResponse.next({
    request: { headers: req.headers },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            req.cookies.set(name, value)
          );
          response = NextResponse.next({ request: req });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Legacy redirects
  if (pathname === "/dashboard") {
    return NextResponse.redirect(new URL(user ? "/feed" : "/", req.url));
  }
  if (pathname.startsWith("/digests")) {
    return NextResponse.redirect(new URL(user ? "/digest" : "/", req.url));
  }

  const isProtected = PROTECTED.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );

  if (isProtected && !user) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: [
    "/",
    "/onboarding",
    "/login",
    "/signup",
    "/feed/:path*",
    "/digest/:path*",
    "/profile/:path*",
    "/signals/:path*",
    "/dashboard/:path*",
    "/settings/:path*",
    "/digests/:path*",
  ],
};
