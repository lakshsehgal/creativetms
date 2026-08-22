import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Keeps the auth cookie fresh and bounces signed-out visitors to /login before
 * any page work happens, so protected routes never flash their shell.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  /**
   * getSession() reads (and refreshes) the cookie locally. getUser() would
   * make a network call to the auth server on EVERY request — including each
   * link prefetch, so hovering the sidebar fired six of them and every
   * navigation carried that latency.
   *
   * This is only deciding "bounce to /login or not". It is deliberately NOT
   * the security boundary: the app layout re-checks with getUser(), and
   * row-level security guards the data itself. A forged cookie gets past this
   * redirect and no further.
   */
  let session = null;
  try {
    const { data } = await supabase.auth.getSession();
    session = data.session;
  } catch {
    // An auth blip shouldn't 500 every route — treat it as signed out.
    session = null;
  }
  const user = session?.user ?? null;

  const { pathname } = request.nextUrl;
  const isPublic = pathname.startsWith("/login") || pathname.startsWith("/auth");

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/board";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/cron|.*\\.(?:svg|png|jpg|webp)$).*)"],
};
