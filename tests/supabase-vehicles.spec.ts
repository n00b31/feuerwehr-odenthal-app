import {test,expect,type Page} from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {emptyInbox} from "./notification-fixture";
import {publicPath} from "../src/config/app";
import {vehicleRequestSchema,vehicleInputSchema,vehicleWorkspaceSchema,type VehicleReservation,type Vehicle} from "../src/domain/vehicles";

const api="https://syntheticci.supabase.co",actor="a0600000-0000-4000-8000-000000000001";
const unit="b0600000-0000-4000-8000-000000000001",vehicleId="c0600000-0000-4000-8000-000000000001";
const now="2026-11-08T12:00:00Z";
async function connect(page:Page,role:"global"|"member"|"manager"|"chief"|"unit"|"function"="member",preload=false){
  const manage=role==="global" || role==="manager",global=role==="global";
  const vehicles:Vehicle[]=[{id:vehicleId,name:"DEV synthetisch - MTF Scheuren",resource_type:"vehicle",unit_id:unit,
    active:true,revision:0,type_key:"mtf",call_sign:"",location:"Synthetic DEV",description:"Synthetic, not a real vehicle",
    reservable:true,unit_admin_enabled:false,can_manage:manage,current_access:true,usage_units:[unit],manager_ids:[actor]}];
  const state={vehicles,items:[] as VehicleReservation[],notifications:[] as {
    id:string;recipient_id:string;event_id:string;message:string;created_at:string;read_at:string|null;
  }[],next:1,fail:false,conflict:false};
  function row(id:string,title:string):VehicleReservation{
    return {id,event_id:id,vehicle_id:vehicleId,vehicle_name:vehicles[0].name,
      actor_id:actor,actor_name:"Synthetic Vehicles",
      requester_id:role==="member" ? actor : "a0600000-0000-4000-8000-000000000002",requester_name:"Synthetic applicant",
      responsible_id:actor,responsible_name:"Synthetic Vehicles",unit_id:unit,unit_name:"Scheuren",kind:"reservation",
      state:"REQUESTED",title,description:"Synthetic request",starts_at:"2026-11-09T08:00:00Z",ends_at:"2026-11-09T09:00:00Z",
      requested_at:now,purpose_key:"course",destination:"",notes:"",revision:0,can_manage:manage,own:role==="member",
      decided_at:null,decided_by:null,decision_reason:null,cancelled_at:null,cancelled_by:null,cancellation_reason:null,
      completed_at:null,completed_by:null};
  }
  if(preload)state.items.push(row("d0600000-0000-4000-8000-000000000001","Synthetic approval task"));
  const context={vehicle_calendar:true,organization:global,configure:global,units:[{id:unit,name:"Scheuren"}],
    manageable_units:global ? [{id:unit,name:"Scheuren"}] : [],functions:[],organizers:[{id:actor,name:"Synthetic Vehicles"}],
    resources:vehicles,categories:[{id:"e0600000-0000-4000-8000-000000000001",name:"Fahrzeugreservierung",active:true}]};
  const user={id:actor,aud:"authenticated",role:"authenticated",email:"synthetic.vehicles@feuerwehr-odenthal.de",
    email_confirmed_at:now,created_at:now,app_metadata:{provider:"email",providers:["email"]},user_metadata:{display_name:"Synthetic Vehicles"}};
  await page.context().route(`${api}/**`,async route=>{
    const request=route.request(),path=new URL(request.url()).pathname;
    const respond=(data:unknown,status=200)=>route.fulfill({status,contentType:"application/json",body:JSON.stringify(data)});
    if(path==="/auth/v1/token"){
      const payload=Buffer.from(JSON.stringify({sub:actor,exp:Math.floor(Date.now()/1000)+3600})).toString("base64url");
      return respond({access_token:`synthetic.${payload}.fixture`,refresh_token:"synthetic-vehicles-only",token_type:"bearer",expires_in:3600,user});
    }
    if(path==="/auth/v1/user")return respond(user);
    if(path.endsWith("/ff_my_access"))return respond({user_id:actor,display_name:"Synthetic Vehicles",account_status:"approved",
      access_granted:true,unit_id:unit,unit_name:"Scheuren",roles:global ? ["MEMBER","GLOBAL_ADMIN"] : role==="chief" ? ["MEMBER","FIRE_CHIEF"] :
        role==="unit" ? ["MEMBER","UNIT_ADMIN"] : role==="function" ? ["MEMBER","FUNCTION_ADMIN"] : ["MEMBER"]});
    if(path.endsWith("/ff_notifications"))return respond(emptyInbox(actor));
    if(path.endsWith("/units"))return respond(context.units);
    if(path.endsWith("/document_areas") || path.endsWith("/ff_pending_registrations"))return respond([]);
    if(path.endsWith("/ff_events_page"))return respond({server_now:now,manageable_units:context.manageable_units,events:[],retained_events:[],has_more:false,next_cursor:null});
    if(path.endsWith("/ff_calendar_context") || path.endsWith("/ff_calendar_vehicle_context"))return respond(context);
    if(path.endsWith("/ff_calendar_page") || path.endsWith("/ff_calendar_vehicle_page")){
      const q=request.postDataJSON();
      const events=state.items.filter(i=>i.state==="APPROVED").map(i=>({id:i.id,title:i.title,description:i.description,
        starts_at:i.starts_at,ends_at:i.ends_at,location:"Synthetic DEV",event_type:"other",status:"scheduled",revision:i.revision,
        scope_kind:"unit",unit_id:unit,function_id:null,organizer_id:actor,organizer_name:"Synthetic Vehicles",scope_name:"Scheuren",
        entry_kind:"vehicle",vehicle_state:i.state,vehicle_kind:i.kind,all_day:false,audience:"scope",category_id:context.categories[0].id,
        category_name:"Fahrzeugreservierung",resource_id:vehicleId,resource_name:vehicles[0].name,can_manage:false,unit_ids:[]}));
      return respond({server_now:now,next_cursor:null,events,retained_events:events.filter(i=>q.retained_ids.includes(i.id))});
    }
    if(path.endsWith("/ff_vehicle_requesters"))return respond({
      actor_name:"Synthetic Vehicles",request_units:context.units,
      requesters:[{id:actor,name:"Synthetic Vehicles",units:[unit]},
        ...(["global","chief","unit"].includes(role) ? [{id:"a0600000-0000-4000-8000-000000000002",name:"Synthetic applicant",units:[unit]}] : [])],
    });
    if(path.endsWith("/ff_vehicle_workspace")){
      if(state.fail)return respond({code:"503",message:"Synthetic outage"},503);
      const q=request.postDataJSON();
      expect(Object.keys(q).sort()).toEqual(["lower_bound","upper_bound","target_vehicle","retained_event"].sort());
      const data={server_now:now,configure:global,vehicles:state.vehicles,units:context.units,own_units:context.units,
        people:[{id:actor,name:"Synthetic Vehicles",units:[unit]},
          {id:"a0600000-0000-4000-8000-000000000002",name:"Synthetic applicant",units:[unit]}],types:[{key:"mtf",name:"MTF",active:true}],
        purposes:[{key:"course",name:"Lehrgang",active:true}],items:state.items,
        retained:state.items.find(i=>i.id===q.retained_event) ?? null,
        tasks:manage ? state.items.filter(i=>i.state==="REQUESTED") : [],tasks_total:manage ? state.items.filter(i=>i.state==="REQUESTED").length : 0,
        notifications:state.notifications};
      return respond(vehicleWorkspaceSchema.parse(data));
    }
    if(path.endsWith("/ff_request_vehicle")){
      const p=vehicleRequestSchema.parse(request.postDataJSON().input);
      const id=`d0600000-0000-4000-8000-${String(++state.next).padStart(12,"0")}`;
      const item={...row(id,p.title),...p,requester_name:p.requester_id===actor ? "Synthetic Vehicles" : "Synthetic applicant",
        own:p.requester_id===actor,state:p.kind==="block" ? "APPROVED" as const : "REQUESTED" as const};
      state.items.push(item);
      state.notifications.push({id:id.replace("d060","f060"),event_id:id,recipient_id:actor,message:"Neue Reservierungsanfrage",created_at:now,read_at:null});
      return respond({id,conflicts:state.conflict ? [{id:null,title:"Verbindlich belegt",binding:true,starts_at:p.starts_at,ends_at:p.ends_at}] : []});
    }
    if(path.endsWith("/ff_decide_vehicle")){
      const q=request.postDataJSON(),item=state.items.find(i=>i.id===q.target_event)!;
      if(state.conflict && q.next_state==="APPROVED")return respond({code:"42501",message:"Zeitraum verbindlich belegt. Keine überlappende Genehmigung möglich."},403);
      item.state=q.next_state;item.revision++;
      if(q.next_state==="CANCELLED"){item.cancelled_at=now;item.cancelled_by=actor;item.cancellation_reason=q.reason;}
      else{item.decided_at=now;item.decided_by=actor;item.decision_reason=q.reason;}
      return respond(null);
    }
    if(path.endsWith("/ff_read_vehicle_notification")){
      const n=state.notifications.find(n=>n.id===request.postDataJSON().target_notification)!;n.read_at=now;return respond(null);
    }
    if(path.endsWith("/ff_save_vehicle")){
      const q=request.postDataJSON(),p=vehicleInputSchema.parse(q.input);
      const id=q.target_vehicle ?? "c0600000-0000-4000-8000-000000000002";
      const previous=state.vehicles.find(v=>v.id===id);
      state.vehicles=state.vehicles.filter(v=>v.id!==id).concat({...vehicles[0],...p,id,can_manage:true,revision:previous ? previous.revision+1 : 0});
      return respond(id);
    }
    return respond({code:"UNEXPECTED",message:`Unexpected fixture endpoint ${path}`},500);
  });
  await page.goto(publicPath("/termine/"));
  await page.getByLabel("Feuerwehr-E-Mail").fill(user.email);
  await page.getByLabel("Passwort",{exact:true}).fill("synthetic-not-a-real-password");
  await page.getByRole("button",{name:"Anmelden",exact:true}).click();
  await page.getByRole("button",{name:/Fahrzeugkalender/}).click();
  await expect(page.getByLabel("Fahrzeug auswählen")).toBeVisible();
  return state;
}
test("MEMBER requests vehicle, sees REQUESTED without binding calendar entry and reads persistent notification",async({page})=>{
  const state=await connect(page);
  await page.getByRole("button",{name:"Reservierung beantragen",exact:true}).click();
  await page.getByLabel("Zweck / Titel").fill("Synthetic course request");
  await page.getByRole("button",{name:"Anfrage absenden"}).click();
  await expect(page.getByRole("dialog").getByText("◷ Angefragt",{exact:true})).toBeVisible();
  expect(state.items[0].state).toBe("REQUESTED");
  await expect(page.getByRole("button",{name:"Genehmigen",exact:true})).toHaveCount(0);
  await page.getByRole("button",{name:"Dialog schließen"}).click();
  await page.getByText(/Interne Benachrichtigungen \(/).click();
  await page.getByRole("button",{name:"Als gelesen markieren"}).click();
  await expect(page.getByText(/Gelesen ·/)).toBeVisible();
});
test("assigned manager approves, opens canonical shared-calendar detail and cancels with required reason",async({page})=>{
  const state=await connect(page,"manager",true);
  await page.getByText("Genehmigungsaufgaben (1)").click();
  await page.getByRole("button",{name:/DEV synthetisch.*Synthetic approval task/}).click();
  await page.getByRole("button",{name:"Genehmigen",exact:true}).click();
  await expect(page.getByRole("dialog").getByText("✓ Genehmigt",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Dialog schließen"}).click();
  await page.getByRole("button",{name:"Gemeinsamer Kalender",exact:true}).click();
  await page.getByRole("button",{name:"Kalender aktualisieren",exact:true}).click();
  await page.locator(".calendar > .calendar-month .calendar-chip").filter({hasText:"Synthetic approval task"}).click();
  await page.getByRole("button",{name:"Reservierungsdetails öffnen",exact:true}).click();
  await expect(page.getByRole("dialog").getByText("✓ Genehmigt",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Stornieren",exact:true}).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("mindestens fünf Zeichen");
  await page.getByLabel("Begründung",{exact:true}).fill("Synthetic change of plan");
  await page.getByRole("button",{name:"Stornieren",exact:true}).click();
  await expect(page.getByRole("dialog").getByText("− Storniert",{exact:true})).toBeVisible();
  expect(state.items[0].cancellation_reason).toBe("Synthetic change of plan");
});
test("conflicting approval surfaces server denial and leaves request intact",async({page})=>{
  const state=await connect(page,"manager",true);state.conflict=true;
  await page.getByText("Genehmigungsaufgaben (1)").click();
  await page.getByRole("button",{name:/DEV synthetisch.*Synthetic approval task/}).click();
  await page.getByRole("button",{name:"Genehmigen",exact:true}).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("Zeitraum verbindlich belegt");
  expect(state.items[0].state).toBe("REQUESTED");
});
test("rejection requires a reason and persists the rejected status",async({page})=>{
  const state=await connect(page,"manager",true);
  await page.getByText("Genehmigungsaufgaben (1)").click();
  await page.getByRole("button",{name:/DEV synthetisch.*Synthetic approval task/}).click();
  await page.getByRole("button",{name:"Ablehnen",exact:true}).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("mindestens fünf Zeichen");
  await page.getByLabel("Begründung",{exact:true}).fill("Synthetic missing qualification");
  await page.getByRole("button",{name:"Ablehnen",exact:true}).click();
  await expect(page.getByRole("dialog").getByText("✕ Abgelehnt",{exact:true})).toBeVisible();
  expect(state.items[0].decision_reason).toBe("Synthetic missing qualification");
});
test("GLOBAL_ADMIN creates and independently edits vehicle configuration",async({page})=>{
  const state=await connect(page,"global");
  await page.getByRole("button",{name:"Fahrzeug anlegen",exact:true}).click();
  await page.getByLabel("Fahrzeugname",{exact:true}).fill("DEV synthetic HLF");
  await page.getByRole("button",{name:"Fahrzeug speichern",exact:true}).click();
  await expect(page.getByRole("heading",{name:"DEV synthetic HLF",exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Fahrzeug bearbeiten",exact:true}).click();
  await page.getByLabel("Reservierbar",{exact:true}).uncheck();
  await page.getByRole("button",{name:"Fahrzeug speichern",exact:true}).click();
  expect(state.vehicles.find(v=>v.name==="DEV synthetic HLF")?.reservable).toBe(false);
  await expect(page.getByRole("button",{name:"Reservierung beantragen",exact:true})).toHaveCount(0);
});
test("manager blocks vehicle while FIRE_CHIEF has only reading UI",async({page})=>{
  const state=await connect(page,"manager");
  await page.getByRole("button",{name:"Fahrzeug sperren",exact:true}).click();
  await page.getByLabel("Sperrungsgrund").fill("Synthetic maintenance");
  await page.getByRole("button",{name:"Sperrung speichern",exact:true}).click();
  await expect(page.getByRole("dialog").getByText("⊘ Gesperrt / nicht verfügbar",{exact:true})).toBeVisible();
  expect(state.items[0].kind).toBe("block");
});
test("mobile dark vehicle calendar supports week/list and retains draft across refresh",async({page})=>{
  const state=await connect(page,"member");
  await page.setViewportSize({width:390,height:844});
  await page.emulateMedia({colorScheme:"dark"});
  const mode=page.getByLabel("Fahrzeugkalenderdarstellung");
  await mode.getByRole("button",{name:"Woche",exact:true}).click();
  await expect(page.getByLabel("Fahrzeugkalender week")).toBeVisible();
  await mode.getByRole("button",{name:"Liste",exact:true}).click();
  await page.getByRole("button",{name:"Reservierung beantragen",exact:true}).click();
  await page.getByLabel("Zweck / Titel").fill("Preserved vehicle draft");
  state.vehicles[0].active=false;
  await page.evaluate(()=>document.querySelector<HTMLButtonElement>(".vehicles .event-card-top button")?.click());
  await expect(page.getByLabel("Zweck / Titel")).toHaveValue("Preserved vehicle draft");
  await expect(page.getByRole("button",{name:"Anfrage absenden"})).toBeDisabled();
  await page.getByRole("button",{name:"Dialog schließen"}).click();
  const results=await new AxeBuilder({page}).include(".vehicles").withTags(["wcag2a","wcag2aa","wcag21aa"]).analyze();
  expect(results.violations).toEqual([]);
});
test("FIRE_CHIEF sees vehicle availability without management controls",async({page})=>{
  await connect(page,"chief");
  await expect(page.getByLabel("Fahrzeug auswählen")).toBeVisible();
  await expect(page.getByRole("button",{name:"Fahrzeug bearbeiten",exact:true})).toHaveCount(0);
  await expect(page.getByRole("button",{name:"Fahrzeug sperren",exact:true})).toHaveCount(0);
  await expect(page.getByRole("button",{name:"Fahrzeug anlegen",exact:true})).toHaveCount(0);
});
for(const role of ["member","function"] as const)test(`${role} has a fixed own requester independent of responsibility`,async({page})=>{
  const state=await connect(page,role);
  await page.getByRole("button",{name:"Reservierung beantragen",exact:true}).click();
  await expect(page.getByLabel("Antragsteller",{exact:true})).toHaveValue("Synthetic Vehicles");
  await expect(page.getByLabel("Antragsteller",{exact:true})).toHaveAttribute("readonly","");
  await page.getByRole("combobox",{name:"Verantwortliche Person",exact:true}).selectOption("a0600000-0000-4000-8000-000000000002");
  await page.getByLabel("Zweck / Titel").fill("Distinct responsibility");
  await page.getByRole("button",{name:"Anfrage absenden"}).click();
  await expect(page.getByRole("dialog").getByText("◷ Angefragt",{exact:true})).toBeVisible();
  expect(state.items[0].requester_id).toBe(actor);
  expect(state.items[0].responsible_id).not.toBe(actor);
});
for(const role of ["global","chief","unit"] as const)test(`${role} selects an eligible requester without receiving new vehicle-manager rights`,async({page})=>{
  const state=await connect(page,role);
  await page.getByRole("button",{name:"Reservierung beantragen",exact:true}).click();
  await expect(page.getByRole("combobox",{name:"Antragsteller",exact:true})).toHaveValue(actor);
  await page.getByRole("combobox",{name:"Antragsteller",exact:true}).selectOption("a0600000-0000-4000-8000-000000000002");
  await page.getByLabel("Zweck / Titel").fill("On behalf synthetic request");
  await page.getByRole("button",{name:"Anfrage absenden"}).click();
  await expect(page.getByRole("dialog").getByText("◷ Angefragt",{exact:true})).toBeVisible();
  expect(state.items[0].actor_id).toBe(actor);
  expect(state.items[0].requester_id).not.toBe(actor);
  if(role!=="global")await expect(page.getByRole("button",{name:"Genehmigen",exact:true})).toHaveCount(0);
});
test("three equal sections preserve vehicle controls, URL deep link and browser back navigation",async({page})=>{
  await connect(page);
  const month=page.getByLabel("Fahrzeugmonat");
  await month.fill("2027-02");
  await page.getByRole("button",{name:/Dienstverwaltung/}).click();
  await expect(month).toBeHidden();
  await page.goBack();
  await expect(month).toBeVisible();
  await expect(month).toHaveValue("2027-02");
  await expect(page).toHaveURL(/bereich=fahrzeuge/);
  await page.reload();
  await expect(page.getByLabel("Fahrzeug auswählen")).toBeVisible();
});
test("browser back releases the native vehicle modal without losing its draft",async({page})=>{
  await connect(page);
  await page.getByRole("button",{name:"Reservierung beantragen",exact:true}).click();
  await page.getByLabel("Zweck / Titel").fill("Preserved request draft");
  await page.goBack();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button",{name:/Dienstverwaltung/})).toHaveAttribute("aria-pressed","true");
  await page.getByRole("button",{name:/Fahrzeugkalender/}).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByLabel("Zweck / Titel")).toHaveValue("Preserved request draft");
  await page.getByRole("button",{name:"Dialog schließen"}).click();
  await expect(page.getByLabel("Fahrzeug auswählen")).toBeVisible();
});
