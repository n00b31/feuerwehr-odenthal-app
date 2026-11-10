import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {emptyInbox} from "./notification-fixture";
import { readFile } from "node:fs/promises";
import { publicPath } from "../src/config/app";
import type { ReportQuery, ReportMetrics } from "../src/domain/dev-reports";

const api = "https://syntheticci.supabase.co";
const actor = "11000000-0000-4000-8000-000000000001";
const unit = "21000000-0000-4000-8000-000000000001";
const other = "21000000-0000-4000-8000-000000000002";
const seedPerson = "41000000-0000-4000-8000-000000000001";
const units = [unit, other, ...[3,4,5].map((n) => `21000000-0000-4000-8000-00000000000${n}`)]
  .map((id, i) => ({ id, name: i===0 ? "Scheuren" : `Synthetic Einheit ${i+1}` }));
const metrics: ReportMetrics = { services: 2, practices: 2, training_services: 2, eligible: 2,
  present: 1, absent: 1, training_present: 1, training_absent: 1, unknown: 0,
  training_hours: 2, service_hours: 4, participant_hours: 2, rate: 50, average_attendance: 0.5,
  pending: 1, excluded: 0, missing_roster: 0 };
const empty: ReportMetrics = { services: 0, practices: 0, training_services: 0, eligible: 0,
  present: 0, absent: 0, training_present: 0, training_absent: 0, unknown: 0,
  training_hours: 0, service_hours: 0, participant_hours: 0, rate: null, average_attendance: null,
  pending: 0, excluded: 0, missing_roster: 0 };

