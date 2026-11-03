import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { publicPath } from "../src/config/app";
import { localInput } from "../src/domain/time";

const api = "https://syntheticci.supabase.co";
const unit = "20000000-0000-4000-8000-000000000001";
const otherUnit = "20000000-0000-4000-8000-000000000002";
const admin = "10000000-0000-4000-8000-000000000001";
const member = "10000000-0000-4000-8000-000000000002";
const eventId = "30000000-0000-4000-8000-000000000001";
type Response = "yes" | "no" | "maybe";
type StoredEvent = {
  id: string; title: string; description: string; event_type: string; location: string;
  starts_at: string; ends_at: string; unit_id: string; status: "scheduled" | "cancelled"; revision: number;
};
function store() {
  return {
    events: [] as StoredEvent[], answers: new Map<string, Response>(),
    audit: [] as { actor: string; before: Response | undefined; after: Response }[],
    now: Date.now(), broken: false, denyCreation: false,
  };
}
type Store = ReturnType<typeof store>;

// Protocol fixtures share a central store but never contact a real project or mailbox.
async function connect(context: BrowserContext, state: Store, actor: string) {
  const isAdmin = actor === admin;
  const user = () => ({
    id: actor, aud: "authenticated", role: "authenticated",
    email: `synthetic.${isAdmin ? "admin" : "member"}@feuerwehr-odenthal.de`,
    email_confirmed_at: new Date().toISOString(), created_at: new Date().toISOString(),
    app_metadata: { provider: "email", providers: ["email"] }, user_metadata: { display_name: isAdmin ? "Synthetic Admin" : "Synthetic Member" },
  });
  await context.route(`${api}/**`, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const respond = (body: unknown, status = 200) => route.fulfill({
      status, contentType: "application/json", headers: { "x-supabase-api-version": "2024-01-01",
        "access-control-allow-origin": "*", "access-control-expose-headers": "x-supabase-api-version" },
      body: JSON.stringify(body),
    });
    const denied = () => respond({ code: "42501", message: "Synthetische serverseitige Sperre." }, 403);
    if (path === "/auth/v1/token") {
      const payload = Buffer.from(JSON.stringify({ sub: actor, aud: "authenticated", role: "authenticated", exp: Math.floor(Date.now()/1000)+3600 })).toString("base64url");
      return respond({ access_token: `eyJhbGciOiJIUzI1NiJ9.${payload}.synthetic-signature`,
        refresh_token: "synthetic-only", token_type: "bearer", expires_in: 3600, user: user() });
    }
    if (path === "/auth/v1/user") return respond(user());
    if (path === "/auth/v1/logout") return route.fulfill({ status: 204 });
    if (path === "/rest/v1/rpc/ff_my_access") return respond({
      user_id: actor, display_name: isAdmin ? "Synthetic Admin" : "Synthetic Member", account_status: "approved",
      access_granted: true, unit_id: unit, unit_name: "Scheuren", roles: isAdmin ? ["MEMBER","GLOBAL_ADMIN"] : ["MEMBER"],
    });
    if (path === "/rest/v1/rpc/ff_events_workspace") {
      if (state.broken) return respond({ code: "503", message: "Synthetic outage" }, 503);
      return respond({
        server_now: new Date(state.now).toISOString(), manageable_units: isAdmin ? [{ id: unit, name: "Scheuren" }] : [],
        events: state.events.filter((e) => isAdmin || e.unit_id === unit).map((e) => ({
          ...e, series_id: null, response_deadline: null, scope_name: e.unit_id === unit ? "Scheuren" : "Andere Einheit",
          can_manage: isAdmin, can_lead: isAdmin, in_roster: e.unit_id === unit,
          own_response: state.answers.get(`${e.id}:${actor}`) ?? null,
          participants: isAdmin ? [admin, member].map((id) => ({
            user_id: id, name: id === admin ? "Synthetic Admin" : "Synthetic Member",
            response: state.answers.get(`${e.id}:${id}`) ?? null, updated_at: null,
          })) : null,
        })),
      });
    }
    if (path === "/rest/v1/rpc/ff_create_single_event") {
      if (!isAdmin || state.denyCreation) return denied();
      const body = request.postDataJSON().input;
      expect(body.unit_id).toBe(unit);
      expect(body).not.toHaveProperty("user_id");
      state.events.push({ ...body, id: eventId, status: "scheduled", revision: 0 });
      return respond(eventId);
    }
    if (path === "/rest/v1/rpc/ff_set_response") {
      const body = request.postDataJSON();
      const e = state.events.find((item) => item.id === body.target_event);
      if (!e || e.unit_id !== unit || e.status !== "scheduled" || Date.parse(e.starts_at) <= state.now) return denied();
      const key = `${e.id}:${actor}`;
      state.audit.push({ actor, before: state.answers.get(key), after: body.answer });
      state.answers.set(key, body.answer);
      return respond(null);
    }
    if (path === "/rest/v1/rpc/ff_update_single_event" || path === "/rest/v1/rpc/ff_cancel_single_event") {
      const body = request.postDataJSON();
      const e = state.events.find((item) => item.id === body.target_event);
      if (!isAdmin || !e) return denied();
      if (e.revision !== body.expected_revision) return respond({ code: "40001", message: "Termin wurde zwischenzeitlich geändert. Bitte aktualisieren." }, 409);
      if (path.endsWith("ff_update_single_event")) Object.assign(e, body.input);
      else e.status = "cancelled";
      e.revision++;
      return respond(null);
    }
    if (path === "/rest/v1/units") return respond([{ id: unit, name: "Scheuren" }]);
    if (path === "/rest/v1/document_areas" || path === "/rest/v1/confirmed_attendance" || path === "/rest/v1/rpc/ff_pending_registrations") return respond([]);
    throw new Error(`Unexpected synthetic endpoint: ${path}`);
  });
  await context.route(/https:\/\/(?!syntheticci\.supabase\.co)[^/]+\.supabase\.co\/.*/, (route) => route.abort());
}
async function login(page: Page, isAdmin: boolean) {
  await page.goto(publicPath("/termine/"));
  await page.getByLabel("Feuerwehr-E-Mail").fill(`synthetic.${isAdmin ? "admin" : "member"}@feuerwehr-odenthal.de`);
  await page.getByLabel("Passwort", { exact: true }).fill("SyntheticOnly!123");
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Sichtbare DEV-Termine" })).toBeVisible();
}
async function create(page: Page, state: Store) {
  await page.getByRole("button", { name: "Einzeltermin erstellen" }).click();
  await page.getByLabel("Titel", { exact: true }).fill("Synthetic gemeinsamer Dienst");
  await page.getByLabel("Beschreibung", { exact: true }).fill("Nur simulierte Testdaten");
  await page.getByLabel("Beginn (Europe/Berlin)", { exact: true }).fill(localInput(new Date(state.now+172800000).toISOString()));
  await page.getByLabel("Ende (Europe/Berlin)", { exact: true }).fill(localInput(new Date(state.now+180000000).toISOString()));
  await page.getByLabel("Ort", { exact: true }).fill("Synthetic Gerätehaus");
  await page.getByRole("button", { name: "Termin speichern" }).click();
}

