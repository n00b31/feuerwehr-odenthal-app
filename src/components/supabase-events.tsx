"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CalendarPlus, RefreshCw } from "lucide-react";
import {
  readEventWorkspace, saveSingleEvent, cancelSingleEvent, setEventResponse, correctEventResponse,
  type DevEvent, type EventWorkspace,
} from "@/data/supabase-repository";
import {
  eventPayload, eventErrorMessage, responseCounts, responsePresentation, devEventTypeSchema,
  type DevEventDraft, type DevResponse,
} from "@/domain/dev-events";
import { dateLabel, localInput, timeLabel } from "@/domain/time";
import { EVENT_TYPES } from "@/config/app";
import { SupabaseAttendance } from "./supabase-attendance";
import { attendanceLabels } from "@/domain/dev-attendance";
import { defaultEventList, monthLabel, monthKeySchema, type EventListQuery } from "@/domain/dev-event-list";
import { SupabaseCalendar } from "./supabase-calendar";
import { SupabaseVehicles } from "./supabase-vehicles";
import { AppDialogVisibility } from "./app-dialog";

export type EventEditorState = { id?: string; revision: number; draft: DevEventDraft };
const responses: [DevResponse, string][] = [["yes", "Ich komme"], ["no", "Ich kann nicht"], ["maybe", "Vielleicht"]];
const responseNames = { yes: "Zusage", no: "Absage", maybe: "Vielleicht" };

