import { test } from "node:test";
import assert from "node:assert/strict";
import { notificationHref,notificationPreferencesSchema,notificationWorkspaceSchema,publicApplicationKey,
  notificationError,notificationDiagnostic,PushRegistrationError } from "./notifications";
import { allowedPushEndpoint,createPushHandler } from "../../supabase/functions/push-dispatch/handler";
import { generateKeyPairSync } from "node:crypto";

const id="a0700000-0000-4000-8000-000000000001",notice="b0700000-0000-4000-8000-000000000001";
const delivery="c0700000-0000-4000-8000-000000000001",lease="d0700000-0000-4000-8000-000000000001";
test("push diagnostics retain only known phase and error names, never raw exceptions",()=>{
  const cause=new Error("SYNTHETIC_PRIVATE_TOKEN https://notify.invalid/private");
  cause.name="SYNTHETIC_PRIVATE_NAME";
  const failure=new PushRegistrationError("backend_registration_failed",cause);
  assert.deepEqual(notificationDiagnostic(failure),{code:"backend_registration_failed",browserError:"UnknownError"});
  assert.ok(!notificationError(failure).includes("SYNTHETIC_PRIVATE"));
  assert.ok(!JSON.stringify(notificationDiagnostic(failure)).includes("https://"));
  assert.ok(!notificationError(cause).includes("SYNTHETIC_PRIVATE"));
  const service=new PushRegistrationError("push_service_failed",new DOMException("private details","AbortError"));
  assert.deepEqual(notificationDiagnostic(service),{code:"push_service_failed",browserError:"AbortError"});
  assert.match(notificationError(service),/Website-Berechtigung erteilt/);
});
test("notification navigation uses only validated UUIDs and existing authenticated routes",()=>{
  assert.equal(notificationHref({source_kind:"event",target_id:id}),`/termine/?bereich=dienste&termin=${id}#event-${id}`);
  assert.match(notificationHref({source_kind:"attendance",target_id:id}),/aufgabe=attendance/);
  assert.equal(notificationHref({source_kind:"vehicle",target_id:id}),`/termine/?bereich=fahrzeuge&vorgang=${id}`);
  assert.equal(notificationHref({source_kind:"registration",target_id:id}),"/administration/");
  assert.equal(notificationHref({source_kind:"test",target_id:id}),"/profil/");
  assert.throws(()=>notificationHref({source_kind:"event",target_id:"https://evil.invalid"}));
});
test("notification settings never accept unknown or privileged categories",()=>{
  assert.equal(notificationPreferencesSchema.safeParse({push_enabled:false,categories:["services"],reminder_two_hours:false}).success,true);
  assert.equal(notificationPreferencesSchema.safeParse({push_enabled:true,categories:["auth"],reminder_two_hours:false}).success,false);
  assert.equal(notificationWorkspaceSchema.safeParse({actor_id:id,unread:0,notices:[]}).success,false);
});
test("public application key is actual uncompressed P-256 point, not arbitrary input",()=>{
  const {publicKey}=generateKeyPairSync("ec",{namedCurve:"prime256v1"});
  const jwk=publicKey.export({format:"jwk"});
  const key=Buffer.concat([Buffer.from([4]),Buffer.from(jwk.x!,"base64url"),Buffer.from(jwk.y!,"base64url")]).toString("base64url");
  assert.equal(publicApplicationKey(key).byteLength,65);
  assert.throws(()=>publicApplicationKey("A".repeat(87)));
  assert.throws(()=>publicApplicationKey("short"));
});
test("push transport rejects arbitrary hosts, insecure schemes, credentials, ports and redirects",()=>{
  for(const endpoint of ["https://fcm.googleapis.com/fcm/send/ci","https://web.push.apple.com/ci",
    "https://updates.push.services.mozilla.com/wpush/v2/ci","https://wns2-bl2p.notify.windows.com/ci"])
    assert.equal(allowedPushEndpoint(endpoint),true);
  for(const endpoint of ["http://fcm.googleapis.com/ci","https://fcm.googleapis.com.attacker.invalid/ci",
    "https://fcm.googleapis.com:444/ci","https://user@fcm.googleapis.com/ci","https://127.0.0.1/ci","https://web.push.apple.com/ci#fragment"])
    assert.equal(allowedPushEndpoint(endpoint),false);
});
function fixture(status=201,endpoint="https://fcm.googleapis.com/fcm/send/ci") {
  const tasks:Promise<void>[]=[],calls:{path:string;data:Record<string,unknown>;authorization:string|null}[]=[];
  const sent:{payload:string;topic:string}[]=[],reports:string[]=[];
  let validUser=true,denyTest=false;
  const request:typeof fetch=async(input,init)=>{
    const path=new URL(String(input)).pathname;
    const data=JSON.parse(String(init?.body??"{}")) as Record<string,unknown>;
    const authorization=new Headers(init?.headers).get("authorization");
    calls.push({path,data,authorization});
    const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json"}});
    if(path==="/auth/v1/user")return json(validUser?{id}:null,validUser?200:401);
    if(path.endsWith("ff_push_test"))return json(denyTest?{message:"forbidden"}:notice,denyTest?403:200);
    if(path.endsWith("ff_notification_tick"))return json(1);
    if(path.endsWith("ff_push_claim"))return json([{id:delivery,lease_id:lease,notification_id:notice,
      subscription:{endpoint,keys:{p256dh:"synthetic-point",auth:"synthetic-auth"}}}]);
    if(path.endsWith("ff_push_complete"))return json(true);
    throw new Error("Unexpected synthetic request");
  };
  const handler=createPushHandler({url:"https://orxinqhhbtjpkzwlfaxq.supabase.co",publicKey:"synthetic-public",serviceKey:"synthetic-server",
    cronSecret:"c".repeat(43),request,waitUntil:task=>tasks.push(task),report:code=>reports.push(code),
    bootstrap:async()=>{calls.push({path:"bootstrap",data:{},authorization:null});},
    send:async(_subscription,payload,topic)=>{sent.push({payload,topic});return status;}});
  const invoke=(data:unknown,headers:Record<string,string>={})=>handler(new Request("https://synthetic.invalid/push-dispatch",
    {method:"POST",headers,body:JSON.stringify(data)}));
  return {invoke,calls,sent,reports,wait:()=>Promise.all(tasks),invalidUser:()=>{validUser=false;},denyTest:()=>{denyTest=true;}};
}
test("only authenticated user action queues its own DEV test using caller bearer, not a browser-supplied role",async()=>{
  const f=fixture();
  const response=await f.invoke({action:"test",device_id:id},{Authorization:"Bearer synthetic-user"});
  assert.equal(response.status,202);await f.wait();
  assert.equal(f.calls.find(call=>call.path.endsWith("ff_push_test"))?.authorization,"Bearer synthetic-user");
  assert.deepEqual(f.calls.find(call=>call.path.endsWith("ff_push_claim"))?.data,{only_notification:notice});
  assert.equal(f.calls.find(call=>call.path.endsWith("ff_push_complete"))?.authorization,"Bearer synthetic-server");
  assert.equal(f.sent.length,1);
  assert.deepEqual(JSON.parse(f.sent[0].payload),{format:1,notification_id:notice,delivery_id:delivery});
  assert.equal(f.sent[0].topic,delivery.replace(/-/g,""));
  assert.deepEqual(f.reports,[]);
});
test("unauthenticated, forged or server-refused DEV tests never dispatch",async()=>{
  const f=fixture();
  assert.equal((await f.invoke({action:"test",device_id:id})).status,401);
  assert.equal((await f.invoke({action:"test",device_id:id,role:"GLOBAL_ADMIN"},{Authorization:"Bearer fake"})).status,400);
  f.invalidUser();
  assert.equal((await f.invoke({action:"test",device_id:id},{Authorization:"Bearer fake"})).status,401);
  await f.wait();assert.deepEqual(f.sent,[]);
  const denied=fixture();denied.denyTest();
  assert.equal((await denied.invoke({action:"test",device_id:id},{Authorization:"Bearer synthetic-user"})).status,403);
  await denied.wait();assert.deepEqual(denied.sent,[]);
});
test("cron and bootstrap require secret authentication and never accept browser authorization alone",async()=>{
  const f=fixture();
  assert.equal((await f.invoke({action:"drain"},{Authorization:"Bearer synthetic-user"})).status,401);
  assert.equal((await f.invoke({action:"bootstrap"},{"x-ff-cron":"wrong"})).status,401);
  assert.equal((await f.invoke({action:"bootstrap"},{"x-ff-cron":"c".repeat(43)})).status,200);
  assert.equal((await f.invoke({action:"drain"},{"x-ff-cron":"c".repeat(43)})).status,202);
  await f.wait();assert.ok(f.calls.some(call=>call.path.endsWith("ff_notification_tick")));
});
for(const status of [201,404,410,429,503])test(`transport reports HTTP ${status} for actual database retry/expiry handling`,async()=>{
  const f=fixture(status);
  await f.invoke({action:"test",device_id:id},{Authorization:"Bearer synthetic-user"});await f.wait();
  assert.equal(f.calls.find(call=>call.path.endsWith("ff_push_complete"))?.data.result_code,status);
});
test("invalid claimed endpoint is terminal and does not issue arbitrary outbound request",async()=>{
  const f=fixture(201,"https://127.0.0.1/private");
  await f.invoke({action:"test",device_id:id},{Authorization:"Bearer synthetic-user"});await f.wait();
  assert.deepEqual(f.sent,[]);
  assert.equal(f.calls.find(call=>call.path.endsWith("ff_push_complete"))?.data.result_code,400);
});
test("oversized requests and foreign origins fail closed without side effects",async()=>{
  const f=fixture();
  assert.equal((await f.invoke({action:"test",device_id:id,padding:"x".repeat(5000)})).status,400);
  assert.equal((await f.invoke({action:"test",device_id:id},{Origin:"https://attacker.invalid"})).status,403);
  assert.deepEqual(f.calls,[]);
});
