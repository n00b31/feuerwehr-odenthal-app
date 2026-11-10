export type PushSubscriptionData={endpoint:string;keys:{p256dh:string;auth:string}};
type Job={id:string;lease_id:string;notification_id:string;subscription:PushSubscriptionData};
class PushRpcError extends Error {
  constructor(readonly code:string){super("notification_rpc_failed");}
}
type Options={
  url:string;publicKey:string;serviceKey:string;cronSecret:string;
  send:(subscription:PushSubscriptionData,payload:string,topic:string)=>Promise<number>;
  waitUntil:(task:Promise<void>)=>void;
  request?:typeof fetch;
  report?:(code:string)=>void;
  bootstrap:()=>Promise<void>;
};
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function allowedPushEndpoint(endpoint:string) {
  if(!URL.canParse(endpoint))return false;
  const url=new URL(endpoint);
  return url.protocol==="https:" && !url.username && !url.password && !url.port && !url.hash && endpoint.length<=2048
    && /^(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)$/.test(url.hostname);
}
async function equalSecret(left:string,right:string) {
  if(left.length>256)return false;
  const hash=async(value:string)=>new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value)));
  const [a,b]=await Promise.all([hash(left),hash(right)]);
  let difference=0;for(let i=0;i<a.length;i++)difference|=a[i]^b[i];
  return difference===0;
}
async function body(request:Request):Promise<Record<string,unknown>>{
  const reader=request.body?.getReader();
  if(!reader)throw new Error("invalid_request");
  let size=0;const chunks:Uint8Array[]=[];
  while(true){const next=await reader.read();if(next.done)break;size+=next.value.length;
    if(size>4096){await reader.cancel();throw new Error("invalid_request");}chunks.push(next.value);}
  const bytes=new Uint8Array(size);let offset=0;
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  const value:unknown=JSON.parse(new TextDecoder().decode(bytes));
  if(!value || typeof value!=="object" || Array.isArray(value))throw new Error("invalid_request");
  return value as Record<string,unknown>;
}
export function createPushHandler(options:Options) {
  const request=options.request??fetch;
  const headers={"Access-Control-Allow-Origin":"https://n00b31.github.io",
    "Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods":"POST, OPTIONS","Vary":"Origin","Cache-Control":"no-store"};
  const response=(status:number,value:unknown)=>new Response(JSON.stringify(value),{status,headers:{...headers,"Content-Type":"application/json"}});
  async function rpc(name:string,input:Record<string,unknown>,token=options.serviceKey,key=options.serviceKey):Promise<unknown> {
    const result=await request(`${options.url}/rest/v1/rpc/${name}`,{method:"POST",
      headers:{apikey:key,Authorization:`Bearer ${token}`,"Content-Type":"application/json"},
      body:JSON.stringify(input),redirect:"error",signal:AbortSignal.timeout(10_000)});
    if(!result.ok){
      let payload:unknown;
      try { payload=await result.json(); } catch { throw new PushRpcError(""); }
      throw new PushRpcError(payload && typeof payload==="object" && "code" in payload && typeof payload.code==="string"
        && ["PT404","PT409","PT429"].includes(payload.code)?payload.code:"");
    }
    return await result.json();
  }
  async function dispatch(only:string|null) {
    try {
      if(!only)await rpc("ff_notification_tick",{});
      const deadline=Date.now()+100_000;
      for(let batch=0;batch<5 && (batch===0 || Date.now()+60_000<deadline);batch++){
        const data=await rpc("ff_push_claim",{only_notification:only});
        if(!Array.isArray(data))throw new Error("invalid_claim_response");
        const jobs:Job[]=data.map((value:unknown)=>{
          if(!value || typeof value!=="object")throw new Error("invalid_claim_response");
          const job=value as Job;
          if(!uuid.test(job.id)||!uuid.test(job.lease_id)||!uuid.test(job.notification_id)
            ||!job.subscription || typeof job.subscription.endpoint!=="string"
            ||!job.subscription.keys || typeof job.subscription.keys.p256dh!=="string" ||typeof job.subscription.keys.auth!=="string")
            throw new Error("invalid_claim_response");
          return job;
        });
        if(jobs.length>10)throw new Error("claim_limit_exceeded");
        for(let index=0;index<jobs.length;index+=4)await Promise.all(jobs.slice(index,index+4).map(async job=>{
          let code=0;
          try {
            if(await rpc("ff_push_ready",{delivery_id:job.id,lease_id:job.lease_id})!==true){
              options.report?.("delivery_cancelled_before_send");return;
            }
            if(!allowedPushEndpoint(job.subscription.endpoint))code=400;
            else code=await options.send(job.subscription,JSON.stringify({format:1,notification_id:job.notification_id,delivery_id:job.id}),job.id.replace(/-/g,""));
          } catch { code=0; }
          const completed=await rpc("ff_push_complete",{delivery_id:job.id,lease_id:job.lease_id,result_code:code});
          if(completed!==true)options.report?.("stale_delivery_completion");
        }));
        if(only || jobs.length<10)break;
      }
    } catch { options.report?.("push_dispatch_failed"); }
  }
  return async(request:Request)=>{
    if(request.method==="OPTIONS")return new Response(null,{status:204,headers});
    if(request.method!=="POST")return response(405,{error:"method_not_allowed"});
    const origin=request.headers.get("origin");
    if(origin && origin!=="https://n00b31.github.io")return response(403,{error:"origin_denied"});
    let input:Record<string,unknown>;
    try { input=await body(request); } catch { return response(400,{error:"invalid_request"}); }
    if(input.action==="drain" || input.action==="bootstrap"){
      if(!await equalSecret(request.headers.get("x-ff-cron")??"",options.cronSecret))return response(401,{error:"unauthorized"});
      if(input.action==="bootstrap"){
        try { await options.bootstrap();return response(200,{ready:true}); }
        catch { options.report?.("push_bootstrap_failed");return response(503,{error:"setup_failed"}); }
      }
      options.waitUntil(dispatch(null));return response(202,{queued:true});
    }
    if(input.action!=="test" || typeof input.device_id!=="string" || !uuid.test(input.device_id)
      || Object.keys(input).some(key=>key!=="action"&&key!=="device_id"))return response(400,{error:"invalid_request"});
    const authorization=request.headers.get("authorization");
    if(!authorization?.startsWith("Bearer ") || authorization.length>8192)return response(401,{error:"unauthorized"});
    try {
      const user=await requestFetchUser(authorization);
      if(!user)return response(401,{error:"unauthorized"});
      const queued=await rpc("ff_push_test",{device_id:input.device_id},authorization.slice(7),options.publicKey);
      if(typeof queued!=="string" || !uuid.test(queued))throw new Error("invalid_test_response");
      options.waitUntil(dispatch(queued));return response(202,{queued:true,notification_id:queued});
    } catch(error) {
      if(error instanceof PushRpcError){
        if(error.code==="PT429")return response(429,{error:"test_rate_limited"});
        if(error.code==="PT404")return response(404,{error:"device_unavailable"});
        if(error.code==="PT409")return response(409,{error:"device_inactive"});
      }
      return response(403,{error:"test_not_permitted_or_limited"});
    }
  };
  async function requestFetchUser(authorization:string) {
    const result=await request(`${options.url}/auth/v1/user`,{headers:{apikey:options.publicKey,Authorization:authorization},
      redirect:"error",signal:AbortSignal.timeout(10_000)});
    if(!result.ok)return false;
    const user:unknown=await result.json();
    return Boolean(user && typeof user==="object" && "id" in user && typeof user.id==="string" && uuid.test(user.id));
  }
}
