import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { browserEnvironment } from "@/lib/env";
import type { Database } from "@/types/database";

export async function createClient() {
  if (
    !browserEnvironment.NEXT_PUBLIC_SUPABASE_URL ||
    !browserEnvironment.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    throw new Error("Supabase server environment is not configured.");
  }

  const cookieStore = await cookies();

  return createServerClient<Database>(
    browserEnvironment.NEXT_PUBLIC_SUPABASE_URL,
    browserEnvironment.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
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
