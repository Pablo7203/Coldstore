import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Refresh Supabase cookies on public storefront routes as well as protected pages.
  matcher: [
    "/",
    "/shop/:path*",
    "/cart/:path*",
    "/checkout/:path*",
    "/login",
    "/register",
    "/forgot-password",
    "/reset-password",
    "/staff/:path*",
    "/account/:path*",
    "/auth/callback",
  ],
};
