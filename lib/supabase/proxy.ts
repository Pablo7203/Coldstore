import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { browserEnvironment } from "@/lib/env";
import { phase2Diagnostic } from "@/lib/diagnostics/phase2";

export async function updateSession(request: NextRequest) {
  const url = browserEnvironment.NEXT_PUBLIC_SUPABASE_URL;
  const key = browserEnvironment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) return NextResponse.next({ request });

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const claimsStarted = performance.now();
  phase2Diagnostic("proxy.get_claims.started");
  const { error } = await supabase.auth.getClaims();
  phase2Diagnostic("proxy.get_claims.completed", claimsStarted, error ? "error" : "ok");
  return response;
}
