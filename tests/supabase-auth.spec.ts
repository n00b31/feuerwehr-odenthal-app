import { test, expect, type BrowserContext } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { publicPath } from "../src/config/app";

// These are intercepted protocol fixtures, not working accounts, keys or tokens.
const memberId = "10000000-0000-4000-8000-000000000001";
const adminId = "10000000-0000-4000-8000-000000000002";
const unitId = "20000000-0000-4000-8000-000000000001";
const api = "https://syntheticci.supabase.co";
const email = "synthetic.member@feuerwehr-odenthal.de";
const password = "SyntheticOnly!123";

async function fixture(context: BrowserContext) {
  const state = {
    verified: false, approved: false, suspended: false, missingUnit: false,
    admin: false, broken: false, mailLimited: false, unauthorizedMail: false,
    protectedReads: [] as string[], signup: null as null | Record<string, unknown>, callbackCalls: 0, signupCalls: 0,
  };
  const user = () => ({
    id: state.admin ? adminId : memberId,
    aud: "authenticated", role: "authenticated", email: state.admin ? "synthetic.admin@feuerwehr-odenthal.de" : email,
    email_confirmed_at: state.verified || state.admin ? new Date().toISOString() : null,
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: { display_name: state.admin ? "Synthetic Admin" : "Synthetic Mitglied" },
    created_at: new Date().toISOString(),
  });
  const session = () => {
    const body = Buffer.from(JSON.stringify({ sub: user().id, aud: "authenticated", role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url");
    return { access_token: `eyJhbGciOiJIUzI1NiJ9.${body}.synthetic`, refresh_token: "synthetic-refresh-only", token_type: "bearer", expires_in: 3600, user: user() };
  };
  await context.route(`${api}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const respond = (body: unknown, status = 200) => route.fulfill({
      status, contentType: "application/json",
      headers: {
        "x-supabase-api-version": "2024-01-01",
        "access-control-allow-origin": "*",
        "access-control-expose-headers": "x-supabase-api-version",
      },
      body: JSON.stringify(body),
    });
    if (url.pathname === "/auth/v1/signup") {
      state.signupCalls++;
      state.signup = request.postDataJSON();
      if (state.mailLimited) return respond({ code: "over_email_send_rate_limit", msg: "Synthetic rate limit" }, 429);
      if (state.unauthorizedMail) return respond({ code: "email_address_not_authorized", msg: "Synthetic recipient restriction" }, 403);
      return respond(user());
    }
    if (url.pathname === "/auth/v1/token") {
      if (url.searchParams.get("grant_type") === "pkce") { state.verified = true; state.callbackCalls++; }
      if (!state.verified && !state.admin) return respond({ code: "email_not_confirmed", msg: "Synthetic unconfirmed" }, 400);
      return respond(session());
    }
    if (url.pathname === "/auth/v1/user") return respond(user());
    if (url.pathname === "/auth/v1/logout") return route.fulfill({ status: 204 });
    if (url.pathname === "/auth/v1/resend") return respond({});
    if (url.pathname === "/rest/v1/rpc/ff_my_access") {
      if (state.broken) return respond({ code: "PGRST202", message: "Synthetic missing migration" }, 404);
      const active = state.admin || (state.approved && !state.suspended && !state.missingUnit);
      return respond({
        user_id: user().id, display_name: state.admin ? "Synthetic Admin" : "Synthetic Mitglied",
        account_status: state.suspended ? "suspended" : state.approved || state.admin ? "approved" : "pending",
        access_granted: active, unit_id: active ? unitId : null, unit_name: active ? "Scheuren" : null,
        roles: active ? state.admin ? ["MEMBER", "GLOBAL_ADMIN"] : ["MEMBER"] : [],
      });
    }
    if (url.pathname === "/rest/v1/rpc/ff_approve_member") {
      expect(state.admin).toBe(true);
      expect(request.postDataJSON()).toEqual({ target_user: memberId, target_unit: unitId });
      state.approved = true;
      return respond(null);
    }
    if (url.pathname.startsWith("/rest/v1/")) {
      state.protectedReads.push(url.pathname);
      expect(state.admin || (state.approved && !state.suspended && !state.missingUnit)).toBe(true);
      if (url.pathname.endsWith("/ff_pending_registrations")) return respond(state.approved ? [] : [{
        user_id: memberId, display_name: "Synthetic Mitglied", email, email_verified: state.verified, registered_at: new Date().toISOString(),
      }]);
      if (url.pathname.endsWith("/units")) return respond([{ id: unitId, name: "Scheuren" }]);
      if (url.pathname.endsWith("/ff_members_workspace")) return respond({
        global_admin: state.admin, units: [{ id: unitId, name: "Scheuren" }], functions: [], members: [],
      });
      if (url.pathname.endsWith("/ff_events_page")) return respond({
        server_now: new Date().toISOString(), manageable_units: state.admin ? [{ id: unitId, name: "Scheuren" }] : [],
        retained_events: [], has_more: false, next_cursor: null,
        events: [{
        id: "30000000-0000-4000-8000-000000000001", title: "Synthetic DEV Dienst", description: "Nur Testdaten",
        event_type: "regular", starts_at: "2026-12-01T18:00:00Z", ends_at: "2026-12-01T20:00:00Z",
        location: "Synthetischer Testort", status: "scheduled",
        unit_id: unitId, series_id: null, revision: 0, response_deadline: null, scope_name: "Scheuren",
        can_manage: state.admin, can_lead: state.admin, in_roster: true, own_response: null,
        can_delegate: state.admin, can_read_attendance: state.admin, attendance_state: "NOT_STARTED", own_attendance: null,
        participants: state.admin ? [{ user_id: memberId, name: "Synthetic Mitglied", response: null, updated_at: null }] : null,
      }] });
      return respond([]);
    }
    throw new Error(`Unexpected synthetic endpoint: ${url.pathname}`);
  });
  // An accidental request to another Supabase project must never leave the browser.
  await context.route(/https:\/\/(?!syntheticci\.supabase\.co)[^/]+\.supabase\.co\/.*/, (route) => route.abort());
  return state;
}

async function login(page: import("@playwright/test").Page, address = email) {
  await page.getByLabel("Feuerwehr-E-Mail").fill(address);
  await page.getByLabel("Passwort", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
}

test("full DEV registration, PKCE confirmation, pending approval, admin release and renewed login", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "light" });
  const state = await fixture(context);
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(publicPath("/"));
  await page.getByRole("button", { name: "Testkonto registrieren", exact: true }).click();
  await page.getByLabel("Anzeigename").fill("Synthetic Mitglied");
  await page.getByLabel("Feuerwehr-E-Mail").fill(email);
  await page.getByLabel("Passwort", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Registrierung anfordern" }).click();
  await expect(page.getByRole("status")).toContainText("Bestätigung angefordert");
  expect(state.signup).toMatchObject({ email, data: { display_name: "Synthetic Mitglied" } });
  expect(JSON.stringify(state.signup)).not.toContain("GLOBAL_ADMIN");
  expect(state.protectedReads).toEqual([]);
  await page.goto(publicPath("/auth/callback/?code=synthetic-code&next=https://evil.test"));
  await expect(page.getByRole("heading", { name: "Wartet auf Freigabe" })).toBeVisible();
  expect(new URL(page.url()).search).toBe("");
  expect(state.callbackCalls).toBe(1);
  expect(state.protectedReads).toEqual([]);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Wartet auf Freigabe" })).toBeVisible();
  expect(state.callbackCalls).toBe(1);
  await page.getByRole("button", { name: /Abmelden/ }).click();
  await expect(page.getByRole("heading", { name: "Anmelden", exact: true })).toBeVisible();

  state.admin = true;
  await login(page, "synthetic.admin@feuerwehr-odenthal.de");
  await expect(page.getByRole("heading", { name: "Hallo Synthetic Admin" })).toBeVisible();
  await page.getByRole("link", { name: "Administration", exact: true }).click();
  await expect(page.getByRole("button", { name: "Synthetic Mitglied freigeben" })).toBeDisabled();
  await page.getByLabel("Einheit für Synthetic Mitglied").selectOption(unitId);
  await page.getByRole("button", { name: "Synthetic Mitglied freigeben" }).click();
  await expect(page.getByText("Keine wartenden Registrierungen.")).toBeVisible();
  await page.getByRole("button", { name: /Abmelden/ }).click();
  await expect(page.getByRole("heading", { name: "Anmelden", exact: true })).toBeVisible();
  state.admin = false;
  await page.goto(publicPath("/"));
  await login(page);
  await expect(page.getByRole("heading", { name: "Hallo Synthetic Mitglied" })).toBeVisible();
  await page.getByRole("link", { name: "Termine", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Synthetic DEV Dienst" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Administration" })).toHaveCount(0);
  await expect(page.getByText(/Demo-Profil wechseln/)).toHaveCount(0);
  expect(await page.evaluate(() => Object.keys(localStorage).some((key) => key.startsWith("ff-odenthal-demo-v1")))).toBe(false);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: "test-results/supabase-dev-member-light.png", fullPage: true, animations: "disabled" });
  await page.getByRole("button", { name: "Farbschema wechseln" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.screenshot({ path: "test-results/supabase-dev-member-dark.png", fullPage: true, animations: "disabled" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
  await context.close();
});

test("unverified and pending users cannot load protected data, including direct routes", async ({ context, page }) => {
  const state = await fixture(context);
  await page.goto(publicPath("/administration"));
  await login(page);
  await expect(page.getByRole("main").getByRole("alert")).toContainText("verifizieren");
  expect(state.protectedReads).toEqual([]);
  state.verified = true;
  await login(page);
  await expect(page.getByRole("heading", { name: "Wartet auf Freigabe" })).toBeVisible();
  await page.goto(publicPath("/dokumente"));
  await expect(page.getByRole("heading", { name: "Wartet auf Freigabe" })).toBeVisible();
  expect(state.protectedReads).toEqual([]);
});

test("suspension, missing unit and database errors close access without a demo fallback", async ({ context, page }) => {
  const state = await fixture(context);
  state.verified = true; state.approved = true;
  await page.goto(publicPath("/"));
  await login(page);
  await expect(page.getByRole("heading", { name: "Hallo Synthetic Mitglied" })).toBeVisible();
  state.suspended = true;
  await page.getByRole("button", { name: "Aktualisieren", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Zugang gesperrt" })).toBeVisible();
  state.suspended = false; state.missingUnit = true;
  await page.getByRole("button", { name: "Freigabestatus prüfen" }).click();
  await expect(page.getByRole("heading", { name: "Erneute Prüfung erforderlich" })).toBeVisible();
  state.missingUnit = false; state.broken = true;
  await page.getByRole("button", { name: "Freigabestatus prüfen" }).click();
  await expect(page.getByRole("heading", { name: "DEV-Zugriff nicht verfügbar" })).toBeVisible();
  await expect(page.getByText(/Hallo Anna|Profilwechsel ohne Anmeldung/)).toHaveCount(0);
});

test("mail limits and unauthorized recipients are visible; no automatic retry", async ({ context, page }) => {
  const state = await fixture(context);
  state.mailLimited = true;
  await page.goto(publicPath("/"));
  await page.getByRole("button", { name: "Testkonto registrieren", exact: true }).click();
  await page.getByLabel("Anzeigename").fill("Synthetic Mitglied");
  await page.getByLabel("Feuerwehr-E-Mail").fill(email);
  await page.getByLabel("Passwort", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Registrierung anfordern" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(/limit/i);
  expect(state.signupCalls).toBe(1);
  state.mailLimited = false; state.unauthorizedMail = true;
  await page.getByLabel("Passwort", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Registrierung anfordern" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("nicht autorisiert");
  expect(state.signupCalls).toBe(2);
  expect(state.protectedReads).toEqual([]);
});

test("foreign-domain registration is rejected before a network request", async ({ context, page }) => {
  const state = await fixture(context);
  await page.goto(publicPath("/"));
  await page.getByRole("button", { name: "Testkonto registrieren", exact: true }).click();
  await page.getByLabel("Anzeigename").fill("Synthetic Mitglied");
  await page.getByLabel("Feuerwehr-E-Mail").fill("synthetic@example.test");
  await page.getByLabel("Passwort", { exact: true }).fill(password);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByLabel("Anzeigename")).toHaveValue("Synthetic Mitglied");
  await page.getByRole("button", { name: "Registrierung anfordern" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Nur @feuerwehr-odenthal.de");
  expect(state.signupCalls).toBe(0);
  expect(state.protectedReads).toEqual([]);
});

test("callback errors remove URL parameters and allow a fresh login after session removal", async ({ context, page }) => {
  const state = await fixture(context);
  await page.goto(publicPath("/auth/callback/?error=access_denied&error_description=synthetic&next=https://evil.test"));
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Bestätigungslink");
  expect(new URL(page.url()).search).toBe("");
  expect(state.protectedReads).toEqual([]);
  await page.getByRole("button", { name: /Abmelden/ }).click();
  await expect(page.getByRole("heading", { name: "Anmelden", exact: true })).toBeVisible();
  state.verified = true;
  await login(page);
  await expect(page.getByRole("heading", { name: "Wartet auf Freigabe" })).toBeVisible();
});
