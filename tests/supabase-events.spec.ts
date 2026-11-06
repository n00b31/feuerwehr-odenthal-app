import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { APP, publicPath } from "../src/config/app";
import { localInput } from "../src/domain/time";

const api = "https://syntheticci.supabase.co";
const unit = "20000000-0000-4000-8000-000000000001";
const otherUnit = "20000000-0000-4000-8000-000000000002";
const admin = "10000000-0000-4000-8000-000000000001";
const member = "10000000-0000-4000-8000-000000000002";
const eventId = "30000000-0000-4000-8000-000000000001";
const specialFunction = "40000000-0000-4000-8000-000000000001";
type Response = "yes" | "no" | "maybe";
type Actual = "present" | "absent" | "unknown";
type Attendance = {
  state: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "CORRECTED"; initialized_at: string | null;
  initialized_by: string | null; prepared_at: string | null; confirmed_at: string | null;
  confirmed_by: string | null; corrected_at: string | null;
  rows: Map<string, { status: Actual; origin: "prefill" | "manual"; response: Response | null; recorded_at: string }>;
};
type StoredEvent = {
  id: string; title: string; description: string; event_type: string; location: string;
  starts_at: string; ends_at: string; unit_id: string; status: "scheduled" | "cancelled"; revision: number;
};
function store() {
  return {
    events: [] as StoredEvent[], answers: new Map<string, Response>(),
    audit: [] as { actor: string; before: Response | undefined; after: Response }[],
    now: Date.now(), broken: false, denyCreation: false, tokenLifetime: 3600, invalidSession: false,
    authGrants: [] as string[], accessChecks: 0, queries: [] as Record<string, unknown>[],
    memberUnit: unit, memberAdmin: false, memberSuspended: false, memberFunction: false,
    roster: [admin, member], attendance: new Map<string, Attendance>(), delegates: new Map<string, { user: string; note: string }>(),
    attendanceAudit: [] as { event: string; actor: string; action: string; user?: string; before?: Actual; after?: Actual; reason?: string }[],
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
    const actorUnit = isAdmin ? unit : state.memberUnit || null;
    const name = (id: string) => id === admin ? "Synthetic Admin" : id === member ? "Synthetic Member" : `Synthetic Person ${id.slice(-1)}`;
    const leader = (id: string) => isAdmin || state.delegates.get(id)?.user === actor;
    const attendance = (id: string) => {
      if (!state.attendance.has(id)) state.attendance.set(id, { state: "NOT_STARTED", initialized_at: null, initialized_by: null,
        prepared_at: null, confirmed_at: null, confirmed_by: null, corrected_at: null, rows: new Map() });
      return state.attendance.get(id)!;
    };
    const final = (id: string) => ["COMPLETED","CORRECTED"].includes(attendance(id).state);
    if (path === "/auth/v1/token") {
      state.authGrants.push(new URL(request.url()).searchParams.get("grant_type") ?? "");
      const payload = Buffer.from(JSON.stringify({ sub: actor, aud: "authenticated", role: "authenticated", exp: Math.floor(Date.now()/1000)+state.tokenLifetime })).toString("base64url");
      return respond({ access_token: `eyJhbGciOiJIUzI1NiJ9.${payload}.synthetic-signature`,
        refresh_token: "synthetic-only", token_type: "bearer", expires_in: state.tokenLifetime, user: user() });
    }
    if (path === "/auth/v1/user") return state.invalidSession ? respond({ code: "bad_jwt", message: "Synthetic invalid session" }, 401) : respond(user());
    if (path === "/auth/v1/logout") return route.fulfill({ status: 204 });
    if (path === "/rest/v1/rpc/ff_my_access") return respond({
      ...(state.accessChecks++, {}),
      user_id: actor, display_name: isAdmin ? "Synthetic Admin" : "Synthetic Member",
      account_status: !isAdmin && state.memberSuspended ? "suspended" : "approved",
      access_granted: isAdmin || (!state.memberSuspended && !!actorUnit), unit_id: actorUnit,
      unit_name: actorUnit === unit ? "Scheuren" : actorUnit ? "Andere Einheit" : null,
      roles: isAdmin ? ["MEMBER","GLOBAL_ADMIN"] : state.memberAdmin ? ["MEMBER","UNIT_ADMIN"] : ["MEMBER"],
    });
    if (path === "/rest/v1/rpc/ff_members_workspace") {
      if (!isAdmin && (!state.memberAdmin || state.memberSuspended)) return denied();
      const person = (id: string) => {
        const root = id === admin;
        const currentUnit = root ? unit : state.memberUnit || null;
        return {
          user_id: id, display_name: root ? "Synthetic Admin" : "Synthetic Member",
          status: !root && state.memberSuspended ? "suspended" : "approved", access_granted: root || (!state.memberSuspended && !!currentUnit),
          unit_id: currentUnit, unit_name: currentUnit === unit ? "Scheuren" : currentUnit ? "Andere Einheit" : null,
          can_change_membership: isAdmin,
          roles: isAdmin ? [{ role: "MEMBER", unit_id: null, function_id: null },
            ...(root ? [{ role: "GLOBAL_ADMIN", unit_id: null, function_id: null }]
              : state.memberAdmin ? [{ role: "UNIT_ADMIN", unit_id: currentUnit, function_id: null }] : [])] : [],
          functions: !root && state.memberFunction ? [{ id: specialFunction, name: "Synthetic Atemschutz" }] : [],
          unit_history: [{ unit_id: currentUnit ?? unit, unit_name: currentUnit === otherUnit ? "Andere Einheit" : "Scheuren",
            valid_from: new Date(state.now - 86400000).toISOString(), valid_until: currentUnit ? null : new Date(state.now).toISOString() }],
        };
      };
      return respond({ global_admin: isAdmin,
        units: isAdmin ? [{ id: unit, name: "Scheuren" }, { id: otherUnit, name: "Andere Einheit" }]
          : [{ id: state.memberUnit, name: state.memberUnit === unit ? "Scheuren" : "Andere Einheit" }],
        functions: isAdmin ? [{ id: specialFunction, name: "Synthetic Atemschutz" }] : [],
        members: (isAdmin ? [admin,member] : [member]).map(person),
      });
    }
    if (path === "/rest/v1/rpc/ff_set_unit_membership") {
      const input = request.postDataJSON();
      if (!isAdmin || input.target_user !== member || input.reason.trim().length < 5) return denied();
      state.memberUnit = input.assign ? input.target_unit : "";
      return respond(null);
    }
    if (path === "/rest/v1/rpc/ff_set_role") {
      const input = request.postDataJSON();
      if (!isAdmin || input.target_user !== member || input.wanted_role !== "UNIT_ADMIN") return denied();
      state.memberAdmin = input.assign;
      return respond(null);
    }
    if (path === "/rest/v1/rpc/ff_set_function_membership") {
      const input = request.postDataJSON();
      if (!isAdmin || input.target_user !== member) return denied();
      state.memberFunction = input.assign;
      return respond(null);
    }
    if (path === "/rest/v1/rpc/ff_set_account_status" || path === "/rest/v1/rpc/ff_reactivate_member") {
      const input = request.postDataJSON();
      if (!isAdmin || input.target_user !== member) return denied();
      state.memberSuspended = path.endsWith("ff_set_account_status");
      return respond(null);
    }
    if (path === "/rest/v1/rpc/ff_events_page") {
      if (state.broken) return respond({ code: "503", message: "Synthetic outage" }, 503);
      const query = request.postDataJSON(); state.queries.push(query);
      const eligible = state.events.filter((e) => isAdmin || e.unit_id === unit);
      const sorted = eligible.filter((e) => (query.status_filter === "all" || e.status === query.status_filter)
        && (query.list_view === "past" ? Date.parse(e.ends_at) <= state.now : query.list_view === "month"
          ? localInput(e.starts_at).slice(0, 7) === query.month_key : Date.parse(e.ends_at) > state.now))
        .sort((a, b) => (Date.parse(a.starts_at) - Date.parse(b.starts_at) || a.id.localeCompare(b.id)) * (query.list_view === "past" ? -1 : 1))
        .filter((e) => !query.after_id || Date.parse(e.starts_at) > Date.parse(query.after_start)
          || (Date.parse(e.starts_at) === Date.parse(query.after_start) && e.id > query.after_id));
      const limit = query.list_view === "month" ? 50 : 5;
      const selected = sorted.slice(0, limit);
      const retained = eligible.filter((e) => query.retained_ids.includes(e.id) && !selected.some((item) => item.id === e.id));
      const serialize = (e: StoredEvent) => ({
        ...e, series_id: null, response_deadline: null, scope_name: e.unit_id === unit ? "Scheuren" : "Andere Einheit",
        can_manage: isAdmin, can_lead: leader(e.id), can_delegate: isAdmin, can_read_attendance: leader(e.id),
        attendance_state: attendance(e.id).state, own_attendance: final(e.id) ? attendance(e.id).rows.get(actor)?.status ?? null : null,
        in_roster: e.unit_id === unit, own_response: state.answers.get(`${e.id}:${actor}`) ?? null,
        participants: leader(e.id) ? state.roster.map((id) => ({
          user_id: id, name: name(id), response: state.answers.get(`${e.id}:${id}`) ?? null, updated_at: null,
        })) : null,
      });
      return respond({
        server_now: new Date(state.now).toISOString(), manageable_units: isAdmin ? [{ id: unit, name: "Scheuren" }] : [],
        events: selected.map(serialize), retained_events: retained.map(serialize), has_more: sorted.length > limit,
        next_cursor: query.list_view === "month" && sorted.length > limit ? { id: selected.at(-1)!.id, starts_at: selected.at(-1)!.starts_at } : null,
      });
    }
    if (path === "/rest/v1/rpc/ff_attendance_workspace") {
      const id: string = request.postDataJSON().target_event;
      const e = state.events.find((item) => item.id === id);
      if (!e || !leader(id)) return denied();
      const a = attendance(id); const delegate = state.delegates.get(id);
      return respond({ ...a, rows: undefined, server_now: new Date(state.now).toISOString(), event_id: id,
        title: e.title, starts_at: e.starts_at, ends_at: e.ends_at, event_type: e.event_type,
        event_status: e.status, scope_name: "Scheuren", can_manage: leader(id), can_delegate: isAdmin,
        organizer_name: delegate ? name(delegate.user) : name(admin),
        primary_organizer: delegate ? { user_id: delegate.user, name: name(delegate.user), note: delegate.note, access_granted: true } : null,
        candidates: isAdmin ? state.roster.map((id) => ({ id, name: name(id) })) : [],
        members: state.roster.map((user) => {
          const row = a.rows.get(user);
          return { user_id: user, name: name(user), response: row ? row.response : state.answers.get(`${id}:${user}`) ?? null,
            response_known: true, status: row?.status ?? null, origin: row?.origin ?? null, recorded_at: row?.recorded_at ?? null };
        }),
      });
    }
    if (path === "/rest/v1/rpc/ff_set_primary_organizer") {
      const input = request.postDataJSON();
      if (!isAdmin || (input.target_user && !state.roster.includes(input.target_user))) return denied();
      if (input.target_user) state.delegates.set(input.target_event, { user: input.target_user, note: input.internal_note });
      else state.delegates.delete(input.target_event);
      return respond(null);
    }
    if (["/rest/v1/rpc/ff_prepare_attendance","/rest/v1/rpc/ff_record_attendance","/rest/v1/rpc/ff_confirm_attendance"].includes(path)) {
      const input = request.postDataJSON(); const id: string = input.target_event;
      const e = state.events.find((item) => item.id === id);
      if (!e || !leader(id) || state.now < Date.parse(e.starts_at) || e.status !== "scheduled") return denied();
      const a = attendance(id); const stamp = new Date(state.now).toISOString();
      if (path.endsWith("ff_prepare_attendance")) {
        if (a.prepared_at || final(id)) return respond(null);
        for (const user of state.roster) if (!a.rows.has(user)) {
          const response = state.answers.get(`${id}:${user}`) ?? null;
          a.rows.set(user, { status: response === "yes" ? "present" : "absent",
            origin: "prefill", response, recorded_at: stamp });
        }
        a.state = "IN_PROGRESS"; a.prepared_at = stamp; a.initialized_at ??= stamp; a.initialized_by ??= name(actor);
        state.attendanceAudit.push({ event: id, actor, action: "prepare" });
      } else if (path.endsWith("ff_record_attendance")) {
        if (!state.roster.includes(input.target_user) || (final(id) && (input.attendance_status === "unknown" || (input.reason?.trim().length ?? 0) < 5))) return denied();
        const previous = a.rows.get(input.target_user);
        const confirmed = final(id);
        a.rows.set(input.target_user, { status: input.attendance_status, origin: "manual",
          response: previous ? previous.response : state.answers.get(`${id}:${input.target_user}`) ?? null, recorded_at: stamp });
        a.state = confirmed ? "CORRECTED" : "IN_PROGRESS"; a.initialized_at ??= stamp; a.initialized_by ??= name(actor);
        if (confirmed) a.corrected_at = stamp;
        state.attendanceAudit.push({ event: id, actor, action: confirmed ? "correct" : "record", user: input.target_user,
          before: previous?.status, after: input.attendance_status, reason: input.reason ?? undefined });
      } else {
        if (final(id)) return respond(null);
        if (!a.prepared_at || !state.roster.length || state.roster.some((user) => !a.rows.has(user) || a.rows.get(user)?.status === "unknown")) return denied();
        a.state = "COMPLETED"; a.confirmed_at = stamp; a.confirmed_by = name(actor);
        state.attendanceAudit.push({ event: id, actor, action: "complete" });
      }
      return respond(null);
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
    if (path === "/rest/v1/confirmed_attendance") return respond(state.events.filter((e) => final(e.id) && attendance(e.id).rows.has(actor)).map((e) => ({
      event_id: e.id, user_id: actor, title: e.title, starts_at: e.starts_at, status: attendance(e.id).rows.get(actor)!.status,
      report_year: new Date(e.starts_at).getFullYear(), training_hours: 2,
    })));
    if (path === "/rest/v1/document_areas" || path === "/rest/v1/rpc/ff_pending_registrations") return respond([]);
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

function attendanceEvent(state: Store, delay = -1000): StoredEvent {
  return { id: eventId, title: "Synthetic Anwesenheitsdienst", description: "Nur synthetischer Protokolltest", event_type: "regular",
    unit_id: unit, location: "Synthetic Gerätehaus", starts_at: new Date(state.now + delay).toISOString(),
    ends_at: new Date(state.now + delay + 7200000).toISOString(), status: "scheduled", revision: 0 };
}

test("attendance prefill, filters, explicit completion, own final data and reasoned correction survive reload across themes", async ({ browser }) => {
  const state = store(); state.events = [attendanceEvent(state)];
  const maybe = "10000000-0000-4000-8000-000000000003", unanswered = "10000000-0000-4000-8000-000000000004";
  state.roster.push(maybe, unanswered);
  state.answers.set(`${eventId}:${admin}`, "yes"); state.answers.set(`${eventId}:${member}`, "no"); state.answers.set(`${eventId}:${maybe}`, "maybe");
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const memberContext = await browser.newContext();
  await connect(context, state, admin); await connect(memberContext, state, member);
  const page = await context.newPage(), memberPage = await memberContext.newPage();
  await login(page, true);
  await page.getByRole("button", { name: "Anwesenheit öffnen" }).click();
  const panel = page.getByRole("region", { name: "Tatsächliche Anwesenheit" });
  await expect(panel.getByText("In Bearbeitung", { exact: true })).toBeVisible();
  await expect(panel.getByRole("listitem", { name: "Synthetic Admin" })).toContainText("Anwesend · Vorläufig");
  await expect(panel.getByRole("listitem", { name: "Synthetic Member" })).toContainText("Abwesend · Vorläufig");
  await expect(panel.getByRole("button", { name: "Liste abschließen" })).toBeEnabled();
  await expect(panel.getByRole("listitem", { name: "Synthetic Person 3" })).toContainText("Abwesend · Vorläufig");
  await expect(panel.getByRole("listitem", { name: "Synthetic Person 4" })).toContainText("Abwesend · Vorläufig");
  await panel.getByRole("listitem", { name: "Synthetic Person 3" }).getByRole("button", { name: "Nicht festgestellt", exact: true }).click();
  await panel.getByRole("listitem", { name: "Synthetic Person 4" }).getByRole("button", { name: "Nicht festgestellt", exact: true }).click();
  await expect(panel.getByRole("button", { name: "Liste abschließen" })).toBeDisabled();
  await panel.getByRole("combobox", { name: "Anwesenheitsfilter", exact: true }).selectOption("unknown");
  await expect(panel.getByRole("listitem")).toHaveCount(2);
  await panel.getByRole("listitem", { name: "Synthetic Person 3" }).getByRole("button", { name: "Abwesend", exact: true }).click();
  await expect(panel.getByRole("listitem")).toHaveCount(1);
  await panel.getByRole("listitem", { name: "Synthetic Person 4" }).getByRole("button", { name: "Abwesend", exact: true }).click();
  await expect(panel.getByRole("listitem")).toHaveCount(0);
  await panel.getByRole("combobox", { name: "Anwesenheitsfilter", exact: true }).selectOption("all");
  await panel.getByLabel("Mitglied suchen", { exact: true }).fill("Member");
  await expect(panel.getByRole("listitem")).toHaveCount(1);
  await panel.getByLabel("Mitglied suchen", { exact: true }).fill("");
  await panel.getByRole("button", { name: "Liste abschließen" }).click();
  const dialog = page.getByRole("dialog", { name: "Anwesenheitsliste verbindlich abschließen" });
  await expect(dialog).toBeVisible();
  expect(state.attendanceAudit.filter((row) => row.action === "complete")).toHaveLength(0);
  await dialog.getByRole("button", { name: "Weiter prüfen" }).click();
  await panel.getByRole("button", { name: "Liste abschließen" }).click();
  await dialog.getByRole("button", { name: "Abschluss bestätigen" }).click();
  await expect(panel.getByText("Verbindlich abgeschlossen", { exact: true })).toBeVisible();
  await page.reload(); await page.getByRole("button", { name: "Anwesenheit öffnen" }).click();
  await expect(panel.getByText("Verbindlich abgeschlossen", { exact: true })).toBeVisible();
  expect(state.attendanceAudit.filter((row) => row.action === "prepare")).toHaveLength(1);
  expect(state.attendanceAudit.filter((row) => row.action === "complete")).toHaveLength(1);
  await login(memberPage, false);
  await expect(memberPage.getByText("Deine bestätigte Anwesenheit: Abwesend", { exact: true })).toBeVisible();
  await expect(memberPage.getByRole("button", { name: "Anwesenheit öffnen" })).toHaveCount(0);
  await panel.getByRole("listitem", { name: "Synthetic Member" }).getByRole("button", { name: "Anwesend", exact: true }).click();
  const correction = page.getByRole("dialog", { name: "Bestätigte Anwesenheit korrigieren" });
  await expect(correction.getByRole("button", { name: "Begründete Korrektur speichern" })).toBeDisabled();
  await correction.getByLabel("Begründung der Anwesenheitskorrektur").fill("Synthetic überprüfte spätere Ankunft");
  await correction.getByRole("button", { name: "Begründete Korrektur speichern" }).click();
  await expect(panel.getByText("Nachträglich korrigiert", { exact: true })).toBeVisible();
  await expect(panel.getByRole("listitem", { name: "Synthetic Member" }).getByRole("button", { name: "Anwesend", exact: true })).toBeDisabled();
  expect(state.attendanceAudit.find((row) => row.action === "correct")).toMatchObject({
    event: eventId, actor: admin, user: member, before: "absent", after: "present", reason: "Synthetic überprüfte spätere Ankunft",
  });
  await memberPage.getByRole("button", { name: "Termine aktualisieren" }).click();
  await expect(memberPage.getByText("Deine bestätigte Anwesenheit: Anwesend", { exact: true })).toBeVisible();
  for (const width of [390, 1366]) {
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ["light", "dark"]) {
      if (await page.locator("html").getAttribute("data-theme") !== theme) await page.getByRole("button", { name: "Farbschema wechseln" }).click();
      await expect.poll(() => page.evaluate(() => document.getAnimations().filter((animation) =>
        animation.playState === "running" && Number.isFinite(animation.effect?.getComputedTiming().endTime)).length)).toBe(0);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const present = panel.getByRole("listitem", { name: "Synthetic Admin" }).getByRole("button", { name: "Anwesend", exact: true });
      const absent = panel.getByRole("listitem", { name: "Synthetic Person 3" }).getByRole("button", { name: "Abwesend", exact: true });
      await expect(present.locator("svg.lucide-check")).toHaveCount(1);
      await expect(absent.locator("svg.lucide-x")).toHaveCount(1);
      await expect(panel.getByRole("button", { name: "Nicht festgestellt", exact: true }).first().locator("svg")).toHaveCount(0);
      const green = (await present.evaluate((element) => getComputedStyle(element).backgroundColor)).match(/\d+(?:\.\d+)?/g)!.map(Number);
      const red = (await absent.evaluate((element) => getComputedStyle(element).backgroundColor)).match(/\d+(?:\.\d+)?/g)!.map(Number);
      expect(green[1]).toBeGreaterThan(green[0]); expect(green[1]).toBeGreaterThan(green[2]);
      expect(red[0]).toBeGreaterThan(red[1]); expect(red[0]).toBeGreaterThan(red[2]);
      await panel.scrollIntoViewIfNeeded();
      await page.screenshot({ path: `test-results/dev033-attendance-${width}-${theme}.png` });
    }
  }
  await context.close(); await memberContext.close();
});

test("event-only organizer can work without an admin role and loses access on the next request after revocation", async ({ browser }) => {
  const state = store(); state.events = [attendanceEvent(state, 60000), { ...attendanceEvent(state, 60000),
    id: "30000000-0000-4000-8000-000000000002", title: "Synthetic anderer Dienst" }];
  const adminContext = await browser.newContext(), memberContext = await browser.newContext();
  await connect(adminContext, state, admin); await connect(memberContext, state, member);
  const page = await adminContext.newPage(), memberPage = await memberContext.newPage();
  await login(page, true);
  const event = page.locator(".dev-event").filter({ has: page.getByRole("heading", { name: "Synthetic Anwesenheitsdienst" }) });
  await event.getByRole("button", { name: "Organisator zuweisen" }).click();
  const panel = event.getByRole("region", { name: "Tatsächliche Anwesenheit" });
  await panel.getByRole("combobox", { name: "Organisator", exact: true }).selectOption(member);
  await panel.getByLabel("Interne Notiz (optional)").fill("Synthetic nur dieser Termin");
  await panel.getByRole("button", { name: "Dienstleitung speichern" }).click();
  await expect(panel.getByRole("status").filter({ hasText: "Terminbezogene Dienstleitung gespeichert" })).toBeVisible();
  expect(state.attendanceAudit).toHaveLength(0);
  state.now += 60001;
  await login(memberPage, false);
  await expect(memberPage.getByRole("link", { name: "Administration", exact: true })).toHaveCount(0);
  await expect(memberPage.getByRole("button", { name: "Anwesenheit öffnen" })).toHaveCount(1);
  await memberPage.getByRole("button", { name: "Anwesenheit öffnen" }).click();
  const memberPanel = memberPage.getByRole("region", { name: "Tatsächliche Anwesenheit" });
  await expect(memberPanel.getByText("In Bearbeitung", { exact: true })).toBeVisible();
  await expect(memberPanel.getByRole("button", { name: "Dienstleitung speichern" })).toHaveCount(0);
  await memberPanel.getByRole("listitem", { name: "Synthetic Member" }).getByRole("button", { name: "Anwesend", exact: true }).click();
  await expect(memberPanel.getByRole("status").filter({ hasText: "Anwesenheit für Synthetic Member gespeichert" })).toBeVisible();
  const status = await memberPage.evaluate(async ({ api, id }) => {
    const result = await fetch(`${api}/rest/v1/rpc/ff_prepare_attendance`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ target_event: id }),
    }); return result.status;
  }, { api, id: state.events[1].id });
  expect(status).toBe(403);
  await panel.getByRole("button", { name: "Delegation widerrufen" }).click();
  await expect(panel.getByRole("status").filter({ hasText: "Delegation widerrufen" })).toBeVisible();
  const before = state.attendanceAudit.length;
  await memberPanel.getByRole("listitem", { name: "Synthetic Admin" }).getByRole("button", { name: "Anwesend", exact: true }).click();
  await expect(memberPanel.getByRole("alert")).toContainText("Anfrage abgewiesen");
  await expect(memberPanel.getByRole("listitem")).toHaveCount(0);
  expect(state.attendanceAudit).toHaveLength(before);
  await memberPage.getByRole("button", { name: "Termine aktualisieren" }).click();
  await expect(memberPage.getByRole("button", { name: "Anwesenheit öffnen" })).toHaveCount(0);
  await adminContext.close(); await memberContext.close();
});

