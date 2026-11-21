import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

test("Phase 1C hosted identity, staff, customer, and secret-boundary workflow", async ({
  browser,
  page,
}) => {
  test.skip(process.env.PHASE1C_LIVE !== "1", "Opt in to hosted identity provisioning.");
  test.setTimeout(300_000);

  loadLocalEnvironment();
  const url = requiredEnvironment("NEXT_PUBLIC_SUPABASE_URL");
  const publicKey = requiredEnvironment("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  const secretKey = requiredEnvironment("SUPABASE_SECRET_KEY");
  const marker = randomUUID().replaceAll("-", "").slice(0, 16);
  const admin = createClient<Database>(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const identities: Array<{ id: string; email: string }> = [];
  const customerIds: string[] = [];
  const passwordFor = () => randomBytes(32).toString("base64url");
  const names = {
    admin: `Phase1C Admin ${marker}`,
    manager: `Phase1C Manager ${marker}`,
    cashier: `Phase1C Cashier ${marker}`,
    stock: `Phase1C Stock ${marker}`,
    customerA: `Phase1C Customer A ${marker}`,
    customerB: `Phase1C Customer B ${marker}`,
  };
  const credentials = {
    admin: { email: `phase1c-admin-${marker}@example.test`, password: passwordFor() },
    pending: {
      email: `phase1c-unconfirmed-${marker}@example.test`,
      password: passwordFor(),
    },
    manager: { email: `phase1c-manager-${marker}@example.test`, password: passwordFor() },
    cashier: { email: `phase1c-cashier-${marker}@example.test`, password: passwordFor() },
    stock: { email: `phase1c-stock-${marker}@example.test`, password: passwordFor() },
    customerA: {
      email: `phase1c-customer-a-${marker}@example.test`,
      password: passwordFor(),
    },
    customerB: {
      email: `phase1c-customer-b-${marker}@example.test`,
      password: passwordFor(),
    },
  };

  try {
    // Bootstrap requires a pre-existing confirmed Auth identity; credentials stay in memory.
    const { data: adminCreated, error: adminCreateError } =
      await admin.auth.admin.createUser({
        email: credentials.admin.email,
        password: credentials.admin.password,
        email_confirm: true,
        user_metadata: { full_name: names.admin },
      });
    expect(adminCreateError).toBeNull();
    expect(adminCreated.user).not.toBeNull();
    const adminId = adminCreated.user!.id;
    identities.push({ id: adminId, email: credentials.admin.email });

    const { data: pendingCreated, error: pendingCreateError } =
      await admin.auth.admin.createUser({
        email: credentials.pending.email,
        password: credentials.pending.password,
        email_confirm: false,
        user_metadata: { full_name: `Unconfirmed ${marker}` },
      });
    expect(pendingCreateError).toBeNull();
    expect(pendingCreated.user).not.toBeNull();
    identities.push({ id: pendingCreated.user!.id, email: credentials.pending.email });

    const missingBootstrap = runBootstrap(
      `missing-${marker}@example.test`,
      "Missing Test Identity",
    );
    expect(missingBootstrap.status).not.toBe(0);
    const unconfirmedBootstrap = runBootstrap(
      credentials.pending.email,
      `Unconfirmed ${marker}`,
    );
    expect(unconfirmedBootstrap.status).not.toBe(0);
    const { data: beforeBootstrap } = await admin
      .from("staff_profiles")
      .select("user_id")
      .eq("user_id", adminId)
      .maybeSingle();
    expect(beforeBootstrap).toBeNull();
    const { data: unconfirmedProfile } = await admin
      .from("staff_profiles")
      .select("user_id")
      .eq("user_id", pendingCreated.user!.id)
      .maybeSingle();
    expect(unconfirmedProfile).toBeNull();

    const bootstrap = runBootstrap(credentials.admin.email, names.admin);
    const bootstrapOutput = [bootstrap.stdout, bootstrap.stderr]
      .filter(Boolean)
      .join("\n")
      .replaceAll(secretKey, "[redacted]")
      .replaceAll(publicKey, "[redacted]");
    expect(bootstrap.status, bootstrapOutput.slice(-1200)).toBe(0);
    const { data: bootstrapped, error: bootstrapError } = await admin
      .from("staff_profiles")
      .select("user_id, full_name, role, is_active")
      .eq("user_id", adminId)
      .single();
    expect(bootstrapError).toBeNull();
    expect(bootstrapped).toMatchObject({
      full_name: names.admin,
      role: "admin",
      is_active: true,
    });
    const { data: bootstrapEvents } = await admin
      .from("staff_profile_audit")
      .select("event_type, new_role, new_is_active, actor_user_id")
      .eq("staff_user_id", adminId);
    expect(bootstrapEvents).toContainEqual(
      expect.objectContaining({
        event_type: "profile_created",
        new_role: "admin",
        new_is_active: true,
        actor_user_id: null,
      }),
    );
    const { data: confirmedAuthIdentity } = await admin.auth.admin.getUserById(adminId);
    expect(confirmedAuthIdentity.user?.email_confirmed_at).toBeTruthy();

    const duplicateBootstrap = runBootstrap(credentials.admin.email, names.admin);
    expect(duplicateBootstrap.status).not.toBe(0);
    const publicBootstrapRoute = await page.request.get("/api/bootstrap-admin");
    expect(publicBootstrapRoute.status()).toBe(404);

    await signInInUi(page, credentials.admin.email, credentials.admin.password);
    await expect(page).toHaveURL(/\/staff$/u);
    await expect(
      page.getByRole("heading", { name: `Welcome, ${names.admin}` }),
    ).toBeVisible();
    await expect(page.getByText("Administrator", { exact: true }).first()).toBeVisible();
    await assertClientSecretBoundary(page, secretKey);
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/u);
    await page.goto("/staff");
    await expect(page).toHaveURL(/\/login(?:\?|$)/u);

    await signInInUi(page, credentials.admin.email, credentials.admin.password);
    await expect(page.getByRole("heading", { name: "Staff accounts" })).toBeVisible();
    await createStaffThroughUi(page, {
      email: credentials.manager.email,
      fullName: names.manager,
      phone: "024 555 0101",
      role: "manager",
    });
    const managerProfile = await readStaffProfile(
      admin,
      identities,
      credentials.manager.email,
    );
    expect(managerProfile).toMatchObject({
      full_name: names.manager,
      phone: "+233245550101",
      role: "manager",
      is_active: true,
    });
    await expectStaffAudit(admin, managerProfile.user_id, adminId);
    await admin.auth.admin.updateUserById(managerProfile.user_id, {
      password: credentials.manager.password,
    });

    await createStaffThroughUi(page, {
      email: credentials.cashier.email,
      fullName: names.cashier,
      phone: "+233205550102",
      role: "cashier",
    });
    const cashierProfile = await readStaffProfile(
      admin,
      identities,
      credentials.cashier.email,
    );
    expect(cashierProfile).toMatchObject({
      full_name: names.cashier,
      phone: "+233205550102",
      role: "cashier",
      is_active: true,
    });
    await expectStaffAudit(admin, cashierProfile.user_id, adminId);
    await admin.auth.admin.updateUserById(cashierProfile.user_id, {
      password: credentials.cashier.password,
    });

    await createStaffThroughUi(page, {
      email: credentials.stock.email,
      fullName: names.stock,
      phone: "020-555-0103",
      role: "stock_assistant",
    });
    const stockProfile = await readStaffProfile(
      admin,
      identities,
      credentials.stock.email,
    );
    expect(stockProfile).toMatchObject({
      full_name: names.stock,
      phone: "+233205550103",
      role: "stock_assistant",
      is_active: true,
    });
    await expectStaffAudit(admin, stockProfile.user_id, adminId);
    await admin.auth.admin.updateUserById(stockProfile.user_id, {
      password: credentials.stock.password,
    });
    await expectStaffCreationRejectsInvalidPhone(page, marker);

    const managerApi = await signInApi(url, publicKey, credentials.manager);
    const cashierApi = await signInApi(url, publicKey, credentials.cashier);
    const stockApi = await signInApi(url, publicKey, credentials.stock);
    await verifyPermissionsAndDenial(managerApi, managerProfile.user_id, {
      allow: ["manage_credit", "view_customers"],
      deny: ["manage_staff", "view_audit", "manage_settings"],
    });
    await verifyPermissionsAndDenial(cashierApi, cashierProfile.user_id, {
      allow: ["complete_sale"],
      deny: ["manage_staff", "manage_credit", "view_audit"],
    });
    await verifyPermissionsAndDenial(stockApi, stockProfile.user_id, {
      allow: ["receive_stock", "view_inventory"],
      deny: ["manage_staff", "complete_sale", "view_audit"],
    });

    for (const [displayName, identity] of [
      [names.manager, credentials.manager],
      [names.cashier, credentials.cashier],
      [names.stock, credentials.stock],
    ] as const) {
      const staffPage = await page.context().newPage();
      await signInInUi(staffPage, identity.email, identity.password);
      await expect(
        staffPage.getByRole("heading", { name: `Welcome, ${displayName}` }),
      ).toBeVisible();
      await expect(
        staffPage.getByRole("heading", { name: "Create a staff account" }),
      ).toHaveCount(0);
      await expect(
        staffPage.getByRole("heading", { name: "Staff accounts" }),
      ).toHaveCount(0);
      await staffPage.getByRole("button", { name: "Sign out" }).click();
      await expect(staffPage).toHaveURL(/\/login$/u);
      await staffPage.close();
    }

    const managerSessionPage = await browser.newPage();
    await signInInUi(
      managerSessionPage,
      credentials.manager.email,
      credentials.manager.password,
    );
    await expect(
      managerSessionPage.getByRole("heading", { name: `Welcome, ${names.manager}` }),
    ).toBeVisible();
    await signInInUi(page, credentials.admin.email, credentials.admin.password);
    const managerRow = page.getByRole("listitem").filter({ hasText: names.manager });
    await managerRow.getByRole("button", { name: "Deactivate" }).click();
    await expect(managerRow).toContainText("Inactive");
    await expect(managerRow.getByRole("button", { name: "Deactivate" })).toHaveCount(0);
    const { data: deactivatedManager } = await admin
      .from("staff_profiles")
      .select("is_active")
      .eq("user_id", managerProfile.user_id)
      .single();
    expect(deactivatedManager?.is_active).toBe(false);
    const { data: deactivationEvents } = await admin
      .from("staff_profile_audit")
      .select("event_type, old_is_active, new_is_active, actor_user_id")
      .eq("staff_user_id", managerProfile.user_id)
      .order("id", { ascending: false })
      .limit(1);
    expect(deactivationEvents?.[0]).toMatchObject({
      event_type: "activation_changed",
      old_is_active: true,
      new_is_active: false,
      actor_user_id: adminId,
    });
    const { data: existingManagerAuth } = await admin.auth.admin.getUserById(
      managerProfile.user_id,
    );
    expect(existingManagerAuth.user?.id).toBe(managerProfile.user_id);
    const { data: inactivePermission } = await managerApi.rpc("has_permission", {
      requested_permission: "view_customers",
    });
    expect(inactivePermission).toBe(false);
    await managerSessionPage.goto("/staff");
    await expect(managerSessionPage).toHaveURL(/\/login\?notice=inactive$/u);
    await managerSessionPage.close();
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/u);

    await registerCustomerThroughUi(page, {
      email: credentials.customerA.email,
      password: credentials.customerA.password,
      fullName: names.customerA,
      validPhone: "0245550201",
      admin,
      identities,
      customerIds,
    });
    await expect(page).toHaveURL(/\/account$/u);
    await expect(
      page.getByRole("heading", {
        name: `Good to see you, ${names.customerA.split(" ")[0]}.`,
      }),
    ).toBeVisible();
    const customerA = await findAuthUser(admin, credentials.customerA.email);
    const customerBootstrap = runBootstrap(credentials.customerA.email, names.customerA);
    expect(customerBootstrap.status).not.toBe(0);
    const { data: customerStaffProfile } = await admin
      .from("staff_profiles")
      .select("user_id")
      .eq("user_id", customerA.id)
      .maybeSingle();
    expect(customerStaffProfile).toBeNull();
    const customerAApi = await signInApi(url, publicKey, credentials.customerA);
    const { data: customerARows, error: customerAReadError } = await customerAApi
      .from("customers")
      .select("id, auth_user_id, full_name, phone, email");
    expect(customerAReadError).toBeNull();
    expect(customerARows).toHaveLength(1);
    expect(customerARows?.[0]).toMatchObject({
      auth_user_id: customerA.id,
      full_name: names.customerA,
      phone: "+233245550201",
      email: credentials.customerA.email,
    });
    const customerPromotion = await customerAApi.rpc("assign_staff_profile", {
      target_user_id: customerA.id,
      profile_name: names.customerA,
      profile_phone: "+233245550201",
      assigned_role: "cashier",
      active: true,
    });
    expect(customerPromotion.error?.code).toBe("42501");
    await page.goto("/staff");
    await expect(page).toHaveURL(/\/account$/u);
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/u);

    await registerCustomerThroughUi(page, {
      email: credentials.customerB.email,
      password: credentials.customerB.password,
      fullName: names.customerB,
      validPhone: "0205550202",
      admin,
      identities,
      customerIds,
    });
    await expect(page).toHaveURL(/\/account$/u);
    await expect(
      page.getByRole("heading", {
        name: `Good to see you, ${names.customerB.split(" ")[0]}.`,
      }),
    ).toBeVisible();
    const customerB = await findAuthUser(admin, credentials.customerB.email);
    const customerBApi = await signInApi(url, publicKey, credentials.customerB);
    const { data: customerBRows, error: customerBReadError } = await customerBApi
      .from("customers")
      .select("id, auth_user_id, full_name, phone, email");
    expect(customerBReadError).toBeNull();
    expect(customerBRows).toHaveLength(1);
    expect(customerBRows?.[0]?.auth_user_id).toBe(customerB.id);
    expect(customerBRows?.[0]?.auth_user_id).not.toBe(customerA.id);
    const { data: customerAAfterB } = await customerAApi
      .from("customers")
      .select("id, auth_user_id")
      .order("id");
    expect(customerAAfterB).toHaveLength(1);
    expect(customerAAfterB?.[0]?.auth_user_id).toBe(customerA.id);
    expect(customerAAfterB?.[0]?.auth_user_id).not.toBe(customerB.id);

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/u);
    await signInInUi(page, credentials.customerA.email, credentials.customerA.password);
    await expect(page).toHaveURL(/\/account$/u);
    await page.goto("/staff");
    await expect(page).toHaveURL(/\/account$/u);
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/u);

    expect(customerIds).toHaveLength(2);
    expect(identities).toHaveLength(7);
  } finally {
    const { data: remainingUsers } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    const remainingTestUsers = remainingUsers.users.filter(
      (user) =>
        user.email?.startsWith("phase1c-") && user.email.endsWith("@example.test"),
    );
    const ids = Array.from(
      new Set([
        ...identities.map((identity) => identity.id),
        ...remainingTestUsers.map((user) => user.id),
      ]),
    );
    if (ids.length > 0) {
      await admin.from("staff_profile_audit").delete().in("staff_user_id", ids);
      await admin.from("staff_profile_audit").delete().in("actor_user_id", ids);
      await admin.from("customers").delete().in("auth_user_id", ids);
      for (const identityId of ids) {
        await admin.auth.admin.deleteUser(identityId);
      }
    }
  }
});

