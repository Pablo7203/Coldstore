import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("Supabase client boundaries", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("initializes the browser client with the public URL and key only", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "public-test-key");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const { createClient } = await import("@/lib/supabase/client");

    expect(createClient().from("customers")).toBeDefined();
  });

  it("initializes the server-only admin client when the server key is present", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "public-test-key");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "server-only-test-key");
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const client = createAdminClient();

    expect(client.auth.admin.listUsers).toBeTypeOf("function");
  });

  it("does not initialize an admin client without the server key", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "public-test-key");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const { createAdminClient } = await import("@/lib/supabase/admin");

    expect(() => createAdminClient()).toThrow(
      "Supabase admin environment is not configured.",
    );
  });
});
