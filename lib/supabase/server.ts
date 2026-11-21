import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { browserEnvironment } from "@/lib/env";
import { phase2Diagnostic } from "@/lib/diagnostics/phase2";
import type { Database } from "@/types/database";

export async function createClient() {
  if (
    !browserEnvironment.NEXT_PUBLIC_SUPABASE_URL ||
    !browserEnvironment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  ) {
    throw new Error("Supabase server environment is not configured.");
  }

  const cookieStore = await cookies();

  return createServerClient<Database>(
    browserEnvironment.NEXT_PUBLIC_SUPABASE_URL,
    browserEnvironment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          const cookiesToRead = cookieStore.getAll();
          phase2Diagnostic(
            "server_client.cookies.get_all",
            undefined,
            "ok",
            cookiesToRead.length,
          );
          return cookiesToRead;
        },
        setAll(cookiesToSet) {
          phase2Diagnostic(
            "server_client.cookies.set_all",
            undefined,
            "ok",
            cookiesToSet.length,
          );
          try {
            for (const { name, value, options } of cookiesToSet)
              cookieStore.set(name, value, options);
          } catch {
            // Server Components cannot write cookies; a future proxy handles refresh writes.
          }
        },
      },
    },
  );
}
