import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function loadLocalEnvironment() {
  let contents;
  try {
    contents = readFileSync(resolve(projectRoot, ".env.local"), "utf8");
  } catch {
    return;
  }

  for (const line of contents.split(/\r?\n/u)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/u);
    if (!match || match[1] in process.env) continue;
    const rawValue = match[2];
    const quote = rawValue[0];
    const value =
      (quote === '"' || quote === "'") && rawValue.at(-1) === quote
        ? rawValue.slice(1, -1)
        : rawValue;
    process.env[match[1]] = value;
  }
}

async function main() {
  loadLocalEnvironment();
  const [emailArgument, fullNameArgument] = process.argv.slice(2);
  const email = emailArgument?.trim().toLowerCase();
  const fullName = fullNameArgument?.trim();
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

  if (!email || !emailPattern.test(email) || !fullName || fullName.length < 2) {
    throw new Error("Usage: pnpm bootstrap:admin -- <confirmed-auth-email> <full-name>");
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local first.",
    );
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let matchedUser;
  for (let page = 1; !matchedUser; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error)
      throw new Error("Could not read Auth users; check local development credentials.");
    matchedUser = data.users.find((user) => user.email?.toLowerCase() === email);
    if (matchedUser || data.users.length < 1000) break;
  }

  if (!matchedUser) {
    throw new Error(
      "Create or invite this identity in Supabase Auth, then run this command again.",
    );
  }

  if (!matchedUser.email_confirmed_at) {
    throw new Error(
      "Confirm this Auth identity before bootstrapping its administrator profile.",
    );
  }

  const { data: customer, error: customerError } = await admin
    .from("customers")
    .select("id")
    .eq("auth_user_id", matchedUser.id)
    .maybeSingle();
  if (customerError)
    throw new Error(
      "Could not check account type; verify the Phase 1 migration is applied.",
    );
  if (customer)
    throw new Error(
      "A customer identity cannot be promoted to staff; use a separate staff identity.",
    );

  const { data: existingStaff, error: staffError } = await admin
    .from("staff_profiles")
    .select("user_id")
    .eq("user_id", matchedUser.id)
    .maybeSingle();
  if (staffError)
    throw new Error(
      "Could not check staff profile; verify the Phase 1 migration is applied.",
    );
  if (existingStaff)
    throw new Error("This identity already has a staff profile; no changes were made.");

  const { error: insertError } = await admin.from("staff_profiles").insert({
    user_id: matchedUser.id,
    full_name: fullName,
    role: "admin",
    is_active: true,
  });
  if (insertError) throw new Error("Could not create the initial administrator profile.");

  console.log("Initial administrator profile created.");
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Initial administrator setup failed.",
  );
  process.exitCode = 1;
});
