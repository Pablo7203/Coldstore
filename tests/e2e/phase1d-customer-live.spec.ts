import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type CustomerProfile = Pick<
  Database["public"]["Tables"]["customers"]["Row"],
  "id" | "auth_user_id" | "full_name" | "phone" | "email"
>;

test("Phase 1D real customer confirmation, sessions, and isolation", async ({ page }) => {
  test.skip(
    process.env.PHASE1D_LIVE !== "1",
    "Opt in to hosted customer Auth verification.",
  );
  test.setTimeout(1_200_000);
  loadLocalEnvironment();

  const url = requiredEnvironment("NEXT_PUBLIC_SUPABASE_URL");
  const publishableKey = requiredEnvironment("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  const secretKey = requiredEnvironment("SUPABASE_SECRET_KEY");
  const inbox = requiredEnvironment("PHASE1D_INBOX").trim().toLowerCase();
  const marker = randomUUID().replaceAll("-", "").slice(0, 12);
  const [inboxName, inboxDomain, ...extra] = inbox.split("@");
  expect(inboxName).toBeTruthy();
  expect(inboxDomain).toBeTruthy();
  expect(extra).toHaveLength(0);

  const admin = createClient<Database>(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const cleanupIds = new Set<string>();
  const passwordFor = () => randomBytes(32).toString("base64url");
  const customerA = {
    email: `${inboxName}+grandpa-phase1d-a-${marker}@${inboxDomain}`,
    password: passwordFor(),
    name: `Phase 1D Customer A ${marker}`,
    phone: "0245550201",
    normalizedPhone: "+233245550201",
  };
  const customerB = {
    email: `${inboxName}+grandpa-phase1d-b-${marker}@${inboxDomain}`,
    password: passwordFor(),
    name: `Phase 1D Customer B ${marker}`,
    phone: "0205550202",
    normalizedPhone: "+233205550202",
  };

  try {
    const settingsResponse = await fetch(`${url}/auth/v1/settings`, {
      headers: { apikey: publishableKey },
    });
    expect(settingsResponse.ok).toBe(true);
    const authSettings = (await settingsResponse.json()) as {
      disable_signup?: boolean;
      mailer_autoconfirm?: boolean;
    };
    expect(authSettings.disable_signup).toBe(false);
    expect(authSettings.mailer_autoconfirm).toBe(false);

    const a = await registerAndConfirm(page, admin, customerA, cleanupIds);
    const aApi = await signInApi(url, publishableKey, customerA);
    await verifyCustomerSession(page, admin, aApi, a, customerA);

    await registerAndConfirm(page, admin, customerB, cleanupIds);
    const bApi = await signInApi(url, publishableKey, customerB);
    const b = await readCustomerProfile(admin, customerB.email);
    expect(
      b.profile.auth_user_id === b.userId &&
        b.profile.full_name === customerB.name &&
        b.profile.phone === customerB.normalizedPhone &&
        b.profile.email === customerB.email,
      "customer data is normalized and linked to its Auth user",
    ).toBe(true);

    await verifyOwnProfile(bApi, b);
    await verifyNoStaffRoleAndPromotion(bApi, admin, b.userId, customerB);
    await verifyHiddenProfile(bApi, a.profile.id);
    await verifyHiddenProfile(aApi, b.profile.id);
    await verifyNoStaffRole(admin, b.userId);
    await expectStaffRouteDenied(page, customerB);
    await expectLoggedOutAccountDenied(page);
  } finally {
    const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const residualIds = data.users
      .filter(
        (user) =>
          user.email?.startsWith(`${inboxName}+grandpa-phase1d-`) &&
          user.email.endsWith(`@${inboxDomain}`),
      )
      .map((user) => user.id);
    const allIds = Array.from(new Set([...cleanupIds, ...residualIds]));
    if (allIds.length > 0) {
      const cleanupQueries = await Promise.all([
        admin.from("staff_profile_audit").delete().in("staff_user_id", allIds),
        admin.from("staff_profile_audit").delete().in("actor_user_id", allIds),
        admin.from("customers").delete().in("auth_user_id", allIds),
        admin.from("staff_profiles").delete().in("user_id", allIds),
      ]);
      const cleanupResults = await Promise.all(
        allIds.map((id) => admin.auth.admin.deleteUser(id)),
      );
      if (
        cleanupQueries.some(({ error }) => error) ||
        cleanupResults.some(({ error }) => error)
      ) {
        throw new Error(
          "Phase 1D temporary identity cleanup failed; inspect hosted test accounts.",
        );
      }
    }
  }
});

async function registerAndConfirm(
  page: Page,
  admin: SupabaseClient<Database>,
  customer: { email: string; password: string; name: string; phone: string },
  cleanupIds: Set<string>,
) {
  await page.goto("/register");
  await page.getByLabel("Full name").fill(customer.name);
  await page.getByLabel("Phone number").fill(customer.phone);
  await page.getByLabel("Email address").fill(customer.email);
  await page.getByLabel("Password").fill(customer.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("status")).toContainText(
    "If registration can be completed, check your email for a confirmation link.",
    { timeout: 30_000 },
  );

  const user = await findAuthUser(admin, customer.email);
  cleanupIds.add(user.id);
  expect(user.email_confirmed_at).toBeFalsy();
  expect(user.user_metadata).toMatchObject({
    account_type: "customer",
    full_name: customer.name,
  });
  const { data: profile, error } = await admin
    .from("customers")
    .select("id, auth_user_id, full_name, phone, email")
    .eq("auth_user_id", user.id)
    .single();
  expect(error).toBeNull();
  expect(profile?.auth_user_id).toBe(user.id);
  expect(profile?.full_name).toBe(customer.name);
  expect(
    profile?.email === customer.email,
    "registered email is linked to the customer profile",
  ).toBe(true);

  await expect
    .poll(
      async () => {
        const { data: confirmedUser, error: confirmationLookupError } =
          await admin.auth.admin.getUserById(user.id);
        expect(confirmationLookupError).toBeNull();
        return Boolean(confirmedUser.user?.email_confirmed_at);
      },
      {
        timeout: 600_000,
        intervals: [2_000, 3_000, 5_000],
        message: "Open the matching GrandPa development confirmation email to continue.",
      },
    )
    .toBe(true);
  return { userId: user.id, profile: profile! };
}

async function verifyCustomerSession(
  page: Page,
  admin: SupabaseClient<Database>,
  api: SupabaseClient<Database>,
  customer: { userId: string; profile: CustomerProfile },
  credentials: { email: string; password: string; name: string; normalizedPhone: string },
) {
  const { data: ownRows, error: ownError } = await api
    .from("customers")
    .select("id, auth_user_id, full_name, phone, email");
  expect(ownError).toBeNull();
  expect(ownRows).toHaveLength(1);
  expect(
    ownRows?.[0]?.id === customer.profile.id &&
      ownRows[0].auth_user_id === customer.userId &&
      ownRows[0].full_name === credentials.name &&
      ownRows[0].phone === credentials.normalizedPhone &&
      ownRows[0].email === credentials.email,
    "registered customer data is normalized and linked to its Auth user",
  ).toBe(true);
  await verifyNoStaffRoleAndPromotion(api, admin, customer.userId, credentials);

  await page.goto("/login");
  await page.getByLabel("Email address").fill(credentials.email);
  await page.getByLabel("Password").fill(`${credentials.password}wrong`);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.locator('p[role="alert"]')).toContainText(
    "We could not sign you in with those details.",
  );
  await expect(page).toHaveURL(/\/login/u);

  await signInInUi(page, credentials.email, credentials.password);
  await expect(page).toHaveURL(/\/account$/u);
  await expect(
    page.getByRole("heading", { name: `Hello, ${credentials.name}` }),
  ).toBeVisible();
  await page.goto("/staff");
  await expect(page).toHaveURL(/\/account$/u);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/u);
  await page.goto("/account");
  await expect(page).toHaveURL(/\/login(?:\?|$)/u);
}

