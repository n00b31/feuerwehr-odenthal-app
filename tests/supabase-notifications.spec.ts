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
type BrowserPushState={requests:number;gesture:boolean;subscribed:boolean;unsubscribed:number;subscriptions:number;
  workerActive:boolean;failure:"service"|"subscribe"|"lookup"|"worker"|"permission"|"denied"|"notAllowed"|"cleanup"
    |"pendingPermission"|"pendingWorker"|"pendingLookup"|"pendingSubscribe"|null;validKey:boolean;staleKey:boolean;
  finishPermission:(()=>void)|null;finishSubscription:(()=>void)|null};
async function connect(page:Page,options:{support?:boolean;denied?:boolean;linked?:boolean;global?:boolean;guestPush?:boolean;
  provider?:"windows"|"apple";existing?:boolean;otherDevice?:boolean;invalidKey?:boolean}={}){
  const state={calls:[] as string[],revoked:false,fail:false,registerFail:false,reactivateRemoved:false,tests:0,testError:"",
    testStatus:"accepted",testReason:null as string|null,snapshot:{
    actor_id:actor,unread:1,notices:[{id:notice,source_kind:"event",target_id:event,event_type:"event_created",category:"services",
      title:"Neuer Übungsdienst",message:"Synthetic notification practice",created_at:date,read_at:null,
      delivery:{total:0,accepted:0,pending:0,failed:0,cancelled:0}}],
    preferences:{push_enabled:false,categories:["services","changes","reminders","vehicles","administration","information"],reminder_two_hours:false},
    public_key:options.invalidKey?"A".repeat(87):publicKey,server_ready:true,devices:options.otherDevice?[{id:"c0700000-0000-4000-8000-000000000002",
      device_name:"Existing iPhone PWA",created_at:date,last_success_at:date,active:true}]:[],
  } as NotificationWorkspace};
  await page.addInitScript(({support,denied,existing,provider,key})=>{
    const state:BrowserPushState={requests:0,gesture:false,subscribed:existing,unsubscribed:0,subscriptions:0,
      workerActive:true,failure:null,validKey:false,staleKey:false,finishPermission:null,finishSubscription:null};
    Object.defineProperty(window,"syntheticPush",{value:state});
    let permission:NotificationPermission=denied?"denied":"default";
    class SyntheticNotification {
      static get permission(){return permission;}
      static requestPermission(){
        state.requests++;state.gesture=navigator.userActivation.isActive;
        if(state.failure==="permission")throw new DOMException("SYNTHETIC_DO_NOT_LOG","SecurityError");
        if(state.failure==="denied"){permission="denied";return Promise.resolve(permission);}
        if(state.failure==="pendingPermission")return new Promise<NotificationPermission>(resolve=>{
          state.finishPermission=()=>{permission="granted";resolve(permission);};
        });
        permission="granted";return Promise.resolve(permission);
      }
    }
    Object.defineProperty(window,"Notification",{value:SyntheticNotification});
    Object.defineProperty(window,"PushManager",{value:class{}});
    if(!support)Object.defineProperty(window,"isSecureContext",{value:false});
    const endpoint=provider==="windows"?"https://wns2-am3p.notify.windows.com/w/?token=synthetic-browser"
      :provider==="apple"?"https://web.push.apple.com/synthetic-browser":"https://fcm.googleapis.com/fcm/send/synthetic-browser";
    const expected=Uint8Array.from(atob(key.replace(/-/g,"+").replace(/_/g,"/")+"="),c=>c.charCodeAt(0));
    const subscription={endpoint,
      get options(){const bytes=expected.slice();if(state.staleKey)bytes[64]^=1;return {userVisibleOnly:true,applicationServerKey:bytes.buffer};},
      toJSON:()=>({endpoint,keys:{p256dh:"synthetic-point",auth:"synthetic-auth"}}),
      unsubscribe:async()=>{state.unsubscribed++;if(state.failure==="cleanup")return false;state.subscribed=false;return true;}};
    const registration=new EventTarget();
    Object.defineProperty(registration,"active",{get:()=>state.workerActive?{state:"activated"}:null});
    Object.assign(registration,{waiting:null,installing:null,getNotifications:async()=>[],
      pushManager:{getSubscription:async()=>{
        if(state.failure==="pendingLookup")return new Promise<never>(()=>{});
        if(state.failure==="lookup")throw new DOMException("SYNTHETIC_DO_NOT_LOG","InvalidStateError");
        return state.subscribed?subscription:null;
      },subscribe:async(options:PushSubscriptionOptionsInit)=>{
        state.subscriptions++;
        if(!(options.applicationServerKey instanceof ArrayBuffer))throw new DOMException("SYNTHETIC_DO_NOT_LOG","InvalidAccessError");
        const bytes=new Uint8Array(options.applicationServerKey);
        state.validKey=options.userVisibleOnly===true && bytes.length===65 && bytes[0]===4 && bytes.every((value,i)=>value===expected[i]);
        if(!state.validKey)throw new DOMException("SYNTHETIC_DO_NOT_LOG","InvalidAccessError");
        if(state.failure==="service")throw new DOMException("Registration failed - push service error SYNTHETIC_DO_NOT_LOG","AbortError");
        if(state.failure==="subscribe")throw new DOMException("SYNTHETIC_DO_NOT_LOG","NotSupportedError");
        if(state.failure==="notAllowed")throw new DOMException("SYNTHETIC_DO_NOT_LOG","NotAllowedError");
        if(state.failure==="pendingSubscribe")return new Promise(resolve=>{
          state.finishSubscription=()=>{state.subscribed=true;resolve(subscription);};
        });
        state.subscribed=true;return subscription;
      }}});
    const workers=new EventTarget();
    Object.assign(workers,{register:async()=>registration,getRegistration:async()=>{
      if(state.failure==="pendingWorker")return new Promise<never>(()=>{});
      if(state.failure==="worker")throw new DOMException("SYNTHETIC_DO_NOT_LOG","SecurityError");
      return registration;
    }});
    Object.defineProperty(navigator,"serviceWorker",{value:workers});
  },{support:options.support!==false,denied:options.denied??false,existing:options.existing??false,provider:options.provider,key:publicKey});
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
    if(path.endsWith("ff_push_current"))return respond(state.snapshot.devices.some(row=>row.id===device)?device:null);
    if(path.endsWith("ff_push_test_status"))return respond({status:state.testStatus,reason:state.testReason});
    if(path.endsWith("ff_push_register") || path.endsWith("ff_push_reactivate")){
      expect(request.postDataJSON().subscription.endpoint).toContain("synthetic-browser");
      if(path.endsWith("ff_push_reactivate") && state.reactivateRemoved){
        state.snapshot.devices=state.snapshot.devices.filter(row=>row.id!==device);
        return respond({code:"PT404",message:"device_unavailable"},404);
      }
      if(state.registerFail)return respond({code:"42501",message:"SYNTHETIC_DO_NOT_LOG https://invalid.example/private-token"},403);
      state.snapshot.preferences.push_enabled=true;state.snapshot.devices=[...state.snapshot.devices.filter(row=>row.id!==device),
        {id:device,device_name:request.postDataJSON().device_name,
        created_at:date,last_success_at:null,active:true}];return respond(device);
    }
    if(path.endsWith("ff_push_deactivate")){
      const target=request.postDataJSON().device_id??device;
      state.snapshot.devices.forEach(row=>{if(row.id===target)row.active=false;});return respond(null);
    }
    if(path.endsWith("ff_push_remove")){
      state.snapshot.devices=state.snapshot.devices.filter(row=>row.id!==request.postDataJSON().device_id);
      return respond(null);
    }
    if(path==="/functions/v1/push-dispatch"){
      expect(request.postDataJSON()).toEqual({action:"test",device_id:device});
      if(state.testError)return respond({error:state.testError},state.testError==="test_rate_limited"?429:409);
      state.tests++;return respond({queued:true,notification_id:notice},202);
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
  if(options.guestPush){
    await expect(page.getByLabel("Feuerwehr-E-Mail")).toBeVisible();
    await page.evaluate(id=>navigator.serviceWorker.dispatchEvent(new MessageEvent("message",{data:{type:"FF_NOTIFICATION_OPEN",notification_id:id}})),notice);
    await expect(page.getByRole("button",{name:"Benachrichtigung öffnen",exact:true})).toBeDisabled();
    expect(state.calls.filter(path=>path.endsWith("ff_notifications"))).toHaveLength(0);
  }
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
  expect((await browserState(page)).unsubscribed).toBe(0);
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
test("warm Push received while signed out waits for approved login and deliberate navigation",async({page})=>{
  await connect(page,{guestPush:true});
  await expect(page.getByRole("button",{name:"Benachrichtigung öffnen",exact:true})).toBeEnabled();
  await page.getByRole("button",{name:"Benachrichtigung öffnen",exact:true}).click();
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

test("Edge-style granted permission plus native service AbortError never becomes a backend/authorization error",async({page})=>{
  const diagnostics:string[]=[];
  page.on("console",message=>{if(message.text().includes("FF_PUSH_DIAG"))diagnostics.push(message.text());});
  const state=await connect(page,{provider:"windows",otherDevice:true});
  await page.evaluate(()=>{Reflect.get(window,"syntheticPush").failure="service";});
  await page.getByRole("button",{name:"Push-Benachrichtigungen aktivieren",exact:true}).click();
  const alert=page.getByRole("main").getByRole("alert");
  await expect(alert).toContainText("push_service_failed");
  await expect(alert).toContainText("Website-Berechtigung erteilt");
  expect(state.calls.filter(path=>path.endsWith("ff_push_register"))).toHaveLength(0);
  expect((await browserState(page)).validKey).toBe(true);
  expect((await browserState(page)).unsubscribed).toBe(0);
  await expect(page.getByRole("heading",{name:"Posteingang · 1 ungelesen"})).toBeVisible();
  expect(diagnostics.join()).toContain("AbortError");
  expect(diagnostics.join()).not.toContain("SYNTHETIC_DO_NOT_LOG");
  expect(diagnostics.join()).not.toContain("notify.windows.com");
  expect(state.snapshot.devices[0].active).toBe(true);
  await page.evaluate(()=>window.dispatchEvent(new Event("focus")));
  await expect(alert).toContainText("push_service_failed");
  await page.evaluate(()=>{Reflect.get(window,"syntheticPush").failure=null;});
  await page.getByRole("button",{name:"Push-Benachrichtigungen aktivieren",exact:true}).click();
  await expect(page.getByText("Push-Status: Aktiviert",{exact:true})).toBeVisible();
});
for(const provider of ["windows","apple"] as const)test(`synthetic ${provider} subscription is reused without replacing another device`,async({page})=>{
  const state=await connect(page,{provider,otherDevice:true});
  const activate=page.getByRole("button",{name:"Push-Benachrichtigungen aktivieren",exact:true});
  await activate.click();await expect(page.getByText("Push-Status: Aktiviert",{exact:true})).toBeVisible();
  await activate.click();await expect(page.getByText("Push für dieses eigene Gerät aktiviert.",{exact:true})).toBeVisible();
  const browser=await browserState(page);
  expect(browser.subscriptions).toBe(1);expect(browser.validKey).toBe(true);expect(browser.requests).toBe(1);
  expect(state.snapshot.devices).toHaveLength(2);
  await page.getByRole("button",{name:"Push auf diesem Gerät deaktivieren",exact:true}).click();
  await expect(page.getByText("Push-Status: Deaktiviert",{exact:true})).toBeVisible();
  expect(state.snapshot.devices.find(row=>row.device_name==="Existing iPhone PWA")?.active).toBe(true);
});
for(const existing of [false,true])test(`backend rejection never implicitly deletes a subscription another tab may use: existing=${existing}`,async({page})=>{
  const state=await connect(page,{existing,otherDevice:true});
  state.registerFail=true;
  await page.getByRole("button",{name:"Push-Benachrichtigungen aktivieren",exact:true}).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("backend_registration_failed");
  const browser=await browserState(page);
  expect(browser.unsubscribed).toBe(0);expect(browser.subscribed).toBe(true);
  expect(state.snapshot.devices).toHaveLength(1);expect(state.snapshot.devices[0].active).toBe(true);
  await expect(page.getByRole("main").getByRole("alert")).not.toContainText("SYNTHETIC_DO_NOT_LOG");
});
for(const [failure,code] of [["worker","worker_unavailable"],["lookup","subscription_lookup_failed"],
  ["permission","permission_failed"],["subscribe","subscription_create_failed"],["notAllowed","subscription_create_failed"],
  ["denied","permission_blocked"]] as const)test(`registration reports the exact ${failure} phase without backend writes`,async({page})=>{
  const state=await connect(page);
  await page.evaluate(value=>{Reflect.get(window,"syntheticPush").failure=value;},failure);
  await page.getByRole("button",{name:"Push-Benachrichtigungen aktivieren",exact:true}).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(code);
  expect(state.calls.filter(path=>path.endsWith("ff_push_register"))).toHaveLength(0);
  expect((await browserState(page)).unsubscribed).toBe(0);
});
test("malformed public point is rejected before subscribe without altering existing devices",async({page})=>{
  const state=await connect(page,{otherDevice:true,invalidKey:true});
  await page.getByRole("button",{name:"Push-Benachrichtigungen aktivieren",exact:true}).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("public_key_invalid");
  expect((await browserState(page)).subscriptions).toBe(0);
  expect(state.snapshot.devices[0].active).toBe(true);
});
test("failed local subscription lookup still refreshes the usable In-App inbox",async({page})=>{
  await connect(page);
  await page.evaluate(()=>{Reflect.get(window,"syntheticPush").failure="lookup";});
  await page.getByRole("button",{name:"Benachrichtigungen aktualisieren",exact:true}).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("subscription_lookup_failed");
  await expect(page.getByRole("heading",{name:"Posteingang · 1 ungelesen"})).toBeVisible();
  await page.getByRole("button",{name:"Alle als gelesen markieren",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Posteingang · 0 ungelesen"})).toBeVisible();
  await expect(page.getByText("Alle berechtigt sichtbaren Nachrichten als gelesen markiert.",{exact:true})).toHaveCount(0);
});
test("backend failure keeps a native subscription for a deliberate retry and never reports activation",async({page})=>{
  const state=await connect(page);state.registerFail=true;
  await page.evaluate(()=>{Reflect.get(window,"syntheticPush").failure="cleanup";});
  await page.getByRole("button",{name:"Push-Benachrichtigungen aktivieren",exact:true}).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("backend_registration_failed");
  await expect(page.getByText("Push für dieses eigene Gerät aktiviert.",{exact:true})).toHaveCount(0);
});
test("an existing but not activated worker is not passed to PushManager",async({page})=>{
  const state=await connect(page);
  await page.evaluate(()=>{Reflect.get(window,"syntheticPush").workerActive=false;});
  await page.getByRole("button",{name:"Push-Benachrichtigungen aktivieren",exact:true}).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("worker_unavailable");
  expect((await browserState(page)).subscriptions).toBe(0);
  expect(state.calls.filter(path=>path.endsWith("ff_push_register"))).toHaveLength(0);
});
test("existing subscription with an old public key is not silently replaced or saved",async({page})=>{
  const state=await connect(page,{existing:true,otherDevice:true});
  await page.evaluate(()=>{Reflect.get(window,"syntheticPush").staleKey=true;});
  await page.getByRole("button",{name:"Push-Benachrichtigungen aktivieren",exact:true}).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("subscription_key_mismatch");
  expect((await browserState(page)).subscribed).toBe(true);
  expect((await browserState(page)).unsubscribed).toBe(0);
  expect(state.calls.filter(path=>path.endsWith("ff_push_register"))).toHaveLength(0);
});
test("own inactive browser subscription can be explicitly removed without touching another device",async({page})=>{
  const state=await connect(page,{existing:true,otherDevice:true});
  state.snapshot.devices.push({id:device,device_name:"Expired local browser",created_at:date,last_success_at:null,active:false});
  await page.getByRole("button",{name:"Benachrichtigungen aktualisieren",exact:true}).click();
  page.once("dialog",dialog=>dialog.accept());
  await page.getByRole("article").filter({hasText:"Expired local browser"}).getByRole("button",{name:"Gerät entfernen",exact:true}).click();
  await expect(page.getByText("Eigenes Gerät dauerhaft entfernt.",{exact:true})).toBeVisible();
  expect((await browserState(page)).unsubscribed).toBe(1);
  expect(state.snapshot.devices).toHaveLength(1);
  expect(state.snapshot.devices.find(row=>row.device_name==="Existing iPhone PWA")?.active).toBe(true);
});
test("quiet permission prompt has visible progress and a strict 30-second limit; late consent never registers automatically",async({page})=>{
  const state=await connect(page);await page.clock.install();await page.clock.pauseAt(new Date(Date.now()+1_000));
  await page.evaluate(()=>{Reflect.get(window,"syntheticPush").failure="pendingPermission";});
  const activate=page.getByRole("button",{name:"Push-Benachrichtigungen aktivieren",exact:true});
  await activate.click();
  await expect(page.getByText(/Edge kann sie auch nur über ein Benachrichtigungssymbol/)).toBeVisible();
  await page.clock.fastForward(29_999);await expect(activate).toBeDisabled();
  await page.clock.fastForward(1);
  await expect(page.getByRole("main").getByRole("alert")).toContainText("permission_timeout");
  await expect(activate).toBeEnabled();
  await page.evaluate(()=>{Reflect.get(window,"syntheticPush").finishPermission();});
  expect((await browserState(page)).subscriptions).toBe(0);
  expect(state.calls.filter(path=>path.endsWith("ff_push_register"))).toHaveLength(0);
  await page.evaluate(()=>{Reflect.get(window,"syntheticPush").failure=null;});
  await activate.click();await expect(page.getByText("Push-Status: Aktiviert",{exact:true})).toBeVisible();
  expect((await browserState(page)).requests).toBe(1);
});
for(const [failure,milliseconds,code] of [["pendingWorker",10_000,"worker_unavailable"],
  ["pendingLookup",15_000,"subscription_lookup_failed"]] as const)test(`native ${failure} has a bounded wait without backend writes`,async({page})=>{
  const state=await connect(page);await page.clock.install();await page.clock.pauseAt(new Date(Date.now()+1_000));
  await page.evaluate(value=>{Reflect.get(window,"syntheticPush").failure=value;},failure);
  const activate=page.getByRole("button",{name:"Push-Benachrichtigungen aktivieren",exact:true});
  await activate.click();await page.clock.fastForward(milliseconds-1);await expect(activate).toBeDisabled();
  await page.clock.fastForward(1);
  await expect(page.getByRole("main").getByRole("alert")).toContainText(code);
  await expect(activate).toBeEnabled();
  expect(state.calls.filter(path=>path.endsWith("ff_push_register"))).toHaveLength(0);
});
test("late native subscription after 30 seconds never auto-registers or gets deleted; explicit retry reuses it",async({page})=>{
  const state=await connect(page,{otherDevice:true});await page.clock.install();await page.clock.pauseAt(new Date(Date.now()+1_000));
  await page.evaluate(()=>{Reflect.get(window,"syntheticPush").failure="pendingSubscribe";});
  const activate=page.getByRole("button",{name:"Push-Benachrichtigungen aktivieren",exact:true});
  await activate.click();
  await expect(page.getByText(/Der Browser erstellt das Abonnement bei seinem Push-Dienst/)).toBeVisible();
  await page.clock.fastForward(29_999);await expect(activate).toBeDisabled();
  await page.clock.fastForward(1);
  await expect(page.getByRole("main").getByRole("alert")).toContainText("subscription_timeout");
  await expect(activate).toBeEnabled();
  await page.evaluate(()=>{Reflect.get(window,"syntheticPush").finishSubscription();});
  expect(state.calls.filter(path=>path.endsWith("ff_push_register"))).toHaveLength(0);
  expect((await browserState(page)).unsubscribed).toBe(0);
  await page.evaluate(()=>{Reflect.get(window,"syntheticPush").failure=null;});
  await activate.click();await expect(page.getByText("Push-Status: Aktiviert",{exact:true})).toBeVisible();
  expect((await browserState(page)).subscriptions).toBe(1);
  expect(state.snapshot.devices.find(row=>row.device_name==="Existing iPhone PWA")?.active).toBe(true);
});
test("late native subscription cannot make an authenticated backend write after logout",async({page})=>{
  const state=await connect(page);await page.clock.install();await page.clock.pauseAt(new Date(Date.now()+1_000));
  await page.evaluate(()=>{Reflect.get(window,"syntheticPush").failure="pendingSubscribe";});
  await page.getByRole("button",{name:"Push-Benachrichtigungen aktivieren",exact:true}).click();
  await page.clock.fastForward(30_000);
  await expect(page.getByRole("main").getByRole("alert")).toContainText("subscription_timeout");
  await page.getByRole("button",{name:"Abmelden / Sitzung entfernen",exact:true}).click();
  await expect(page.getByRole("button",{name:"Anmelden",exact:true})).toBeVisible();
  await page.evaluate(()=>{Reflect.get(window,"syntheticPush").finishSubscription();});
  expect(state.calls.filter(path=>path.endsWith("ff_push_register"))).toHaveLength(0);
});
for(const provider of ["windows","apple"] as const)test(`synthetic ${provider} lifecycle: repeated reactivation, removal and fresh registration preserve another device`,async({page})=>{
  const state=await connect(page,{provider,otherDevice:true});
  const activate=page.getByRole("button",{name:"Push-Benachrichtigungen aktivieren",exact:true});
  const send=page.getByRole("button",{name:"Test-Push senden · DEV",exact:true});
  await activate.click();await expect(page.getByText("Push-Status: Aktiviert",{exact:true})).toBeVisible();
  await send.click();await expect.poll(()=>state.tests).toBe(1);
  for(let i=0;i<3;i++){
    await page.getByRole("button",{name:"Push auf diesem Gerät deaktivieren",exact:true}).click();
    await expect(page.getByText("Push-Status: Deaktiviert",{exact:true})).toBeVisible();
    await expect(send).toBeDisabled();
    await page.getByRole("button",{name:"Gerät reaktivieren",exact:true}).click();
    await expect(page.getByText("Push-Status: Aktiviert",{exact:true})).toBeVisible();
    await send.click();await expect.poll(()=>state.tests).toBe(i+2);
  }
  expect((await browserState(page)).subscriptions).toBe(1);
  const local=page.getByRole("article").filter({hasText:"dieses Gerät"});
  page.once("dialog",dialog=>dialog.dismiss());
  await local.getByRole("button",{name:"Gerät entfernen",exact:true}).click();
  expect(state.snapshot.devices).toHaveLength(2);
  page.once("dialog",dialog=>dialog.accept());
  await local.getByRole("button",{name:"Gerät entfernen",exact:true}).click();
  await expect(page.getByText("Eigenes Gerät dauerhaft entfernt.",{exact:true})).toBeVisible();
  expect(state.snapshot.devices).toHaveLength(1);
  expect((await browserState(page)).unsubscribed).toBe(1);
  await activate.click();await expect(page.getByText("Push-Status: Aktiviert",{exact:true})).toBeVisible();
  await send.click();await expect.poll(()=>state.tests).toBe(5);
  expect((await browserState(page)).subscriptions).toBe(2);
  expect(state.snapshot.devices.find(row=>row.device_name==="Existing iPhone PWA")?.active).toBe(true);
});
for(const reason of ["test_rate_limited","device_inactive","device_unavailable"] as const)test(`test ${reason} is explicit, never a registration error`,async({page})=>{
  const state=await connect(page);
  await page.getByRole("button",{name:"Push-Benachrichtigungen aktivieren",exact:true}).click();
  await expect(page.getByText("Push-Status: Aktiviert",{exact:true})).toBeVisible();
  state.testError=reason;
  await page.getByRole("button",{name:"Test-Push senden · DEV",exact:true}).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(reason);
  await expect(page.getByText("Registrierung: Aktiv",{exact:true})).toBeVisible();
  expect(state.tests).toBe(0);
});
test("provider rejection is not reported as registration failure or successful delivery",async({page})=>{
  const state=await connect(page);
  await page.getByRole("button",{name:"Push-Benachrichtigungen aktivieren",exact:true}).click();
  await expect(page.getByText("Push-Status: Aktiviert",{exact:true})).toBeVisible();
  state.testStatus="failed";state.testReason="subscription_invalid";
  await page.getByRole("button",{name:"Test-Push senden · DEV",exact:true}).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("subscription_invalid");
  await expect(page.getByText("Registrierung: Aktiv",{exact:true})).toBeVisible();
});
test("removing another own device never unsubscribes this browser",async({page})=>{
  const state=await connect(page,{otherDevice:true});
  await page.getByRole("button",{name:"Push-Benachrichtigungen aktivieren",exact:true}).click();
  await expect(page.getByText("Push-Status: Aktiviert",{exact:true})).toBeVisible();
  page.once("dialog",dialog=>dialog.accept());
  await page.getByRole("article").filter({hasText:"Existing iPhone PWA"}).getByRole("button",{name:"Gerät entfernen",exact:true}).click();
  await expect(page.getByText("Eigenes Gerät dauerhaft entfernt.",{exact:true})).toBeVisible();
  expect(state.snapshot.devices).toHaveLength(1);expect(state.snapshot.devices[0].id).toBe(device);
  expect((await browserState(page)).unsubscribed).toBe(0);
});
test("concurrently removed identity fails reactivation and refreshes the list without deleting the native subscription",async({page})=>{
  const state=await connect(page);
  await page.getByRole("button",{name:"Push-Benachrichtigungen aktivieren",exact:true}).click();
  await expect(page.getByText("Push-Status: Aktiviert",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Push auf diesem Gerät deaktivieren",exact:true}).click();
  await expect(page.getByText("Push-Status: Deaktiviert",{exact:true})).toBeVisible();
  state.reactivateRemoved=true;
  await page.getByRole("button",{name:"Gerät reaktivieren",exact:true}).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("device_unavailable");
  await expect(page.getByText("Noch kein Gerät registriert.",{exact:true})).toBeVisible();
  expect((await browserState(page)).unsubscribed).toBe(0);
});
