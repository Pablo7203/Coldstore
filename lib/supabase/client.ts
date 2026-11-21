import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { browserEnvironment } from "@/lib/env";
import type { Database } from "@/types/database";

let client: SupabaseClient<Database> | undefined;

export function createClient() {
  if (
    !browserEnvironment.NEXT_PUBLIC_SUPABASE_URL ||
    !browserEnvironment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  ) {
    throw new Error("Supabase browser environment is not configured.");
  }

  client ??= createBrowserClient<Database>(
    browserEnvironment.NEXT_PUBLIC_SUPABASE_URL,
    browserEnvironment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );

  return client;
}