test("a forged browser wall clock unlocks neither attendance UI nor synthetic server-time gate", async ({ context, page }) => {
  const state = store(); state.events = [attendanceEvent(state, 3600000)];
  await context.addInitScript(() => { Date.now = () => 4_000_000_000_000; });
  await connect(context, state, admin); await login(page, true);
  await expect(page.getByRole("button", { name: "Anwesenheit öffnen" })).toBeDisabled();
  const status = await page.evaluate(async ({ api, id }) => (await fetch(`${api}/rest/v1/rpc/ff_prepare_attendance`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ target_event: id }),
  })).status, { api, id: eventId });
  expect(status).toBe(403);
  expect(state.attendanceAudit).toHaveLength(0);
});

test("background access checks, real SDK token renewal and page refetch retain dialog, draft, filter and DOM identity", async ({ context, page }) => {
  const state = store(); state.events = [attendanceEvent(state)]; state.tokenLifetime = 120;
  await page.clock.install();
  await connect(context, state, admin); await login(page, true);
  let documents = 0;
  page.on("request", (request) => { if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documents++; });
  await page.getByRole("button", { name: "Einzeltermin erstellen" }).click();
  const title = page.getByLabel("Titel", { exact: true }); await title.fill("Unfertiger Entwurf bleibt erhalten");
  const input = await title.elementHandle();
  await page.getByRole("button", { name: "Anwesenheit öffnen" }).click();
  const panel = page.getByRole("region", { name: "Tatsächliche Anwesenheit" });
  await panel.getByLabel("Mitglied suchen", { exact: true }).fill("Member");
  await panel.getByRole("combobox", { name: "Anwesenheitsfilter", exact: true }).selectOption("absent");
  const element = await panel.elementHandle();
  await panel.getByRole("button", { name: "Liste abschließen" }).click();
  const dialog = page.getByRole("dialog", { name: "Anwesenheitsliste verbindlich abschließen" });
  const dialogElement = await dialog.elementHandle();
  const scrollBefore = await page.evaluate(() => scrollY);
  const previous = state.accessChecks;
  await page.clock.fastForward(125_000);
  await expect.poll(() => state.authGrants.includes("refresh_token")).toBe(true);
  await expect.poll(() => state.accessChecks).toBeGreaterThan(previous);
  await expect(dialog).toBeVisible();
  expect(await dialogElement!.evaluate((node) => node.isConnected)).toBe(true);
  expect(await input!.evaluate((node) => node.isConnected)).toBe(true);
  expect(await element!.evaluate((node) => node.isConnected)).toBe(true);
  expect(Math.abs(await page.evaluate(() => scrollY) - scrollBefore)).toBeLessThan(2);
  await expect(title).toHaveValue("Unfertiger Entwurf bleibt erhalten");
  await dialog.getByRole("button", { name: "Weiter prüfen" }).click();
  await expect(panel.getByLabel("Mitglied suchen", { exact: true })).toHaveValue("Member");
  await expect(panel.getByRole("combobox", { name: "Anwesenheitsfilter", exact: true })).toHaveValue("absent");
  // Displace the open event from the next bounded page without closing its panel.
  for (let i=2;i<=6;i++) state.events.push({ ...attendanceEvent(state,-i*1000),
    id: `30000000-0000-4000-8000-${String(i).padStart(12,"0")}`, title: `Synthetic displaced ${i}` });
  await page.clock.fastForward(31_000);
  await expect(page.getByText(/Geöffneter Termin außerhalb/)).toBeVisible();
  expect(await element!.evaluate((node) => node.isConnected)).toBe(true);
  await expect(title).toHaveValue("Unfertiger Entwurf bleibt erhalten");
  expect(documents).toBe(0);
  state.invalidSession = true;
  await page.getByRole("button", { name: "Aktualisieren", exact: true }).click();
  await expect(page.getByRole("heading", { name: "DEV-Zugriff nicht verfügbar" })).toBeVisible();
  await expect(panel).toHaveCount(0);
});

