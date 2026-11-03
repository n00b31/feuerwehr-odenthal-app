import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFile } from "node:fs/promises";
import { APP, publicPath } from "../src/config/app";
import type { DemoState } from "../src/domain/model";

async function profile(page: Page, name: string) {
  await page.goto(publicPath("/profil"));
  await page.getByRole("button", { name: new RegExp(name) }).click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
}
async function openLive(page: Page) {
  await page.goto(publicPath("/termine"));
  await page.getByRole("button", { name: /Praxisdienst · Technische Hilfe/ }).click();
  return page.getByRole("dialog");
}
async function delegateToAnna(page: Page) {
  await profile(page, "Lukas Weber");
  const dialog = await openLive(page);
  const options = dialog.getByLabel("Verantwortliches Mitglied");
  await expect(options.locator("option")).toHaveCount(51);
  await expect(options.locator('option[value="person-1-0"]')).toHaveCount(0);
  await options.selectOption("person-0-0");
  await dialog.getByRole("button", { name: "Organisator zuweisen", exact: true }).click();
  await expect(dialog.getByText("Verantwortlicher Organisator: Anna Berg", { exact: true })).toBeVisible();
}

test("prefill persists without overwriting manual entries; only confirmation updates statistics and exports", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto(publicPath("/statistik"));
  const total = page.locator(".metric").filter({ hasText: "Tatsächliche Teilnahmen" }).locator(".metric-value");
  await expect(total).toBeVisible();
  const baseline = Number(await total.innerText());
  await page.evaluate((key) => {
    const state: DemoState = JSON.parse(localStorage.getItem(key)!);
    const event = state.events.find((entry) => entry.id === "unit-0-live")!;
    event.responses = { "person-0-0": "yes", "person-0-4": "no", "person-0-5": "maybe" };
    event.attendance = { "person-0-0": "absent" };
    localStorage.setItem(key, JSON.stringify(state));
  }, APP.storageKey);
  await profile(page, "Lukas Weber");
  let dialog = await openLive(page);
  await dialog.getByRole("button", { name: /Anwesenheit \(/ }).click();
  await expect(dialog.getByLabel("Anwesenheit Anna Berg", { exact: true })).toHaveValue("absent");
  await expect(dialog.getByLabel("Anwesenheit Jana Wagner", { exact: true })).toHaveValue("absent");
  await expect(dialog.getByLabel("Anwesenheit Felix Becker", { exact: true })).toHaveValue("unknown");
  await expect(dialog.getByLabel("Anwesenheit Lea Schulz", { exact: true })).toHaveValue("unknown");
  await expect(dialog.getByText("Vorläufig · manuell erfasst", { exact: true })).toHaveCount(1);
  await expect(dialog.getByText("Vorläufig · aus Rückmeldung", { exact: true })).toHaveCount(49);
  await dialog.getByLabel("Anwesenheit Anna Berg", { exact: true }).selectOption("present");
  await page.reload();
  dialog = await openLive(page);
  await dialog.getByRole("button", { name: /Anwesenheit \(/ }).click();
  await expect(dialog.getByLabel("Anwesenheit Anna Berg", { exact: true })).toHaveValue("present");
  expect(await page.evaluate((key) => {
    const state: DemoState = JSON.parse(localStorage.getItem(key)!);
    return state.audit.filter((entry) => entry.action === "Anwesenheit vorläufig vorbelegt" && entry.targetId === "unit-0-live").length;
  }, APP.storageKey)).toBe(1);
  await page.goto(publicPath("/statistik"));
  await page.getByRole("button", { name: "Bereichsstatistik", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "CSV für Excel", exact: true }).click();
  const content = await readFile((await (await download).path())!, "utf8");
  expect(content).toContain('"Anwesend (bestätigt)"');
  const row = content.split("\r\n").find((line) => line.startsWith('"Praxisdienst · Technische Hilfe"'));
  expect(row).toMatch(/;"0";"0";"0";"1";"1";"48";"Nein"$/);
  await profile(page, "Anna Berg");
  await page.goto(publicPath("/statistik"));
  await expect(total).toHaveText(String(baseline));
  await profile(page, "Lukas Weber");
  dialog = await openLive(page);
  await dialog.getByRole("button", { name: /Anwesenheit \(/ }).click();
  await dialog.getByRole("button", { name: "Anwesenheitsliste bestätigen", exact: true }).click();
  await expect(dialog.getByText("Abgeschlossen · Korrekturen möglich", { exact: true })).toBeVisible();
  await profile(page, "Anna Berg");
  await page.goto(publicPath("/statistik"));
  await expect(total).toHaveText(String(baseline + 1));
  await expect(page.getByRole("rowheader", { name: /Praxisdienst · Technische Hilfe/ })).toBeVisible();
});

test("delegated organizer can confirm and correct only their event, with accessible light/dark mobile UI", async ({ page }, info) => {
  test.setTimeout(90_000);
  await delegateToAnna(page);
  await profile(page, "Anna Berg");
  await page.setViewportSize({ width: 390, height: 844 });
  let dialog = await openLive(page);
  await expect(dialog.getByRole("heading", { name: "Planungsübersicht", exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Organisator zuweisen", exact: true })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Nur diesen Termin absagen", exact: true })).toHaveCount(0);
  await dialog.getByRole("button", { name: /Anwesenheit \(/ }).click();
  await expect(dialog.getByLabel("Anwesenheit Anna Berg", { exact: true })).toHaveValue("present");
  for (const theme of ["light", "dark"]) {
    await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(results.violations.map((entry) => ({ id: entry.id, nodes: entry.nodes.map((node) => node.target) }))).toEqual([]);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`delegated-attendance-${theme}.png`) });
  }
  await dialog.getByRole("button", { name: "Anwesenheitsliste bestätigen", exact: true }).click();
  await dialog.getByLabel("Anwesenheit Anna Berg", { exact: true }).selectOption("absent");
  await expect(dialog.getByRole("alert")).toContainText("Korrekturgrund");
  await expect(dialog.getByLabel("Anwesenheit Anna Berg", { exact: true })).toHaveValue("present");
  await dialog.getByLabel(/Korrekturgrund/).fill("Mit Ausbilder vor Ort geprüft");
  await dialog.getByLabel("Anwesenheit Anna Berg", { exact: true }).selectOption("absent");
  await expect(dialog.getByLabel("Anwesenheit Anna Berg", { exact: true })).toHaveValue("absent");
  const entry = await page.evaluate((key) => {
    const state: DemoState = JSON.parse(localStorage.getItem(key)!);
    return state.audit[0];
  }, APP.storageKey);
  expect(entry.action).toBe("Anwesenheit korrigiert");
  expect(entry.actorId).toBe("person-0-0");
  expect(entry.detail).toContain("present → absent; Grund: Mit Ausbilder vor Ort geprüft");
  await page.getByRole("button", { name: "Dialog schließen", exact: true }).click();
  await page.getByRole("button", { name: /Löschangriff im Team/ }).click();
  dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: /Anwesenheit \(/ })).toHaveCount(0);
  await expect(dialog.getByRole("heading", { name: "Planungsübersicht", exact: true })).toHaveCount(0);
  await page.goto(publicPath("/administration"));
  await expect(page.getByRole("heading", { name: "Dieser Bereich ist deiner Leitung vorbehalten.", exact: true })).toBeVisible();
});

