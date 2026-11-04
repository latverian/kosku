import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { devPreviewUserId, supabaseEnv } from "./config";

/** Rute yang boleh diakses tanpa login. */
const PUBLIC_PREFIXES = ["/login", "/daftar", "/auth", "/p/", "/api/cron", "/api/webhooks", "/api/files"];

function isPublic(pathname: string) {
  return PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix));
}

/**
 * Memperbarui cookie sesi Supabase di setiap request dan mengarahkan pengguna
 * yang belum login ke /login. Ini pemeriksaan optimistis; otorisasi sebenarnya
 * tetap dilakukan di server (getCurrentUser) dan database (RLS).
 */
export async function updateSession(request: NextRequest) {
  const env = supabaseEnv();
  const { pathname } = request.nextUrl;

  if (!env) {
    if (devPreviewUserId() || isPublic(pathname)) return NextResponse.next();
    return redirectToLogin(request);
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        for (const [key, value] of Object.entries(headers ?? {})) {
          response.headers.set(key, value);
        }
      },
    },
  });

  // Jangan menaruh kode apa pun di antara createServerClient dan getClaims.
  const { data } = await supabase.auth.getClaims();
  const loggedIn = Boolean(data?.claims?.sub);

  if (!loggedIn && !isPublic(pathname)) return redirectToLogin(request);
  if (loggedIn && (pathname === "/login" || pathname === "/daftar")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return response;
}

function redirectToLogin(request: NextRequest) {
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search =
    request.nextUrl.pathname === "/" ? "" : `?next=${encodeURIComponent(request.nextUrl.pathname)}`;
  return NextResponse.redirect(url);
}
