import { test, expect, devices } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import sharp from "sharp";
import { APP, publicPath } from "../src/config/app";
import { THEME_STORAGE_KEY } from "../src/config/theme";

test("home response is one tap, persists, and never changes actual attendance", async ({ page }) => {
  await page.goto(publicPath("/"));
  const service = page.getByRole("region", { name: "Dein nächster Dienst", exact: true });
  await expect(service.getByRole("button", { name: "Ich komme", exact: true })).toBeVisible();
  const attendance = await page.evaluate((key) => JSON.stringify(JSON.parse(localStorage.getItem(key)!).events.map((event: { attendance: Record<string, string> }) => event.attendance)), APP.storageKey);
  for (const label of ["Ich komme", "Ich kann nicht", "Vielleicht"]) {
    await service.getByRole("button", { name: label, exact: true }).click();
    await expect(service.getByRole("button", { name: label, exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
  await page.reload();
  await expect(service.getByRole("button", { name: "Vielleicht", exact: true })).toHaveAttribute("aria-pressed", "true");
  const after = await page.evaluate((key) => JSON.stringify(JSON.parse(localStorage.getItem(key)!).events.map((event: { attendance: Record<string, string> }) => event.attendance)), APP.storageKey);
  expect(after).toBe(attendance);
  await page.evaluate((key) => {
    const state = JSON.parse(localStorage.getItem(key)!);
    const next = state.events.filter((event: { type: string; startsAt: string; status: string; roster: { userId: string }[] }) => ["regular", "special"].includes(event.type) && event.status !== "cancelled" && Date.parse(event.startsAt) > Date.now() && event.roster.some((person) => person.userId === "person-0-0")).sort((a: { startsAt: string }, b: { startsAt: string }) => a.startsAt.localeCompare(b.startsAt))[0];
    next.deadline = new Date(Date.now() - 1000).toISOString();
    localStorage.setItem(key, JSON.stringify(state));
  }, APP.storageKey);
  await page.reload();
  await expect(service.getByRole("button", { name: "Ich komme", exact: true })).toBeDisabled();
  await expect(service.getByText("Der Anmeldeschluss ist erreicht.")).toBeVisible();
});

test("theme follows system, saves manual preference, and synchronizes another tab", async ({ page, context }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto(publicPath("/profil"));
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const options = page.getByRole("group", { name: "Farbschema", exact: true });
  await options.getByRole("button", { name: "Hell", exact: true }).click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(options.getByRole("button", { name: "Hell", exact: true })).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate((key) => localStorage.getItem(key), THEME_STORAGE_KEY)).toBe("light");
  const other = await context.newPage();
  await other.goto(publicPath("/"));
  await expect(other.locator("html")).toHaveAttribute("data-theme", "light");
  await options.getByRole("button", { name: "Dunkel", exact: true }).click();
  await expect(other.locator("html")).toHaveAttribute("data-theme", "dark");
  await options.getByRole("button", { name: "System", exact: true }).click();
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await other.close();
});

test("failed theme persistence is reported, not presented as saved", async ({ page }) => {
  await page.goto(publicPath("/profil"));
  await expect(page.getByRole("heading", { name: "Darstellung", exact: true })).toBeVisible();
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException("Test", "QuotaExceededError"); }; });
  await page.getByRole("group", { name: "Farbschema", exact: true }).getByRole("button", { name: "Dunkel", exact: true }).click();
  await expect(page.locator("#main").getByRole("alert")).toContainText("nur für diese Sitzung");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("original branding, padded PWA icons and repository paths are valid", async ({ page }) => {
  await page.goto(publicPath("/"));
  const logo = page.getByRole("banner").getByRole("img", { name: "Feuerwehr Odenthal", exact: true });
  await expect(logo).toBeVisible();
  await expect(logo).toHaveAttribute("src", publicPath("/branding/feuerwehr-odenthal-logo.png"));
  await expect.poll(() => logo.evaluate((image: HTMLImageElement) => [image.naturalWidth, image.naturalHeight])).toEqual([300, 100]);
  const manifest = await (await page.request.get(publicPath("/manifest.webmanifest"))).json();
  expect(manifest.scope).toBe(publicPath("/"));
  for (const [file, size] of [["icon-192", 192], ["icon-512", 512], ["maskable-512", 512], ["apple-touch-icon", 180], ["favicon-32", 32]] as const) {
    const response = await page.request.get(publicPath(`/icons/${file}.png`));
    expect(response.status()).toBe(200);
    const png = await response.body();
    expect(png.subarray(1, 4).toString()).toBe("PNG");
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([size, size]);
    if (file === "maskable-512") {
      const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      const background = [data[0], data[1], data[2]];
      let outside = 0;
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const index = (y * size + x) * info.channels;
        const motif = background.some((value, channel) => Math.abs(data[index + channel] - value) > 20);
        if (motif && Math.hypot(x - (size - 1) / 2, y - (size - 1) / 2) > size * .4) outside++;
      }
      expect(outside, "Original motif must fit inside the maskable 80%-diameter safe circle").toBe(0);
    }
  }
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute("href", publicPath("/icons/favicon-32.png"));
});

test("touch layouts, active navigation, mobile drawer and both themes remain accessible", async ({ page }, info) => {
  test.setTimeout(90_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const width of [320, 390, 412]) {
    await page.setViewportSize({ width, height: 844 });
    for (const theme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: theme });
      for (const route of ["/", "/termine", "/dokumente", "/statistik", "/profil"]) {
        await page.goto(publicPath(route));
        await expect(page.locator("#main")).toBeVisible();
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        const nav = page.getByRole("navigation", { name: "Mobile Navigation" });
        await expect(nav.locator('a[aria-current="page"]')).toHaveCount(1);
        const targets = await nav.locator("a").evaluateAll((links) => links.map((link) => ({ width: link.getBoundingClientRect().width, height: link.getBoundingClientRect().height })));
        expect(targets.every((target) => target.width >= 44 && target.height >= 44)).toBe(true);
      }
      if (width === 390) {
        await page.goto(publicPath("/"));
        await expect(page.getByRole("heading", { name: /Hallo Anna/ })).toBeVisible();
        const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
        expect(results.violations.map((violation) => ({ id: violation.id, nodes: violation.nodes.map((node) => node.target) }))).toEqual([]);
        await page.screenshot({ path: info.outputPath(`mobile-${theme}.png`), fullPage: true });
      }
    }
  }
  await page.getByRole("button", { name: "Menü öffnen" }).click();
  const drawer = page.getByRole("dialog", { name: "Navigation" });
  await expect(drawer).toBeVisible();
  await expect.poll(() => drawer.evaluate((dialog) => dialog.contains(document.activeElement))).toBe(true);
  await drawer.getByRole("link", { name: "Termine", exact: true }).click();
  await expect(drawer).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Dein Dienstplan" })).toBeVisible();
  await page.getByRole("button", { name: "Menü öffnen" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Menü öffnen" })).toBeFocused();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(publicPath("/"));
  await expect(page.getByRole("complementary")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Mobile Navigation" })).toBeHidden();
  await page.screenshot({ path: info.outputPath("desktop-dark.png"), fullPage: true });
});

test("iPhone and Android Chromium emulation support direct touch interactions", async ({ browser, baseURL }, info) => {
  for (const device of ["iPhone 13", "Pixel 7"]) {
    const context = await browser.newContext({ ...devices[device], baseURL });
    const page = await context.newPage();
    await page.goto(publicPath("/"));
    const service = page.getByRole("region", { name: "Dein nächster Dienst", exact: true });
    await service.getByRole("button", { name: "Ich komme", exact: true }).tap();
    await expect(service.getByRole("button", { name: "Ich komme", exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("navigation", { name: "Mobile Navigation" }).getByRole("link", { name: "Termine", exact: true }).tap();
    await expect(page.getByRole("heading", { name: "Dein Dienstplan" })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`${device.replaceAll(" ", "-")}.png`), fullPage: true });
    await context.close();
  }
});