// Intercepted protocol fixtures only. PostgreSQL tests separately prove authorization and arithmetic.
async function connect(page: Page, role: "MEMBER" | "UNIT_ADMIN" | "FIRE_CHIEF" | "GLOBAL_ADMIN") {
  const state = { allowed: true, fail: false, contextYear: 2026, accessChecks: 0, calls: [] as string[], queries: [] as ReportQuery[] };
  const overseer = role==="FIRE_CHIEF" || role==="GLOBAL_ADMIN";
  const user = { id: actor, aud: "authenticated", role: "authenticated",
    email: "synthetic.report.browser@feuerwehr-odenthal.de", email_confirmed_at: new Date().toISOString(),
    created_at: new Date().toISOString(), app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: { display_name: "Synthetic Reporter" } };
  await page.context().route(`${api}/**`, async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    state.calls.push(pathname);
    const respond = (data: unknown, status = 200) => route.fulfill({ status,
      contentType: "application/json", headers: { "access-control-allow-origin": "*", "x-supabase-api-version": "2024-01-01" },
      body: JSON.stringify(data) });
    const denied = () => respond({ code: "42501", message: "Synthetic Berichtsberechtigung entzogen." }, 403);
    if (pathname==="/auth/v1/token") {
      const payload = Buffer.from(JSON.stringify({ sub: actor, exp: Math.floor(Date.now()/1000)+3600 })).toString("base64url");
      return respond({ access_token: `synthetic.${payload}.fixture`, refresh_token: "synthetic-report-only",
        token_type: "bearer", expires_in: 3600, user });
    }
    if (pathname==="/auth/v1/user") return respond(user);
    if (pathname==="/auth/v1/logout") return route.fulfill({ status: 204 });
    if (pathname.endsWith("/ff_my_access")) {
      state.accessChecks++;
      return respond({ user_id: actor, display_name: "Synthetic Reporter", account_status: "approved",
        access_granted: true, unit_id: unit, unit_name: "Scheuren", roles: role==="MEMBER" ? [role] : ["MEMBER",role] });
    }
    if(pathname.endsWith("/ff_notifications"))return respond(emptyInbox(actor));
    if (pathname.endsWith("/ff_events_page")) return respond({ server_now: new Date().toISOString(),
      manageable_units: [], events: [], retained_events: [], has_more: false, next_cursor: null });
    if (pathname.endsWith("/ff_pending_registrations") || pathname.endsWith("/document_areas")) return respond([]);
    if (pathname.endsWith("/units")) return respond(units);
    if (pathname.endsWith("/ff_reports_context")) return respond({
      current_year: state.contextYear, years: [state.contextYear,2025], organization: overseer, configure: role==="GLOBAL_ADMIN",
      personal_units: [units[0], units[1]], units: overseer ? units : role==="UNIT_ADMIN" ? [units[0]] : [],
      seed_people: overseer ? [{ id: seedPerson, name: "DEV TEST | Testmitglied Scheuren 01", units: [units[0]] }] : [],
      functions: [], event_types: ["regular","special","breathing","training","community","other"].map((event_type) => ({
        event_type, is_training_relevant: !["community","other"].includes(event_type),
      })),
    });
    if (pathname.endsWith("/ff_year_report") || pathname.endsWith("/ff_dev_personal_report")) {
      const payload = request.postDataJSON();
      const seeded = pathname.endsWith("/ff_dev_personal_report");
      if (seeded && (!overseer || payload.target_user!==seedPerson)) return denied();
      const query: ReportQuery = seeded ? { ...payload, report_scope: "personal", seed_member: payload.target_user } : payload;
      state.queries.push(query);
      if (state.fail) return respond({ code: "XX000", message: "Synthetic report unavailable" }, 500);
      if ((query.report_scope==="organization" && !overseer)
        || (query.report_scope==="unit" && (!state.allowed || (!overseer && (role!=="UNIT_ADMIN" || query.target_scope!==unit))))) return denied();
      const noData = query.wanted_year===2025 || query.wanted_type==="community";
      const data = noData ? empty : metrics;
      const event = (id: number) => ({
        event_id: `31000000-0000-4000-8000-00000000000${id}`, title: id===1 ? "Synthetic bestätigter Dienst" : "Nur im vollständigen Export",
        event_type: "regular", scope_name: "Scheuren", unit_name: "Scheuren",
        starts_at: "2026-11-01T17:00:00Z", ends_at: "2026-11-01T19:00:00Z", hours: 2, training: true,
        confirmed_at: "2026-11-01T19:01:00Z", corrected_at: null,
        own_status: query.report_scope==="personal" ? id===1 ? "present" : "absent" : null, metrics,
      });
      return respond({ year: query.wanted_year, scope: query.report_scope, target: query.target_scope,
        scope_name: seeded ? "DEV TEST | Testmitglied Scheuren 01" : query.report_scope==="personal" ? "Mein Dienstbuch" : query.report_scope==="organization" ? "Feuerwehr Odenthal" : "Scheuren",
        ...(seeded ? { seed_member: seedPerson } : {}),
        summary: { ...data, members: 1 }, page: query.page_number, event_count: noData ? 0 : 2,
        has_more: !noData && !query.export_all && query.page_number===0,
        events: noData ? [] : query.export_all ? [event(1),event(2)] : [event(query.page_number===0 ? 1 : 2)],
        members: query.report_scope==="unit" ? [{ user_id: actor, name: "Synthetic berechtigtes Mitglied", metrics: data }] : [],
        units: query.report_scope==="organization" ? units.filter((u) => !query.target_scope || u.id===query.target_scope)
          .map((u) => ({ ...u, members: 1, metrics: data })) : [],
      });
    }
    return respond({ message: `Unexpected synthetic endpoint: ${pathname}` }, 500);
  });
  await page.context().route(/https:\/\/(?!syntheticci\.supabase\.co)[^/]+\.supabase\.co\/.*/, (route) => route.abort());
  await page.goto(publicPath("/termine/"));
  await page.getByLabel("Feuerwehr-E-Mail").fill(user.email);
  await page.getByLabel("Passwort", { exact: true }).fill("synthetic-browser-only");
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Hallo Synthetic Reporter" })).toBeVisible();
  await page.goto(publicPath("/statistik/"));
  await expect(page.getByRole("heading", { name: "Mein Dienstbuch", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Dienst öffnen: Synthetic bestätigter Dienst" })).toBeVisible();
  return state;
}

test("synthetic testbook is readonly overseer reporting, never a login or authenticated profile switch", async ({ page }) => {
  const state = await connect(page, "FIRE_CHIEF");
  await page.getByRole("combobox", { name: "Testdienstbuch (nicht anmeldbar)", exact: true }).selectOption(seedPerson);
  await expect(page.getByRole("heading", { name: "Synthetisches Testdienstbuch", exact: true })).toBeVisible();
  await expect(page.getByText(/ohne Auth-Konto oder Anmeldung/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Administration" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Dienst öffnen: Synthetic bestätigter Dienst" })).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Dienste als CSV", exact: true }).click();
  const file = await download;
  expect(await readFile((await file.path())!, "utf8")).toContain('"DEV TEST | Testmitglied Scheuren 01"');
  expect(file.suggestedFilename()).toMatch(/^dev-test-/);
  expect(state.calls.filter((call) => call==="/auth/v1/token")).toHaveLength(1);
  expect(state.queries.some((query) => query.seed_member===seedPerson)).toBe(true);
  await page.getByRole("combobox", { name: "Testdienstbuch (nicht anmeldbar)", exact: true }).selectOption("");
  await expect(page.getByRole("heading", { name: "Mein Dienstbuch", exact: true })).toBeVisible();
});

test("member reads own dutybook, opens read-only details and selects empty years without a fabricated quote", async ({ page }) => {
  const state = await connect(page, "MEMBER");
  await expect(page.getByRole("combobox", { name: "Testdienstbuch (nicht anmeldbar)", exact: true })).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "Berichtsansicht" }).locator("option")).toHaveCount(1);
  await page.getByRole("button", { name: "Dienst öffnen: Synthetic bestätigter Dienst" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Anwesend", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("button")).toHaveCount(1);
  await dialog.getByRole("button", { name: "Dialog schließen" }).click();
  await page.getByLabel("Berichtsjahr").selectOption("2025");
  await expect(page.getByRole("heading", { name: "Keine abgeschlossenen Dienste für diese Auswahl" })).toBeVisible();
  await expect(page.locator(".metric").filter({ hasText: "Ausbildungsquote" })).toContainText("Keine verlässliche Quote");
  expect(state.calls.filter((call) => /actual_attendance|confirmed_attendance|profiles/.test(call))).toEqual([]);
  expect(state.queries.every((query) => query.report_scope==="personal")).toBe(true);
});
test("unit administrator exports a complete freshly authorized report and only their members", async ({ page }) => {
  const state = await connect(page, "UNIT_ADMIN");
  await page.getByLabel("Berichtsansicht").selectOption("unit");
  await expect(page.getByRole("rowheader", { name: "Synthetic berechtigtes Mitglied" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Einheit", exact: true }).locator("option")).toHaveCount(1);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Dienste als CSV", exact: true }).click();
  const file = await download;
  const content = await readFile((await file.path())!, "utf8");
  expect(content.startsWith("\uFEFF")).toBe(true);
  expect(content).toContain("Nur im vollständigen Export");
  expect(content).toContain('"Scheuren";"2026"');
  expect(state.queries.some((query) => query.export_all && query.target_scope===unit)).toBe(true);
});
test("FIRE_CHIEF gets organization and unit comparisons but no technical administration", async ({ page }) => {
  await connect(page, "FIRE_CHIEF");
  await expect(page.getByRole("link", { name: "Administration" })).toHaveCount(0);
  await expect(page.getByText("Ausbildungsrelevanz verwalten", { exact: true })).toHaveCount(0);
  await page.getByLabel("Berichtsansicht").selectOption("organization");
  await expect(page.getByRole("heading", { name: "Wehrleiter-Dashboard" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Einheiten im Vergleich" })).toBeVisible();
  await expect(page.getByRole("rowheader", { name: "Synthetic Einheit 5" })).toBeVisible();
  await page.getByRole("combobox", { name: "Einheit", exact: true }).selectOption(other);
  await expect(page.getByRole("rowheader", { name: "Synthetic Einheit 5" })).toHaveCount(0);
  await expect(page.getByRole("rowheader", { name: "Synthetic Einheit 2" })).toBeVisible();
});
test("background rechecks retain report details and filters; subsequent server denial clears protected rows", async ({ page }) => {
  await page.clock.install();
  const state = await connect(page, "UNIT_ADMIN");
  await page.getByLabel("Berichtsansicht").selectOption("unit");
  await page.getByRole("combobox", { name: "Terminart", exact: true }).selectOption("regular");
  await page.getByLabel("Mitglied suchen").fill("berechtigt");
  await page.getByRole("button", { name: "Dienst öffnen: Synthetic bestätigter Dienst" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const node = await dialog.elementHandle();
  const checks = state.accessChecks;
  await page.clock.fastForward(125_000);
  await expect.poll(() => state.accessChecks).toBeGreaterThanOrEqual(checks+1);
  await expect(dialog).toBeVisible();
  expect(await node?.evaluate((element) => element.isConnected)).toBe(true);
  await dialog.getByRole("button", { name: "Dialog schließen" }).click();
  await expect(page.getByRole("combobox", { name: "Terminart", exact: true })).toHaveValue("regular");
  await expect(page.getByLabel("Mitglied suchen")).toHaveValue("berechtigt");
  state.allowed = false;
  await page.getByRole("button", { name: "Bericht aktualisieren" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Synthetic Berichtsberechtigung entzogen" })).toBeVisible();
  await expect(page.getByRole("rowheader", { name: "Synthetic berechtigtes Mitglied" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Dienste als CSV", exact: true })).toHaveCount(0);
});
test("reports stay accessible in light/dark on smartphone and desktop; RPC failures never render successful zero statistics", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const state = await connect(page, "GLOBAL_ADMIN");
  await page.getByLabel("Berichtsansicht").selectOption("unit");
  await expect(page.getByRole("rowheader", { name: "Synthetic berechtigtes Mitglied" })).toBeVisible();
  for (const width of [320,390,1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ["light","dark"]) {
      await page.evaluate((value) => { document.documentElement.dataset.theme=value; }, theme);
      expect(await page.evaluate(() => document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      const results = await new AxeBuilder({ page }).withTags(["wcag2a","wcag2aa","wcag21a","wcag21aa"]).analyze();
      expect(results.violations.map((violation) => ({ id: violation.id, nodes: violation.nodes.map((node) => node.target) }))).toEqual([]);
    }
  }
  state.fail = true;
  await page.getByRole("button", { name: "Bericht aktualisieren" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Synthetic report unavailable" })).toBeVisible();
  await expect(page.locator(".dutybook-metrics")).toHaveCount(0);
  state.fail = false;
  state.contextYear = 1800;
  await page.getByRole("button", { name: "Bericht aktualisieren" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Ungültige Berichtsdaten" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Bericht aktualisieren" })).toBeVisible();
});
test("revoked export permission blocks the download and clears the previously displayed protected report", async ({ page }) => {
  const state = await connect(page, "UNIT_ADMIN");
  await page.getByLabel("Berichtsansicht").selectOption("unit");
  await expect(page.getByRole("rowheader", { name: "Synthetic berechtigtes Mitglied" })).toBeVisible();
  let downloaded = false;
  page.on("download", () => { downloaded = true; });
  state.allowed = false;
  await page.getByRole("button", { name: "Dienste als CSV", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Synthetic Berichtsberechtigung entzogen" })).toBeVisible();
  await expect(page.getByRole("rowheader", { name: "Synthetic berechtigtes Mitglied" })).toHaveCount(0);
  expect(downloaded).toBe(false);
});
