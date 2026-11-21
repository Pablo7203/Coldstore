import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test, type Page, type Request, type TestInfo } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

test("Phase 2 hosted catalogue, inventory, and role boundaries", async ({
  page,
}, testInfo) => {
  test.skip(process.env.PHASE2_LIVE !== "1", "Opt in to hosted Phase 2 verification.");
  test.setTimeout(180_000);
  loadLocalEnvironment();

  const url = requiredEnvironment("NEXT_PUBLIC_SUPABASE_URL");
  if (new URL(url).hostname.split(".")[0] !== "xjzdcpuwrjnpjzntytjs") {
    throw new Error("Refusing hosted Phase 2 verification outside GrandPa development.");
  }
  const publishableKey = requiredEnvironment("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  const secretKey = requiredEnvironment("SUPABASE_SECRET_KEY");
  const marker = `${Date.now().toString(36)}-${randomUUID().replaceAll("-", "").slice(0, 10)}`;
  const runId = `phase2-e2e-${marker}`;
  const evidenceDirectory = resolve(process.cwd(), "docs/evidence/phase-2");
  const password = () => randomBytes(32).toString("base64url");
  const identities: Array<{ id: string; email: string; password: string }> = [];
  const categoryName = `Phase 2 QA ${marker}`;
  const categorySlug = `phase-2-qa-${marker}`;
  const productName = `Phase 2 Sample Product ${marker}`;
  const sku = `P2QA-${marker}`;
  const barcode = `930${marker}`;
  let categoryId: string | null = null;
  let productId: string | null = null;
  let currentStage = "test_setup";
  let workflowFailure: unknown;
  const cleanupFailures: string[] = [];
  const traceEvents: Array<Record<string, string | number>> = [];
  const testStartedAt = performance.now();
  const requestStartedAt = new WeakMap<Request, number>();
  const mark = (stage: string, outcome?: string) => {
    currentStage = stage;
    traceEvents.push({
      at_ms: Math.round(performance.now() - testStartedAt),
      event: "stage",
      stage,
      ...(outcome ? { outcome } : {}),
    });
  };
  const appendEvent = (event: Record<string, string | number>) => {
    if (traceEvents.length < 500) {
      traceEvents.push({
        at_ms: Math.round(performance.now() - testStartedAt),
        ...event,
      });
    }
  };
  mark("test.started");
  const diagnosticFetch: typeof fetch = async (input, init) => {
    const requestUrl = safeRequestUrl(
      input instanceof Request
        ? input.url
        : input instanceof URL
          ? input.href
          : String(input),
    );
    if (!requestUrl) return fetch(input, init);
    const startedAt = performance.now();
    const method = init?.method ?? (input instanceof Request ? input.method : "GET");
    try {
      const response = await fetch(input, init);
      appendEvent({
        event: "supabase.request.completed",
        method,
        ...requestUrl,
        status: response.status,
        duration_ms: Math.round(performance.now() - startedAt),
      });
      return response;
    } catch (error) {
      appendEvent({
        event: "supabase.request.failed",
        method,
        ...requestUrl,
        duration_ms: Math.round(performance.now() - startedAt),
        outcome: safeErrorCode(error),
      });
      throw error;
    }
  };
  const admin = createClient<Database>(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: diagnosticFetch },
  });
  const publicClient = () =>
    createClient<Database>(url, publishableKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { fetch: diagnosticFetch },
    });

  page.on("request", (request) => {
    const requestUrl = safeRequestUrl(request.url());
    if (!requestUrl) return;
    requestStartedAt.set(request, performance.now());
    appendEvent({ event: "request.started", method: request.method(), ...requestUrl });
  });
  page.on("response", (response) => {
    const requestUrl = safeRequestUrl(response.url());
    if (!requestUrl) return;
    const startedAt = requestStartedAt.get(response.request());
    appendEvent({
      event: "request.completed",
      method: response.request().method(),
      ...requestUrl,
      status: response.status(),
      ...(startedAt === undefined
        ? {}
        : { duration_ms: Math.round(performance.now() - startedAt) }),
    });
  });
  page.on("requestfailed", (request) => {
    const requestUrl = safeRequestUrl(request.url());
    if (!requestUrl) return;
    appendEvent({
      event: "request.failed",
      method: request.method(),
      ...requestUrl,
      outcome: safeNetworkFailure(request.failure()?.errorText),
    });
  });
  page.on("console", (message) => {
    if (message.type() === "error") {
      appendEvent({
        event: "browser.console_error",
        detail: sanitizeDiagnosticText(message.text()),
      });
    }
  });
  page.on("pageerror", (error) => {
    appendEvent({
      event: "browser.page_error",
      detail: sanitizeDiagnosticText(error.name),
    });
  });

  async function createIdentity(
    name: string,
    role: "admin" | "manager" | "cashier" | "stock_assistant" | "customer",
  ) {
    const email = `phase2-${role}-${marker}-${identities.length}@example.test`;
    const secret = password();
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: secret,
      email_confirm: true,
      user_metadata:
        role === "customer"
          ? { account_type: "customer", full_name: name, phone: "0241234567" }
          : { full_name: name },
    });
    expect(error).toBeNull();
    expect(data.user).not.toBeNull();
    const userId = data.user!.id;
    identities.push({ id: userId, email, password: secret });
    if (role !== "customer") {
      const { error: profileError } = await admin.from("staff_profiles").insert({
        user_id: userId,
        full_name: name,
        role,
        is_active: true,
      });
      expect(profileError).toBeNull();
    }
    appendEvent({ event: "identity.provisioned", persona: role, outcome: "ok" });
    return { id: userId, email, password: secret, name };
  }

  try {
    mark("identity_setup.started");
    const manager = await createIdentity(`Phase 2 Manager ${marker}`, "manager");
    const stockAssistant = await createIdentity(
      `Phase 2 Stock ${marker}`,
      "stock_assistant",
    );
    const cashier = await createIdentity(`Phase 2 Cashier ${marker}`, "cashier");
    const customer = await createIdentity(`Phase 2 Customer ${marker}`, "customer");
    mark("identity_setup.completed", "ok");

    const managerPreflightClient = publicClient();
    const managerPreflightStartedAt = performance.now();
    const { error: managerPreflightError } =
      await managerPreflightClient.auth.signInWithPassword({
        email: manager.email,
        password: manager.password,
      });
    appendEvent({
      event: "identity.auth_preflight",
      persona: "manager",
      outcome: managerPreflightError ? "error" : "ok",
      duration_ms: Math.round(performance.now() - managerPreflightStartedAt),
    });
    expect(managerPreflightError).toBeNull();
    await managerPreflightClient.auth.signOut();

    mark("manager.ui_signin.started");
    await signIn(page, manager.email, manager.password, mark);
    mark("manager.ui_signin.completed", "ok");
    await page.goto("/products");
    const categoryForm = page
      .locator("form")
      .filter({ has: page.locator('input[name="slug"]') })
      .first();
    await categoryForm.locator('input[name="name"]').fill(categoryName);
    await categoryForm.locator('input[name="slug"]').fill(categorySlug);
    mark("category.create.started");
    await categoryForm.getByRole("button", { name: "Add category" }).click();
    await expect(page.getByRole("status")).toContainText("Category created.", {
      timeout: 20_000,
    });
    const { data: category, error: categoryLookupError } = await admin
      .from("categories")
      .select("id")
      .eq("slug", categorySlug)
      .single();
    expect(categoryLookupError).toBeNull();
    categoryId = category!.id;
    mark("category.create.completed", "ok");

    await page.reload();
    const productForm = page
      .locator("form")
      .filter({ has: page.locator('input[name="sellingPrice"]') });
    await productForm.locator('input[name="name"]').fill(productName);
    await productForm.locator('select[name="categoryId"]').selectOption(categoryId);
    await productForm.locator('input[name="sku"]').fill(sku);
    await productForm.locator('input[name="barcode"]').fill(barcode);
    await productForm.locator('input[name="sellingPrice"]').fill("12.30");
    await productForm.locator('input[name="costPrice"]').fill("8.10");
    await productForm.locator('input[name="reorderLevel"]').fill("2.500");
    mark("product.create.started");
    await productForm.getByRole("button", { name: "Create product" }).click();
    await expect(page.getByRole("status")).toContainText("Product created.");
    const { data: createdProduct, error: productLookupError } = await admin
      .from("products")
      .select("id")
      .eq("sku", sku)
      .single();
    expect(productLookupError).toBeNull();
    productId = createdProduct!.id;
    mark("product.create.completed", "ok");

    await page.goto("/products");
    const productRow = page.getByRole("row").filter({ hasText: productName });
    await expect(productRow).toContainText("GHS 12.30");
    await productRow.getByRole("link", { name: "Edit" }).click();
    await page.locator('input[name="sellingPrice"]').fill("13.40");
    mark("product.edit.started");
    await page.getByRole("button", { name: "Save product" }).click();
    await expect(page.getByRole("status")).toContainText("Product updated.");
    mark("product.edit.completed", "ok");

    for (const term of [productName, sku, barcode]) {
      await page.goto("/products");
      await page.locator('input[name="query"]').fill(term);
      await page.getByRole("button", { name: "Apply filters" }).click();
      await expect(page.getByRole("row").filter({ hasText: productName })).toBeVisible();
    }
    mark("product.search.completed", "ok");

    await page.goto("/inventory");
    await recordMovement(
      page,
      admin,
      productId,
      "opening_stock",
      "10.000",
      `Initial fictional count ${marker}`,
      "10.000",
    );
    await recordMovement(
      page,
      admin,
      productId,
      "receipt",
      "2.250",
      `Fictional test receipt ${marker}`,
      "12.250",
    );
    await recordMovement(
      page,
      admin,
      productId,
      "wastage",
      "1.000",
      `Fictional test wastage ${marker}`,
      "11.250",
    );
    await recordMovement(
      page,
      admin,
      productId,
      "damage",
      "0.250",
      `Fictional test damage ${marker}`,
      "11.000",
    );
    await recordMovement(
      page,
      admin,
      productId,
      "adjustment_in",
      "0.500",
      `Fictional count correction ${marker}`,
      "11.500",
    );
    await recordMovement(
      page,
      admin,
      productId,
      "adjustment_out",
      "2.000",
      `Fictional count correction ${marker}`,
      "9.500",
    );
    const inventoryRow = page.getByRole("row").filter({ hasText: productName });
    await expect(inventoryRow).toContainText("9.5");
    await recordMovement(
      page,
      admin,
      productId,
      "adjustment_out",
      "100.000",
      `Rejected negative-stock test ${marker}`,
      undefined,
      false,
    );
    await expect(page.getByRole("alert")).toContainText("below zero");
    await expect(inventoryRow).toContainText("9.5");

    await page.goto(`/stock-movements?productId=${productId}`);
    for (const movement of [
      "Opening stock",
      "Stock received",
      "Wastage",
      "Damage",
      "Adjustment in",
      "Adjustment out",
    ]) {
      await expect(page.getByRole("table")).toContainText(movement);
    }
    await expect(page.getByRole("table")).toContainText(manager.name);

    await signOut(page);
    mark("stock_assistant.ui_signin.started");
    await signIn(page, stockAssistant.email, stockAssistant.password, mark);
    await page.goto("/inventory");
    await expect(
      page.locator('select[name="movementType"] option[value="opening_stock"]'),
    ).toHaveCount(0);
    await recordMovement(
      page,
      admin,
      productId,
      "receipt",
      "0.125",
      `Stock assistant test receipt ${marker}`,
      "9.625",
    );

    await signOut(page);
    mark("cashier.ui_signin.started");
    await signIn(page, cashier.email, cashier.password, mark);
    await page.goto("/products");
    await expect(page.getByText("View only").first()).toBeVisible();
    await expect(page.getByText("Add a product")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Movement history" })).toHaveCount(0);

    const cashierClient = publicClient();
    const { error: cashierLoginError } = await cashierClient.auth.signInWithPassword({
      email: cashier.email,
      password: cashier.password,
    });
    expect(cashierLoginError).toBeNull();
    const { error: cashierInsertError } = await cashierClient.from("products").insert({
      category_id: categoryId!,
      name: "Denied cashier product",
      selling_price: 1,
    });
    expect(cashierInsertError).not.toBeNull();
    const { error: cashierAdjustmentError } = await cashierClient.rpc(
      "record_stock_movement",
      {
        p_product_id: productId,
        p_movement_type: "adjustment_in",
        p_quantity: 1,
        p_reason: "Denied cashier adjustment",
        p_reference_type: undefined,
        p_client_operation_id: randomUUID(),
      },
    );
    expect(cashierAdjustmentError?.code).toBe("42501");

    const customerClient = publicClient();
    const { error: customerLoginError } = await customerClient.auth.signInWithPassword({
      email: customer.email,
      password: customer.password,
    });
    expect(customerLoginError).toBeNull();
    const { data: customerProducts, error: customerProductError } = await customerClient
      .from("products")
      .select("id");
    expect(customerProductError).toBeNull();
    expect(customerProducts).toEqual([]);
    const { data: customerBalances, error: customerBalanceError } = await customerClient
      .from("inventory_balances")
      .select("product_id");
    expect(customerBalanceError).toBeNull();
    expect(customerBalances).toEqual([]);
    const { error: customerSearchError } = await customerClient.rpc(
      "get_inventory_summary",
    );
    expect(customerSearchError?.code).toBe("42501");
    const { error: customerInsertError } = await customerClient.from("products").insert({
      category_id: categoryId!,
      name: "Denied customer product",
      selling_price: 1,
    });
    expect(customerInsertError).not.toBeNull();

    const anonymousClient = publicClient();
    const { error: anonymousBalanceError } = await anonymousClient
      .from("inventory_balances")
      .select("product_id");
    expect(anonymousBalanceError).not.toBeNull();
    mark("hosted_workflow.completed", "ok");
  } catch (error) {
    workflowFailure = error;
    mark("hosted_workflow.failed", error instanceof Error ? error.name : "unknown");
    try {
      await persistSafeTrace(testInfo, evidenceDirectory, runId, {
        final_stage: currentStage,
        workflow_outcome: "failed",
        cleanup_outcome: "pending",
        events: traceEvents,
      });
    } catch {
      appendEvent({ event: "safe_trace_attachment", outcome: "unavailable" });
    }
    try {
      await page.locator('input[type="password"]').evaluateAll((elements) => {
        for (const element of elements) (element as HTMLInputElement).value = "";
      });
      const screenshot = await page.screenshot({ animations: "disabled" });
      await writeFile(
        resolve(evidenceDirectory, `${runId}-redacted-failure.png`),
        screenshot,
      );
      await testInfo.attach(`${runId}-redacted-failure.png`, {
        body: screenshot,
        contentType: "image/png",
      });
    } catch {
      appendEvent({ event: "failure_screenshot", outcome: "unavailable" });
    }
  } finally {
    mark("cleanup.started");
    const { data: matchingProducts } = await admin
      .from("products")
      .select("id")
      .eq("sku", sku);
    const productIds = [
      ...new Set(
        [productId, ...(matchingProducts ?? []).map((item) => item.id)].filter(
          (id): id is string => Boolean(id),
        ),
      ),
    ];
    if (productIds.length) {
      const { error } = await admin
        .from("products")
        .update({ is_active: false })
        .in("id", productIds);
      if (error) cleanupFailures.push("product_deactivation");
    }
    const { data: matchingCategories, error: categoryLookupError } = await admin
      .from("categories")
      .select("id")
      .eq("slug", categorySlug);
    if (categoryLookupError) cleanupFailures.push("category_lookup");
    const categoryIds = [
      ...new Set(
        [categoryId, ...(matchingCategories ?? []).map((item) => item.id)].filter(
          (id): id is string => Boolean(id),
        ),
      ),
    ];
    if (categoryIds.length) {
      const { error } = await admin
        .from("categories")
        .update({ is_active: false })
        .in("id", categoryIds);
      if (error) cleanupFailures.push("category_deactivation");
    }
    if (identities.length) {
      const userIds = identities.map((identity) => identity.id);
      const { error: customerCleanupError } = await admin
        .from("customers")
        .delete()
        .in("auth_user_id", userIds);
      if (customerCleanupError) cleanupFailures.push("customer_profile_removal");
      const { error: staffCleanupError } = await admin
        .from("staff_profiles")
        .delete()
        .in("user_id", userIds);
      if (staffCleanupError) cleanupFailures.push("staff_profile_removal");
      const cleanup = await Promise.all(
        identities.map(({ id }) => admin.auth.admin.deleteUser(id)),
      );
      if (cleanup.some(({ error }) => error))
        cleanupFailures.push("auth_identity_removal");
    }
    mark("cleanup.completed", cleanupFailures.length === 0 ? "ok" : "error");
    appendEvent({
      event: "cleanup.summary",
      products_deactivated: productIds.length,
      categories_deactivated: categoryIds.length,
      identities_removed: identities.length,
      failure_count: cleanupFailures.length,
    });
    await persistSafeTrace(testInfo, evidenceDirectory, runId, {
      final_stage: currentStage,
      workflow_outcome: workflowFailure ? "failed" : "passed",
      cleanup_outcome: cleanupFailures.length === 0 ? "passed" : "failed",
      cleanup_failure_codes: cleanupFailures,
      events: traceEvents,
    });
  }
  if (workflowFailure) throw workflowFailure;
  if (cleanupFailures.length) throw new Error("Phase 2 fixture cleanup failed.");
});

