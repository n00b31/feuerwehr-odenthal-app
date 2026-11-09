// @ts-types="npm:@types/web-push@3.6.4"
import webpush from "npm:web-push@3.6.7";
import { createPushHandler } from "./handler.ts";
declare const EdgeRuntime:{waitUntil(task:Promise<void>):void};

const url=Deno.env.get("SUPABASE_URL");
const publicKey=Deno.env.get("SUPABASE_ANON_KEY");
const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const vapidPublic=Deno.env.get("FF_VAPID_PUBLIC_KEY");
const vapidPrivate=Deno.env.get("FF_VAPID_PRIVATE_KEY");
const cronSecret=Deno.env.get("FF_PUSH_CRON_SECRET");
if(url!=="https://orxinqhhbtjpkzwlfaxq.supabase.co" || !publicKey || !serviceKey || !vapidPublic || !vapidPrivate || !cronSecret)
  throw new Error("Pinned DEV and server-only push configuration required");
const vapidDetails={subject:"https://n00b31.github.io/feuerwehr-odenthal-app/",publicKey:vapidPublic,privateKey:vapidPrivate};
const bootstrap=async()=>{
  const receiver=webpush.generateVAPIDKeys();
  const auth=btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16)))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
  const probe=webpush.generateRequestDetails({endpoint:"https://fcm.googleapis.com/fcm/send/local-crypto-check",
    keys:{p256dh:receiver.publicKey,auth}},'{"format":1}',{vapidDetails,contentEncoding:"aes128gcm",TTL:300});
  if(!probe.body || probe.headers["Content-Encoding"]!=="aes128gcm")throw new Error("push_crypto_unavailable");
  const response=await fetch(`${url}/rest/v1/rpc/ff_push_bootstrap`,{method:"POST",
    headers:{apikey:serviceKey,Authorization:`Bearer ${serviceKey}`,"Content-Type":"application/json"},
    body:JSON.stringify({public_key:vapidPublic,cron_secret:cronSecret}),redirect:"error",signal:AbortSignal.timeout(10_000)});
  if(!response.ok){
    const data:unknown=await response.json();
    const code=data && typeof data==="object" && "code" in data && typeof data.code==="string"
      && /^[A-Z0-9_]{5,32}$/.test(data.code) ? data.code : "unknown";
    throw new Error(`push_bootstrap_failed_${response.status}_${code}`);
  }
};
await bootstrap();

Deno.serve(createPushHandler({
  url,publicKey,serviceKey,cronSecret,
  waitUntil:task=>EdgeRuntime.waitUntil(task),
  report:code=>console.error(JSON.stringify({component:"push-dispatch",code})),
  bootstrap,
  send:async(subscription,payload,topic)=>{
    let details:ReturnType<typeof webpush.generateRequestDetails>;
    try {
      details=webpush.generateRequestDetails(subscription,payload,{vapidDetails,TTL:300,urgency:"normal",topic,contentEncoding:"aes128gcm"});
    } catch { return 400; }
    if(!details.body)return 400;
    const response=await fetch(subscription.endpoint,{method:"POST",headers:details.headers,body:new Uint8Array(details.body).buffer,
      redirect:"error",signal:AbortSignal.timeout(8_000)});
    await response.body?.cancel();
    return response.status;
  },
}));
