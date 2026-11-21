import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const expectedProjectRef = "xjzdcpuwrjnpjzntytjs";

function loadLocalEnvironment() {
  let contents;
  try {
    contents = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
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

function requiredEnvironment(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing local ${name} configuration.`);
  return value;
}

function milliunits(value) {
  const [whole = "0", fraction = ""] = String(value).split(".");
  return (
    BigInt(whole) * BigInt(1000) + BigInt(fraction.padEnd(3, "0").slice(0, 3) || "0")
  );
}

async function main() {
  loadLocalEnvironment();
  const url = requiredEnvironment("NEXT_PUBLIC_SUPABASE_URL");
  const projectRef = new URL(url).hostname.split(".")[0];
  if (projectRef !== expectedProjectRef) {
    throw new Error(
      "Refusing to run Phase 2 concurrency verification outside the GrandPa development project.",
    );
  }

  const publishableKey = requiredEnvironment("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  const secretKey = requiredEnvironment("SUPABASE_SECRET_KEY");
  const marker = randomUUID().replaceAll("-", "").slice(0, 12);
  const name = `Phase 2 Concurrency ${marker}`;
  const email = `phase2-concurrency-${marker}@example.test`;
  const password = randomBytes(32).toString("base64url");
  const slug = `phase-2-concurrency-${marker}`;
  const sku = `P2CON-${marker}`;
  const admin = createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const staff = createClient(url, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  let userId;
  let categoryId;
  let productId;
  let successful = false;

  try {
    const { data: userData, error: userError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: name },
    });
    if (userError || !userData.user)
      throw new Error("Could not create a temporary development staff identity.");
    userId = userData.user.id;

    const { data: category, error: categoryError } = await admin
      .from("categories")
      .insert({ name, slug })
      .select("id")
      .single();
    if (categoryError || !category)
      throw new Error("Could not create a temporary development category.");
    categoryId = category.id;

    const { data: product, error: productError } = await admin
      .from("products")
      .insert({
        category_id: categoryId,
        sku,
        name,
        selling_price: "1.00",
        reorder_level: "0.000",
      })
      .select("id")
      .single();
    if (productError || !product)
      throw new Error("Could not create a temporary development product.");
    productId = product.id;

    const { error: profileError } = await admin.from("staff_profiles").insert({
      user_id: userId,
      full_name: name,
      role: "manager",
      is_active: true,
    });
    if (profileError)
      throw new Error("Could not assign the temporary development staff role.");

    const { error: signInError } = await staff.auth.signInWithPassword({
      email,
      password,
    });
    if (signInError)
      throw new Error("Could not authenticate the temporary development staff identity.");

    const opening = await staff.rpc("record_stock_movement", {
      p_product_id: productId,
      p_movement_type: "receipt",
      p_quantity: "100.000",
      p_reason: "Isolated concurrency verification baseline",
      p_client_operation_id: randomUUID(),
    });
    if (opening.error)
      throw new Error("Could not establish the development concurrency-test baseline.");

    const concurrentResults = await Promise.all([
      staff.rpc("record_stock_movement", {
        p_product_id: productId,
        p_movement_type: "receipt",
        p_quantity: "0.125",
        p_reason: "Concurrent request one",
        p_client_operation_id: randomUUID(),
      }),
      staff.rpc("record_stock_movement", {
        p_product_id: productId,
        p_movement_type: "receipt",
        p_quantity: "0.250",
        p_reason: "Concurrent request two",
        p_client_operation_id: randomUUID(),
      }),
    ]);
    if (concurrentResults.some(({ error }) => error)) {
      throw new Error("At least one concurrent inventory operation was rejected.");
    }

    const [
      { data: balance, error: balanceError },
      { data: movements, error: movementError },
    ] = await Promise.all([
      admin
        .from("inventory_balances")
        .select("quantity")
        .eq("product_id", productId)
        .single(),
      admin.from("stock_movements").select("quantity_delta").eq("product_id", productId),
    ]);
    if (balanceError || movementError || !balance || !movements) {
      throw new Error("Could not verify the concurrency-test stock ledger.");
    }
    const ledgerTotal = movements.reduce(
      (sum, movement) => sum + milliunits(movement.quantity_delta),
      BigInt(0),
    );
    if (
      milliunits(balance.quantity) !== BigInt(100375) ||
      ledgerTotal !== BigInt(100375) ||
      movements.length !== 3
    ) {
      throw new Error(
        "Concurrent inventory updates did not match the expected balance and movement total.",
      );
    }
    successful = true;
    process.stdout.write("Phase 2 hosted development concurrency verification: PASS\n");
    process.stdout.write("Two overlapping authenticated stock requests: both accepted\n");
    process.stdout.write("Expected balance and movement-ledger total (100.375): match\n");
  } finally {
    await staff.auth.signOut();
    if (productId) {
      const { error } = await admin
        .from("products")
        .update({ is_active: false })
        .eq("id", productId);
      if (error)
        throw new Error(
          "Concurrency verification product could not be safely deactivated.",
        );
    }
    if (categoryId) {
      const { error } = await admin
        .from("categories")
        .update({ is_active: false })
        .eq("id", categoryId);
      if (error)
        throw new Error(
          "Concurrency verification category could not be safely deactivated.",
        );
    }
    if (userId) {
      const { error: profileError } = await admin
        .from("staff_profiles")
        .delete()
        .eq("user_id", userId);
      if (profileError)
        throw new Error("Concurrency verification staff profile could not be removed.");
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error)
        throw new Error(
          `Concurrency verification staff identity could not be removed (Auth error: ${error.name ?? "unknown"}; status ${error.status ?? "unknown"}).`,
        );
    }
    if (!successful)
      process.stderr.write(
        "Phase 2 hosted development concurrency verification: FAIL (sanitized)\n",
      );
  }
}

main().catch((error) => {
  const safeMessage =
    error instanceof Error ? error.message : "Unexpected verification failure.";
  process.stderr.write(`${safeMessage}\n`);
  process.exitCode = 1;
});