test("two independent sessions centrally create, respond, change, reload, edit and cancel one shared event", async ({ browser }) => {
  const state = store();
  const adminContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const memberContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await connect(adminContext, state, admin); await connect(memberContext, state, member);
  const adminPage = await adminContext.newPage(); const memberPage = await memberContext.newPage();
  await login(adminPage, true); await login(memberPage, false);
  await create(adminPage, state);
  await expect(adminPage.getByRole("status")).toContainText("Termin in Supabase erstellt");
  await memberPage.getByRole("button", { name: "Termine aktualisieren" }).click();
  await expect(memberPage.getByRole("heading", { name: "Synthetic gemeinsamer Dienst" })).toBeVisible();
  await memberPage.getByRole("button", { name: "Ich komme", exact: true }).click();
  await expect(memberPage.getByRole("button", { name: "Ich komme", exact: true })).toHaveAttribute("aria-pressed", "true");
  await adminPage.getByRole("button", { name: "Termine aktualisieren" }).click();
  await expect(adminPage.getByText(/Teilnehmerübersicht · 1 Zusagen/)).toBeVisible();
  await memberPage.getByRole("button", { name: "Vielleicht", exact: true }).click();
  await expect(memberPage.getByRole("button", { name: "Vielleicht", exact: true })).toHaveAttribute("aria-pressed", "true");
  await memberPage.reload();
  await expect(memberPage.getByRole("button", { name: "Vielleicht", exact: true })).toHaveAttribute("aria-pressed", "true");
  expect(state.audit.filter((entry) => entry.actor === member)).toEqual([
    { actor: member, before: undefined, after: "yes" }, { actor: member, before: "yes", after: "maybe" },
  ]);
  await adminPage.getByRole("button", { name: "Termine aktualisieren" }).click();
  await expect(adminPage.getByText(/Teilnehmerübersicht · 0 Zusagen · 0 Absagen · 1 Vielleicht · 1 ohne/)).toBeVisible();
  await adminPage.getByRole("button", { name: "Termin bearbeiten" }).click();
  await adminPage.getByLabel("Titel", { exact: true }).fill("Synthetic geänderter Dienst");
  await adminPage.getByRole("button", { name: "Termin speichern" }).click();
  await memberPage.getByRole("button", { name: "Termine aktualisieren" }).click();
  await expect(memberPage.getByRole("heading", { name: "Synthetic geänderter Dienst" })).toBeVisible();
  expect((await new AxeBuilder({ page: memberPage }).analyze()).violations).toEqual([]);
  await memberPage.getByRole("button", { name: "Farbschema wechseln" }).click();
  await expect(memberPage.locator("html")).toHaveAttribute("data-theme", "dark");
  expect((await new AxeBuilder({ page: memberPage }).analyze()).violations).toEqual([]);
  await memberPage.screenshot({ path: "test-results/dev-events-member-dark.png", fullPage: true });
  await adminPage.screenshot({ path: "test-results/dev-events-admin-light.png", fullPage: true });
  expect(await memberPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await memberPage.evaluate(() => Object.keys(localStorage).some((key) => key.startsWith("ff-odenthal-demo-v1")))).toBe(false);
  await adminPage.getByRole("button", { name: "Termin absagen", exact: true }).click();
  await adminPage.getByLabel("Absagegrund", { exact: true }).fill("Synthetic Absagegrund");
  await adminPage.getByRole("button", { name: "Absage bestätigen" }).click();
  await memberPage.reload();
  await expect(memberPage.getByRole("button", { name: "Vielleicht", exact: true })).toBeDisabled();
  expect(state.answers.get(`${eventId}:${member}`)).toBe("maybe");
  await adminContext.close(); await memberContext.close();
});

