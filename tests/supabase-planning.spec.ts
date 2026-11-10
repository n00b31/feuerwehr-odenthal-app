import {test,expect,type Page} from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {publicPath} from "../src/config/app";
import {seriesDates,CSV_HEADERS,type PlanRequest,type PlannedEvent} from "../src/domain/event-planning";

const api="https://syntheticci.supabase.co",actor="a0631000-0000-4000-8000-000000000001";
const unit="b0631000-0000-4000-8000-000000000001",foreign="b0631000-0000-4000-8000-000000000002";
const seriesId="c0631000-0000-4000-8000-000000000001";
const now="2026-11-09T10:00:00Z";
async function connect(page:Page,role:"global"|"unit"|"member"="global"){
  const state={events:[] as (PlannedEvent&{id:string;series_id:string|null;instance_number:number})[],
    previews:[] as PlanRequest[],commits:[] as PlanRequest[],deny:false,stale:false};
  const global=role==="global",admin=role!=="member";
  const units=[{id:unit,name:"Scheuren",manageable:admin},{id:foreign,name:"Blecher",manageable:global}];
  const selected=(input:PlanRequest)=>state.events.filter(e=>e.series_id===input.series_id && (
    input.selection==="all" || input.selection==="single" && e.id===input.anchor_id ||
    input.selection==="following" && e.instance_number>=(state.events.find(a=>a.id===input.anchor_id)?.instance_number ?? 100)));
  const proposed=(input:PlanRequest)=>{
    if(input.rows)return input.rows;
    const entries=input.operation==="series_update" ? selected(input) : null;
    const dates=seriesDates({...input.rule!,...(entries ? {count:entries.length,end_date:null,
      ...(input.selection==="single" ? {frequency:"daily" as const} : {})} : {})});
    return dates.map(date=>({...input.data!,...date,response_deadline:null}));
  };
  const user={id:actor,aud:"authenticated",role:"authenticated",email:"synthetic.planning@feuerwehr-odenthal.de",
    email_confirmed_at:now,created_at:now,app_metadata:{provider:"email",providers:["email"]},
    user_metadata:{display_name:"Synthetic Planning"}};
  await page.context().route(`${api}/**`,async route=>{
    const request=route.request(),pathname=new URL(request.url()).pathname;
    const respond=(data:unknown,status=200)=>route.fulfill({status,contentType:"application/json",
      headers:{"access-control-allow-origin":"*","x-supabase-api-version":"2024-01-01"},body:JSON.stringify(data)});
    if(pathname==="/auth/v1/token"){
      const payload=Buffer.from(JSON.stringify({sub:actor,exp:Math.floor(Date.now()/1000)+3600})).toString("base64url");
      return respond({access_token:`synthetic.${payload}.fixture`,refresh_token:"synthetic-planning-only",token_type:"bearer",expires_in:3600,user});
    }
    if(pathname==="/auth/v1/user")return respond(user);
    if(pathname.endsWith("/ff_my_access"))return respond({user_id:actor,display_name:"Synthetic Planning",account_status:"approved",
      access_granted:true,unit_id:unit,unit_name:"Scheuren",roles:global ? ["MEMBER","GLOBAL_ADMIN"] : admin ? ["MEMBER","UNIT_ADMIN"] : ["MEMBER"]});
    if(pathname.endsWith("/units"))return respond(units.map(({id,name})=>({id,name})));
    if(pathname.endsWith("/document_areas") || pathname.endsWith("/ff_pending_registrations"))return respond([]);
    if(pathname.endsWith("/ff_events_page"))return respond({server_now:now,manageable_units:units.filter(u=>u.manageable),
      has_more:false,next_cursor:null,retained_events:[],events:state.events.map(e=>({...e,status:"scheduled",revision:0,
        scope_name:"Scheuren",can_manage:admin,can_lead:admin,can_delegate:admin,can_read_attendance:admin,
        attendance_state:"NOT_STARTED",own_attendance:null,in_roster:true,own_response:null,participants:admin ? [] : null}))});
    if(pathname.endsWith("/ff_event_planning_context"))return respond({actor_id:actor,actor_name:"Synthetic Planning",server_now:now,
      units,functions:[],organization:global,organizers:[{id:actor,name:"Synthetic Planning",unit_ids:[unit],function_ids:[]}]});
    if(pathname.endsWith("/ff_series_workspace")){
      const anchor=state.events.find(e=>e.id===request.postDataJSON().target_event)!;
      return respond({series:{id:seriesId,title:"Synthetic fortnightly",frequency:"biweekly",occurrence_count:3,
        rule:state.previews.find(p=>p.operation==="series_create")!.rule,revision:0,ended_on:null},anchor,
        instances:state.events.map(e=>({...e,status:"scheduled",protected:false,exception:false}))});
    }
    if(pathname.endsWith("/ff_preview_event_plan")){
      const input:PlanRequest=request.postDataJSON().input;state.previews.push(input);
      const rows=proposed(input),entries=input.operation==="series_update" ? selected(input) : [];
      const duplicates=rows.map(e=>state.events.some(x=>!entries.some(a=>a.id===x.id) && x.title===e.title && x.starts_at===e.starts_at));
      return respond({token:"a".repeat(64),can_commit:!duplicates.some(Boolean),protected_count:0,response_count:0,
        duplicate_count:duplicates.filter(Boolean).length,rows:rows.map((e,i)=>({...e,event_id:entries[i]?.id ?? null,scope_name:"Scheuren",duplicate:duplicates[i]}))});
    }
    if(pathname.endsWith("/ff_commit_event_plan")){
      const {input,expected_token,confirmed}=request.postDataJSON();
      expect(confirmed).toBe(true);expect(expected_token).toBe("a".repeat(64));
      if(state.deny || !admin)return respond({code:"42501",message:"Synthetic permission revoked"},403);
      if(state.stale)return respond({code:"40001",message:"Vorschau zwischenzeitlich geändert. Erneut prüfen und bestätigen."},409);
      state.commits.push(input);
      const rows:PlannedEvent[]=proposed(input);
      if(input.operation==="series_update"){
        const entries=selected(input);entries.forEach((e,i)=>Object.assign(e,rows[i]));
        return respond({event_ids:entries.map(e=>e.id),series_id:seriesId,count:entries.length,replayed:false});
      }
      const events=rows.map((e,i)=>({...e,id:`e0631000-0000-4000-8000-${String(state.events.length+i+1).padStart(12,"0")}`,
        series_id:input.operation==="series_create" ? seriesId : null,instance_number:i+1}));
      state.events.push(...events);
      return respond({event_ids:events.map(e=>e.id),series_id:events[0].series_id,count:events.length,replayed:false});
    }
    return respond({message:`Unexpected synthetic RPC: ${pathname}`},400);
  });
  await page.goto(publicPath("/termine"));
  await page.getByLabel("Feuerwehr-E-Mail").fill(user.email);
  await page.getByLabel("Passwort",{exact:true}).fill("synthetic-browser-only");
  await page.getByRole("button",{name:"Anmelden",exact:true}).click();
  await expect(page.getByRole("button",{name:/Dienstverwaltung/})).toBeVisible();
  return state;
}
async function planningAction(page:Page,name:string){
  if((page.viewportSize()?.width??1280)<768)
    await page.getByRole("button",{name:name==="Terminserie erstellen"?"Termin erstellen":"Verwalten",exact:true}).click();
  await page.getByRole("button",{name,exact:true}).click();
}
async function fillSeries(page:Page){
  await planningAction(page,"Terminserie erstellen");
  const dialog=page.getByRole("dialog",{name:"Terminserie erstellen"});
  await dialog.getByLabel("Titel",{exact:true}).fill("Synthetic fortnightly");
  await dialog.getByLabel("Ort",{exact:true}).fill("Synthetic CI");
  await dialog.getByLabel("Beschreibung",{exact:true}).fill("Synthetic description");
  await dialog.getByLabel("Startdatum",{exact:true}).fill("2027-03-23");
  await dialog.getByLabel("Wiederholungsregel").selectOption("biweekly");
  await dialog.getByLabel("Maximale Anzahl",{exact:false}).fill("3");
  return dialog;
}
const confirmation="Ich bestätige die geprüften Änderungen einschließlich angezeigter Rückmeldungsinvalidierung.";
const csv=(title="Synthetic CSV",unitName="Scheuren")=>CSV_HEADERS.join(";")+
  `\r\n23.03.2027;19:30;21:30;${title};Synthetic description;Synthetic CI;${unitName};regular;;\r\n`;

