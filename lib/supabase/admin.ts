import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { browserEnvironment, getServerEnvironment } from "@/lib/env";
import type { Database } from "@/types/database";

/** Creates the server-only client used by verified payment callbacks and webhooks. */
export function createAdminClient() {
  const { SUPABASE_SECRET_KEY } = getServerEnvironment();
  const supabaseUrl = browserEnvironment.NEXT_PUBLIC_SUPABASE_URL;

  if (!supabaseUrl || !SUPABASE_SECRET_KEY) {
    throw new Error("Supabase admin environment is not configured.");
  }

  return createSupabaseClient<Database>(supabaseUrl, SUPABASE_SECRET_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
