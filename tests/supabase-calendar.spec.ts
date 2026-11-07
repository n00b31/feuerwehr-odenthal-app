import { test,expect,type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { publicPath } from "../src/config/app";
import { calendarPayloadSchema,type CalendarEvent,type CalendarContext } from "../src/domain/calendar";

const api="https://syntheticci.supabase.co";
const actor="a0500000-0000-4000-8000-000000000001";
const unit="b0500000-0000-4000-8000-000000000001";
const category="c0500000-0000-4000-8000-000000000001";
const resource="d0500000-0000-4000-8000-000000000001";
const service="e0500000-0000-4000-8000-000000000001";
const info="e0500000-0000-4000-8000-000000000002";
const now="2026-11-07T10:00:00Z";
function event(id:string,title:string,kind:CalendarEvent["entry_kind"],hour:number):CalendarEvent {
  return {id,title,description:"Synthetic calendar fixture",location:"Synthetic location",
    starts_at:`2026-11-08T${hour}:00:00Z`,ends_at:`2026-11-08T${hour+1}:00:00Z`,
    event_type:kind==="participation" ? "regular" : "other",status:"scheduled",revision:0,
    scope_kind:kind==="information" ? "organization" : "unit",unit_id:kind==="information" ? null : unit,
    function_id:null,organizer_id:actor,organizer_name:"Synthetic Calendar",scope_name:"Scheuren",
    entry_kind:kind,all_day:false,audience:"scope",category_id:kind==="participation" ? null : category,
    category_name:kind==="participation" ? null : "Synthetic category",
    resource_id:kind==="booking" ? resource : null,resource_name:kind==="booking" ? "Synthetic building" : null,
    can_manage:true,unit_ids:[]};
}

// Intercepted protocol fixtures, not real authentication or hosted RLS proof.
async function connect(page:Page,admin=true) {
  const state={queries:[] as Record<string,unknown>[],events:[
    event(service,"Synthetic existing service","participation",18),
    event(info,"Synthetic public information","information",19),
  ],archived:new Set<string>(),conflict:false,fail:false,serviceQueries:0};
  const context:CalendarContext={organization:admin,configure:admin,
    units:[{id:unit,name:"Scheuren"}],manageable_units:admin ? [{id:unit,name:"Scheuren"}] : [],
    functions:[],organizers:[{id:actor,name:"Synthetic Calendar"}],categories:[{id:category,name:"Synthetic category",active:true}],
    resources:[{id:resource,name:"Synthetic building",resource_type:"building",unit_id:unit,active:true,revision:0}]};
  const user={id:actor,aud:"authenticated",role:"authenticated",email:"synthetic.calendar@feuerwehr-odenthal.de",
    email_confirmed_at:now,created_at:now,app_metadata:{provider:"email",providers:["email"]},
    user_metadata:{display_name:"Synthetic Calendar"}};
  const conflicts=()=>state.conflict ? [{id:null,title:"Bereits belegt (Details geschützt)",
    starts_at:"2026-11-07T17:00:00Z",ends_at:"2026-11-07T18:30:00Z"}] : [];
  await page.context().route(`${api}/**`,async route=>{
    const request=route.request(),pathname=new URL(request.url()).pathname;
    const respond=(body:unknown,status=200)=>route.fulfill({status,contentType:"application/json",
      headers:{"access-control-allow-origin":"*","x-supabase-api-version":"2024-01-01"},body:JSON.stringify(body)});
    if(pathname==="/auth/v1/token") {
      const payload=Buffer.from(JSON.stringify({sub:actor,exp:Math.floor(Date.now()/1000)+3600})).toString("base64url");
      return respond({access_token:`synthetic.${payload}.fixture`,refresh_token:"synthetic-calendar-only",
        token_type:"bearer",expires_in:3600,user});
    }
    if(pathname==="/auth/v1/user") return respond(user);
    if(pathname.endsWith("/ff_my_access")) return respond({user_id:actor,display_name:"Synthetic Calendar",
      account_status:"approved",access_granted:true,unit_id:unit,unit_name:"Scheuren",
      roles:admin ? ["MEMBER","GLOBAL_ADMIN"] : ["MEMBER"]});
    if(pathname.endsWith("/units")) return respond(context.units);
    if(pathname.endsWith("/document_areas") || pathname.endsWith("/ff_pending_registrations")) return respond([]);
    if(pathname.endsWith("/ff_calendar_context")) return respond(context);
    if(pathname.endsWith("/ff_events_page")) {
      state.serviceQueries++;
      return respond({server_now:now,manageable_units:context.manageable_units,has_more:false,next_cursor:null,retained_events:[],
        events:state.events.filter(e=>e.entry_kind==="participation").map(e=>({...e,series_id:null,response_deadline:null,
          can_manage:admin,can_lead:admin,can_delegate:admin,can_read_attendance:admin,attendance_state:"NOT_STARTED",
          own_attendance:null,in_roster:true,own_response:null,participants:admin ? [] : null}))});
    }
    if(pathname.endsWith("/ff_calendar_page")) {
      if(state.fail) return respond({code:"503",message:"Synthetic calendar outage"},503);
      const q:Record<string,unknown>=request.postDataJSON();state.queries.push(q);
      const values=(key:string):string[]=>Array.isArray(q[key]) ? q[key].filter((v:unknown)=>typeof v==="string") : [];
      const types=values("wanted_types"),kinds=values("wanted_kinds"),scopes=values("scopes");
      const visible=state.events.filter(e=>!state.archived.has(e.id));
      const filtered=visible.filter(e=>Date.parse(e.starts_at)<Date.parse(String(q.upper_bound))
        && Date.parse(e.ends_at)>Date.parse(String(q.lower_bound))
        && (!types.length && !kinds.length || e.entry_kind==="participation" && types.includes(e.event_type) || kinds.includes(e.entry_kind))
        && (!values("wanted_units").length || values("wanted_units").includes(e.unit_id ?? "") || e.unit_ids.some(id=>values("wanted_units").includes(id)))
        && (!values("wanted_categories").length || values("wanted_categories").includes(e.category_id ?? ""))
        && (!values("wanted_resources").length || values("wanted_resources").includes(e.resource_id ?? ""))
        && (!scopes.length || scopes.includes(e.scope_kind==="unit" ? "units" : e.scope_kind)
          || scopes.includes("mine") && e.unit_id===unit)
        && (q.show_cancelled || e.status==="scheduled"));
      return respond({server_now:now,next_cursor:null,
        events:filtered.map(e=>({...e,can_manage:admin})),
        retained_events:visible.filter(e=>values("retained_ids").includes(e.id) && !filtered.some(x=>x.id===e.id))
          .map(e=>({...e,can_manage:admin}))});
    }
    if(pathname.endsWith("/ff_calendar_conflicts")) return respond(conflicts());
    if(pathname.endsWith("/ff_save_calendar_event")) {
      const q=request.postDataJSON(),p=calendarPayloadSchema.parse(q.input);
      const id=q.target_event ?? "e0500000-0000-4000-8000-000000000009";
      const previous=state.events.find(e=>e.id===id);
      const row:CalendarEvent={...event(id,p.title,p.entry_kind,18),...p,revision:previous ? previous.revision+1 : 0};
      state.events=state.events.filter(e=>e.id!==id).concat(row);
      return respond({id,conflicts:conflicts()});
    }
    if(pathname.endsWith("/ff_change_calendar_event")) {
      const q=request.postDataJSON(),row=state.events.find(e=>e.id===q.target_event);
      if(row){row.revision++;if(q.next_action==="archive")state.archived.add(row.id);else row.status="cancelled";}
      return respond(null);
    }
    if(pathname.endsWith("/ff_save_calendar_resource")) {
      const q=request.postDataJSON(),previous=context.resources.find(r=>r.id===q.target_resource);
      if(previous && previous.revision!==q.expected_revision) return respond({code:"40001",message:"Synthetic stale resource"},409);
      if(previous){Object.assign(previous,q.input);previous.revision++;}
      else context.resources.push({...q.input,id:"d0500000-0000-4000-8000-000000000009",revision:0});
      return respond(previous?.id ?? "d0500000-0000-4000-8000-000000000009");
    }
    return respond({message:`Unexpected synthetic endpoint ${pathname}`},500);
  });
  await page.context().route(/https:\/\/(?!syntheticci\.supabase\.co)[^/]+\.supabase\.co\/.*/,route=>route.abort());
  await page.goto(publicPath("/termine/"));
  await page.getByLabel("Feuerwehr-E-Mail").fill(user.email);
  await page.getByLabel("Passwort",{exact:true}).fill("synthetic-browser-only");
  await page.getByRole("button",{name:"Anmelden",exact:true}).click();
  await page.getByRole("button",{name:"Gemeinsamer Kalender",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Gemeinsamer Feuerwehrkalender"})).toBeVisible();
  await expect(page.locator(".calendar-chip").filter({hasText:"Synthetic existing service"})).toHaveCount(1);
  return state;
}

test("calendar renders canonical services once, month/week/list, navigation and combined OR/AND filters",async({page})=>{
  const state=await connect(page);
  await expect(page.getByRole("button",{name:"Monat",exact:true})).toHaveAttribute("aria-pressed","true");
  await page.getByRole("button",{name:"Woche",exact:true}).click();
  await expect(page.getByLabel("Wochenkalender")).toBeVisible();
  await page.getByRole("button",{name:"Liste",exact:true}).click();
  await expect(page.locator(".calendar-list").getByText("Synthetic existing service")).toBeVisible();
  await page.getByRole("button",{name:"Monat",exact:true}).click();
  await page.getByRole("button",{name:"Nächster Zeitraum"}).click();
  await expect(page.getByLabel("Kalendermonat")).toHaveValue("2026-12");
  await page.getByRole("button",{name:"Vorheriger Zeitraum"}).click();
  await page.getByText("Kalenderfilter",{exact:true}).click();
  await page.getByLabel("Übungsdienste / Ausbildung").check();
  await page.getByLabel("Organisatorische Information").check();
  await expect(page.locator(".calendar-chip")).toHaveCount(2);
  await page.getByRole("combobox",{name:"Einheitsfilter",exact:true}).selectOption(unit);
  await expect(page.locator(".calendar-chip")).toHaveCount(1);
  expect(state.queries.at(-1)?.wanted_units).toEqual([unit]);
  await page.getByRole("button",{name:"Kalenderfilter zurücksetzen"}).click();
  await expect(page.locator(".calendar-chip")).toHaveCount(2);
});

test("member sees global information without participation or administrative controls",async({page})=>{
  await connect(page,false);
  await expect(page.getByRole("button",{name:"Kalendereintrag erstellen"})).toHaveCount(0);
  await expect(page.getByText("Kalenderkonfiguration · globale Administration")).toHaveCount(0);
  await page.locator(".calendar-chip").filter({hasText:"Synthetic public information"}).click();
  await expect(page.getByRole("dialog")).toContainText("keine Teilnahmeabfrage oder Anwesenheitsliste");
  await expect(page.getByRole("button",{name:"Kalendereintrag bearbeiten",exact:true})).toHaveCount(0);
  await expect(page.getByRole("button",{name:"Dienst und Teilnahme öffnen"})).toHaveCount(0);
});

test("information create/edit/cancel/archive and warning-only building booking use RPC contracts",async({page})=>{
  const state=await connect(page);
  await page.getByRole("button",{name:"Kalendereintrag erstellen"}).click();
  await page.getByLabel("Zweck / Titel").fill("Synthetic new information");
  await page.getByLabel("Ort",{exact:true}).fill("Synthetic meeting room");
  await page.getByRole("button",{name:"Kalendereintrag speichern"}).click();
  await page.locator(".calendar-chip").filter({hasText:"Synthetic new information"}).click();
  await page.getByRole("button",{name:"Kalendereintrag bearbeiten",exact:true}).click();
  await page.getByLabel("Zweck / Titel").fill("Synthetic edited information");
  await page.getByRole("button",{name:"Kalendereintrag speichern"}).click();
  await page.locator(".calendar-chip").filter({hasText:"Synthetic edited information"}).click();
  await page.getByLabel("Begründung für Absage / Archivierung").fill("Synthetic cancellation reason");
  await page.getByRole("button",{name:"Kalendereintrag absagen"}).click();
  await expect(page.locator(".calendar-chip").filter({hasText:"Synthetic edited information"})).toContainText("Abgesagt");
  await page.locator(".calendar-chip").filter({hasText:"Synthetic edited information"}).click();
  await page.getByLabel("Begründung für Absage / Archivierung").fill("Synthetic archive reason");
  await page.getByRole("button",{name:"Kalendereintrag archivieren"}).click();
  await expect(page.locator(".calendar-chip").filter({hasText:"Synthetic edited information"})).toHaveCount(0);
  state.conflict=true;
  await page.getByRole("button",{name:"Kalendereintrag erstellen"}).click();
  await page.getByLabel("Zweck / Titel").fill("Synthetic permitted overlap");
  await page.getByLabel("Ort",{exact:true}).fill("Synthetic building");
  await page.getByRole("combobox",{name:"Eintragsart",exact:true}).selectOption("booking");
  await page.getByRole("combobox",{name:"Gerätehaus",exact:true}).selectOption(resource);
  await page.getByRole("button",{name:"Überschneidungen prüfen"}).click();
  await expect(page.getByRole("heading",{name:/Überschneidung erkannt/})).toBeVisible();
  await page.getByRole("button",{name:"Kalendereintrag speichern"}).click();
  await expect(page.locator(".calendar-chip").filter({hasText:"Synthetic permitted overlap"})).toBeVisible();
});

test("resource successive edits keep revisions, drafts and explicit refresh errors",async({page})=>{
  const state=await connect(page);
  await page.getByText("Kalenderkonfiguration · globale Administration").click();
  await page.getByLabel("Ressource bearbeiten").selectOption(resource);
  await page.getByLabel("Gerätehausname").fill("Synthetic renamed building");
  await page.getByRole("button",{name:"Gerätehaus speichern",exact:true}).click();
  await expect(page.getByRole("status")).toContainText("Gerätehaus gespeichert");
  await page.getByLabel("Gerätehausname").fill("Synthetic twice renamed building");
  await page.getByRole("button",{name:"Gerätehaus speichern",exact:true}).click();
  await expect(page.locator(".calendar").getByRole("alert")).toHaveCount(0);
  await expect(page.getByLabel("Gerätehausname")).toHaveValue("Synthetic twice renamed building");
  state.fail=true;
  await page.getByRole("button",{name:"Kalender aktualisieren"}).click();
  await expect(page.locator(".calendar").getByRole("alert")).toBeVisible();
});

test("four simulated background intervals retain month/filter/native dialog and editor DOM",async({page})=>{
  const state=await connect(page);
  await page.clock.install();
  await page.getByText("Kalenderfilter",{exact:true}).click();
  await page.getByLabel("Organisatorische Information").check();
  await page.locator(".calendar-chip").filter({hasText:"Synthetic public information"}).click();
  await page.getByRole("dialog").evaluate(node=>node.setAttribute("data-retention-proof","same-node"));
  const before=state.queries.length;
  await page.clock.runFor(130_000);
  await expect(page.getByRole("dialog")).toHaveAttribute("data-retention-proof","same-node");
  await expect(page.getByLabel("Organisatorische Information")).toBeChecked();
  await expect(page.getByLabel("Kalendermonat")).toHaveValue("2026-11");
  expect(state.queries.length).toBeGreaterThanOrEqual(before+4);
  await page.getByRole("button",{name:"Kalendereintrag bearbeiten",exact:true}).click();
  await page.getByLabel("Zweck / Titel").fill("Synthetic unsaved draft");
  await page.getByLabel("Beginn (Europe/Berlin)").fill("2026-11-09T20:30");
  await page.getByLabel("Zweck / Titel").evaluate(node=>node.setAttribute("data-retention-proof","same-node"));
  await page.clock.runFor(130_000);
  await expect(page.getByLabel("Zweck / Titel")).toHaveValue("Synthetic unsaved draft");
  await expect(page.getByLabel("Zweck / Titel")).toHaveAttribute("data-retention-proof","same-node");
  await expect(page.getByLabel("Beginn (Europe/Berlin)")).toHaveValue("2026-11-09T20:30");
});

test("service opens existing editor and closes calendar modal without duplicate editing logic",async({page})=>{
  const state=await connect(page);
  await page.locator(".calendar-chip").filter({hasText:"Synthetic existing service"}).click();
  await page.getByRole("button",{name:"Bestehende Bearbeitung öffnen"}).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("heading",{name:"Gemeinsamer Feuerwehrkalender"})).toBeHidden();
  await expect(page.getByLabel("Titel",{exact:true})).toHaveValue("Synthetic existing service");
  expect(state.serviceQueries).toBeGreaterThan(1);
});

test("calendar remains accessible in mobile light and desktop dark layouts",async({page})=>{
  await connect(page);
  await expect(page.getByRole("navigation",{name:"Mobile Navigation"})).toBeVisible();
  await expect(page.locator(".calendar-month")).toBeVisible();
  expect((await new AxeBuilder({page}).include("main").analyze()).violations).toEqual([]);
  await page.setViewportSize({width:1440,height:1000});
  await page.evaluate(()=>document.documentElement.setAttribute("data-theme","dark"));
  await expect(page.locator("aside.sidebar")).toBeVisible();
  await expect(page.getByRole("navigation",{name:"Mobile Navigation"})).toBeHidden();
  await page.getByRole("button",{name:"Woche",exact:true}).click();
  expect((await new AxeBuilder({page}).include("main").analyze()).violations).toEqual([]);
});