test("series require explicit preview and confirmation, remain at Berlin time and refresh canonical services",async({page})=>{
  const state=await connect(page),dialog=await fillSeries(page);
  expect(state.events).toHaveLength(0);
  await dialog.getByRole("button",{name:"Vorschau prüfen"}).click();
  await expect(dialog.getByRole("region",{name:"Servervorschau"}).locator("tbody tr")).toHaveCount(3);
  expect(state.previews[0].rule?.frequency).toBe("biweekly");
  await expect(dialog.getByRole("button",{name:"Änderungen bestätigen"})).toBeDisabled();
  expect(state.commits).toHaveLength(0);
  await dialog.getByLabel(confirmation).check();
  await dialog.getByRole("button",{name:"Änderungen bestätigen"}).click();
  await expect(dialog.getByRole("status").filter({hasText:"3 Termine gespeichert"})).toBeVisible();
  expect(new Set(state.events.map(e=>e.id)).size).toBe(3);
  expect(state.events.map(e=>e.starts_at)).toEqual(["2027-03-23T18:30:00.000Z","2027-04-06T17:30:00.000Z","2027-04-20T17:30:00.000Z"]);
  await dialog.getByRole("button",{name:"Ergebnis schließen"}).click();
  await expect(page.getByText("Synthetic fortnightly",{exact:true})).toHaveCount(3);
});
test("CSV upload never saves, reports errors and duplicates before explicit atomic confirmation",async({page})=>{
  const state=await connect(page);
  await planningAction(page,"Termine aus CSV importieren");
  const dialog=page.getByRole("dialog",{name:"Termine aus CSV importieren"});
  const file=dialog.getByLabel("CSV-Datei (UTF-8, Semikolon)");
  await file.setInputFiles({name:"invalid.csv",mimeType:"text/csv",buffer:Buffer.from(csv("Synthetic invalid","Unbekannt"))});
  await expect(dialog.getByText("Einheit nicht erkannt oder fehlt.",{exact:false})).toBeVisible();
  await expect(dialog.getByRole("button",{name:"Vorschau prüfen"})).toBeDisabled();
  await file.setInputFiles({name:"valid.csv",mimeType:"text/csv",buffer:Buffer.from("\uFEFF"+csv())});
  await expect(dialog.getByRole("status")).toContainText("1 gültig");
  expect(state.commits).toHaveLength(0);
  await dialog.getByRole("button",{name:"Vorschau prüfen"}).click();
  await dialog.getByLabel(confirmation).check();
  await dialog.getByRole("button",{name:"Import bestätigen"}).click();
  await expect(dialog.getByRole("status").filter({hasText:"1 Termine gespeichert"})).toBeVisible();
  await dialog.getByRole("button",{name:"Ergebnis schließen"}).click();
  await planningAction(page,"Termine aus CSV importieren");
  await page.getByLabel("CSV-Datei (UTF-8, Semikolon)").setInputFiles({name:"repeat.csv",mimeType:"text/csv",buffer:Buffer.from(csv())});
  await page.getByRole("dialog").getByRole("button",{name:"Vorschau prüfen"}).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("Duplikate erkannt");
  await expect(page.getByLabel(confirmation)).toBeDisabled();
  expect(state.events).toHaveLength(1);
});
test("changed draft discards confirmation; stale or revoked permissions never show success",async({page})=>{
  const state=await connect(page),dialog=await fillSeries(page);
  await dialog.getByRole("button",{name:"Vorschau prüfen"}).click();
  await dialog.getByLabel(confirmation).check();
  await dialog.getByLabel("Ort",{exact:true}).fill("Changed draft");
  await expect(dialog.getByLabel(confirmation)).toHaveCount(0);
  await dialog.getByRole("button",{name:"Vorschau prüfen"}).click();
  await dialog.getByLabel(confirmation).check();state.stale=true;
  await dialog.getByRole("button",{name:"Änderungen bestätigen"}).click();
  await expect(dialog.getByRole("alert")).toContainText("Vorschau zwischenzeitlich geändert");
  expect(state.commits).toHaveLength(0);
  state.stale=false;state.deny=true;
  await dialog.getByRole("button",{name:"Vorschau prüfen"}).click();
  await dialog.getByLabel(confirmation).check();
  await dialog.getByRole("button",{name:"Änderungen bestätigen"}).click();
  await expect(dialog.getByRole("alert")).toContainText("Synthetic permission revoked");
  expect(state.commits).toHaveLength(0);
});
test("series management previews single, following and all selections and edits the original ID",async({page})=>{
  const state=await connect(page),create=await fillSeries(page);
  await create.getByRole("button",{name:"Vorschau prüfen"}).click();
  await create.getByLabel(confirmation).check();
  await create.getByRole("button",{name:"Änderungen bestätigen"}).click();
  await expect(create.getByRole("status").filter({hasText:"3 Termine gespeichert"})).toBeVisible();
  await create.getByRole("button",{name:"Ergebnis schließen"}).click();
  const ids=state.events.map(e=>e.id);
  if((page.viewportSize()?.width??1280)<768){
    await page.getByRole("button",{name:"Termindetails öffnen: Synthetic fortnightly",exact:false}).nth(1).click();
    await page.getByRole("button",{name:"Serie verwalten",exact:true}).click();
  }else await page.getByRole("button",{name:"Serie verwalten",exact:true}).nth(1).click();
  const dialog=page.getByRole("dialog",{name:"Terminserie verwalten"});
  for(const [selection,count] of [["single",1],["following",2],["all",3]] as const){
    await dialog.getByLabel("Änderungsbereich").selectOption(selection);
    await dialog.getByRole("button",{name:"Vorschau prüfen"}).click();
    await expect(dialog.getByRole("region",{name:"Servervorschau"}).locator("tbody tr")).toHaveCount(count);
    expect(state.previews.at(-1)?.selection).toBe(selection);
  }
  await dialog.getByLabel("Änderungsbereich").selectOption("single");
  await dialog.getByLabel("Titel",{exact:true}).fill("Synthetic moved instance");
  await dialog.getByLabel("Startdatum",{exact:true}).fill("2027-05-01");
  await dialog.getByRole("button",{name:"Vorschau prüfen"}).click();
  await dialog.getByLabel(confirmation).check();
  await dialog.getByRole("button",{name:"Änderungen bestätigen"}).click();
  await expect(dialog.getByRole("status").filter({hasText:"1 Termine verarbeitet"})).toBeVisible();
  expect(state.events.map(e=>e.id)).toEqual(ids);
  expect(state.events.map(e=>e.title)).toEqual(["Synthetic fortnightly","Synthetic moved instance","Synthetic fortnightly"]);
});
test("member has no planning controls and scoped administrator receives only eligible choices",async({page})=>{
  await connect(page,"member");
  await expect(page.getByRole("button",{name:"Terminserie erstellen",exact:true})).toHaveCount(0);
  await expect(page.getByRole("button",{name:"Termine aus CSV importieren",exact:true})).toHaveCount(0);
});
test("unit scope, mobile light/dark accessibility and UTF-8 Excel template",async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await connect(page,"unit");const dialog=await fillSeries(page);
  await expect(dialog.getByLabel("Terminbereich").locator("option")).toHaveCount(1);
  await expect(dialog.getByLabel("Terminbereich")).toHaveValue(`unit:${unit}`);
  for(const theme of ["light","dark"]){
    await page.locator("html").evaluate((e,t)=>e.setAttribute("data-theme",t),theme);
    const audit=await new AxeBuilder({page}).include('[role="dialog"],dialog').analyze();
    expect(audit.violations).toEqual([]);
  }
  await page.getByRole("button",{name:"Dialog schließen",exact:true}).click();
  const downloaded=page.waitForEvent("download");
  await planningAction(page,"CSV-Vorlage herunterladen");
  const download=await downloaded;
  expect(download.suggestedFilename()).toBe("feuerwehr-termine-vorlage.csv");
  const stream=await download.createReadStream();const chunks:Buffer[]=[];
  for await(const chunk of stream!)chunks.push(Buffer.from(chunk));
  const bytes=Buffer.concat(chunks);
  expect(bytes.subarray(0,3).toString("hex")).toBe("efbbbf");
  expect(bytes.toString("utf8")).toContain("BEISPIEL");
  expect(bytes.toString("utf8")).toContain(CSV_HEADERS.join(";"));
});