export function SupabaseEvents({ client, initial, preferredUnit, editor, setEditor, actorId }: {
  client: SupabaseClient; initial: EventWorkspace; editor: EventEditorState | null;
  preferredUnit: string | null; actorId: string;
  setEditor: (value: EventEditorState | null) => void;
}) {
  const [workspace, setWorkspace] = useState<EventWorkspace | null>(initial);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [section,setSection]=useState<"dienste"|"kalender"|"fahrzeuge">("dienste");
  const [calendarActivated,setCalendarActivated]=useState(false);
  const [vehiclesActivated,setVehiclesActivated]=useState(false);
  const [vehicleEvent,setVehicleEvent]=useState<{id:string;sequence:number}|null>(null);
  const activateSection=useCallback((value:"dienste"|"kalender"|"fahrzeuge")=>{
    setSection(value);
    if(value==="kalender")setCalendarActivated(true);
    if(value==="fahrzeuge")setVehiclesActivated(true);
  },[]);
  useEffect(()=>{
    const readSection=()=>{
      const value=new URLSearchParams(window.location.search).get("bereich");
      activateSection(value==="fahrzeuge" || value==="kalender" ? value : "dienste");
    };
    readSection();
    window.addEventListener("popstate",readSection);
    return()=>window.removeEventListener("popstate",readSection);
  },[activateSection]);
  function changeSection(value:"dienste"|"kalender"|"fahrzeuge"){
    activateSection(value);
    const url=new URL(window.location.href);
    url.searchParams.set("bereich",value);
    if(url.href!==window.location.href)window.history.pushState(null,"",url);
  }
  function openVehicle(id:string){setVehicleEvent(previous=>({id,sequence:(previous?.sequence ?? 0)+1}));changeSection("fahrzeuge");}
  const [elapsed, setElapsed] = useState(0);
  const [serverTime, setServerTime] = useState(() => Date.parse(initial.server_now));
  const [query, setQuery] = useState<EventListQuery>(defaultEventList);
  const [monthInput, setMonthInput] = useState("");
  const previousQuery = useRef(query);
  const retained = useRef<string[]>([]);
  const pages = useRef(1);
  const anchor = useRef(0);
  const epoch = useRef({ value: 0 });
  const working = useRef(false);
  useEffect(() => {
    anchor.current = performance.now();
    const lifetime = epoch.current;
    const timer = window.setInterval(() => setElapsed(Math.max(0, performance.now() - anchor.current)), 1000);
    return () => { window.clearInterval(timer); lifetime.value++; };
  }, []);
  const reload = useCallback(async (pageCount = pages.current) => {
    const version = ++epoch.current.value;
    let result: EventWorkspace;
    try {
      result = await readEventWorkspace(client, query, null, retained.current);
      for (let page = 1; page < pageCount && result.next_cursor; page++) {
        const next = await readEventWorkspace(client, query, result.next_cursor, retained.current);
        result = { ...next, events: Array.from(new Map([...result.events, ...next.events].map((item) => [item.id, item])).values()) };
      }
    }
    catch (cause) {
      // A replaced or unmounted read must not clear a newer authorized snapshot.
      if (version !== epoch.current.value) return;
      throw cause;
    }
    if (version !== epoch.current.value) return;
    return { result, version };
  }, [client, query]);
  const accept = useCallback((snapshot?: { result: EventWorkspace; version: number }) => {
    if (!snapshot || snapshot.version !== epoch.current.value) return;
    anchor.current = performance.now();
    setServerTime(Date.parse(snapshot.result.server_now));
    setElapsed(0); setError(""); setWorkspace(snapshot.result);
  }, []);
  useEffect(() => {
    if (previousQuery.current === query) return;
    previousQuery.current = query;
    let alive = true;
    const lifetime = epoch.current;
    void reload().then(accept).catch((cause: unknown) => {
      if (alive) { setWorkspace(null); setError(eventErrorMessage(cause)); }
    }).finally(() => { if (alive && !working.current) setBusy(false); });
    return () => { alive = false; lifetime.value++; };
  }, [reload, accept, query]);
  const keepOpen = useCallback((id: string, open: boolean) => {
    if (retained.current.includes(id) === open) return;
    retained.current = open ? [...retained.current, id] : retained.current.filter((value) => value !== id);
    epoch.current.value++;
  }, []);
  function changeQuery(next: EventListQuery) {
    pages.current = 1; epoch.current.value++;
    setMonthInput(next.view === "month" ? next.month : "");
    setError(""); setBusy(true); setQuery(next);
  }
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.hidden || working.current) return;
      void reload().then(accept).catch((cause: unknown) => {
        setWorkspace(null); setError(eventErrorMessage(cause));
      });
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [reload, accept]);
  // Elapsed monotonic time from the server snapshot, never the device wall clock.
  const serverNow = serverTime + elapsed;

  async function run(operation: () => Promise<void>, success: string) {
    if (working.current) return;
    working.current = true;
    epoch.current.value++;
    setBusy(true); setError(""); setMessage("");
    let committed = false;
    try {
      await operation();
      committed = true;
      setMessage(success);
      accept(await reload());
    } catch (cause) {
      if (committed) setWorkspace(null);
      setError(`${committed ? "Änderung gespeichert, erneutes Laden fehlgeschlagen: " : ""}${eventErrorMessage(cause)}`);
    } finally { working.current = false; setBusy(false); }
  }
  async function refresh() {
    setBusy(true); setError("");
    try { accept(await reload()); }
    catch (cause) { setWorkspace(null); setError(eventErrorMessage(cause)); }
    finally { setBusy(false); }
  }
  async function loadMore() {
    if (busy || !workspace?.next_cursor) return;
    pages.current++;
    await refresh();
  }
  const listed = workspace ? [...workspace.events, ...workspace.retained_events.filter((item) => !workspace.events.some((row) => row.id === item.id))] : [];
  function edit(item?: DevEvent) {
    setMessage(""); setError("");
    setEditor(item ? {
      id: item.id, revision: item.revision,
      draft: { title: item.title, description: item.description, event_type: item.event_type, location: item.location,
        unit_id: item.unit_id ?? "", start: localInput(item.starts_at), end: localInput(item.ends_at),
        deadline: item.response_deadline ? localInput(item.response_deadline) : "" },
    } : {
      revision: 0,
      draft: { title: "", description: "", event_type: "regular", location: "",
        unit_id: workspace?.manageable_units.find((unit) => unit.id === preferredUnit)?.id ?? workspace?.manageable_units[0]?.id ?? "", start: "", end: "", deadline: "" },
    });
  }
  async function openService(id:string,editing:boolean) {
    const result=await readEventWorkspace(client,query,null,[...new Set([...retained.current,id])]);
    const item=[...result.events,...result.retained_events].find(e=>e.id===id);
    if(!item) throw new Error("Dienst nicht mehr berechtigt sichtbar.");
    if(editing && !item.can_manage) throw new Error("Keine bestehende Terminbearbeitung für diesen Dienst.");
    retained.current=[...new Set([...retained.current,id])];
    accept({result,version:++epoch.current.value});
    if(editing) edit(item);
    changeSection("dienste");
    requestAnimationFrame(()=>document.getElementById(`event-${id}`)?.scrollIntoView({block:"start"}));
  }
  return <>
    <div className="calendar-views dev-actions" aria-label="Terminbereich">
      <button className="button secondary" aria-pressed={section==="dienste"} onClick={()=>changeSection("dienste")}>Dienstverwaltung</button>
      <button className="button secondary" aria-pressed={section==="kalender"} onClick={()=>changeSection("kalender")}>Gemeinsamer Kalender</button>
      <button className="button secondary" aria-pressed={section==="fahrzeuge"} onClick={()=>changeSection("fahrzeuge")}>Fahrzeugkalender</button>
    </div>
    {calendarActivated && <AppDialogVisibility.Provider value={section==="kalender"}><div hidden={section!=="kalender"}><SupabaseCalendar key={actorId} client={client} actorId={actorId}
      preferredUnit={preferredUnit} initialTime={initial.server_now} openService={openService} openVehicle={openVehicle}/></div></AppDialogVisibility.Provider>}
    {vehiclesActivated && <AppDialogVisibility.Provider value={section==="fahrzeuge"}><div hidden={section!=="fahrzeuge"}><SupabaseVehicles key={actorId} client={client} actorId={actorId}
      initialTime={initial.server_now} preferredUnit={preferredUnit} initialEventId={vehicleEvent?.id} initialEventSequence={vehicleEvent?.sequence}/></div></AppDialogVisibility.Provider>}
    <AppDialogVisibility.Provider value={section==="dienste"}>
    <section className="card section-card" hidden={section!=="dienste"}>
    <div className="event-card-top"><h2>Sichtbare DEV-Termine</h2><div className="dev-actions">
      <button className="button secondary" disabled={busy} onClick={() => void refresh()}><RefreshCw size={18} />Termine aktualisieren</button>
      {!!workspace?.manageable_units.length && !editor && <button className="button" disabled={busy} onClick={() => edit()}><CalendarPlus size={18} />Einzeltermin erstellen</button>}
    </div></div>
    <p className="muted text-sm">Zentrale Supabase-Daten · Hintergrundaktualisierung ohne Ansichtswechsel. Rückmeldungen sind Planung, keine tatsächliche Anwesenheit.</p>
    {message && <p className="notice" role="status">{message}</p>}
    {error && <p className="notice error" role="alert">{error}</p>}
    {busy && <p role="status">Supabase-Anfrage läuft …</p>}
    {editor && workspace && <EventForm editor={editor} units={workspace.manageable_units} busy={busy} change={setEditor}
      close={() => setEditor(null)} submit={() => run(async () => {
        await saveSingleEvent(client, eventPayload(editor.draft), editor.id ? { id: editor.id, revision: editor.revision } : undefined);
        setEditor(null);
      }, editor.id ? "Termin in Supabase geändert." : "Termin in Supabase erstellt.")} />}
    <div className="form-grid dev-list-filters">
      <label>Terminansicht<select value={query.view} disabled={busy} onChange={(event) => changeQuery({ ...query,
        view: event.target.value === "past" ? "past" : event.target.value === "month" ? "month" : "upcoming",
        month: event.target.value === "month" ? query.month || localInput(initial.server_now).slice(0, 7) : "" })}>
        <option value="upcoming">Aktuelle und zukünftige Termine</option><option value="past">Vergangene Termine</option><option value="month">Monatsansicht</option>
      </select></label>
      <label>Monat und Jahr<input type="month" min="2000-01" max="9998-12" placeholder="JJJJ-MM" disabled={busy} value={monthInput}
        onChange={(event) => {
          const value = event.target.value;
          setMonthInput(value);
          if (!value) changeQuery({ ...query, month: "", view: "upcoming" });
          else if (monthKeySchema.safeParse(value).success) changeQuery({ ...query, month: value, view: "month" });
          else setError("Bitte einen gültigen Monat im Format JJJJ-MM wählen (Jahr 2000–9998).");
        }} /></label>
      <label>Terminstatus<select value={query.status} disabled={busy} onChange={(event) => changeQuery({ ...query,
        status: event.target.value === "scheduled" ? "scheduled" : event.target.value === "cancelled" ? "cancelled" : "all" })}>
        <option value="all">Alle sichtbaren Termine</option><option value="scheduled">Geplant</option><option value="cancelled">Abgesagt</option>
      </select></label>
      <button className="button secondary" disabled={busy} onClick={() => changeQuery({ ...defaultEventList })}>Standardansicht wiederherstellen</button>
    </div>
    <p className="muted text-sm">{query.view === "month" ? `${monthLabel(query.month)} · chronologisch · 50 Termine pro Seite`
      : query.view === "past" ? "Vergangene Termine · neueste zuerst · maximal fünf"
      : "Aktuelle und zukünftige Termine · nächste zuerst · maximal fünf"} · Europe/Berlin · Einordnung nach geplantem Ende</p>
    {workspace && <>
    {workspace.events.length === 0 && <p>Noch keine sichtbaren DEV-Termine. Es werden keine Demo-Daten übernommen.</p>}
    {listed.map((item) =>
      <EventCard key={item.id} client={client} changed={async () => { accept(await reload()); }} keepOpen={keepOpen}
        retained={!workspace.events.some((row) => row.id === item.id)} item={item} serverNow={serverNow} busy={busy} edit={() => edit(item)}
        reply={(answer) => run(() => setEventResponse(client, item.id, answer), "Rückmeldung in Supabase gespeichert.")}
        cancel={(reason) => run(() => cancelSingleEvent(client, item, reason), "Termin in Supabase abgesagt. Rückmeldungen und Historie bleiben erhalten.")}
        correct={(user, answer, reason) => run(() => correctEventResponse(client, item.id, user, answer, reason), "Rückmeldung mit Korrekturgrund protokolliert.")} />)}
    {query.view === "month" && workspace.next_cursor && <button className="button secondary" disabled={busy} onClick={() => void loadMore()}>Weitere Termine laden</button>}
    {query.view !== "month" && workspace.has_more && <p className="muted text-sm">Weitere Termine sind über die Monatsansicht zugänglich.</p>}
    </>}
  </section></AppDialogVisibility.Provider></>;
}

