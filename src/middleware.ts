import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  // En producción, redirigir las URLs de despliegue (*.vercel.app) a la dirección fija
  const canonical = process.env.NEXT_PUBLIC_APP_URL;
  if (canonical && process.env.VERCEL_ENV === "production") {
    const target = new URL(canonical);
    if (request.nextUrl.host !== target.host && request.nextUrl.host.endsWith(".vercel.app")) {
      const to = new URL(request.nextUrl.pathname + request.nextUrl.search, target);
      return NextResponse.redirect(to, 308);
    }
  }

  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const path = request.nextUrl.pathname;
  if (path.startsWith("/api")) return response;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && path.startsWith("/dashboard")) {
    const to = request.nextUrl.clone();
    to.pathname = "/login";
    to.search = "";
    return NextResponse.redirect(to);
  }
  if (user && path === "/login") {
    const to = request.nextUrl.clone();
    to.pathname = "/dashboard";
    to.search = "";
    return NextResponse.redirect(to);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
