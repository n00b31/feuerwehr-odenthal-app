import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {emptyInbox} from "./notification-fixture";
import { publicPath } from "../src/config/app";
import type { DashboardData } from "../src/domain/dashboard";
import type { DevResponse } from "../src/domain/dev-events";

const api = "https://syntheticci.supabase.co";
const actor = "a0641000-0000-4000-8000-000000000001";
const unit = "b0641000-0000-4000-8000-000000000001";
const event = "e0641000-0000-4000-8000-000000000001";
type Role = "MEMBER" | "UNIT_ADMIN" | "FUNCTION_ADMIN" | "FIRE_CHIEF" | "GLOBAL_ADMIN" | "vehicle" | "combined";
function snapshot(role: Role): DashboardData {
  const next = { id: event, title: "Synthetic cockpit practice", starts_at: "2026-11-10T18:00:00Z",
    ends_at: "2026-11-10T20:00:00Z", location: "Synthetic fire station", scope_name: "Scheuren",
    own_response: null, response_deadline: null, can_reply: true };
  const global = role === "GLOBAL_ADMIN" || role === "combined";
  return {
    actor_id: actor, server_now: "2026-11-09T12:00:00Z", year: 2026,
    units: [{ id: unit, name: "Scheuren" }], functions: [],
    next_service: next, open_count: 7, open_events: [next, ...[2, 3].map(i => ({
      ...next, id: `e0641000-0000-4000-8000-00000000000${i}`, title: `Synthetic open practice ${i}`,
    }))],
    statistics: { services: 5, practices: 5, training_services: 5, eligible: 5, present: 4, absent: 1,
      training_present: 4, training_absent: 1, unknown: 0, training_hours: 8.5, service_hours: 10,
      participant_hours: 8.5, rate: 80, average_attendance: 0.8, pending: 1, excluded: 0, missing_roster: 0 },
    information: [{ id: "c0641000-0000-4000-8000-000000000001", title: "Synthetic organizational information",
      starts_at: next.starts_at, scope_name: "Alle Einheiten" }],
    reservations: [{ id: "f0641000-0000-4000-8000-000000000001", vehicle_name: "Synthetic own MTF",
      starts_at: next.starts_at, state: "APPROVED" }],
    tasks: [
      ...(global ? [{ kind: "registrations" as const, count: 2, target: null }] : []),
      ...(global || role === "UNIT_ADMIN" || role === "FUNCTION_ADMIN" ? [{ kind: "attendance" as const, count: 3, target: event }] : []),
      ...(global || role === "vehicle" ? [{ kind: "vehicles" as const, count: 4, target: "f0641000-0000-4000-8000-000000000001" }] : []),
    ], vehicles_visible: true,
  };
}
async function connect(page: Page, role: Role = "MEMBER", change?: (data: DashboardData) => void) {
  const state = { data: snapshot(role), calls: [] as string[], answers: [] as DevResponse[],
    fail: false, rejectReply: false, blocked: false };
  change?.(state.data);
  const user = { id: actor, aud: "authenticated", role: "authenticated",
    email: "synthetic.cockpit@feuerwehr-odenthal.de", email_confirmed_at: "2026-01-01T00:00:00Z",
    created_at: "2026-01-01T00:00:00Z", app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: { display_name: "Alex Synthetic" } };
  await page.context().route(/https:\/\/(?!syntheticci\.supabase\.co)[^/]+\.supabase\.co\/.*/, route => route.abort());
  await page.context().route(`${api}/**`, async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    state.calls.push(path);
    const respond = (data: unknown, status = 200) => route.fulfill({ status, contentType: "application/json",
      headers: { "access-control-allow-origin": "*", "x-supabase-api-version": "2024-01-01" }, body: JSON.stringify(data) });
    if (path === "/auth/v1/token") {
      const payload = Buffer.from(JSON.stringify({ sub: actor, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url");
      return respond({ access_token: `synthetic.${payload}.fixture`, refresh_token: "synthetic-cockpit-only", expires_in: 3600, token_type: "bearer", user });
    }
    if (path === "/auth/v1/user") return respond(user);
    if (path.endsWith("/ff_my_access")) return respond({ user_id: actor, display_name: "Alex Synthetic",
      account_status: state.blocked ? "suspended" : "approved", access_granted: !state.blocked,
      unit_id: state.blocked ? null : unit, unit_name: state.blocked ? null : "Scheuren",
      roles: role === "combined" ? ["MEMBER", "UNIT_ADMIN", "FUNCTION_ADMIN", "GLOBAL_ADMIN"]
        : role === "vehicle" ? ["MEMBER"] : ["MEMBER", ...role === "MEMBER" ? [] : [role]] });
    if(path.endsWith("/ff_notifications"))return state.blocked
      ?respond({code:"42501",message:"Synthetic account suspended"},403):respond(emptyInbox(actor));
    if (path.endsWith("/ff_dashboard")) return state.fail
      ? respond({ code: "42501", message: "Synthetic cockpit scope denied" }, 403) : respond(state.data);
    if (path.endsWith("/ff_set_response")) {
      expect(request.postDataJSON().target_event).toBe(event);
      if (state.rejectReply) return respond({ code: "42501", message: "Synthetic service has started; response locked" }, 403);
      state.answers.push(request.postDataJSON().answer);
      state.data.next_service!.own_response = request.postDataJSON().answer;
      state.data.open_count = 6;
      state.data.open_events = state.data.open_events.filter(item => item.id !== event);
      return respond(null);
    }
    if (path.endsWith("/ff_events_page")) return respond({ server_now: state.data.server_now, manageable_units: [],
      can_filter_attendance:role==="GLOBAL_ADMIN",open_attendance_count:request.postDataJSON().list_view==="open_attendance" ? 3 : null,
      retained_events: [], has_more: false, next_cursor: null, events: state.data.next_service ? [{
        ...state.data.next_service, description: "Synthetic retained source", event_type: "regular", status: "scheduled",
        unit_id: unit, series_id: null, revision: 0, can_manage: false,
        can_delegate: false, can_read_attendance:request.postDataJSON().list_view==="open_attendance",
        can_lead:request.postDataJSON().list_view==="open_attendance",in_roster: true, attendance_state: "NOT_STARTED",
        starts_at:request.postDataJSON().list_view==="open_attendance" ? "2026-11-08T18:00:00Z" : state.data.next_service.starts_at,
        organizer_name:"Alex Synthetic",
        own_attendance: null, participants: null,
      }] : [] });
    if (path.endsWith("/units")) return respond([{ id: unit, name: "Scheuren" }]);
    if (path.endsWith("/document_areas") || path.endsWith("/ff_pending_registrations")) return respond([]);
    return respond({ message: `Unexpected synthetic cockpit request: ${path}` }, 400);
  });
  await page.goto(publicPath("/"));
  await page.getByLabel("Feuerwehr-E-Mail").fill(user.email);
  await page.getByLabel("Passwort", { exact: true }).fill("synthetic-browser-only");
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Dein nächster Übungsdienst" })).toBeVisible();
  return state;
}

test("personal cockpit uses authenticated identity, small data and canonical dutybook metrics", async ({ page }) => {
  const state = await connect(page);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Alex");
  await expect(page.locator(".cockpit-header")).toContainText("Scheuren");
  await expect(page.getByRole("heading", { name: "Synthetic cockpit practice" })).toBeVisible();
  await expect(page.locator(".cockpit-event-meta")).toContainText("19:00");
  await expect(page.locator(".cockpit-metrics")).toContainText("8,5");
  await expect(page.locator(".cockpit-metrics")).toContainText("80 %");
  await expect(page.locator(".cockpit-open")).toContainText("7 Rückmeldungen offen");
  await expect(page.locator(".cockpit-open li")).toHaveCount(3);
  await expect(page.locator(".dev-list-filters")).toHaveCount(0);
  expect(state.calls.filter(path => path.startsWith("/rest/")).every(path => /ff_my_access|ff_dashboard|ff_notifications/.test(path))).toBe(true);
});
test("cockpit attendance task opens the server-scoped attendance filter rather than a single target",async({page})=>{
  await connect(page,"GLOBAL_ADMIN");
  await page.locator(".cockpit-tasks a").filter({hasText:"Anwesenheitslisten abschließen"}).click();
  await expect(page).toHaveURL(/ansicht=open_attendance/);
  await page.getByRole("button",{name:"Filter öffnen"}).click();
  await expect(page.getByRole("combobox",{name:"Terminansicht",exact:true})).toHaveValue("open_attendance");
  await page.getByRole("button",{name:"Filter übernehmen und schließen"}).click();
  await expect(page.getByText("3 offene Anwesenheitslisten",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:/Termindetails öffnen:/}).first().click();
  await expect(page.getByRole("button",{name:"Anwesenheit erfassen",exact:true})).toBeEnabled();
});
for (const mode of ["light", "dark"] as const) test(`direct RSVP uses existing RPC and computed status colors without altering attendance in ${mode} mode`, async ({ page }) => {
  await page.emulateMedia({ colorScheme: mode });
  const state = await connect(page);
  for (const [label, answer, css] of [["Ich komme", "yes", "response-yes"], ["Ich kann nicht", "no", "response-no"], ["Vielleicht", "maybe", "response-maybe"]] as const) {
    await page.getByRole("button", { name: label, exact: true }).click();
    await expect(page.getByRole("button", { name: label, exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".cockpit-next")).toHaveClass(new RegExp(css));
    expect(state.answers.at(-1)).toBe(answer);
    const token = answer === "yes" ? "--cp-success" : answer === "no" ? "--cp-danger" : "--cp-warning";
    const colors = await page.locator(".cockpit-next").evaluate((element, variable) => {
      const probe = document.createElement("i");
      probe.style.color = `var(${variable})`;
      probe.style.backgroundColor = `color-mix(in srgb,var(${variable}) 5%,var(--cp-surface))`;
      document.body.append(probe);
      const actual = getComputedStyle(element), expected = getComputedStyle(probe);
      const result = { actual: actual.borderInlineStartColor, expected: expected.color,
        background: actual.backgroundColor, expectedBackground: expected.backgroundColor };
      probe.remove(); return result;
    }, token);
    expect(colors.actual).toBe(colors.expected);
    expect(colors.background).toBe(colors.expectedBackground);
    expect((await new AxeBuilder({ page }).include(".cockpit-next").analyze()).violations).toEqual([]);
  }
  await expect(page.locator(".cockpit-open")).toContainText("6 Rückmeldungen offen");
  await expect(page.locator(".cockpit-metrics")).toContainText("8,5");
});
test("exact server start boundary disables response buttons", async ({ page }) => {
  const state = await connect(page, "MEMBER", data => { data.server_now = data.next_service!.starts_at; });
  await expect(page.getByRole("button", { name: "Ich komme", exact: true })).toBeDisabled();
  expect(state.answers).toEqual([]);
});
test("server-side refusal after a stale preview is visibly preserved", async ({ page }) => {
  const state = await connect(page); state.rejectReply = true;
  await page.getByRole("button", { name: "Ich komme", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("response locked");
  expect(state.answers).toEqual([]);
});
for (const role of ["MEMBER", "UNIT_ADMIN", "FUNCTION_ADMIN", "FIRE_CHIEF", "GLOBAL_ADMIN", "vehicle", "combined"] as const) {
  test(`cockpit renders only server-authorized tasks for ${role}`, async ({ page }) => {
    await connect(page, role);
    if (role === "MEMBER" || role === "FIRE_CHIEF") await expect(page.getByRole("heading", { name: "Meine offenen Aufgaben" })).toHaveCount(0);
    else {
      await expect(page.getByRole("heading", { name: "Meine offenen Aufgaben" })).toBeVisible();
      await expect(page.locator(".cockpit-tasks li")).toHaveCount(role === "GLOBAL_ADMIN" || role === "combined" ? 3 : 1);
      if (role === "vehicle") await expect(page.locator(".cockpit-tasks")).not.toContainText("Registrierungen");
    }
  });
}
test("empty service, statistics, information and vehicle states do not fabricate data", async ({ page }) => {
  await connect(page, "MEMBER", data => {
    data.next_service = null; data.open_events = []; data.open_count = 0;
    data.information = []; data.reservations = []; data.statistics.services = 0; data.statistics.rate = null;
  });
  await expect(page.getByRole("heading", { name: "Raum für den nächsten Dienst" })).toBeVisible();
  await expect(page.locator(".cockpit-year")).toContainText("Noch keine bestätigten Dienste");
  await expect(page.locator(".cockpit-year")).not.toContainText("0 %");
  await expect(page.locator(".cockpit-information")).toContainText("keine für dich sichtbaren");
  await expect(page.locator(".cockpit-vehicles")).toContainText("Keine aktuellen eigenen");
});
test("unknown rate is explicitly non-computable and membership combinations are displayed", async ({ page }) => {
  await connect(page, "combined", data => {
    data.statistics.rate = null;
    data.units.push({ id: "b0641000-0000-4000-8000-000000000002", name: "Synthetic second unit" });
    data.functions = [{ id: "c0641000-0000-4000-8000-000000000002", name: "Synthetic special function" }];
  });
  await expect(page.locator(".cockpit-year")).toContainText("Nicht berechenbar");
  await expect(page.locator(".cockpit-header")).toContainText("Synthetic second unit");
  await expect(page.locator(".cockpit-header")).toContainText("Synthetic special function");
});
test("source links retain IDs and open the existing service module", async ({ page }) => {
  await connect(page);
  await expect(page.locator(".cockpit-information a")).toHaveAttribute("href", new RegExp(`bereich=kalender&termin=c064`));
  await expect(page.locator(".cockpit-vehicles a")).toHaveAttribute("href", new RegExp(`bereich=fahrzeuge&vorgang=f064`));
  await page.getByRole("link", { name: "Termindetails", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`termin=${event}`));
  await expect(page.getByRole("heading", { name: "Sichtbare DEV-Termine" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Synthetic cockpit practice" })).toBeVisible();
});
test("information deep link opens the retained calendar detail outside the displayed month", async ({ page }) => {
  const state = await connect(page);
  const item = state.data.information[0];
  const retainedQueries: string[][] = [];
  await page.context().route(`${api}/rest/v1/rpc/ff_calendar_context`, route => route.fulfill({ json: {
    organization: false, configure: false, units: state.data.units, manageable_units: [], functions: [],
    organizers: [{ id: actor, name: "Alex Synthetic" }], categories: [], resources: [],
  } }));
  await page.context().route(`${api}/rest/v1/rpc/ff_calendar_{page,upcoming}`, route => {
    retainedQueries.push(route.request().postDataJSON().retained_ids);
    return route.fulfill({ json: { server_now: state.data.server_now, next_cursor: null, events: [],
      retained_events: [{ ...item, description: "Synthetic retained information", location: "Synthetic station",
        starts_at: "2027-05-01T10:00:00Z", ends_at: "2027-05-01T12:00:00Z", event_type: "other",
        status: "scheduled", revision: 0, scope_kind: "organization", unit_id: null, function_id: null,
        organizer_id: actor, organizer_name: "Alex Synthetic", entry_kind: "information", all_day: false,
        audience: "scope", category_id: null, category_name: null, resource_id: null, resource_name: null,
        can_manage: false, unit_ids: [] }],
    } });
  });
  await page.locator(".cockpit-information a").click();
  await expect(page.getByRole("dialog", { name: item.title })).toBeVisible();
  expect(retainedQueries[0]).toEqual([item.id]);
  await page.getByRole("button", { name: "Dialog schließen", exact: true }).click();
  await page.getByRole("button", { name: "Kalender aktualisieren", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
test("own reservation deep link opens the existing retained vehicle request", async ({ page }) => {
  const state = await connect(page);
  const item = state.data.reservations[0], vehicle = "d0641000-0000-4000-8000-000000000001";
  await page.context().route(`${api}/rest/v1/rpc/ff_vehicle_requesters`, route => route.fulfill({ json: {
    actor_name: "Alex Synthetic", request_units: state.data.units, requesters: [{ id: actor, name: "Alex Synthetic", units: [unit] }],
  } }));
  await page.context().route(`${api}/rest/v1/rpc/ff_vehicle_workspace`, route => {
    expect(route.request().postDataJSON().retained_event).toBe(item.id);
    return route.fulfill({ json: {
      server_now: state.data.server_now, configure: false, units: state.data.units, own_units: state.data.units,
      people: [{ id: actor, name: "Alex Synthetic", units: [unit] }], types: [], purposes: [], items: [],
      tasks: [], tasks_total: 0, notifications: [], vehicles: [{
        id: vehicle, name: item.vehicle_name, resource_type: "vehicle", unit_id: unit, active: true, revision: 0,
        type_key: "mtf", call_sign: "", location: "Synthetic station", description: "", reservable: true,
        unit_admin_enabled: false, can_manage: false, current_access: true, usage_units: [unit], manager_ids: [],
      }], retained: { ...item, event_id: item.id, vehicle_id: vehicle, requester_id: actor,
        requester_name: "Alex Synthetic", responsible_id: actor, responsible_name: "Alex Synthetic",
        unit_id: unit, unit_name: "Scheuren", kind: "reservation", title: "Synthetic retained own reservation",
        description: "", ends_at: "2026-11-10T20:00:00Z", requested_at: state.data.server_now,
        purpose_key: "course", destination: "", notes: "", revision: 1, can_manage: false, own: true,
        decided_at: state.data.server_now, decided_by: actor, decision_reason: null,
        cancelled_at: null, cancelled_by: null, cancellation_reason: null, completed_at: null, completed_by: null },
    } });
  });
  await page.locator(".cockpit-vehicles a").click();
  await expect(page.getByRole("dialog", { name: "Synthetic retained own reservation" })).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText("Alex Synthetic");
});
test("desktop member layout fills the task-free sidebar with the personal year", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await connect(page);
  const next = await page.locator(".cockpit-next").boundingBox(), year = await page.locator(".cockpit-year").boundingBox();
  expect(next).not.toBeNull(); expect(year).not.toBeNull();
  expect(year!.y).toBe(next!.y);
});
test("background refresh preserves DOM identity, focus and scroll without a remount", async ({ page }) => {
  const state = await connect(page);
  const button = page.getByRole("button", { name: "Ich komme", exact: true });
  await button.focus();
  await page.evaluate(() => {
    const element = document.querySelector(".cockpit")!;
    element.setAttribute("data-retained-cockpit", "same-instance");
    window.scrollTo(0, 100);
  });
  const count = state.calls.filter(path => path.endsWith("/ff_dashboard")).length;
  state.data.open_count = 9;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect.poll(() => state.calls.filter(path => path.endsWith("/ff_dashboard")).length).toBeGreaterThan(count);
  await expect(page.locator(".cockpit-open")).toContainText("9 Rückmeldungen offen");
  await expect(page.locator(".cockpit")).toHaveAttribute("data-retained-cockpit", "same-instance");
  await expect(button).toBeFocused();
  expect(await page.evaluate(() => scrollY)).toBeGreaterThan(0);
});
test("permission or network failure clears protected dashboard content rather than returning demo or zeros", async ({ page }) => {
  const state = await connect(page, "GLOBAL_ADMIN"); state.fail = true;
  await page.getByRole("button", { name: "Cockpit aktualisieren" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("scope denied");
  await expect(page.locator(".cockpit-grid")).toHaveCount(0);
});
test("revoked session closes dashboard access on background revalidation", async ({ page }) => {
  const state = await connect(page); state.blocked = true;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByRole("heading", { name: "Zugang gesperrt" })).toBeVisible();
  await expect(page.locator(".cockpit")).toHaveCount(0);
});
for (const mode of ["light", "dark"] as const) {
  test(`mobile and desktop cockpit remain accessible in ${mode} mode`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: mode });
    await connect(page, "GLOBAL_ADMIN");
    await expect(page.getByRole("navigation", { name: "Mobile Navigation" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({ path: `test-results/cockpit-mobile-${mode}.png`, fullPage: true });
    await page.setViewportSize({ width: 320, height: 700 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await expect(page.getByRole("navigation", { name: "Hauptnavigation" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({ path: `test-results/cockpit-desktop-${mode}.png`, fullPage: true });
  });
}
