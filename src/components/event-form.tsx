"use client";

import { useState, type FormEvent } from "react";
import { useDemo } from "./demo-provider";
import { Modal, ScopeSelect } from "./ui";
import { manageableScopes } from "@/domain/permissions";
import { fromBerlin, localInput, addLocalDays, berlinParts } from "@/domain/time";
import { EVENT_TYPES } from "@/config/app";
import type { Event, Repeat, Scope } from "@/domain/model";

export function EventForm({ existing, close }: { existing?: Event; close: () => void }) {
  const { state, user, now, run } = useDemo();
  const [scope, setScope] = useState<Scope>(existing?.scope ?? manageableScopes(state, user)[0]);
  const [repeat, setRepeat] = useState<Repeat>("none");
  const [error, setError] = useState("");
  const date = addLocalDays(berlinParts(now).date, 3);
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    try {
      const input = {
        title: String(data.get("title")).trim(), description: String(data.get("description")).trim(),
        type: String(data.get("type")) as Event["type"], scope,
        startsAt: fromBerlin(String(data.get("startsAt"))), endsAt: fromBerlin(String(data.get("endsAt"))),
        location: String(data.get("location")).trim(),
        deadline: data.get("deadline") ? fromBerlin(String(data.get("deadline"))) : undefined,
      };
      const success = existing
        ? run({ type: "editEvent", eventId: existing.id, input })
        : run({ type: "createEvent", input, repeat, count: repeat === "none" ? 1 : Number(data.get("count")) });
      if (success) close(); else setError("Termin nicht gespeichert. Bitte die Fehlermeldung am unteren Bildschirmrand beachten.");
    } catch (error) { setError(error instanceof Error ? error.message : "Ungültige Eingabe."); }
  }
  return <Modal title={existing ? "Serieninstanz / Termin bearbeiten" : "Neuen Dienst planen"} close={close}><form onSubmit={submit} className="form-grid">
    <label className="span-2">Titel<input name="title" required minLength={3} maxLength={120} defaultValue={existing?.title} placeholder="z. B. Löschangriff im Team" /></label>
    <label>Dienstart<select name="type" defaultValue={existing?.type ?? "regular"}>{Object.entries(EVENT_TYPES).map(([v, label]) => <option value={v} key={v}>{label}</option>)}</select></label>
    <ScopeSelect value={scope} onChange={setScope} disabled={!!existing} />
    <label>Beginn · Europe/Berlin<input name="startsAt" type="datetime-local" required defaultValue={existing ? localInput(existing.startsAt) : `${date}T19:00`} /></label>
    <label>Ende · Europe/Berlin<input name="endsAt" type="datetime-local" required defaultValue={existing ? localInput(existing.endsAt) : `${date}T21:00`} /></label>
    <label className="span-2">Ort<input name="location" required maxLength={200} defaultValue={existing?.location} placeholder="Gerätehaus / Übungsort" /></label>
    <label className="span-2">Beschreibung<textarea name="description" rows={3} maxLength={2000} defaultValue={existing?.description} /></label>
    <label className="span-2">Anmeldeschluss (optional, Berlin)<input name="deadline" type="datetime-local" defaultValue={existing?.deadline ? localInput(existing.deadline) : ""} /></label>
    {!existing && <><label>Wiederholung<select value={repeat} onChange={(e) => setRepeat(e.target.value as Repeat)}><option value="none">Einzeltermin</option><option value="weekly">Wöchentlich</option><option value="biweekly">Alle zwei Wochen</option><option value="monthly">Monatlich</option></select></label>{repeat !== "none" && <label>Anzahl der Instanzen<input name="count" type="number" min={1} max={52} required defaultValue={6} /></label>}</>}
    <p className="notice span-2">{existing ? "Nur diese Instanz wird geändert. Zusagen, Teilnehmerkreis und andere Serieninstanzen bleiben erhalten." : "Jede Serieninstanz erhält eigene Rückmeldungs- und Anwesenheitslisten. Die lokale Uhrzeit bleibt bei Zeitumstellungen erhalten."} Organisator: {user.name}.</p>
    {error && <p role="alert" className="error span-2">{error}</p>}
    <div className="form-actions span-2"><button type="button" className="button secondary" onClick={close}>Abbrechen</button><button className="button primary" type="submit">{existing ? "Instanz speichern" : "Termin(e) erstellen"}</button></div>
  </form></Modal>;
}