async function verifyOwnProfile(
  api: SupabaseClient<Database>,
  customer: { userId: string; profile: Pick<CustomerProfile, "id"> },
) {
  const { data, error } = await api
    .from("customers")
    .select("id, auth_user_id")
    .eq("auth_user_id", customer.userId);
  expect(error).toBeNull();
  expect(data).toEqual([{ id: customer.profile.id, auth_user_id: customer.userId }]);
}

async function verifyNoStaffRoleAndPromotion(
  api: SupabaseClient<Database>,
  admin: SupabaseClient<Database>,
  userId: string,
  customer: { name: string; normalizedPhone: string },
) {
  await verifyNoStaffRole(admin, userId);
  const { error } = await api.rpc("assign_staff_profile", {
    target_user_id: userId,
    profile_name: customer.name,
    profile_phone: customer.normalizedPhone,
    assigned_role: "cashier",
    active: true,
  });
  expect(error?.code).toBe("42501");
  await verifyNoStaffRole(admin, userId);
}

async function verifyHiddenProfile(
  api: SupabaseClient<Database>,
  privateProfileId: string,
) {
  const { data, error } = await api
    .from("customers")
    .select("id")
    .eq("id", privateProfileId);
  expect(error).toBeNull();
  expect(data).toEqual([]);
}

async function verifyNoStaffRole(admin: SupabaseClient<Database>, userId: string) {
  const { data, error } = await admin
    .from("staff_profiles")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  expect(error).toBeNull();
  expect(data).toBeNull();
}

async function expectStaffRouteDenied(
  page: Page,
  customer: { email: string; password: string; name: string },
) {
  await signInInUi(page, customer.email, customer.password);
  await expect(page).toHaveURL(/\/account$/u);
  await expect(
    page.getByRole("heading", { name: `Hello, ${customer.name}` }),
  ).toBeVisible();
  await page.goto("/staff");
  await expect(page).toHaveURL(/\/account$/u);
}

async function expectLoggedOutAccountDenied(page: Page) {
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/u);
  await page.goto("/account");
  await expect(page).toHaveURL(/\/login(?:\?|$)/u);
}

async function signInInUi(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

async function signInApi(
  url: string,
  publicKey: string,
  credentials: { email: string; password: string },
) {
  const client = createClient<Database>(url, publicKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword(credentials);
  expect(error).toBeNull();
  return client;
}

async function readCustomerProfile(
  admin: SupabaseClient<Database>,
  email: string,
): Promise<{ userId: string; profile: CustomerProfile }> {
  const user = await findAuthUser(admin, email);
  const { data, error } = await admin
    .from("customers")
    .select("id, auth_user_id, full_name, phone, email")
    .eq("auth_user_id", user.id)
    .single();
  expect(error).toBeNull();
  return { userId: user.id, profile: data! };
}

async function findAuthUser(admin: SupabaseClient<Database>, email: string) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    expect(error).toBeNull();
    const user = data.users.find((candidate) => candidate.email === email);
    if (user) return user;
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  }
  throw new Error("Customer signup did not provision an Auth identity.");
}

function loadLocalEnvironment() {
  const contents = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  for (const line of contents.split(/\r?\n/u)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/u);
    if (!match || match[1] in process.env) continue;
    const raw = match[2];
    const quote = raw[0];
    process.env[match[1]] =
      (quote === '"' || quote === "'") && raw.at(-1) === quote ? raw.slice(1, -1) : raw;
  }
}

function requiredEnvironment(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required Phase 1D environment variable: ${name}`);
  return value;
}
