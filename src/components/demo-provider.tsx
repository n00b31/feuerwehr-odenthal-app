"use client";

import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { demoRepository, demoStore, publishSnapshot } from "@/data/repository";
import { execute, type Command } from "@/domain/service";
import type { DemoState, User } from "@/domain/model";

interface DemoContextValue {
  state: DemoState; user: User; now: Date; message: string;
  run: (command: Command) => boolean;
  selectProfile: (id: string) => void; reset: () => void;
}
const Context = createContext<DemoContextValue | null>(null);
export function useDemo() {
  const context = useContext(Context);
  if (!context) throw new Error("Demo-Kontext fehlt.");
  return context;
}
function errorText(error: unknown) {
  return error instanceof Error ? error.message : "Die Änderung konnte nicht gespeichert werden.";
}
export function DemoProvider({ children }: { children: ReactNode }) {
  const stored = useSyncExternalStore(demoStore.subscribe, demoStore.getSnapshot, demoStore.getServerSnapshot);
  const snapshot = stored.data;
  const [now, setNow] = useState(() => new Date());
  const [message, setMessage] = useState("");
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  function reset() {
    try { publishSnapshot(demoRepository.reset()); setMessage("Demo zurückgesetzt. Alle lokalen Änderungen wurden entfernt."); }
    catch (error) { setMessage(`Reset fehlgeschlagen: ${errorText(error)}`); }
  }
  if (stored.error) return <main className="recovery"><h1>Lokaler Speicher nicht verfügbar</h1><p role="alert">{stored.error}</p><p>Vorhandene Daten werden nicht still überschrieben. Ein Reset löscht die lokale Demo.</p><button className="button primary" onClick={reset}>Demo-Speicher zurücksetzen</button><p role="status">{message}</p></main>;
  if (!snapshot) return <main className="recovery" aria-busy="true"><div className="eyebrow">FEUERWEHR ODENTHAL</div><h1>Dein Dienst. Dein Team.</h1><p>Lokale Demo wird geladen …</p></main>;
  const user = snapshot.state.users.find((u) => u.id === snapshot.actorId)!;
  return <Context.Provider value={{
    state: snapshot.state, user, now, message,
    run(command) {
      try {
        const latest = demoRepository.load();
        latest.actorId = snapshot.actorId;
        const state = execute(latest.state, latest.actorId, command, new Date());
        demoRepository.save(state);
        publishSnapshot({ ...latest, state });
        setMessage("Änderung lokal gespeichert.");
        return true;
      } catch (error) { setMessage(`Nicht gespeichert: ${errorText(error)}`); return false; }
    },
    selectProfile(id) {
      try {
        if (!snapshot.state.users.some((u) => u.id === id)) throw new Error("Unbekanntes Profil.");
        demoRepository.select(id);
        publishSnapshot({ ...snapshot, actorId: id });
        setMessage("Ungeschützter Demo-Profilwechsel – keine Anmeldung.");
      } catch (error) { setMessage(`Profilwechsel fehlgeschlagen: ${errorText(error)}`); }
    }, reset,
  }}>{children}</Context.Provider>;
}