function loadLocalEnvironment() {
  const contents = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  for (const line of contents.split(/\r?\n/u)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/u);
    if (!match || match[1] in process.env) continue;
    const rawValue = match[2];
    const quote = rawValue[0];
    process.env[match[1]] =
      (quote === '"' || quote === "'") && rawValue.at(-1) === quote
        ? rawValue.slice(1, -1)
        : rawValue;
  }
}

async function expectStaffAudit(
  admin: SupabaseClient<Database>,
  staffUserId: string,
  actorUserId: string,
) {
  const { data, error } = await admin
    .from("staff_profile_audit")
    .select("event_type, new_role, new_is_active, actor_user_id")
    .eq("staff_user_id", staffUserId)
    .eq("event_type", "profile_created");
  expect(error).toBeNull();
  expect(data).toHaveLength(1);
  expect(data?.[0]).toMatchObject({ new_is_active: true, actor_user_id: actorUserId });
}

function requiredEnvironment(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing local ${name} configuration.`);
  return value;
}

function runBootstrap(email: string, fullName: string) {
  return spawnSync(process.execPath, ["scripts/bootstrap-admin.mjs", email, fullName], {
    cwd: process.cwd(),
    encoding: "utf8",
    windowsHide: true,
  });
}

async function signInInUi(
  page: import("@playwright/test").Page,
  email: string,
  password: string,
) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

async function createStaffThroughUi(
  page: import("@playwright/test").Page,
  account: { email: string; fullName: string; phone: string; role: string },
) {
  await page.getByLabel("Full name", { exact: true }).last().fill(account.fullName);
  await page.getByLabel("Email address", { exact: true }).last().fill(account.email);
  await page.getByLabel("Ghana phone number").fill(account.phone);
  await page.getByLabel("Staff role").selectOption(account.role);
  await page.getByRole("button", { name: "Create staff account" }).click();
  await expect(page.getByRole("status")).toContainText("Staff account created.");
}

async function expectStaffCreationRejectsInvalidPhone(
  page: import("@playwright/test").Page,
  marker: string,
) {
  await page
    .getByLabel("Full name", { exact: true })
    .last()
    .fill(`Invalid Phone ${marker}`);
  await page
    .getByLabel("Email address", { exact: true })
    .last()
    .fill(`phase1c-invalid-${marker}@example.test`);
  await page.getByLabel("Ghana phone number").fill("12345");
  await page.getByRole("button", { name: "Create staff account" }).click();
  await expect(page.locator('p[role="alert"]')).toContainText(
    "valid email, name, Ghana phone number",
  );
}

async function readStaffProfile(
  admin: SupabaseClient<Database>,
  identities: Array<{ id: string; email: string }>,
  email: string,
) {
  const authUser = await findAuthUser(admin, email);
  identities.push({ id: authUser.id, email });
  const { data: exactProfile, error: exactError } = await admin
    .from("staff_profiles")
    .select("user_id, full_name, phone, role, is_active")
    .eq("user_id", authUser.id)
    .single();
  expect(exactError).toBeNull();
  return exactProfile!;
}

async function signInApi(
  url: string,
  publicKey: string,
  credential: { email: string; password: string },
) {
  const client = createClient<Database>(url, publicKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword(credential);
  expect(error).toBeNull();
  return client;
}

async function verifyPermissionsAndDenial(
  client: SupabaseClient<Database>,
  userId: string,
  expected: { allow: string[]; deny: string[] },
) {
  for (const permission of expected.allow) {
    const { data, error } = await client.rpc("has_permission", {
      requested_permission: permission,
    });
    expect(error).toBeNull();
    expect(data).toBe(true);
  }
  for (const permission of expected.deny) {
    const { data, error } = await client.rpc("has_permission", {
      requested_permission: permission,
    });
    expect(error).toBeNull();
    expect(data).toBe(false);
  }
  const { error: unauthorizedError } = await client.rpc("assign_staff_profile", {
    target_user_id: userId,
    profile_name: "Unauthorized role escalation",
    profile_phone: "",
    assigned_role: "admin",
    active: true,
  });
  expect(unauthorizedError?.code).toBe("42501");
}

async function findAuthUser(admin: SupabaseClient<Database>, email: string) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    expect(error).toBeNull();
    const user = data.users.find((candidate) => candidate.email === email);
    if (user) return user;
    await new Promise((resolveWait) => setTimeout(resolveWait, 150));
  }
  throw new Error("Test customer Auth identity was not provisioned.");
}

async function registerCustomerThroughUi(
  page: import("@playwright/test").Page,
  options: {
    email: string;
    password: string;
    fullName: string;
    validPhone: string;
    admin: SupabaseClient<Database>;
    identities: Array<{ id: string; email: string }>;
    customerIds: string[];
  },
) {
  await page.goto("/register");
  await page.getByLabel("Full name").fill(options.fullName);
  await page.getByLabel("Phone number").fill(options.validPhone);
  await page.getByLabel("Email address").fill(options.email);
  await page.getByLabel("Password").fill(options.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect
    .poll(
      async () =>
        page.url().endsWith("/account") ||
        (await page.getByRole("status").count()) > 0 ||
        (await page.locator('p[role="alert"]').count()) > 0,
    )
    .toBe(true);

  if (!page.url().endsWith("/account")) {
    expect(
      await page.locator('p[role="alert"]').allTextContents(),
      `Customer signup did not complete: ${new URL(page.url()).pathname}`,
    ).toHaveLength(0);
    await expect(page.getByRole("status")).toContainText(
      "If registration can be completed, check your email",
    );
  }

  const user = await findAuthUser(options.admin, options.email);
  options.identities.push({ id: user.id, email: options.email });
  const { error: confirmError } = await options.admin.auth.admin.updateUserById(user.id, {
    email_confirm: true,
  });
  expect(confirmError).toBeNull();
  const { data: customer, error: customerError } = await options.admin
    .from("customers")
    .select("id, auth_user_id")
    .eq("auth_user_id", user.id)
    .single();
  expect(customerError).toBeNull();
  expect(customer?.auth_user_id).toBe(user.id);
  options.customerIds.push(customer!.id);

  if (page.url().endsWith("/account")) {
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/u);
  }
  await signInInUi(page, options.email, options.password);
  await expect(page).toHaveURL(/\/account$/u);
}

async function assertClientSecretBoundary(
  page: import("@playwright/test").Page,
  secretKey: string,
) {
  const html = await page.content();
  expect(html).not.toContain(secretKey);
  expect(html).not.toContain("SUPABASE_SECRET_KEY");

  const worker = await page.request.get("/service-worker.js");
  const workerText = await worker.text();
  expect(workerText).not.toContain(secretKey);
  expect(workerText).not.toContain("SUPABASE_SECRET_KEY");

  const browserStorage = await page.evaluate(async () => {
    const values: unknown[] = Object.entries(localStorage).map(([key, value]) => [
      key,
      value,
    ]);
    const databases = await indexedDB.databases();
    for (const database of databases) {
      if (!database.name) continue;
      const connection = await new Promise<IDBDatabase>((resolveDb, rejectDb) => {
        const request = indexedDB.open(database.name!);
        request.onsuccess = () => resolveDb(request.result);
        request.onerror = () => rejectDb(request.error);
      });
      for (const storeName of Array.from(connection.objectStoreNames)) {
        const storeValues = await new Promise<unknown[]>(
          (resolveValues, rejectValues) => {
            const request = connection
              .transaction(storeName)
              .objectStore(storeName)
              .getAll();
            request.onsuccess = () => resolveValues(request.result);
            request.onerror = () => rejectValues(request.error);
          },
        );
        values.push([database.name, storeName, storeValues]);
      }
      connection.close();
    }
    return JSON.stringify(values);
  });
  expect(browserStorage).not.toContain(secretKey);
  expect(browserStorage).not.toContain("SUPABASE_SECRET_KEY");

  const staticDirectory = resolve(process.cwd(), ".next", "static");
  const scanFiles = (directory: string): string[] =>
    readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const path = resolve(directory, entry.name);
      return entry.isDirectory() ? scanFiles(path) : [path];
    });
  for (const path of scanFiles(staticDirectory)) {
    const source = readFileSync(path);
    expect(source.includes(secretKey)).toBe(false);
    expect(source.includes("SUPABASE_SECRET_KEY")).toBe(false);
  }

  const evidenceDirectory = resolve(process.cwd(), "docs", "evidence", "phase-1");
  for (const path of scanFiles(evidenceDirectory)) {
    const source = readFileSync(path);
    expect(source.includes(secretKey)).toBe(false);
    expect(source.includes("SUPABASE_SECRET_KEY")).toBe(false);
  }
  expect(process.env.NEXT_PUBLIC_SUPABASE_SECRET_KEY).toBeUndefined();
  expect(process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY).toBeUndefined();

  const gitPaths = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    {
      encoding: "utf8",
    },
  )
    .split("\0")
    .filter(Boolean);
  for (const relativePath of gitPaths) {
    if (/^\.env(?:\.|$)/u.test(relativePath)) continue;
    const source = readFileSync(resolve(process.cwd(), relativePath));
    expect(source.includes(secretKey)).toBe(false);
  }
}
