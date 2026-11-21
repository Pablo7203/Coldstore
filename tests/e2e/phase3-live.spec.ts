import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type Identity = { id: string; email: string; password: string };

test("Phase 3 hosted customer, POS, receipts, stock, and concurrency", async ({
  page,
}, testInfo) => {
  test.skip(process.env.PHASE3_LIVE !== "1", "Opt in to hosted Phase 3 verification.");
  test.setTimeout(300_000);
  loadLocalEnvironment();

  const url = requiredEnvironment("NEXT_PUBLIC_SUPABASE_URL");
  if (new URL(url).hostname.split(".")[0] !== "xjzdcpuwrjnpjzntytjs") {
    throw new Error("Refusing hosted Phase 3 verification outside GrandPa development.");
  }
  const publishableKey = requiredEnvironment("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  const secretKey = requiredEnvironment("SUPABASE_SECRET_KEY");
  const marker = `${Date.now().toString(36)}-${randomUUID().replaceAll("-", "").slice(0, 8)}`;
  const runId = `phase3-e2e-${marker}`;
  const evidenceDirectory = resolve(process.cwd(), "docs/evidence/phase-3");
  const admin = createClient<Database>(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const publicClient = () =>
    createClient<Database>(url, publishableKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  const trace: Array<Record<string, string | number>> = [];
  const started = performance.now();
  const mark = (event: string, result = "pass") =>
    trace.push({ at_ms: Math.round(performance.now() - started), event, result });
  const password = () => randomBytes(30).toString("base64url");
  const cleanupErrors: string[] = [];
  let manager: Identity | null = null;
  let cashier: Identity | null = null;
  let stockAssistant: Identity | null = null;
  let customerIdentity: Identity | null = null;
  let categoryId: string | null = null;
  let productId: string | null = null;
  let walkInCustomerId: string | null = null;
  const walkInCustomerIds: string[] = [];
  let cashierClient: ReturnType<typeof publicClient> | null = null;
  let managerClient: ReturnType<typeof publicClient> | null = null;

  async function createStaff(
    name: string,
    role: "manager" | "stock_assistant",
    email: string,
  ): Promise<Identity> {
    const secret = password();
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: secret,
      email_confirm: true,
      user_metadata: { full_name: name },
    });
    expect(error).toBeNull();
    expect(data.user).not.toBeNull();
    const identity = { id: data.user!.id, email, password: secret };
    const { error: profileError } = await admin
      .from("staff_profiles")
      .insert({ user_id: identity.id, full_name: name, role, is_active: true });
    expect(profileError).toBeNull();
    return identity;
  }

  async function ensureCashier(): Promise<Identity> {
    const email = "phase3-hosted-cashier@example.test";
    const list = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    expect(list.error).toBeNull();
    const existing = list.data.users.find((user) => user.email === email);
    const secret = password();
    let userId: string;
    if (existing) {
      const updated = await admin.auth.admin.updateUserById(existing.id, {
        password: secret,
        email_confirm: true,
      });
      expect(updated.error).toBeNull();
      userId = existing.id;
      const { error } = await admin.from("staff_profiles").upsert({
        user_id: userId,
        full_name: "Phase 3 Test Cashier",
        role: "cashier",
        is_active: true,
      });
      expect(error).toBeNull();
    } else {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password: secret,
        email_confirm: true,
        user_metadata: { full_name: "Phase 3 Test Cashier" },
      });
      expect(error).toBeNull();
      expect(data.user).not.toBeNull();
      userId = data.user!.id;
      const { error: profileError } = await admin.from("staff_profiles").insert({
        user_id: userId,
        full_name: "Phase 3 Test Cashier",
        role: "cashier",
        is_active: true,
      });
      expect(profileError).toBeNull();
    }
    return { id: userId, email, password: secret };
  }

  try {
    manager = await createStaff(
      `Phase 3 Manager ${marker}`,
      "manager",
      `phase3-manager-${marker}@example.test`,
    );
    cashier = await ensureCashier();
    stockAssistant = await createStaff(
      `Phase 3 Stock ${marker}`,
      "stock_assistant",
      `phase3-stock-${marker}@example.test`,
    );
    const customerEmail = `phase3-customer-${marker}@example.test`;
    const customerPassword = password();
    const customerCreated = await admin.auth.admin.createUser({
      email: customerEmail,
      password: customerPassword,
      email_confirm: true,
      user_metadata: {
        account_type: "customer",
        full_name: `Phase 3 Auth Customer ${marker}`,
        phone: "0201234567",
      },
    });
    expect(customerCreated.error).toBeNull();
    expect(customerCreated.data.user).not.toBeNull();
    customerIdentity = {
      id: customerCreated.data.user!.id,
      email: customerEmail,
      password: customerPassword,
    };
    const { data: linkedCustomer } = await admin
      .from("customers")
      .select("id")
      .eq("auth_user_id", customerIdentity.id)
      .single();
    expect(linkedCustomer).not.toBeNull();

    const category = await admin
      .from("categories")
      .insert({ name: `Phase 3 ${marker}`, slug: `phase-3-${marker}` })
      .select("id")
      .single();
    expect(category.error).toBeNull();
    categoryId = category.data!.id;
    const sku = `P3-${marker}`;
    const product = await admin
      .from("products")
      .insert({
        category_id: categoryId,
        name: `Phase 3 POS Product ${marker}`,
        sku,
        barcode: `903${marker.replaceAll("-", "")}`,
        selling_price: 12.34,
        reorder_level: 2,
      })
      .select("id")
      .single();
    expect(product.error).toBeNull();
    productId = product.data!.id;

    managerClient = publicClient();
    const managerLogin = await managerClient.auth.signInWithPassword({
      email: manager.email,
      password: manager.password,
    });
    expect(managerLogin.error).toBeNull();
    const opening = await managerClient.rpc("record_stock_movement", {
      p_product_id: productId,
      p_movement_type: "opening_stock",
      p_quantity: 10,
      p_client_operation_id: randomUUID(),
    });
    expect(opening.error).toBeNull();
    mark("fixture_ready");

    cashierClient = publicClient();
    const cashierLogin = await cashierClient.auth.signInWithPassword({
      email: cashier.email,
      password: cashier.password,
    });
    expect(cashierLogin.error).toBeNull();
    await signIn(page, cashier.email, cashier.password, "/staff");
    await page.goto("/pos");
    await expect(page.getByRole("heading", { name: "New sale" })).toBeVisible();
    const customerPermission = await cashierClient.rpc("has_permission", {
      requested_permission: "create_customer",
    });
    expect(customerPermission.error).toBeNull();
    expect(customerPermission.data).toBe(true);
    const customerSearchResponse = await page.request.get(
      "/api/customers/search?query=Phase",
    );
    expect(customerSearchResponse.status()).toBe(200);
    const directCustomer = await cashierClient
      .from("customers")
      .insert({
        full_name: `Phase 3 Direct ${marker}`,
        phone: "0209999999",
        email: null,
        notes: null,
      })
      .select("id")
      .single();
    expect(directCustomer.error).toBeNull();
    walkInCustomerIds.push(directCustomer.data!.id);
    await page.getByLabel("Search or scan product").fill(sku);
    const result = page
      .locator("article")
      .filter({ hasText: `Phase 3 POS Product ${marker}` })
      .first();
    await expect(result).toContainText("GHS 12.34");
    await result.getByRole("button", { name: /Add Phase 3 POS Product/u }).click();
    mark("pos_product_lookup_and_add");

    await page.getByRole("button", { name: "Create walk-in customer" }).click();
    const quickForm = page
      .locator("form")
      .filter({ has: page.getByRole("heading", { name: "Quick customer" }) });
    await quickForm.getByLabel("Full name").fill(`Phase 3 Walk-in ${marker}`);
    await quickForm.getByLabel("Ghana phone").fill("024 000 0000");
    await quickForm.getByRole("button", { name: "Create customer" }).click();
    await expect(quickForm.getByRole("status")).toContainText("Customer created.");
    await expect(page.getByText(new RegExp(`Phase 3 Walk-in ${marker}`))).toBeVisible();
    const walkIn = await admin
      .from("customers")
      .select("id, auth_user_id, phone")
      .eq("full_name", `Phase 3 Walk-in ${marker}`)
      .single();
    expect(walkIn.error).toBeNull();
    walkInCustomerId = walkIn.data!.id;
    walkInCustomerIds.push(walkInCustomerId);
    expect(walkIn.data).toMatchObject({ auth_user_id: null, phone: "+233240000000" });
    mark("walk_in_customer_created_and_normalized");

    await expect(quickForm.getByRole("status")).toContainText("Customer created.");
    await page.getByRole("button", { name: "Hide quick customer" }).click();
    await page.getByRole("button", { name: "Remove" }).last().click();
    await page.getByRole("button", { name: "Create walk-in customer" }).click();
    const duplicateForm = page
      .locator("form")
      .filter({ has: page.getByRole("heading", { name: "Quick customer" }) });
    await duplicateForm.getByLabel("Full name").fill(`Phase 3 Duplicate ${marker}`);
    await duplicateForm.getByLabel("Ghana phone").fill("024 000 0000");
    await duplicateForm.getByRole("button", { name: "Create customer" }).click();
    await expect(duplicateForm.getByRole("status")).toContainText("Possible duplicate:");
    const duplicateCustomer = await admin
      .from("customers")
      .select("id")
      .eq("full_name", `Phase 3 Duplicate ${marker}`)
      .single();
    expect(duplicateCustomer.error).toBeNull();
    walkInCustomerId = duplicateCustomer.data!.id;
    walkInCustomerIds.push(duplicateCustomer.data!.id);
    mark("duplicate_phone_warning");

    const managerBrowser = page.context().browser();
    if (!managerBrowser)
      throw new Error("Browser context unavailable for isolated manager check.");
    const managementContext = await managerBrowser.newContext();
    const managementPage = await managementContext.newPage();
    await signIn(managementPage, manager.email, manager.password, "/staff");
    await managementPage.goto(
      `/customers?query=${encodeURIComponent(`Phase 3 Duplicate ${marker}`)}`,
    );
    await expect(managementPage.getByText(`Phase 3 Duplicate ${marker}`)).toBeVisible();
    await managementPage.getByRole("link", { name: "View / edit" }).click();
    await expect(managementPage).toHaveURL(/\/customers\/[0-9a-f-]+\/edit$/iu);
    await managementPage
      .getByLabel("Full name")
      .fill(`Phase 3 Duplicate Updated ${marker}`);
    await managementPage
      .getByLabel("Staff notes")
      .fill("Hosted Phase 3 customer edit check");
    await managementPage.getByLabel("Status").selectOption("inactive");
    await managementPage.getByRole("button", { name: "Save customer" }).click();
    await expect(managementPage.getByRole("status")).toContainText(
      "Customer details saved.",
    );
    await managementPage.getByLabel("Status").selectOption("active");
    await managementPage.getByRole("button", { name: "Save customer" }).click();
    await expect
      .poll(async () => {
        const { data } = await admin
          .from("customers")
          .select("status")
          .eq("id", walkInCustomerId!)
          .single();
        return data?.status;
      })
      .toBe("active");
    const reactivatedCustomer = await admin
      .from("customers")
      .select("status, full_name")
      .eq("id", walkInCustomerId)
      .single();
    expect(reactivatedCustomer.data).toMatchObject({
      status: "active",
      full_name: `Phase 3 Duplicate Updated ${marker}`,
    });
    await managementPage.close();
    await managementContext.close();
    mark("manager_customer_search_view_edit_and_activation");

    const quantity = page.getByLabel(`Quantity for Phase 3 POS Product ${marker}`);
    await quantity.fill("1.500");
    await saveScreenshot(page, evidenceDirectory, `${runId}-pos.png`);
    await page.getByRole("button", { name: /Complete sale/u }).click();
    await expect(page).toHaveURL(/\/sales\/[0-9a-f-]+$/iu);
    await expect(
      page.getByRole("heading", { name: "Grand Pa’s Cold Store" }),
    ).toBeVisible();
    await expect(page.getByText(`Phase 3 Duplicate Updated ${marker}`)).toBeVisible();
    await expect(
      page.getByRole("definition").filter({ hasText: "GHS 18.51" }),
    ).toBeVisible();
    const cashSaleId = page.url().split("/").at(-1)!;
    await saveScreenshot(page, evidenceDirectory, `${runId}-cash-receipt.png`);
    mark("cash_sale_and_print_receipt");

    await page.goto("/pos");
    await page.getByLabel("Search or scan product").fill(sku);
    const momoProduct = page
      .locator("article")
      .filter({ hasText: `Phase 3 POS Product ${marker}` })
      .first();
    await expect(momoProduct).toBeVisible();
    await momoProduct.getByRole("button", { name: /Add Phase 3 POS Product/u }).click();
    await page.getByLabel(`Quantity for Phase 3 POS Product ${marker}`).fill("0.500");
    await page.getByLabel("Externally Confirmed Mobile Money").check();
    await page.getByLabel("MoMo reference (optional)").fill(`P3-${marker}`);
    await page.getByRole("button", { name: /Complete sale/u }).click();
    await expect(page).toHaveURL(/\/sales\/[0-9a-f-]+$/iu);
    await expect(page.getByText("Externally Confirmed Mobile Money")).toBeVisible();
    await expect(
      page.getByRole("definition").filter({ hasText: "GHS 6.17" }),
    ).toBeVisible();
    const momoSaleId = page.url().split("/").at(-1)!;
    await saveScreenshot(page, evidenceDirectory, `${runId}-momo-receipt.png`);
    mark("external_momo_sale_and_receipt");

    await page.goto("/sales");
    await expect(page.getByRole("heading", { name: "Sales history" })).toBeVisible();
    await expect(
      page.getByRole("link").filter({ hasText: /^GP-/u }).first(),
    ).toBeVisible();
    await page.goto(`/sales/${cashSaleId}`);
    await expect(page.getByText(`Phase 3 Duplicate Updated ${marker}`)).toBeVisible();

    const [
      cashDetails,
      cashItems,
      momoDetails,
      momoPayment,
      currentBalance,
      movementRows,
    ] = await Promise.all([
      admin
        .from("sales")
        .select("id, receipt_number, customer_id, total, cashier_user_id, status")
        .eq("id", cashSaleId)
        .single(),
      admin
        .from("sale_items")
        .select("product_name_snapshot, unit_price, quantity, line_total")
        .eq("sale_id", cashSaleId)
        .single(),
      admin
        .from("sales")
        .select("id, receipt_number, total")
        .eq("id", momoSaleId)
        .single(),
      admin
        .from("payments")
        .select("method, provider_reference, amount")
        .eq("sale_id", momoSaleId)
        .single(),
      admin
        .from("inventory_balances")
        .select("quantity")
        .eq("product_id", productId)
        .single(),
      admin.from("stock_movements").select("quantity_delta").eq("product_id", productId),
    ]);
    expect(cashDetails.error).toBeNull();
    expect(cashDetails.data).toMatchObject({
      total: 18.51,
      customer_id: walkInCustomerId,
      cashier_user_id: cashier.id,
      status: "completed",
    });
    expect(cashItems.data).toMatchObject({
      product_name_snapshot: `Phase 3 POS Product ${marker}`,
      quantity: 1.5,
      unit_price: 12.34,
      line_total: 18.51,
    });
    expect(momoDetails.error).toBeNull();
    expect(momoDetails.data?.total).toBe(6.17);
    expect(momoPayment.data).toMatchObject({
      method: "external_momo",
      provider_reference: `P3-${marker}`,
      amount: 6.17,
    });
    expect(currentBalance.data?.quantity).toBe(8);
    expect(
      sumDecimalStrings(
        movementRows.data?.map((row) => String(row.quantity_delta)) ?? [],
      ),
    ).toBe("8");
    const { data: ownSales } = await cashierClient
      .from("sales")
      .select("id")
      .eq("id", cashSaleId);
    expect(ownSales).toHaveLength(1);
    mark("hosted_sale_payment_stock_and_rls_verified");

    const adjustment = await managerClient.rpc("record_stock_movement", {
      p_product_id: productId,
      p_movement_type: "adjustment_out",
      p_quantity: 3,
      p_reason: "Set exact Phase 3 concurrency fixture stock",
      p_client_operation_id: randomUUID(),
    });
    expect(adjustment.error).toBeNull();
    const competingSales = await Promise.all([
      cashierClient.rpc("complete_pos_sale", {
        p_client_operation_id: randomUUID(),
        p_items: [{ product_id: productId, quantity: "4" }],
        p_payment_method: "cash",
      }),
      cashierClient.rpc("complete_pos_sale", {
        p_client_operation_id: randomUUID(),
        p_items: [{ product_id: productId, quantity: "4" }],
        p_payment_method: "cash",
      }),
    ]);
    expect(competingSales.filter((result) => !result.error)).toHaveLength(1);
    expect(
      competingSales.filter((result) => result.error?.code === "23514"),
    ).toHaveLength(1);
    const afterRace = await admin
      .from("inventory_balances")
      .select("quantity")
      .eq("product_id", productId)
      .single();
    expect(afterRace.data?.quantity).toBe(1);
    const reconciled = await admin
      .from("stock_movements")
      .select("quantity_delta")
      .eq("product_id", productId);
    expect(
      sumDecimalStrings(reconciled.data?.map((row) => String(row.quantity_delta)) ?? []),
    ).toBe("1");
    mark("hosted_concurrency_one_of_two_four_unit_sales_succeeded");

    const stockLogin = await publicClient();
    const stockSignIn = await stockLogin.auth.signInWithPassword({
      email: stockAssistant.email,
      password: stockAssistant.password,
    });
    expect(stockSignIn.error).toBeNull();
    const stockSale = await stockLogin.rpc("complete_pos_sale", {
      p_client_operation_id: randomUUID(),
      p_items: [{ product_id: productId, quantity: "1" }],
      p_payment_method: "cash",
    });
    expect(stockSale.error?.code).toBe("42501");
    await signOut(page);
    await signIn(page, stockAssistant.email, stockAssistant.password, "/staff");
    await page.goto("/pos");
    await expect(page.getByRole("heading", { name: "POS unavailable" })).toBeVisible();
    mark("stock_assistant_sale_denied");

    await page.goto("/staff");
    await signOut(page);
    const customerClient = publicClient();
    const customerSignIn = await customerClient.auth.signInWithPassword({
      email: customerIdentity.email,
      password: customerIdentity.password,
    });
    expect(customerSignIn.error).toBeNull();
    const customerSales = await customerClient.from("sales").select("id");
    expect(customerSales.data).toEqual([]);
    const customerSale = await customerClient.rpc("complete_pos_sale", {
      p_client_operation_id: randomUUID(),
      p_items: [{ product_id: productId, quantity: "1" }],
      p_payment_method: "cash",
    });
    expect(customerSale.error?.code).toBe("42501");
    await page.goto("/pos");
    await expect(page).toHaveURL(/\/login$/u);
    mark("customer_sales_rls_denied_and_unauthenticated_pos_redirect");

    const evidence = {
      run_id: runId,
      outcome: "PASS",
      stages: trace,
      cash_sale: "PASS",
      externally_confirmed_momo: "PASS",
      receipt_and_history: "PASS",
      cash_receipt_number: cashDetails.data?.receipt_number ?? "unavailable",
      cash_total_ghe: cashDetails.data?.total ?? null,
      momo_receipt_number: momoDetails.data?.receipt_number ?? "unavailable",
      momo_total_ghe: momoDetails.data?.total ?? null,
      stock_after_cash_and_momo: currentBalance.data?.quantity ?? null,
      concurrency_stock_before_sales: 5,
      concurrency_stock_after_sales: afterRace.data?.quantity ?? null,
      movement_ledger_after_concurrency: sumDecimalStrings(
        reconciled.data?.map((row) => String(row.quantity_delta)) ?? [],
      ),
      walk_in_customer: "PASS",
      cashier_rls: "PASS",
      stock_assistant_denied: "PASS",
      customer_sale_rls_denied: "PASS",
      customer_browser_login_and_staff_redirect:
        "DEFERRED with Phase 1 customer-auth verification",
      concurrency:
        "PASS: exactly one of two simultaneous 4-unit sales completed from stock 5; ending balance and ledger both 1",
      cleanup:
        "fictional products/categories/customer deactivated; temporary manager, stock assistant and Auth customer removed; append-only sales and stock ledger preserved",
    };
    await mkdir(evidenceDirectory, { recursive: true });
    await writeFile(
      resolve(evidenceDirectory, `${runId}-safe-trace.json`),
      `${JSON.stringify(evidence, null, 2)}\n`,
    );
    await testInfo.attach(`${runId}-safe-trace.json`, {
      body: Buffer.from(JSON.stringify(evidence, null, 2)),
      contentType: "application/json",
    });
  } finally {
    if (productId) {
      const { error } = await admin
        .from("products")
        .update({ is_active: false })
        .eq("id", productId);
      if (error) cleanupErrors.push("product_deactivation_failed");
    }
    if (categoryId) {
      const { error } = await admin
        .from("categories")
        .update({ is_active: false })
        .eq("id", categoryId);
      if (error) cleanupErrors.push("category_deactivation_failed");
    }
    if (walkInCustomerIds.length > 0) {
      const { error } = await admin
        .from("customers")
        .update({ status: "inactive" })
        .in("id", walkInCustomerIds);
      if (error) cleanupErrors.push("walk_in_customer_deactivation_failed");
    }
    if (cashier) {
      const { error } = await admin
        .from("staff_profiles")
        .update({ is_active: false })
        .eq("user_id", cashier.id);
      if (error) cleanupErrors.push("cashier_deactivation_failed");
    }
    for (const identity of [manager, stockAssistant, customerIdentity]) {
      if (!identity) continue;
      const deleted = await admin.auth.admin.deleteUser(identity.id);
      if (deleted.error) cleanupErrors.push("temporary_identity_cleanup_failed");
    }
    await cashierClient?.auth.signOut();
    await managerClient?.auth.signOut();
    if (cleanupErrors.length > 0) {
      const body = `${JSON.stringify({ run_id: runId, cleanup: cleanupErrors }, null, 2)}\n`;
      await mkdir(evidenceDirectory, { recursive: true });
      await writeFile(resolve(evidenceDirectory, `${runId}-cleanup-issue.json`), body);
      throw new Error(
        `Phase 3 fixture cleanup had ${cleanupErrors.length} sanitized issue(s).`,
      );
    }
  }
});

