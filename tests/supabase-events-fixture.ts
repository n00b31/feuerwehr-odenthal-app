import {expect,type BrowserContext,type Page} from "@playwright/test";
import {publicPath} from "../src/config/app";
import {localInput} from "../src/domain/time";
import {emptyInbox} from "./notification-fixture";

export const api = "https://syntheticci.supabase.co";
export const unit = "20000000-0000-4000-8000-000000000001";
export const otherUnit = "20000000-0000-4000-8000-000000000002";
export const admin = "10000000-0000-4000-8000-000000000001";
export const member = "10000000-0000-4000-8000-000000000002";
export const eventId = "30000000-0000-4000-8000-000000000001";
export const specialFunction = "40000000-0000-4000-8000-000000000001";
export type Response = "yes" | "no" | "maybe";
export type Actual = "present" | "absent" | "unknown";
export type Attendance = {
  state: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "CORRECTED"; initialized_at: string | null;
  initialized_by: string | null; prepared_at: string | null; confirmed_at: string | null;
  confirmed_by: string | null; corrected_at: string | null;
  rows: Map<string, { status: Actual; origin: "prefill" | "manual"; response: Response | null; recorded_at: string }>;
};
export type StoredEvent = {
  id: string; title: string; description: string; event_type: string; location: string;
  starts_at: string; ends_at: string; unit_id: string; status: "scheduled" | "cancelled"; revision: number;
};
export function store() {
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
export type Store = ReturnType<typeof store>;

// Protocol fixtures share a central store but never contact a real project or mailbox.
export async function connect(context: BrowserContext, state: Store, actor: string, apiUrl=api) {
  const isAdmin = actor === admin;
  const user = () => ({
    id: actor, aud: "authenticated", role: "authenticated",
    email: `synthetic.${isAdmin ? "admin" : "member"}@feuerwehr-odenthal.de`,
    email_confirmed_at: new Date().toISOString(), created_at: new Date().toISOString(),
    app_metadata: { provider: "email", providers: ["email"] }, user_metadata: { display_name: isAdmin ? "Synthetic Admin" : "Synthetic Member" },
  });
  await context.route(`${apiUrl}/**`, async (route) => {
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
    const manages=(id:string)=>isAdmin || state.memberAdmin && state.events.find(e=>e.id===id)?.unit_id===actorUnit;
    const leader = (id: string) => isAdmin || (state.memberAdmin && state.events.find(e=>e.id===id)?.unit_id===actorUnit)
      || state.delegates.get(id)?.user === actor;
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
    if(path==="/rest/v1/rpc/ff_dashboard"){
      const open=state.events.filter(e=>e.status==="scheduled" && Date.parse(e.starts_at)<=state.now && !final(e.id) && leader(e.id));
      return respond({actor_id:actor,server_now:new Date(state.now).toISOString(),year:2026,
        units:[{id:unit,name:"Scheuren"}],functions:[],next_service:null,open_count:0,open_events:[],
        statistics:{services:0,practices:0,training_services:0,eligible:0,present:0,absent:0,training_present:0,
          training_absent:0,unknown:0,training_hours:0,service_hours:0,participant_hours:0,rate:null,
          average_attendance:null,pending:0,excluded:0,missing_roster:0},information:[],reservations:[],
        tasks:open.length ? [{kind:"attendance",count:open.length,target:open[0].id}] : [],vehicles_visible:false});
    }
    if (path === "/rest/v1/rpc/ff_events_page") {
      if (state.broken) return respond({ code: "503", message: "Synthetic outage" }, 503);
      const query = request.postDataJSON(); state.queries.push(query);
      const filterAccess=isAdmin || state.memberAdmin || [...state.delegates.values()].some(d=>d.user===actor);
      if(query.list_view==="open_attendance" && !filterAccess)return denied();
      const eligible = state.events.filter((e) => isAdmin || e.unit_id === unit);
      const open=eligible.filter(e=>e.status==="scheduled" && Date.parse(e.starts_at)<=state.now && !final(e.id) && leader(e.id));
      const sorted = (query.list_view==="open_attendance" ? open : eligible.filter((e) => (query.status_filter === "all" || e.status === query.status_filter)
        && (query.list_view === "past" ? Date.parse(e.ends_at) <= state.now : query.list_view === "month"
          ? localInput(e.starts_at).slice(0, 7) === query.month_key : Date.parse(e.ends_at) > state.now)))
        .sort((a, b) => (Date.parse(a.starts_at) - Date.parse(b.starts_at) || a.id.localeCompare(b.id)) * (query.list_view === "past" ? -1 : 1))
        .filter((e) => !query.after_id || Date.parse(e.starts_at) > Date.parse(query.after_start)
          || (Date.parse(e.starts_at) === Date.parse(query.after_start) && e.id > query.after_id));
      const limit = query.list_view === "month" || query.list_view==="open_attendance" ? 50 : 5;
      const selected = sorted.slice(0, limit);
      const retained = eligible.filter((e) => query.retained_ids.includes(e.id) && !selected.some((item) => item.id === e.id));
      const serialize = (e: StoredEvent) => ({
        ...e, series_id: null, response_deadline: null, scope_name: e.unit_id === unit ? "Scheuren" : "Andere Einheit",
        organizer_name:name(state.delegates.get(e.id)?.user ?? admin),
        can_manage: manages(e.id), can_lead: leader(e.id), can_delegate: manages(e.id), can_read_attendance: leader(e.id),
        attendance_state: attendance(e.id).state, own_attendance: final(e.id) ? attendance(e.id).rows.get(actor)?.status ?? null : null,
        in_roster: e.unit_id === unit, own_response: state.answers.get(`${e.id}:${actor}`) ?? null,
        participants: leader(e.id) ? state.roster.map((id) => ({
          user_id: id, name: name(id), response: state.answers.get(`${e.id}:${id}`) ?? null, updated_at: null,
        })) : null,
      });
      return respond({
        server_now: new Date(state.now).toISOString(), manageable_units: isAdmin || state.memberAdmin && actorUnit===unit ? [{ id: unit, name: "Scheuren" }] : [],
        events: selected.map(serialize), retained_events: retained.map(serialize), has_more: sorted.length > limit,
        can_filter_attendance:filterAccess,open_attendance_count:query.list_view==="open_attendance" ? open.length : null,
        next_cursor: (query.list_view === "month" || query.list_view==="open_attendance") && sorted.length > limit ? { id: selected.at(-1)!.id, starts_at: selected.at(-1)!.starts_at } : null,
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
      if ((!isAdmin && (!state.memberAdmin || actorUnit!==unit)) || state.denyCreation) return denied();
      const body = request.postDataJSON().input;
      expect(body.unit_id).toBe(unit);
      expect(body).not.toHaveProperty("user_id");
      let sequence=1,id=eventId;
      while(state.events.some(event=>event.id===id))id=`30000000-0000-4000-8000-${String(++sequence).padStart(12,"0")}`;
      state.events.push({ ...body, id, status: "scheduled", revision: 0 });
      return respond(id);
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
      if (!e || !manages(e.id)) return denied();
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
    if(path.endsWith("/ff_notifications"))return respond(emptyInbox(actor));
    throw new Error(`Unexpected synthetic endpoint: ${path}`);
  });
  await context.route(/https:\/\/[^/]+\.supabase\.co\/.*/, route=>
    new URL(route.request().url()).origin===apiUrl ? route.fallback() : route.abort());
}
export async function login(page: Page, isAdmin: boolean) {
  await page.goto(publicPath("/termine/"));
  await page.getByLabel("Feuerwehr-E-Mail").fill(`synthetic.${isAdmin ? "admin" : "member"}@feuerwehr-odenthal.de`);
  await page.getByLabel("Passwort", { exact: true }).fill("SyntheticOnly!123");
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Sichtbare DEV-Termine" })).toBeVisible();
}
export async function create(page: Page, state: Store) {
  await page.getByRole("button", { name: "Einzeltermin erstellen" }).click();
  await page.getByLabel("Titel", { exact: true }).fill("Synthetic gemeinsamer Dienst");
  await page.getByLabel("Beschreibung", { exact: true }).fill("Nur simulierte Testdaten");
  await page.getByLabel("Beginn (Europe/Berlin)", { exact: true }).fill(localInput(new Date(state.now+172800000).toISOString()));
  await page.getByLabel("Ende (Europe/Berlin)", { exact: true }).fill(localInput(new Date(state.now+180000000).toISOString()));
  await page.getByLabel("Ort", { exact: true }).fill("Synthetic Gerätehaus");
  await page.getByRole("button", { name: "Termin speichern" }).click();
}

export function attendanceEvent(state: Store, delay = -1000): StoredEvent {
  return { id: eventId, title: "Synthetic Anwesenheitsdienst", description: "Nur synthetischer Protokolltest", event_type: "regular",
    unit_id: unit, location: "Synthetic Gerätehaus", starts_at: new Date(state.now + delay).toISOString(),
    ends_at: new Date(state.now + delay + 7200000).toISOString(), status: "scheduled", revision: 0 };
}