async function persistSafeTrace(
  testInfo: TestInfo,
  evidenceDirectory: string,
  runId: string,
  trace: Record<string, unknown>,
) {
  const body = Buffer.from(JSON.stringify({ run_id: runId, ...trace }, null, 2));
  await mkdir(evidenceDirectory, { recursive: true });
  await writeFile(resolve(evidenceDirectory, `${runId}-safe-trace.json`), body);
  await testInfo.attach(`${runId}-safe-trace.json`, {
    body,
    contentType: "application/json",
  });
}

async function recordMovement(
  page: Page,
  admin: ReturnType<typeof createClient<Database>>,
  productId: string,
  movementType: string,
  quantity: string,
  reason: string,
  expectedQuantity?: string,
  expectSuccess = true,
) {
  await page.locator('select[name="movementType"]').selectOption(movementType);
  await page.locator('select[name="productId"]').selectOption(productId);
  await page.locator('input[name="quantity"]').fill(quantity);
  await page.locator('textarea[name="reason"]').fill(reason);
  await page.getByRole("button", { name: "Record movement" }).click();
  if (expectSuccess) {
    await expect(page.getByRole("status")).toContainText("Stock movement recorded.");
    if (expectedQuantity) {
      await expect
        .poll(async () => {
          const { data } = await admin
            .from("inventory_balances")
            .select("quantity")
            .eq("product_id", productId)
            .maybeSingle();
          return data ? milliunits(data.quantity).toString() : null;
        })
        .toBe(milliunits(expectedQuantity).toString());
    }
  }
}