test("revocation removes delegation and hides an already-open attendance panel immediately", async ({ page }) => {
  await delegateToAnna(page);
  await profile(page, "Anna Berg");
  let dialog = await openLive(page);
  await dialog.getByRole("button", { name: /Anwesenheit \(/ }).click();
  await expect(dialog.getByRole("button", { name: "Anwesenheitsliste bestätigen", exact: true })).toBeEnabled();
  await page.evaluate((key) => {
    const state: DemoState = JSON.parse(localStorage.getItem(key)!);
    delete state.events.find((entry) => entry.id === "unit-0-live")!.delegatedOrganizerId;
    localStorage.setItem(key, JSON.stringify(state));
    window.dispatchEvent(new StorageEvent("storage", { key }));
  }, APP.storageKey);
  await expect(dialog.getByRole("button", { name: /Anwesenheit \(/ })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Anwesenheitsliste bestätigen", exact: true })).toHaveCount(0);
  await expect(dialog.getByRole("heading", { name: "Planungsübersicht", exact: true })).toHaveCount(0);
  await delegateToAnna(page);
  dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Delegation widerrufen", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Delegation widerrufen", exact: true })).toHaveCount(0);
  await page.reload();
  await profile(page, "Anna Berg");
  dialog = await openLive(page);
  await expect(dialog.getByRole("button", { name: /Anwesenheit \(/ })).toHaveCount(0);
  expect(await page.evaluate((key) => {
    const state: DemoState = JSON.parse(localStorage.getItem(key)!);
    return state.audit.find((entry) => entry.action === "Delegation widerrufen")?.actorId;
  }, APP.storageKey)).toBe("person-0-1");
});

test("an open list prepares at service start; failed persistence stays blocked and can be retried", async ({ page }) => {
  test.setTimeout(60_000);
  await page.clock.install({ time: new Date("2026-11-03T18:00:00Z") });
  await page.clock.pauseAt(new Date("2026-11-03T18:00:01Z"));
  await profile(page, "Lukas Weber");
  await page.evaluate((key) => {
    const state: DemoState = JSON.parse(localStorage.getItem(key)!);
    const event = state.events.find((entry) => entry.id === "unit-0-next")!;
    event.startsAt = "2026-11-03T18:00:10.000Z";
    event.endsAt = "2026-11-03T20:00:10.000Z";
    delete event.deadline;
    event.responses["person-0-0"] = "yes";
    localStorage.setItem(key, JSON.stringify(state));
    window.dispatchEvent(new StorageEvent("storage", { key }));
    const original = Storage.prototype.setItem;
    sessionStorage.setItem("block-attendance-save", "yes");
    Storage.prototype.setItem = function (name, value) {
      if (name === key && sessionStorage.getItem("block-attendance-save")) throw new DOMException("Test: Speicher voll", "QuotaExceededError");
      original.call(this, name, value);
    };
  }, APP.storageKey);
  // Keep the simulated failing storage wrapper through client navigation.
  await page.getByRole("navigation", { name: "Hauptnavigation" }).getByRole("link", { name: "Termine", exact: true }).click();
  await page.getByRole("button", { name: /Löschangriff im Team/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: /Anwesenheit \(/ }).click();
  await expect(dialog.getByRole("button", { name: "Anwesenheitsliste bestätigen", exact: true })).toBeDisabled();
  await page.clock.fastForward(20_000);
  await expect(dialog.getByRole("alert")).toContainText("Nicht gespeichert: Test: Speicher voll");
  await expect(dialog.getByRole("button", { name: "Anwesenheitsliste bestätigen", exact: true })).toBeDisabled();
  await page.evaluate(() => sessionStorage.removeItem("block-attendance-save"));
  await dialog.getByRole("button", { name: "Vorbelegung erneut versuchen", exact: true }).click();
  await expect(dialog.getByLabel("Anwesenheit Anna Berg", { exact: true })).toHaveValue("present");
  await expect(dialog.getByRole("button", { name: "Anwesenheitsliste bestätigen", exact: true })).toBeEnabled();
  expect(await page.evaluate((key) => {
    const state: DemoState = JSON.parse(localStorage.getItem(key)!);
    return state.audit.filter((entry) => entry.targetId === "unit-0-next" && entry.action === "Anwesenheit vorläufig vorbelegt").length;
  }, APP.storageKey)).toBe(1);
});