test("foreign events and server-start boundary cannot be bypassed by member API requests", async ({ context, page }) => {
  const state = store();
  state.events = [{
    id: eventId, title: "Synthetic begonnener Dienst", description: "", event_type: "regular", location: "Testort",
    unit_id: unit, starts_at: new Date(state.now-1000).toISOString(), ends_at: new Date(state.now+3600000).toISOString(), status: "scheduled", revision: 0,
  }, {
    id: "30000000-0000-4000-8000-000000000002", title: "Synthetic fremder Dienst", description: "", event_type: "other", location: "Testort",
    unit_id: otherUnit, starts_at: new Date(state.now+3600000).toISOString(), ends_at: new Date(state.now+7200000).toISOString(), status: "scheduled", revision: 0,
  }];
  await connect(context, state, member); await login(page, false);
  await expect(page.getByRole("heading", { name: "Synthetic fremder Dienst" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Ich komme", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Termin bearbeiten" })).toHaveCount(0);
  const statuses = await page.evaluate(async ({ api, eventId }) => {
    const result = [];
    for (const [name, body] of [
      ["ff_set_response", { target_event: eventId, answer: "yes" }],
      ["ff_set_response", { target_event: "30000000-0000-4000-8000-000000000002", answer: "yes" }],
      ["ff_cancel_single_event", { target_event: eventId, expected_revision: 0, reason: "Forged request" }],
    ] as const) result.push((await fetch(`${api}/rest/v1/rpc/${name}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })).status);
    return result;
  }, { api, eventId });
  expect(statuses).toEqual([403,403,403]);
  expect(state.answers.size).toBe(0);
});

test("failed create, stale edit and lost connection do not fabricate successful event data", async ({ context, page }) => {
  const state = store(); await connect(context, state, admin); await login(page, true);
  state.denyCreation = true; await create(page, state);
  await expect(page.getByRole("main").getByRole("alert")).toContainText("serverseitige Sperre");
  expect(state.events.length).toBe(0);
  state.denyCreation = false;
  await page.getByRole("button", { name: "Termin speichern" }).click();
  await expect(page.getByRole("heading", { name: "Synthetic gemeinsamer Dienst" })).toBeVisible();
  await page.getByRole("button", { name: "Termin bearbeiten" }).click();
  state.events[0].revision++;
  await page.getByRole("button", { name: "Termin speichern" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("zwischenzeitlich");
  state.broken = true;
  await page.getByRole("button", { name: "Termine aktualisieren" }).click();
  await expect(page.getByRole("heading", { name: "Synthetic gemeinsamer Dienst" })).toHaveCount(0);
  await expect(page.getByRole("main").getByRole("alert")).toContainText("kein erfolgreicher Abschluss");
});