function milliunits(value: string | number) {
  const [whole = "0", fraction = ""] = String(value).split(".");
  return (
    BigInt(whole) * BigInt(1000) + BigInt(fraction.padEnd(3, "0").slice(0, 3) || "0")
  );
}

async function signIn(
  page: Page,
  email: string,
  password: string,
  mark?: (stage: string, outcome?: string) => void,
) {
  await page.goto("/login");
  mark?.("ui.login.page_loaded", "ok");
  await expect(page).toHaveURL(/\/login$/u);
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  mark?.("ui.login.action_submit_started");
  await page.getByRole("button", { name: "Sign in" }).click();
  mark?.("ui.login.action_submit_dispatched", "ok");
  await expect(page).toHaveURL(/\/staff$/u);
  mark?.("ui.login.redirect_completed", "ok");
}

async function signOut(page: Page) {
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/u);
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

function safeRequestUrl(value: string) {
  try {
    const parsed = new URL(value);
    if (
      parsed.hostname !== "localhost" &&
      parsed.hostname !== "127.0.0.1" &&
      parsed.hostname !== "::1" &&
      !parsed.hostname.endsWith(".supabase.co")
    ) {
      return null;
    }
    return { host: parsed.hostname, path: parsed.pathname };
  } catch {
    return null;
  }
}

function safeNetworkFailure(value: string | null | undefined) {
  const knownFailure = value?.match(/^net::ERR_[A-Z0-9_]+$/u)?.[0];
  return knownFailure ?? "request_failed";
}

function safeErrorCode(error: unknown) {
  const cause = error instanceof Error ? error.cause : undefined;
  const code =
    cause && typeof cause === "object" && "code" in cause
      ? String(cause.code)
      : error && typeof error === "object" && "code" in error
        ? String(error.code)
        : "";
  return /^(?:UND_ERR_[A-Z_]+|ECONN[A-Z]+|ENOTFOUND|ETIMEDOUT|EAI_AGAIN)$/u.test(code)
    ? code
    : "fetch_failed";
}

function sanitizeDiagnosticText(value: string) {
  return value
    .replace(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/gu, "[email]")
    .replace(/sb_(?:publishable|secret)_[A-Za-z0-9_-]+/gu, "[supabase-key]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/gu, "[token]")
    .replace(/\b[A-Za-z0-9_-]{32,}\b/gu, "[redacted-value]")
    .slice(0, 400);
}
