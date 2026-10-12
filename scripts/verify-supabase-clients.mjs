import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

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

loadLocalEnvironment();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !publicKey || !serviceRoleKey) {
  console.error(
    "Supabase verification failed: required local environment is incomplete.",
  );
  process.exit(1);
}

const browserClient = createClient(url, publicKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const browserResponse = await fetch(`${url}/auth/v1/settings`, {
  headers: { apikey: publicKey },
});
const adminClient = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

console.log(`Browser public client initialized: ${Boolean(browserClient.auth)}`);
console.log(`Browser public Auth endpoint: HTTP ${browserResponse.status}`);
console.log(
  `Server admin client initialized: ${typeof adminClient.auth.admin.listUsers === "function"}`,
);
console.log("No credentials or account data were printed.");

if (!browserResponse.ok || !adminClient.auth.admin.listUsers) process.exit(1);