function EventForm({ editor, units, busy, change, close, submit }: {
  editor: EventEditorState; units: EventWorkspace["manageable_units"]; busy: boolean;
  change: (value: EventEditorState) => void; close: () => void; submit: () => Promise<void>;
}) {
  const draft = editor.draft;
  function field<K extends keyof DevEventDraft>(key: K, value: DevEventDraft[K]) {
    change({ ...editor, draft: { ...draft, [key]: value } });
  }
  return <section className="soft-panel dev-event-editor" aria-label={editor.id ? "Einzeltermin bearbeiten" : "Neuer Einzeltermin"}>
    <h3>{editor.id ? "Einzeltermin bearbeiten" : "Neuer Einzeltermin"}</h3>
    <p className="text-sm muted">Alle Zeiten in Europe/Berlin. Bestehender Bereich und Teilnehmerkreis bleiben erhalten; Serien werden hier nicht bearbeitet.</p>
    <form className="form-grid" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      <label className="span-2">Titel<input value={draft.title} onChange={(e) => field("title", e.target.value)} required minLength={3} maxLength={120} disabled={busy} /></label>
      <label className="span-2">Beschreibung<textarea value={draft.description} onChange={(e) => field("description", e.target.value)} maxLength={2000} rows={3} disabled={busy} /></label>
      <label>Beginn (Europe/Berlin)<input type="datetime-local" value={draft.start} onChange={(e) => field("start", e.target.value)} required disabled={busy} /></label>
      <label>Ende (Europe/Berlin)<input type="datetime-local" value={draft.end} onChange={(e) => field("end", e.target.value)} required disabled={busy} /></label>
      <label>Ort<input value={draft.location} onChange={(e) => field("location", e.target.value)} required maxLength={200} disabled={busy} /></label>
      <label>Terminart<select value={draft.event_type} onChange={(e) => field("event_type", devEventTypeSchema.parse(e.target.value))} disabled={busy}>
        {Object.entries(EVENT_TYPES).map(([value, name]) => <option key={value} value={value}>{name}</option>)}
      </select></label>
      {!editor.id && <label>Einheit<select value={draft.unit_id} onChange={(e) => field("unit_id", e.target.value)} required disabled={busy}>
        {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
      </select></label>}
      <label>Anmeldeschluss (optional)<input type="datetime-local" value={draft.deadline} onChange={(e) => field("deadline", e.target.value)} disabled={busy} /></label>
      <div className="form-actions span-2"><button type="button" className="button secondary" disabled={busy} onClick={close}>Bearbeitung verwerfen</button><button className="button" disabled={busy}>Termin speichern</button></div>
    </form>
  </section>;
}

function EventCard({ client, changed, item, serverNow, busy, edit, reply, cancel, correct, keepOpen, retained }: {
  client: SupabaseClient; changed: () => Promise<void>;
  item: DevEvent; serverNow: number; busy: boolean; edit: () => void;
  reply: (response: DevResponse) => Promise<void>; cancel: (reason: string) => Promise<void>;
  correct: (user: string, answer: DevResponse, reason: string) => Promise<void>;
  keepOpen: (id: string, open: boolean) => void; retained: boolean;
}) {
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  const [target, setTarget] = useState("");
  const [answer, setAnswer] = useState<DevResponse>("yes");
  const [correction, setCorrection] = useState("");
  const [attendanceMode, setAttendanceMode] = useState<"attendance" | "organizer" | null>(null);
  const [participantsOpen, setParticipantsOpen] = useState(false);
  const open = cancelling || participantsOpen || attendanceMode !== null;
  useEffect(() => { keepOpen(item.id, open); return () => keepOpen(item.id, false); }, [keepOpen, item.id, open]);
  const planned = item.status === "scheduled";
  const unlocked = serverNow < Date.parse(item.starts_at) && (!item.response_deadline || serverNow < Date.parse(item.response_deadline));
  const counts = item.participants ? responseCounts(item.participants) : null;
  const responseStyle=responsePresentation(item.own_response);
  return <article className={`dev-event ${responseStyle.className}`} aria-labelledby={`event-${item.id}`}>
    {retained && <p className="notice">Geöffneter Termin außerhalb der aktuellen Ergebnisliste · Berechtigung weiterhin live geprüft</p>}
    <div className="event-card-top"><h3 id={`event-${item.id}`}>{item.title}</h3><span className={`badge ${planned ? "" : "muted"}`}>{planned ? "Geplant" : "Abgesagt"}</span></div>
    <p>{dateLabel(item.starts_at, { year: "numeric" })} · {timeLabel(item.starts_at)} – {dateLabel(item.ends_at)} {timeLabel(item.ends_at)} · {item.location}</p>
    <p className="muted text-sm">{item.scope_name} · {EVENT_TYPES[item.event_type]}{item.series_id && " · Serieninstanz (keine Serienbearbeitung)"}</p>
    <p className="description">{item.description}</p>
    <p className={`personal-response-label ${responseStyle.className}`}><span className="response-symbol" aria-hidden="true">{responseStyle.symbol}</span> {responseStyle.label}</p>
    {item.response_deadline && <p className="muted text-sm">Anmeldeschluss: {dateLabel(item.response_deadline)} · {timeLabel(item.response_deadline)}</p>}
    {item.in_roster ? <div className="dev-response">
      <p><strong>Deine Rückmeldung: {item.own_response ? responseNames[item.own_response] : "Ohne Rückmeldung"}</strong> · Nur Planung</p>
      <div className="dev-actions">{responses.map(([value, label]) => <button className={`button secondary ${responsePresentation(value).className}`} key={value}
        aria-pressed={item.own_response === value} disabled={busy || !planned || !unlocked} onClick={() => void reply(value)}>
        <span className="response-symbol" aria-hidden="true">{responsePresentation(value).symbol}</span>{label}</button>)}</div>
      {planned && !unlocked && <p className="lock-note">Rückmeldung ab Beginn/Anmeldeschluss gesperrt. Maßgeblich ist die Supabase-Serverzeit.{item.can_lead && " Als zuständige Leitung kannst du eine begründete Korrektur erfassen."}</p>}
    </div> : <p className="muted text-sm">Du gehörst nicht zum berechtigten Teilnehmerkreis; keine eigene Rückmeldung möglich.</p>}
    {item.own_attendance && <p className="notice"><strong>Deine bestätigte Anwesenheit: {attendanceLabels[item.own_attendance]}</strong> · Verbindlich abgeschlossene Liste</p>}
    {(item.can_read_attendance || item.can_delegate) && <>
      <div className="dev-actions">
        {item.can_read_attendance && <button className="button secondary" disabled={busy || serverNow < Date.parse(item.starts_at)}
          onClick={() => setAttendanceMode("attendance")}>Anwesenheit öffnen</button>}
        {item.can_delegate && <button className="button secondary" disabled={busy} onClick={() => setAttendanceMode("organizer")}>Organisator zuweisen</button>}
      </div>
      {serverNow < Date.parse(item.starts_at) && <p className="lock-note">Anwesenheit erst ab Dienstbeginn {timeLabel(item.starts_at)}; vorher ist nur die Teilnahmeplanung möglich.</p>}
      {attendanceMode && <SupabaseAttendance key={`${item.id}-${attendanceMode}`} client={client} eventId={item.id} mode={attendanceMode}
        close={() => setAttendanceMode(null)} changed={changed} />}
    </>}
    {counts && <details className="dev-participants" open={participantsOpen} onToggle={(event) => setParticipantsOpen(event.currentTarget.open)}>
      <summary>Teilnehmerübersicht · {counts.yes} Zusagen · {counts.no} Absagen · {counts.maybe} Vielleicht · {counts.unanswered} ohne Rückmeldung</summary>
      <ul>{item.participants?.map((person) => <li key={person.user_id}><span>{person.name}</span><strong>{person.response ? responseNames[person.response] : "Ohne Rückmeldung"}</strong></li>)}</ul>
      {item.can_lead && planned && <form className="form-grid soft-panel" onSubmit={(event: FormEvent) => {
        event.preventDefault(); void correct(target, answer, correction);
      }}>
        <h4 className="span-2">Rückmeldung korrigieren</h4>
        <label>Mitglied<select value={target} onChange={(e) => setTarget(e.target.value)} required disabled={busy}>
          <option value="">Mitglied auswählen</option>{item.participants?.map((person) => <option key={person.user_id} value={person.user_id}>{person.name}</option>)}
        </select></label>
        <label>Neue Rückmeldung<select value={answer} onChange={(e) => setAnswer(e.target.value === "yes" ? "yes" : e.target.value === "no" ? "no" : "maybe")} disabled={busy}>
          {Object.entries(responseNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
        <label className="span-2">Korrekturgrund<input value={correction} onChange={(e) => setCorrection(e.target.value)} required minLength={5} maxLength={2000} disabled={busy} /></label>
        <p className="span-2 muted text-sm">Gilt nur für diese Termininstanz, auch nach Beginn. Ändert keine tatsächliche Anwesenheit. Akteur, Mitglied und Grund werden protokolliert.</p>
        <button className="button span-2" disabled={busy || !target}>Korrektur speichern</button>
      </form>}
    </details>}
    {item.can_manage && planned && <div className="dev-actions">
      <button className="button secondary" disabled={busy || serverNow >= Date.parse(item.starts_at)} onClick={edit}>Termin bearbeiten</button>
      <button className="button secondary danger-button" disabled={busy} onClick={() => setCancelling(!cancelling)}>Termin absagen</button>
    </div>}
    {cancelling && planned && <form className="dev-cancel soft-panel" onSubmit={(event) => { event.preventDefault(); void cancel(reason); }}>
      <label>Absagegrund<input value={reason} onChange={(e) => setReason(e.target.value)} required minLength={5} maxLength={2000} disabled={busy} /></label>
      <button className="button danger-button" disabled={busy}>Absage bestätigen</button>
      <p className="muted text-sm">Keine Löschung. Teilnehmer, Rückmeldungen und Protokoll bleiben erhalten. Erfasste Anwesenheit verhindert eine Absage.</p>
    </form>}
  </article>;
}
