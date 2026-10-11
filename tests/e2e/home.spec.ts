import { expect, test } from "@playwright/test";

test("homepage renders the foundation heading", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Grand Pa’s Cold Store" }),
  ).toBeVisible();
  await expect(page.getByText("System Foundation Ready")).toBeVisible();
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
    page.getByRole("heading", { name: "Grand Pa’s Cold Store" }),
  ).toBeVisible();
  await context.setOffline(false);
});
