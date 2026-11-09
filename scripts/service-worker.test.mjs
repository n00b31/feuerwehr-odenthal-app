import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

function fakeIndexedDB(rows) {
  return {open:()=>{
    const opening={};
    queueMicrotask(()=>{
      opening.result={close(){},transaction(){
        const transaction={};
        let pending=0;
        const result=value=>{
          const request={};pending++;
          queueMicrotask(()=>{
            request.result=value();request.onsuccess?.();pending--;
            queueMicrotask(()=>{if(!pending)transaction.oncomplete?.();});
          });
          return request;
        };
        transaction.objectStore=()=>({
          get:id=>result(()=>rows.get(id)),
          getAll:()=>result(()=>[...rows.values()]),
          put:row=>{rows.set(row.id,row);},
          delete:id=>rows.delete(id),
        });
        return transaction;
      }};
      opening.onsuccess();
    });
    return opening;
  }};
}
async function worker({rows=new Map(),windows=[],storageFailure=false}={}) {
  const listeners = {}, deleted = [], precached = [], requests = [];
  const shown=[],opened=[],messages=[],errors=[];
  let activated = 0, claimed = 0, fallback = false;
  const root = "https://n00b31.github.io/feuerwehr-odenthal-app/";
  const prefix = "feuerwehr-offline:/feuerwehr-odenthal-app/:";
  const context = {
    URL, Request, Response,
    indexedDB:storageFailure?{open(){throw new Error("Synthetic storage failure");}}:fakeIndexedDB(rows),
    console:{error:code=>errors.push(code)},
    self: {
      location: { href: `${root}sw.js?release=new` },
      addEventListener: (name, handler) => { listeners[name] = handler; },
      registration:{showNotification:async(title,options)=>shown.push({title,options})},
      skipWaiting: async () => { activated++; }, clients: { claim: async () => { claimed++; },
        matchAll:async()=>windows.map(window=>({...window,focus:async()=>{messages.push("focus");},postMessage:value=>messages.push(value)})),
        openWindow:async url=>opened.push(url)},
    },
    caches: {
      open: async () => ({ addAll: async (values) => { precached.push(...values); } }),
      keys: async () => [`${prefix}v4`, `${prefix}new`, "feuerwehr-offline:/feuerwehr-odenthal-demo/:v4"],
      delete: async (key) => { deleted.push(key); },
      match: async () => { fallback = true; return new Response("Offline"); },
    },
    fetch: async (request, options) => { requests.push({ request, options }); return new Response("Network"); },
  };
  const source = (await readFile(new URL("../public/sw.js", import.meta.url), "utf8")).replace("__FF_RELEASE__", "new");
  vm.runInNewContext(source, context);
  async function dispatch(name, props = {}) {
    let task;
    listeners[name]({ ...props, waitUntil: (value) => { task = value; }, respondWith: (value) => { task = value; } });
    return await task;
  }
  return { dispatch, deleted, precached, requests,shown,opened,messages,errors,rows, counts: () => ({ activated, claimed, fallback }) };
}
test("worker waits for consent and activation deletes only this application's previous release caches", async () => {
  const w = await worker();
  await w.dispatch("install");
  assert.equal(w.counts().activated, 0);
  assert.ok(w.precached.every((request) => request.cache === "reload"));
  assert.ok(w.precached.every((request) => /offline.html|icons\//.test(request.url)));
  await w.dispatch("message", { data: { type: "OTHER" } });
  assert.equal(w.counts().activated, 0);
  await w.dispatch("message", { data: { type: "ACTIVATE_UPDATE" } });
  assert.equal(w.counts().activated, 1);
  await w.dispatch("activate");
  assert.deepEqual(w.deleted, ["feuerwehr-offline:/feuerwehr-odenthal-app/:v4"]);
  assert.equal(w.counts().claimed, 1);
});
const push={format:1,notification_id:"a0700000-0000-4000-8000-000000000001",delivery_id:"b0700000-0000-4000-8000-000000000001"};
test("push lock-screen content is generic and opaque delivery dedupe survives a worker restart",async()=>{
  const rows=new Map(),first=await worker({rows});
  await first.dispatch("push",{data:{json:()=>push}});
  await first.dispatch("push",{data:{json:()=>push}});
  assert.equal(first.shown.length,1);
  assert.equal(first.shown[0].title,"Feuerwehr Odenthal");
  assert.match(first.shown[0].options.body,/Keine Alarmierung/);
  assert.equal(first.shown[0].options.renotify,false);
  assert.equal(first.shown[0].options.icon,"https://n00b31.github.io/feuerwehr-odenthal-app/icons/icon-192.png");
  assert.deepEqual(Object.keys(rows.get(push.delivery_id)).sort(),["at","id"]);
  const restarted=await worker({rows});
  await restarted.dispatch("push",{data:{json:()=>push}});
  assert.equal(restarted.shown.length,0);
});
test("invalid or URL-bearing push payloads never become public notifications",async()=>{
  const w=await worker();
  for(const payload of [null,{...push,format:2},{...push,notification_id:"https://evil.invalid"},{...push,url:"https://evil.invalid"}])
    await w.dispatch("push",{data:{json:()=>payload}});
  await w.dispatch("push",{data:{json:()=>{throw new Error("Invalid JSON");}}});
  assert.equal(w.shown.length,0);
});
test("push click focuses an existing app window without navigating or discarding its draft",async()=>{
  const w=await worker({windows:[{url:"https://n00b31.github.io/feuerwehr-odenthal-demo/"},
    {url:"https://n00b31.github.io/feuerwehr-odenthal-app/termine/",focused:true}]});
  let closed=false;
  await w.dispatch("notificationclick",{notification:{data:push,close:()=>{closed=true;}}});
  assert.equal(closed,true);assert.equal(w.opened.length,0);
  assert.equal(w.messages[0],"focus");
  assert.equal(w.messages[1].type,"FF_NOTIFICATION_OPEN");
  assert.equal(w.messages[1].notification_id,push.notification_id);
});
test("cold push click opens only the application profile with an opaque notification UUID",async()=>{
  const w=await worker({windows:[{url:"https://n00b31.github.io/feuerwehr-odenthal-demo/"}]});
  await w.dispatch("notificationclick",{notification:{data:push,close(){}}});
  assert.deepEqual(w.opened,[`https://n00b31.github.io/feuerwehr-odenthal-app/profil/?notification=${push.notification_id}`]);
});
test("unavailable dedupe storage is explicitly reported and browser tag still prevents duplicate visible cards",async()=>{
  const w=await worker({storageFailure:true});
  await w.dispatch("push",{data:{json:()=>push}});
  assert.equal(w.shown.length,1);
  assert.equal(w.shown[0].options.tag,`ff-notice:${push.delivery_id}`);
  assert.ok(w.errors.every(code=>code==="push_storage_unavailable"));
});
test("push dedupe storage retains at most 500 opaque IDs",async()=>{
  const rows=new Map(Array.from({length:500},(_,index)=>[`synthetic-${index}`,{id:`synthetic-${index}`,at:Date.now()-index-1}]));
  const w=await worker({rows});
  await w.dispatch("push",{data:{json:()=>push}});
  assert.equal(rows.size,500);
  assert.ok(rows.has(push.delivery_id));
});
test("worker revalidates navigation and never caches bundles, Supabase data or another repository", async () => {
  const w = await worker();
  const navigation = { mode: "navigate", url: "https://n00b31.github.io/feuerwehr-odenthal-app/termine/" };
  await w.dispatch("fetch", { request: navigation });
  assert.equal(w.requests[0].options.cache, "no-cache");
  for (const request of [
    { mode: "cors", url: "https://orxinqhhbtjpkzwlfaxq.supabase.co/rest/v1/rpc/ff_events_page" },
    { mode: "cors", url: "https://n00b31.github.io/feuerwehr-odenthal-app/_next/static/app.js" },
    { mode: "navigate", url: "https://n00b31.github.io/feuerwehr-odenthal-demo/" },
  ]) await w.dispatch("fetch", { request });
  assert.equal(w.requests.length, 1);
  assert.equal(w.counts().fallback, false);
});
