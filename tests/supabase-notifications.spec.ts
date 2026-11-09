import { test,expect,type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createECDH } from "node:crypto";
import { publicPath } from "../src/config/app";
import type { NotificationWorkspace } from "../src/domain/notifications";
const actor="a0700000-0000-4000-8000-000000000001",unit="b0700000-0000-4000-8000-000000000001";
const device="c0700000-0000-4000-8000-000000000001",notice="d0700000-0000-4000-8000-000000000001",event="e0700000-0000-4000-8000-000000000001";
const api="https://syntheticci.supabase.co",date="2026-11-09T12:00:00Z";
const point=createECDH("prime256v1");point.generateKeys();
const publicKey=point.getPublicKey().toString("base64url");
type BrowserPushState={requests:number;gesture:boolean;subscribed:boolean;unsubscribed:number};
async function connect(page:Page,options:{support?:boolean;denied?:boolean;linked?:boolean;global?:boolean}={}){
  const state={calls:[] as string[],revoked:false,fail:false,tests:0,snapshot:{
    actor_id:actor,unread:1,notices:[{id:notice,source_kind:"event",target_id:event,event_type:"event_created",category:"services",
      title:"Neuer Übungsdienst",message:"Synthetic notification practice",created_at:date,read_at:null,
      delivery:{total:0,accepted:0,pending:0,failed:0,cancelled:0}}],
    preferences:{push_enabled:false,categories:["services","changes","reminders","vehicles","administration","information"],reminder_two_hours:false},
    public_key:publicKey,server_ready:true,devices:[],
  } as NotificationWorkspace};
  await page.addInitScript(({support,denied})=>{
    const state={requests:0,gesture:false,subscribed:false,unsubscribed:0};
    Object.defineProperty(window,"syntheticPush",{value:state});
    let permission:NotificationPermission=denied?"denied":"default";
    class SyntheticNotification {
      static get permission(){return permission;}
      static requestPermission(){state.requests++;state.gesture=navigator.userActivation.isActive;permission="granted";return Promise.resolve(permission);}
    }
    Object.defineProperty(window,"Notification",{value:SyntheticNotification});
    Object.defineProperty(window,"PushManager",{value:class{}});
    if(!support)Object.defineProperty(window,"isSecureContext",{value:false});
    const subscription={endpoint:"https://fcm.googleapis.com/fcm/send/synthetic-browser",
      toJSON:()=>({endpoint:"https://fcm.googleapis.com/fcm/send/synthetic-browser",keys:{p256dh:"synthetic-point",auth:"synthetic-auth"}}),
      unsubscribe:async()=>{state.unsubscribed++;state.subscribed=false;return true;}};
    const registration=new EventTarget();
    Object.assign(registration,{active:{},waiting:null,installing:null,getNotifications:async()=>[],
      pushManager:{getSubscription:async()=>state.subscribed?subscription:null,subscribe:async()=>{
        state.subscribed=true;return subscription;
      }}});
    const workers=new EventTarget();
    Object.assign(workers,{register:async()=>registration,getRegistration:async()=>registration});
    Object.defineProperty(navigator,"serviceWorker",{value:workers});
  },{support:options.support!==false,denied:options.denied??false});
  const user={id:actor,aud:"authenticated",role:"authenticated",email:"synthetic.notifications@feuerwehr-odenthal.de",
    email_confirmed_at:date,created_at:date,app_metadata:{provider:"email",providers:["email"]},user_metadata:{display_name:"Synthetic Member"}};
  await page.context().route(/https:\/\/(?!syntheticci\.supabase\.co)[^/]+\.supabase\.co\/.*/,route=>route.abort());
  await page.context().route(`${api}/**`,async route=>{
    const request=route.request(),path=new URL(request.url()).pathname;state.calls.push(path);
    const respond=(data:unknown,status=200)=>route.fulfill({status,contentType:"application/json",
      headers:{"access-control-allow-origin":"*","x-supabase-api-version":"2024-01-01"},body:JSON.stringify(data)});
    if(path==="/auth/v1/token"){
      const payload=Buffer.from(JSON.stringify({sub:actor,exp:Math.floor(Date.now()/1000)+3600})).toString("base64url");
      return respond({access_token:`synthetic.${payload}.fixture`,refresh_token:"synthetic-only",expires_in:3600,token_type:"bearer",user});
    }
    if(path==="/auth/v1/user")return respond(user);
    if(path==="/auth/v1/logout")return route.fulfill({status:204});
    if(path.endsWith("ff_my_access"))return respond({user_id:actor,display_name:"Synthetic Member",account_status:"approved",access_granted:true,
      unit_id:unit,unit_name:"Scheuren",roles:options.global?["MEMBER","GLOBAL_ADMIN"]:["MEMBER"]});
    if(path.endsWith("/units"))return respond([{id:unit,name:"Scheuren"}]);
    if(path.endsWith("/document_areas")||path.endsWith("ff_pending_registrations"))return respond([]);
    if(path.endsWith("ff_reports_context"))return respond({current_year:2026,years:[2026],organization:false,configure:false,
      personal_units:[{id:unit,name:"Scheuren"}],units:[],functions:[],event_types:[]});
    if(path.endsWith("ff_year_report"))return respond({year:2026,scope:"personal",target:null,scope_name:"Synthetic member",
      summary:{members:1,services:0,practices:0,training_services:0,eligible:0,present:0,absent:0,training_present:0,training_absent:0,
        unknown:0,training_hours:0,service_hours:0,participant_hours:0,rate:null,average_attendance:null,pending:0,excluded:0,missing_roster:0},
      members:[],units:[],events:[],page:0,event_count:0,has_more:false});
    if(path.endsWith("ff_notifications")){
      if(state.fail)return respond({message:"Synthetic notification failure"},503);
      return respond({...state.snapshot,notices:state.revoked?[]:state.snapshot.notices});
    }
    if(path.endsWith("ff_notification_read")){
      for(const row of state.snapshot.notices)row.read_at=date;state.snapshot.unread=0;return respond(null);
    }
    if(path.endsWith("ff_notification_preferences")){state.snapshot.preferences=request.postDataJSON();return respond(null);}
    if(path.endsWith("ff_push_current"))return respond(device);
    if(path.endsWith("ff_push_register")){
      expect(request.postDataJSON().subscription.endpoint).toContain("synthetic-browser");
      state.snapshot.preferences.push_enabled=true;state.snapshot.devices=[{id:device,device_name:request.postDataJSON().device_name,
        created_at:date,last_success_at:null,active:true}];return respond(device);
    }
    if(path.endsWith("ff_push_deactivate")){
      state.snapshot.devices.forEach(row=>{row.active=false;});return respond(null);
    }
    if(path==="/functions/v1/push-dispatch"){
      expect(request.postDataJSON()).toEqual({action:"test",device_id:device});state.tests++;return respond({queued:true},202);
    }
    if(path.endsWith("ff_events_page"))return respond({server_now:date,manageable_units:[],retained_events:[],has_more:false,next_cursor:null,events:[{
      id:event,title:"Synthetic notification practice",description:"Synthetic protocol fixture",event_type:"regular",starts_at:"2026-12-01T18:00:00Z",
      ends_at:"2026-12-01T20:00:00Z",location:"Synthetic CI",status:"scheduled",unit_id:unit,series_id:null,revision:0,
      response_deadline:null,scope_name:"Scheuren",can_manage:false,can_lead:false,can_delegate:false,can_read_attendance:false,
      in_roster:true,attendance_state:"NOT_STARTED",own_response:null,own_attendance:null,participants:null,
    }]});
    return respond({message:`Unexpected synthetic notification request: ${path}`},400);
  });
  await page.goto(publicPath(`/profil/${options.linked?`?notification=${notice}`:""}`));
  await page.getByLabel("Feuerwehr-E-Mail").fill(user.email);
  await page.getByLabel("Passwort",{exact:true}).fill("SyntheticOnly!123");
  await page.getByRole("button",{name:"Anmelden",exact:true}).click();
  if(!options.linked)await expect(page.getByRole("heading",{name:"Posteingang · 1 ungelesen"})).toBeVisible();
  return state;
}
const browserState=(page:Page)=>page.evaluate(()=>Reflect.get(window,"syntheticPush") as BrowserPushState);
test("permission is requested only on explicit click, then own device can receive DEV test and deactivate",async({page})=>{
  const state=await connect(page);
  expect((await browserState(page)).requests).toBe(0);
  await page.getByLabel("Gerätename",{exact:true}).fill("Synthetic phone");
  await page.getByRole("button",{name:"Push-Benachrichtigungen aktivieren",exact:true}).click();
  await expect(page.getByText("Push-Status: Aktiviert",{exact:true})).toBeVisible();
  expect((await browserState(page)).requests).toBe(1);expect((await browserState(page)).gesture).toBe(true);
  await page.getByRole("button",{name:"Test-Push senden · DEV",exact:true}).click();
  await expect.poll(()=>state.tests).toBe(1);
  await expect(page.getByRole("button",{name:"Push auf diesem Gerät deaktivieren",exact:true})).toBeEnabled();
  await page.getByRole("button",{name:"Push auf diesem Gerät deaktivieren",exact:true}).click();
  await expect(page.getByText("Push-Status: Deaktiviert",{exact:true})).toBeVisible();
  expect((await browserState(page)).unsubscribed).toBe(1);
});
test("browser rejection is respected without repeat prompts and In-App fallback remains usable",async({page})=>{
  await connect(page,{denied:true});
  await expect(page.getByText("Push-Status: Vom Browser blockiert",{exact:true})).toBeVisible();
  await expect(page.getByRole("button",{name:"Push-Benachrichtigungen aktivieren",exact:true})).toBeDisabled();
  expect((await browserState(page)).requests).toBe(0);
  await page.getByRole("button",{name:"Alle als gelesen markieren",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Posteingang · 0 ungelesen"})).toBeVisible();
});
test("unsupported Push provides iPhone installation help and fully working In-App fallback",async({page})=>{
  await connect(page,{support:false});
  await expect(page.getByText("Push-Status: Auf diesem Gerät nicht unterstützt",{exact:true})).toBeVisible();
  await expect(page.getByText(/Zum Home-Bildschirm/)).toBeVisible();
  await page.getByRole("button",{name:"Vorgang öffnen",exact:true}).click();
  await expect(page).toHaveURL(new RegExp(`termin=${event}`));
  await expect(page.getByRole("heading",{name:"Synthetic notification practice",exact:true})).toBeVisible();
});
test("category edits do not change confirmed Push state until explicit save",async({page})=>{
  const state=await connect(page);
  await page.getByRole("checkbox",{name:"Übungsdienste",exact:true}).uncheck();
  await page.getByRole("checkbox",{name:"Zusätzliche Übungsdienst-Erinnerung zwei Stunden vorher",exact:true}).check();
  await expect(page.getByText(/Diese Einstellungen sind noch nicht gespeichert/)).toBeVisible();
  expect(state.snapshot.preferences.categories).toContain("services");
  await page.getByRole("button",{name:"Benachrichtigungseinstellungen speichern",exact:true}).click();
  await expect(page.getByText("Benachrichtigungseinstellungen gespeichert.",{exact:true})).toBeVisible();
  expect(state.snapshot.preferences.categories).not.toContain("services");expect(state.snapshot.preferences.reminder_two_hours).toBe(true);
});
test("cold Push link survives login and resolves to authenticated existing service details",async({page})=>{
  await connect(page,{linked:true});
  await expect(page).toHaveURL(new RegExp(`termin=${event}`));
  await expect(page.getByRole("heading",{name:"Synthetic notification practice",exact:true})).toBeVisible();
});
test("warm Push preserves edited settings and navigation requires an explicit action with fresh permission check",async({page})=>{
  const state=await connect(page);
  await page.getByLabel("Gerätename",{exact:true}).fill("Unsaved device draft");
  await page.evaluate(id=>navigator.serviceWorker.dispatchEvent(new MessageEvent("message",{data:{type:"FF_NOTIFICATION_OPEN",notification_id:id}})),notice);
  await expect(page.getByRole("button",{name:"Benachrichtigung öffnen",exact:true})).toBeVisible();
  await expect(page.getByLabel("Gerätename",{exact:true})).toHaveValue("Unsaved device draft");
  expect(page.url()).toContain("/profil/");
  state.revoked=true;
  await page.getByRole("button",{name:"Benachrichtigung öffnen",exact:true}).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("nicht mehr berechtigt verfügbar");
  expect(page.url()).toContain("/profil/");
});
test("logout deactivates the current device before Auth removal and unsubscribes locally",async({page})=>{
  const state=await connect(page);
  await page.getByRole("button",{name:"Push-Benachrichtigungen aktivieren",exact:true}).click();
  await expect(page.getByText("Push-Status: Aktiviert",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Abmelden / Sitzung entfernen",exact:true}).click();
  await expect(page.getByRole("button",{name:"Anmelden",exact:true})).toBeVisible();
  expect(state.calls.findIndex(path=>path.endsWith("ff_push_deactivate"))).toBeLessThan(state.calls.indexOf("/auth/v1/logout"));
  expect((await browserState(page)).unsubscribed).toBe(1);
});
for(const mode of ["light","dark"] as const)test(`notification profile is accessible and responsive in ${mode} mode`,async({page})=>{
  await page.emulateMedia({colorScheme:mode});await connect(page);
  expect((await new AxeBuilder({page}).include("#benachrichtigungen").analyze()).violations).toEqual([]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});
