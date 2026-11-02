import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { APP, publicPath } from "../src/config/app";

const pageErrors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
});
test.afterEach(({ page }) => { expect(pageErrors.get(page)).toEqual([]); });

async function profile(page: Page, name: string) {
  await page.goto(publicPath("/profil"));
  await page.getByRole("button", { name: new RegExp(name) }).click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
}
test("member workflow: response, persistence, scoped documents and start lock", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(publicPath("/"));
  await expect(page.getByRole("heading", { name: /Hallo Anna/ })).toBeVisible();
  await page.getByRole("button", { name: /Zum Dienst & Rückmeldung/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Zugesagt", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Zugesagt", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await page.getByRole("button", { name: /Zum Dienst & Rückmeldung/ }).click();
  await expect(page.getByRole("dialog").getByRole("button", { name: "Zugesagt", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Dialog schließen" }).click();
  await page.goto(publicPath("/termine"));
  await page.getByRole("button", { name: /Praxisdienst · Technische Hilfe/ }).click();
  await expect(page.getByRole("dialog").getByRole("button", { name: "Zugesagt", exact: true })).toBeDisabled();
  await expect(page.getByText("Seit Dienstbeginn sind Rückmeldungen gesperrt.")).toBeVisible();
  await page.getByRole("button", { name: "Dialog schließen" }).click();
  await page.goto(publicPath("/dokumente"));
  await expect(page.getByRole("heading", { name: "Leitungsunterlagen" })).toHaveCount(0);
  await page.getByRole("button", { name: /Demo-Link erklären/ }).first().click();
  await expect(page.getByRole("heading", { name: "Hier würde SharePoint öffnen" })).toBeVisible();
  expect(errors).toEqual([]);
});
test("unit administration records, finalizes, corrects and audits actual attendance", async ({ page }) => {
  await profile(page, "Lukas Weber");
  await page.goto(publicPath("/administration"));
  await page.getByRole("button", { name: /Praxisdienst · Technische Hilfe/ }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: /Anwesenheit \(/ }).click();
  await dialog.getByLabel("Anwesenheit Anna Berg", { exact: true }).selectOption("present");
  await expect(dialog.getByText("1 anwesend", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Anwesenheitsliste abschließen" }).click();
  await expect(dialog.getByText("Abgeschlossen · Korrekturen möglich")).toBeVisible();
  await dialog.getByLabel(/Korrekturgrund/).fill("Korrigiert nach Prüfung vor Ort");
  await dialog.getByLabel("Anwesenheit Anna Berg", { exact: true }).selectOption("absent");
  await expect(dialog.getByText("1 abwesend", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Dialog schließen" }).click();
  await page.getByRole("button", { name: "Änderungsprotokoll" }).click();
  await expect(page.getByText("Anwesenheit korrigiert", { exact: true })).toBeVisible();
  await expect(page.getByText(/present → absent.*Korrigiert/)).toBeVisible();
});
test("series creation, instance edit, scoped function admin and global configuration", async ({ page }) => {
  await profile(page, "Lukas Weber");
  await page.goto(publicPath("/termine"));
  await page.getByRole("button", { name: "Termin erstellen" }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Titel", { exact: true }).fill("Browser-Test Serie");
  await dialog.getByLabel("Ort", { exact: true }).fill("Übungsplatz");
  await dialog.getByLabel("Wiederholung").selectOption("weekly");
  await dialog.getByLabel("Anzahl der Instanzen").fill("3");
  await dialog.getByRole("button", { name: "Termin(e) erstellen" }).click();
  await expect(page.getByRole("heading", { name: "Browser-Test Serie", exact: true })).toHaveCount(3);
  await page.getByRole("button", { name: /Browser-Test Serie/ }).first().click();
  await page.getByRole("button", { name: "Diese Instanz bearbeiten" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Titel", { exact: true }).fill("Browser-Test Einzelinstanz");
  await dialog.getByRole("button", { name: "Instanz speichern" }).click();
  await expect(page.getByRole("dialog").getByRole("heading", { name: "Browser-Test Einzelinstanz", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Dialog schließen" }).click();
  await expect(page.getByRole("heading", { name: "Browser-Test Serie", exact: true })).toHaveCount(2);
  await profile(page, "Miriam Keller");
  await page.goto(publicPath("/administration"));
  await expect(page.getByRole("button", { name: "Globale Einstellungen" })).toHaveCount(0);
  await page.getByRole("button", { name: "Termin erstellen" }).click();
  await expect(page.getByRole("dialog").getByLabel("Bereich")).toHaveValue("function:breathing");
  await expect(page.getByRole("dialog").getByLabel("Bereich").locator("option")).toHaveCount(1);
  await page.getByRole("button", { name: "Dialog schließen" }).click();
  await profile(page, "Thomas Hoffmann");
  await page.goto(publicPath("/administration"));
  await page.getByRole("button", { name: "Globale Einstellungen" }).click();
  await page.getByRole("combobox", { name: "Art", exact: true }).selectOption("addFunction");
  await page.getByLabel("Name", { exact: true }).fill("Browser-Test Ausbildung");
  await page.getByRole("button", { name: "Anlegen" }).click();
  await expect(page.getByText("Browser-Test Ausbildung", { exact: true })).toBeVisible();
});
test("statistics export, mobile layout, manifest and offline fallback", async ({ page, context }) => {
  await page.goto(publicPath("/statistik"));
  await expect(page.getByRole("heading", { name: "Dein Engagement in Zahlen" })).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "CSV für Excel" }).click();
  expect((await download).suggestedFilename()).toMatch(/feuerwehr-demo-statistik-\d{4}\.csv/);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ["/", "/termine", "/dokumente", "/statistik", "/profil"]) {
    await page.goto(publicPath(path));
    await expect(page.getByRole("navigation", { name: "Mobile Navigation" })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  const manifest = await page.request.get(publicPath("/manifest.webmanifest"));
  expect(manifest.status()).toBe(200);
  expect((await manifest.json()).icons).toHaveLength(3);
  expect((await manifest.json()).start_url).toBe(publicPath("/"));
  const icons = (await manifest.json()).icons as { src: string }[];
  for (const icon of icons) expect((await page.request.get(icon.src)).status()).toBe(200);
  expect((await page.request.get(publicPath("/nicht-vorhanden"))).status()).toBe(404);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true);
  await page.goto(publicPath("/offline-check"));
  await expect(page.getByRole("heading", { name: "Die Demo ist gerade nicht erreichbar." })).toBeVisible();
  await context.setOffline(false);
});
test("global administration adds documents, assigns multiple roles and transfers a member without losing history", async ({ page }) => {
  await profile(page, "Thomas Hoffmann");
  await page.goto(publicPath("/dokumente"));
  await page.getByRole("button", { name: "Bereich hinzufügen" }).click();
  await page.getByRole("dialog").getByLabel("Name", { exact: true }).fill("Browser-Test Unterlagen");
  await page.getByRole("dialog").getByRole("button", { name: "Bereich speichern" }).click();
  await expect(page.getByRole("heading", { name: "Browser-Test Unterlagen" })).toBeVisible();
  const before = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).events.filter((e: { attendance: Record<string, string> }) => e.attendance["person-0-0"] === "present").length, APP.storageKey);
  await page.goto(publicPath("/administration"));
  await page.getByRole("button", { name: "Mitglieder", exact: true }).click();
  await page.getByRole("button", { name: "Anna Berg bearbeiten", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox", { name: "Einheit", exact: true }).selectOption("unit-1");
  await dialog.getByRole("button", { name: "Einheitszuordnung speichern" }).click();
  await dialog.getByLabel("Einheitsadministration · Odenthal", { exact: true }).check();
  await dialog.getByRole("button", { name: "Rollen speichern" }).click();
  await page.getByRole("button", { name: "Dialog schließen" }).click();
  await profile(page, "Anna Berg");
  await expect(page.getByText("Einheitsadministration · Odenthal", { exact: true })).toBeVisible();
  await expect(page.getByText("Scheuren · seit", { exact: false })).toBeVisible();
  const after = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).events.filter((e: { attendance: Record<string, string> }) => e.attendance["person-0-0"] === "present").length, APP.storageKey);
  expect(after).toEqual(before);
});
test("storage corruption is explicit, reset recovers, and failed saves do not claim success", async ({ page }) => {
  await page.goto(publicPath("/"));
  await expect(page.getByRole("heading", { name: /Hallo Anna/ })).toBeVisible();
  await page.evaluate((key) => localStorage.setItem(key, "{invalid"), APP.storageKey);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Lokaler Speicher nicht verfügbar" })).toBeVisible();
  await page.getByRole("button", { name: "Demo-Speicher zurücksetzen" }).click();
  await expect(page.getByRole("heading", { name: /Hallo Anna/ })).toBeVisible();
  await page.getByRole("button", { name: /Zum Dienst & Rückmeldung/ }).click();
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException("Test: Speicher voll", "QuotaExceededError"); }; });
  await page.getByRole("dialog").getByRole("button", { name: "Zugesagt", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("Nicht gespeichert: Test: Speicher voll");
  await expect(page.getByRole("dialog").getByRole("button", { name: "Zugesagt", exact: true })).toHaveAttribute("aria-pressed", "false");
});
test("WCAG automated accessibility on main screens in light and dark themes; keyboard modal", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const theme of ["light", "dark"]) {
    for (const route of ["/", "/termine", "/dokumente", "/statistik", "/profil"]) {
      await page.goto(publicPath(route));
      await expect(page.locator("#main")).toBeVisible();
      await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      expect.soft(results.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })) })), `${theme} ${route}`).toEqual([]);
    }
  }
  await page.goto(publicPath("/"));
  await page.getByRole("button", { name: /Zum Dienst & Rückmeldung/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
test("administration and attendance dialogs are accessible in both themes and on narrow screens", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await profile(page, "Thomas Hoffmann");
  for (const theme of ["light", "dark"]) {
    await page.goto(publicPath("/administration"));
    await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
    for (const panel of ["Übersicht", "Mitglieder", "Änderungsprotokoll", "Globale Einstellungen"]) {
      await page.getByRole("button", { name: panel, exact: true }).click();
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      expect.soft(results.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })), `${theme} ${panel}`).toEqual([]);
    }
  }
  await page.getByRole("button", { name: "Übersicht", exact: true }).click();
  await page.getByRole("button", { name: /Praxisdienst · Technische Hilfe/ }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: /Anwesenheit \(/ }).click();
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(results.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) }))).toEqual([]);
  await page.setViewportSize({ width: 320, height: 740 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.keyboard.press("Escape");
  for (const panel of ["Übersicht", "Mitglieder", "Änderungsprotokoll", "Globale Einstellungen"]) {
    await page.getByRole("button", { name: panel, exact: true }).click();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});
