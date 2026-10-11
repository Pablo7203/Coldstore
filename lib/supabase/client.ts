import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { browserEnvironment } from "@/lib/env";

let client: SupabaseClient | undefined;

export function createClient() {
  if (
    !browserEnvironment.NEXT_PUBLIC_SUPABASE_URL ||
    !browserEnvironment.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    throw new Error("Supabase browser environment is not configured.");
  }

  client ??= createBrowserClient(
    browserEnvironment.NEXT_PUBLIC_SUPABASE_URL,
    browserEnvironment.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  return client;
}
