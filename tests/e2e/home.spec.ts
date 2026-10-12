import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";

test("homepage offers sign-in and customer registration", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Welcome to Grand Pa’s" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in" })).toHaveAttribute(
    "href",
    "/login",
  );
  await expect(
    page.getByRole("link", { name: "Create customer account" }),
  ).toHaveAttribute("href", "/register");
});

test("PWA manifest is available with install metadata", async ({ page }) => {
  const response = await page.request.get("/manifest.webmanifest");
  expect(response.ok()).toBeTruthy();

  const manifest = await response.json();
  expect(manifest.name).toBe("Grand Pa’s Cold Store");
  expect(manifest.start_url).toBe("/");
  expect(manifest.display).toBe("standalone");
  expect(manifest.icons).toContainEqual(
    expect.objectContaining({ src: "/icon.svg", type: "image/svg+xml" }),
  );
});

test("service worker response supports safe updates", async ({ page }) => {
  const response = await page.request.get("/service-worker.js");
  expect(response.ok()).toBeTruthy();
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect(response.headers()["content-type"]).toContain("application/javascript");
});

test("anonymous visitors cannot open the staff workspace", async ({ page }) => {
  await page.goto("/staff");
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("anonymous visitors cannot open a customer account", async ({ page }) => {
  await page.goto("/account");
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("login form rejects unknown credentials through Supabase Auth", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(`missing-${randomUUID()}@example.test`);
  await page.getByLabel("Password").fill("not-a-real-password-123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(
    page.getByText("We could not sign you in with those details."),
  ).toBeVisible();
});

test("customer registration collects customer details without a staff role field", async ({
  page,
}) => {
  await page.goto("/register");
  await expect(page.getByLabel("Full name")).toBeVisible();
  await expect(page.getByLabel("Phone number")).toBeVisible();
  await expect(page.getByLabel("Email address")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
  await expect(page.locator('form select[name="role"]')).toHaveCount(0);
  await expect(page.locator('form input[name="role"]')).toHaveCount(0);
});

test("password recovery screens are reachable and labelled", async ({ page }) => {
  await page.goto("/forgot-password");
  await expect(page.getByLabel("Email address")).toBeVisible();
  await expect(page.getByRole("button", { name: "Send reset link" })).toBeVisible();

  await page.goto("/reset-password");
  await expect(page.getByLabel("New password", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Confirm new password", { exact: true })).toBeVisible();
});

test("production service worker caches only the public foundation shell", async ({
  page,
  context,
}) => {
  test.skip(
    process.env.PLAYWRIGHT_PRODUCTION !== "1",
    "Runs against production mode only.",
  );

  await page.goto("/");
  await page.waitForFunction(async () =>
    Boolean(await navigator.serviceWorker.getRegistration()),
  );
  const worker = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    return {
      scope: registration.scope,
      scriptURL: registration.active?.scriptURL,
      controlled: Boolean(navigator.serviceWorker.controller),
    };
  });

  expect(worker.scope).toBe("http://127.0.0.1:3000/");
  expect(worker.scriptURL).toContain("/service-worker.js");
  await page.reload();
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Welcome to Grand Pa’s" }),
  ).toBeVisible();
  await context.setOffline(false);
});
