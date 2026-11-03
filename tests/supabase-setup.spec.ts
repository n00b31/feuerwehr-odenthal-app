import { test, expect } from "@playwright/test";
import { publicPath } from "../src/config/app";

test("missing DEV configuration never opens the demo or a protected route", async ({ page }) => {
  for (const route of ["/", "/administration/", "/termine/", "/auth/callback/"]) {
    const response = await page.goto(publicPath(route));
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: "Supabase DEV noch nicht eingerichtet" })).toBeVisible();
    await expect(page.getByText(/Hallo Anna|Profilwechsel ohne Anmeldung/)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Anmelden", exact: true })).toHaveCount(0);
  }
  expect(await page.evaluate(() => Object.keys(localStorage).some((key) => key.startsWith("ff-odenthal-demo-v1")))).toBe(false);
});