async function signIn(page: Page, email: string, password: string, destination: string) {
  await page.goto("/login");
  await expect(page).toHaveURL(/\/login$/u);
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(new RegExp(`${destination}$`, "u"));
}

async function signOut(page: Page) {
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/u);
}

async function saveScreenshot(page: Page, directory: string, filename: string) {
  await mkdir(directory, { recursive: true });
  await page.screenshot({ path: resolve(directory, filename), fullPage: true });
}

function sumDecimalStrings(values: string[]) {
  const total = values.reduce((sum, value) => {
    const negative = value.startsWith("-");
    const [whole = "0", fraction = ""] = (negative ? value.slice(1) : value).split(".");
    const scaled =
      BigInt(whole) * BigInt(1000) + BigInt(fraction.padEnd(3, "0").slice(0, 3) || "0");
    return sum + (negative ? -scaled : scaled);
  }, BigInt(0));
  const negative = total < BigInt(0);
  const absolute = negative ? -total : total;
  return `${negative ? "-" : ""}${absolute / BigInt(1000)}.${String(absolute % BigInt(1000)).padStart(3, "0")}`.replace(
    /\.000$/u,
    "",
  );
}

function loadLocalEnvironment() {
  const path = resolve(process.cwd(), ".env.local");
  let contents: string;
  try {
    contents = readFileSync(path, "utf8");
  } catch {
    return;
  }
  for (const line of contents.split(/\r?\n/u)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/u);
    if (!match || match[1] in process.env) continue;
    const raw = match[2];
    const quote = raw[0];
    process.env[match[1]] =
      (quote === "'" || quote === '"') && raw.at(-1) === quote ? raw.slice(1, -1) : raw;
  }
}

function requiredEnvironment(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing local ${name} configuration.`);
  return value;
}
