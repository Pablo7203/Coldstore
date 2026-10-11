import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { browserEnvironment, getServerEnvironment } from "@/lib/env";

export function createAdminClient() {
  const { SUPABASE_SERVICE_ROLE_KEY } = getServerEnvironment();
  if (!browserEnvironment.NEXT_PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase admin environment is not configured.");
  }

  return createSupabaseClient(
    browserEnvironment.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { autoRefreshToken: false, persistSession: false },
    },
  );
}
