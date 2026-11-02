import { APP } from "../config/app";
import { stateSchema, type DemoState } from "../domain/model";
import { createSeed } from "./seed";

export interface DemoSnapshot { state: DemoState; actorId: string }
const actorKey = `${APP.storageKey}-profile`;

export const demoRepository = {
  load(): DemoSnapshot {
    const saved = localStorage.getItem(APP.storageKey);
    const state = saved ? stateSchema.parse(JSON.parse(saved)) : createSeed();
    if (!saved) this.save(state);
    const selected = localStorage.getItem(actorKey);
    return { state, actorId: state.users.some((u) => u.id === selected) ? selected! : state.users[0].id };
  },
  save(state: DemoState) {
    localStorage.setItem(APP.storageKey, JSON.stringify(state));
  },
  select(actorId: string) {
    localStorage.setItem(actorKey, actorId);
  },
  reset(): DemoSnapshot {
    const state = createSeed();
    this.save(state);
    this.select(state.users[0].id);
    return { state, actorId: state.users[0].id };
  },
};

interface StoreSnapshot { data: DemoSnapshot | null; error: string }
const serverSnapshot: StoreSnapshot = { data: null, error: "" };
let snapshot = serverSnapshot;
const listeners = new Set<() => void>();
export function publishSnapshot(data: DemoSnapshot) {
  snapshot = { data, error: "" };
  listeners.forEach((notify) => notify());
}
function reload() {
  try { publishSnapshot(demoRepository.load()); }
  catch (error) {
    snapshot = { data: null, error: error instanceof Error ? error.message : "Unbekannter Speicherfehler." };
    listeners.forEach((notify) => notify());
  }
}
export const demoStore = {
  getSnapshot: () => snapshot,
  getServerSnapshot: () => serverSnapshot,
  subscribe(notify: () => void) {
    listeners.add(notify);
    if (snapshot === serverSnapshot) reload();
    function onStorage(event: StorageEvent) {
      if (event.key === null || event.key.startsWith(APP.storageKey)) reload();
    }
    window.addEventListener("storage", onStorage);
    return () => { listeners.delete(notify); window.removeEventListener("storage", onStorage); };
  },
};
