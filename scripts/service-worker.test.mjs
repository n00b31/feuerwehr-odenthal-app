import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

async function worker() {
  const listeners = {}, deleted = [], precached = [], requests = [];
  let activated = 0, claimed = 0, fallback = false;
  const root = "https://n00b31.github.io/feuerwehr-odenthal-app/";
  const prefix = "feuerwehr-offline:/feuerwehr-odenthal-app/:";
  const context = {
    URL, Request, Response,
    self: {
      location: { href: `${root}sw.js?release=new` },
      addEventListener: (name, handler) => { listeners[name] = handler; },
      skipWaiting: async () => { activated++; }, clients: { claim: async () => { claimed++; } },
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
  return { dispatch, deleted, precached, requests, counts: () => ({ activated, claimed, fallback }) };
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
