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

Deno.serve(createPushHandler({
  url,publicKey,serviceKey,cronSecret,
  waitUntil:task=>EdgeRuntime.waitUntil(task),
  report:code=>console.error(JSON.stringify({component:"push-dispatch",code})),
  bootstrap:async()=>{
    const response=await fetch(`${url}/rest/v1/rpc/ff_push_bootstrap`,{method:"POST",
      headers:{apikey:serviceKey,Authorization:`Bearer ${serviceKey}`,"Content-Type":"application/json"},
      body:JSON.stringify({public_key:vapidPublic,cron_secret:cronSecret}),redirect:"error",signal:AbortSignal.timeout(10_000)});
    if(!response.ok)throw new Error("push_bootstrap_failed");
  },
  send:async(subscription,payload,topic)=>{
    let details:ReturnType<typeof webpush.generateRequestDetails>;
    try {
      details=webpush.generateRequestDetails(subscription,payload,{vapidDetails:{
        subject:"https://n00b31.github.io/feuerwehr-odenthal-app/",publicKey:vapidPublic,privateKey:vapidPrivate,
      },TTL:300,urgency:"normal",topic,contentEncoding:"aes128gcm"});
    } catch { return 400; }
    const response=await fetch(subscription.endpoint,{method:"POST",headers:details.headers,body:new Uint8Array(details.body).buffer,
      redirect:"error",signal:AbortSignal.timeout(8_000)});
    await response.body?.cancel();
    return response.status;
  },
}));
