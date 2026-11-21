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

const expectedProjectRef = "xjzdcpuwrjnpjzntytjs";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY;

if (!url || !publishableKey || !secretKey) {
  console.error(
    "Supabase verification failed: required local environment is incomplete.",
  );
  process.exit(1);
}

const endpoint = new URL(url);
const projectMatches = endpoint.hostname === `${expectedProjectRef}.supabase.co`;
if (!projectMatches) {
  console.error(
    "Supabase verification failed: endpoint does not match the GrandPa development project.",
  );
  process.exit(1);
}
if (!publishableKey.startsWith("sb_publishable_")) {
  console.error(
    "Supabase verification failed: browser key is not in publishable-key format.",
  );
  process.exit(1);
}
if (!secretKey.startsWith("sb_secret_")) {
  console.error("Supabase verification failed: server key is not in secret-key format.");
  process.exit(1);
}

const browserClient = createClient(url, publishableKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const adminClient = createClient(url, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

console.log(`GrandPa development endpoint match: ${projectMatches}`);
console.log(`Browser publishable client initialized: ${Boolean(browserClient.auth)}`);
const { error: adminError } = await adminClient.auth.admin.listUsers({
  page: 1,
  perPage: 1,
});
if (adminError) {
  if (/invalid api key/i.test(adminError.message)) {
    console.error(
      "Supabase Admin API rejected the configured secret key: Invalid API key.",
    );
  } else {
    console.error(
      "Supabase Admin API verification failed; response details were withheld.",
    );
  }
  process.exit(1);
}
console.log("Server Admin API authentication: successful (response data withheld).");

try {
  const browserResponse = await fetch(`${url}/auth/v1/settings`, {
    headers: { apikey: publishableKey },
  });
  console.log(`Browser Auth endpoint: HTTP ${browserResponse.status}`);
  if (!browserResponse.ok) process.exitCode = 1;
} catch {
  console.error("Browser Auth endpoint could not be reached from this environment.");
  process.exitCode = 1;
}