test("bounded upcoming/history lists, Berlin month picker and keyset load-more persist through revalidation", async ({ context, page }) => {
  const state = store(); state.now = Date.parse("2026-11-06T12:00:00Z");
  const base = attendanceEvent(state, 86400000);
  state.events = Array.from({ length: 55 }, (_, i) => ({ ...base,
    id: `31000000-0000-4000-8000-${String(i+1).padStart(12,"0")}`, title: `November ${String(i+1).padStart(2,"0")}`,
    starts_at: "2026-11-15T12:00:00Z", ends_at: "2026-11-15T14:00:00Z" }));
  for (let i=1;i<=7;i++) state.events.push({ ...base,
    id: `32000000-0000-4000-8000-${String(i).padStart(12,"0")}`, title: `Historie ${i}`,
    starts_at: `2026-11-01T0${i}:00:00Z`, ends_at: `2026-11-01T0${i+1}:00:00Z` });
  state.events.push({ ...base, title: "Laufender Dienst", starts_at: "2026-11-05T12:00:00Z", ends_at: "2026-11-07T12:00:00Z" },
    { ...base, id: "33000000-0000-4000-8000-000000000001", title: "Januar 2027",
      starts_at: "2026-12-31T23:00:00Z", ends_at: "2027-01-01T01:00:00Z" });
  await page.clock.install(); await connect(context, state, member); await login(page, false);
  const cards = page.locator(".dev-event h3");
  await expect(cards).toHaveText(["Laufender Dienst","November 01","November 02","November 03","November 04"]);
  await page.getByRole("combobox", { name: "Terminansicht", exact: true }).selectOption("past");
  await expect(cards).toHaveText(["Historie 7","Historie 6","Historie 5","Historie 4","Historie 3"]);
  await page.getByLabel("Monat und Jahr", { exact: true }).fill("2026-11");
  await expect(cards).toHaveCount(50);
  await expect(page.getByText("November 2026 · chronologisch", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Weitere Termine laden" }).click();
  await expect(cards).toHaveCount(63);
  await expect(page.getByRole("button", { name: "Weitere Termine laden" })).toHaveCount(0);
  const count = state.accessChecks;
  await page.clock.fastForward(61_000);
  await expect.poll(() => state.accessChecks).toBeGreaterThan(count);
  await expect(cards).toHaveCount(63);
  await expect(page.getByLabel("Monat und Jahr", { exact: true })).toHaveValue("2026-11");
  await expect(page.getByRole("combobox", { name: "Terminansicht", exact: true })).toHaveValue("month");
  expect(state.queries.some((query) => query.after_id)).toBe(true);
  await page.getByLabel("Monat und Jahr", { exact: true }).fill("2027-01");
  await expect(cards).toHaveText(["Januar 2027"]);
  await page.getByRole("button", { name: "Standardansicht wiederherstellen" }).click();
  await expect(cards).toHaveCount(5);
  await expect(page.getByLabel("Monat und Jahr", { exact: true })).toHaveValue("");
});

test("unsupported native month picker validates partial text before rendering or requesting a month", async ({ context, page }) => {
  const state = store(); await connect(context,state,member); await login(page,false);
  const picker = page.getByLabel("Monat und Jahr", { exact: true });
  await picker.evaluate((element) => { element.setAttribute("type","text"); });
  const queries = state.queries.length;
  await picker.fill("202");
  await expect(page.getByRole("main").getByRole("alert")).toContainText("JJJJ-MM");
  await expect(page.getByRole("heading", { name: "Sichtbare DEV-Termine" })).toBeVisible();
  expect(state.queries).toHaveLength(queries);
  await picker.fill("2027-01");
  await expect(page.getByText("Januar 2027 · chronologisch", { exact: false })).toBeVisible();
  await expect.poll(() => state.queries.some((query) => query.month_key === "2027-01")).toBe(true);
});

test("two independent sessions centrally create, respond, change, reload, edit and cancel one shared event", async ({ browser }) => {
  const state = store();
  const adminContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const memberContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await connect(adminContext, state, admin); await connect(memberContext, state, member);
  const adminPage = await adminContext.newPage(); const memberPage = await memberContext.newPage();
  await login(adminPage, true); await login(memberPage, false);
  await create(adminPage, state);
  await expect(adminPage.getByRole("status").filter({ hasText: "Termin in Supabase erstellt" })).toBeVisible();
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
  await expect.poll(() => memberPage.evaluate(() => document.getAnimations().filter((animation) =>
    animation.playState === "running" && Number.isFinite(animation.effect?.getComputedTiming().endTime)).length)).toBe(0);
  expect((await new AxeBuilder({ page: memberPage }).analyze()).violations).toEqual([]);
  await memberPage.screenshot({ path: "test-results/dev-events-member-dark.png", fullPage: true });
  await adminPage.screenshot({ path: "test-results/dev-events-admin-light.png", fullPage: true });
  expect(await memberPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await memberPage.evaluate((key) => [
    localStorage.getItem(key), localStorage.getItem(`${key}-profile`),
  ], APP.storageKey)).toEqual([null, null]);
  await adminPage.getByRole("button", { name: "Termin absagen", exact: true }).click();
  await adminPage.getByLabel("Absagegrund", { exact: true }).fill("Synthetic Absagegrund");
  await adminPage.getByRole("button", { name: "Absage bestätigen" }).click();
  await memberPage.reload();
  await expect(memberPage.getByRole("button", { name: "Vielleicht", exact: true })).toBeDisabled();
  expect(state.answers.get(`${eventId}:${member}`)).toBe("maybe");
  await adminContext.close(); await memberContext.close();
});

test("global membership, role, function and status changes are reflected in renewed member access", async ({ browser }) => {
  const state = store();
  const a = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const m = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await connect(a,state,admin); await connect(m,state,member);
  const page = await a.newPage(); const memberPage = await m.newPage();
  await login(page,true); await login(memberPage,false);
  await expect(page.locator(".sidebar")).toBeVisible();
  await expect(page.getByRole("navigation",{ name: "Mobile Navigation" })).toBeHidden();
  await page.getByRole("link",{ name: "Administration", exact: true }).click();
  await expect(page.getByRole("heading",{ name: "Mitgliederverwaltung" })).toBeVisible();
  const row = page.locator(".dev-member").filter({ has: page.getByText("Synthetic Member", { exact: true }) });
  await row.locator("summary").click();
  await row.getByLabel("Änderungsgrund für Synthetic Member", { exact: true }).fill("Synthetic membership test");
  await row.getByRole("combobox", { name: "Einheit für Synthetic Member", exact: true }).selectOption(otherUnit);
  await row.getByRole("button",{ name: "Einheitszuordnung speichern" }).click();
  await expect(row.locator("summary")).toContainText("Andere Einheit");
  await memberPage.reload();
  await expect(memberPage.getByText(/Andere Einheit · Mitglied/)).toBeVisible();
  await row.getByRole("combobox", { name: "Neue Rolle für Synthetic Member", exact: true }).selectOption("UNIT_ADMIN");
  await row.getByRole("combobox", { name: "Rollenbereich", exact: true }).selectOption(otherUnit);
  await row.getByRole("button",{ name: "Rolle zuweisen", exact: true }).click();
  await expect(row.getByRole("button",{ name: "Rolle Einheitsführer · Andere Einheit entfernen" })).toBeVisible();
  await memberPage.reload();
  await memberPage.getByRole("link",{ name: "Administration", exact: true }).click();
  await expect(memberPage.getByText(/Nur eigene Einheiten/)).toBeVisible();
  await expect(memberPage.getByRole("button",{ name: "Rolle zuweisen", exact: true })).toHaveCount(0);
  await row.getByRole("button",{ name: "Rolle Einheitsführer · Andere Einheit entfernen" }).click();
  await expect(row.getByRole("button",{ name: "Rolle Einheitsführer · Andere Einheit entfernen" })).toHaveCount(0);
  await memberPage.reload();
  await expect(memberPage.getByRole("link",{ name: "Administration", exact: true })).toHaveCount(0);
  await expect(memberPage.getByRole("main").getByRole("alert")).toContainText("Keine Berechtigung zur Mitgliederverwaltung");
  await row.getByRole("combobox", { name: "Sonderfunktion", exact: true }).selectOption(specialFunction);
  await row.getByRole("button",{ name: "Sonderfunktion zuweisen" }).click();
  await expect(row.getByRole("button",{ name: "Sonderfunktion Synthetic Atemschutz entfernen" })).toBeVisible();
  await row.getByRole("button",{ name: "Mitglied deaktivieren", exact: true }).click();
  await expect(row.locator("summary")).toContainText("Deaktiviert");
  await memberPage.reload();
  await expect(memberPage.getByRole("heading",{ name: "Zugang gesperrt" })).toBeVisible();
  await row.getByRole("button",{ name: "Mitglied reaktivieren", exact: true }).click();
  await expect(row.locator("summary")).toContainText("Freigegeben");
  await memberPage.goto(publicPath("/termine/"));
  await expect(memberPage.getByRole("heading",{ name: "Hallo Synthetic Member" })).toBeVisible();
  await expect(memberPage.getByRole("navigation",{ name: "Mobile Navigation" })).toBeVisible();
  await expect(memberPage.locator(".sidebar")).toBeHidden();
  await expect.poll(() => page.evaluate(() => document.getAnimations().filter((x) => x.playState === "running" &&
    Number.isFinite(x.effect?.getComputedTiming().endTime)).length)).toBe(0);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  const sidebar = await page.locator(".sidebar").boundingBox();
  expect(sidebar?.x).toBe(0);
  expect(sidebar?.y).toBe(0);
  await page.screenshot({ path: "test-results/dev031-members-desktop.png" });
  await a.close(); await m.close();
});

test("member API cannot change roles or units and responsive navigation survives viewport changes", async ({ context, page }) => {
  const state = store(); await connect(context,state,member); await login(page,false);
  await expect(page.getByRole("button",{ name: "Einzeltermin erstellen" })).toHaveCount(0);
  const statuses = await page.evaluate(async (apiUrl) => {
    const bodies = [
      ["ff_members_workspace", {}],
      ["ff_set_unit_membership", { target_user: "10000000-0000-4000-8000-000000000002", target_unit: "20000000-0000-4000-8000-000000000002", assign: true, reason: "Synthetic self transfer" }],
      ["ff_set_role", { target_user: "10000000-0000-4000-8000-000000000002", wanted_role: "GLOBAL_ADMIN", assign: true }],
    ] as const;
    return Promise.all(bodies.map(async ([name,body]) => (await fetch(`${apiUrl}/rest/v1/rpc/${name}`, {
      method: "POST",headers: { "Content-Type": "application/json" },body: JSON.stringify(body),
    })).status));
  },api);
  expect(statuses).toEqual([403,403,403]);
  for (const width of [320,390,960,1366]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.locator(".sidebar"))[width > 960 ? "toBeVisible" : "toBeHidden"]();
    await expect(page.getByRole("navigation",{ name: "Mobile Navigation" }))[width > 960 ? "toBeHidden" : "toBeVisible"]();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test("role labels and assigned selection stay accessible across themes, scopes and screen sizes without writes", async ({ context, page }) => {
  const state = store(); state.memberAdmin = true;
  await connect(context, state, admin);
  let writes = 0;
  page.on("request", (request) => {
    if (/\/rpc\/ff_set_/.test(request.url())) writes++;
  });
  await login(page, true);
  await page.getByRole("link", { name: "Administration", exact: true }).click();
  const row = page.locator(".dev-member").filter({ has: page.getByText("Synthetic Member", { exact: true }) });
  await row.locator("summary").click();
  await expect(page.getByRole("main")).not.toContainText(/GLOBAL_ADMIN|UNIT_ADMIN|MEMBER/);
  const assigned = row.getByRole("list", { name: "Zugewiesene Rollen für Synthetic Member" });
  await expect(assigned.getByRole("listitem")).toHaveCount(2);
  await expect(assigned.getByRole("listitem").filter({ hasText: "Mitglied" })).toContainText("Basisrolle");
  await expect(assigned.getByRole("button", { name: /Mitglied.*entfernen/ })).toHaveCount(0);
  const remove = assigned.getByRole("button", { name: "Rolle Einheitsführer · Scheuren entfernen" });
  await expect(remove).toBeDisabled();
  await row.getByLabel("Änderungsgrund für Synthetic Member", { exact: true }).fill("Synthetic visual review");
  await expect(remove).toBeEnabled();
  const select = row.getByRole("combobox", { name: "Neue Rolle für Synthetic Member", exact: true });
  await expect(select.getByRole("option", { name: "Globaler Administrator", exact: true })).toHaveAttribute("value", "GLOBAL_ADMIN");
  await expect(select.getByRole("option", { name: "Einheitsführer", exact: true })).toHaveAttribute("value", "UNIT_ADMIN");
  const scopeSelect = row.getByRole("combobox", { name: "Rollenbereich", exact: true });
  const status = row.locator(".member-role-state");
  await expect(status).toContainText("Rollenbereich auswählen");
  await scopeSelect.selectOption(unit);
  await expect(status).toContainText("Einheitsführer · Bereits zugewiesen");
  await expect(status).toHaveClass(/assigned/);
  for (const width of [390, 1366]) {
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ["light", "dark"]) {
      if (await page.locator("html").getAttribute("data-theme") !== theme) {
        await page.getByRole("button", { name: "Farbschema wechseln" }).click();
      }
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await expect.poll(() => page.evaluate(() => document.getAnimations().filter((animation) =>
        animation.playState === "running" && Number.isFinite(animation.effect?.getComputedTiming().endTime)).length)).toBe(0);
      const colors = await status.evaluate((element) => ({
        assigned: getComputedStyle(element).backgroundColor,
        remove: getComputedStyle(element.closest(".dev-member")!.querySelector(".member-role-remove")!).color,
      }));
      await scopeSelect.selectOption(otherUnit);
      await expect(status).toContainText("Einheitsführer · Nicht zugewiesen");
      await expect(status).not.toHaveClass(/assigned/);
      const neutral = await status.evaluate((element) => getComputedStyle(element).backgroundColor);
      expect(neutral).not.toBe(colors.assigned);
      const rgb = colors.assigned.match(/\d+(?:\.\d+)?/g)!.map(Number);
      expect(rgb[1]).toBeGreaterThan(rgb[0]);
      expect(rgb[1]).toBeGreaterThan(rgb[2]);
      const red = colors.remove.match(/\d+(?:\.\d+)?/g)!.map(Number);
      expect(red[0]).toBeGreaterThan(red[1]);
      expect(red[0]).toBeGreaterThan(red[2]);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await scopeSelect.selectOption(unit);
      await expect(status).toHaveClass(/assigned/);
      await status.scrollIntoViewIfNeeded();
      await page.screenshot({ path: `test-results/dev0321-roles-${width}-${theme}.png` });
    }
  }
  expect(writes).toBe(0);
  expect(state.memberAdmin).toBe(true);
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
