"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Check, X, ClipboardCheck, RefreshCw, UserRoundCheck } from "lucide-react";
import {
  readAttendanceWorkspace, prepareAttendance, recordAttendance, completeAttendance, assignOrganizer,
} from "@/data/supabase-repository";
import {
  attendanceCounts, attendanceErrorMessage, attendanceLabels, attendanceStateLabels, canCompleteAttendance,
  isAttendanceFinal, type AttendanceStatus, type AttendanceWorkspace,
} from "@/domain/dev-attendance";
import { dateLabel, timeLabel } from "@/domain/time";
import { AppDialog } from "./app-dialog";

const responseLabels = { yes: "Zusage", no: "Absage", maybe: "Vielleicht" };
const statuses: AttendanceStatus[] = ["present", "absent", "unknown"];

export function SupabaseAttendance({ client, eventId, mode, close, changed }: {
  client: SupabaseClient; eventId: string; mode: "attendance" | "organizer";
  close: () => void; changed: () => Promise<void>;
}) {
  const [data, setData] = useState<AttendanceWorkspace | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [completing, setCompleting] = useState(false);
  const [correction, setCorrection] = useState<{ user: string; name: string; status: AttendanceStatus } | null>(null);
  const [reason, setReason] = useState("");
  const working = useRef(true);
  const epoch = useRef({ value: 0 });
  const reload = useCallback(async (initialize = false) => {
    const version = ++epoch.current.value;
    try {
      let next = await readAttendanceWorkspace(client, eventId);
      if (version !== epoch.current.value) return;
      if (initialize && next.can_manage && next.event_status === "scheduled" && !isAttendanceFinal(next.state)
        && Date.parse(next.server_now) >= Date.parse(next.starts_at) && !next.prepared_at
        && (next.event_type === "regular" || next.event_type === "special")) {
        await prepareAttendance(client, eventId);
        next = await readAttendanceWorkspace(client, eventId);
      }
      if (version === epoch.current.value) return { data: next, version };
    } catch (cause) {
      if (version === epoch.current.value) throw cause;
    }
  }, [client, eventId]);
  const accept = useCallback((snapshot?: { data: AttendanceWorkspace; version: number }) => {
    if (snapshot && snapshot.version === epoch.current.value) { setData(snapshot.data); setError(""); }
  }, []);
  useEffect(() => {
    let alive = true;
    const lifetime = epoch.current;
    void reload(mode === "attendance").then(accept).catch((cause: unknown) => {
      if (alive) { setData(null); setError(attendanceErrorMessage(cause)); }
    }).finally(() => { if (alive) { working.current = false; setBusy(false); } });
    const timer = window.setInterval(() => {
      if (document.hidden || working.current) return;
      void reload().then(accept).catch((cause: unknown) => {
        if (alive) { setData(null); setError(attendanceErrorMessage(cause)); }
      });
    }, 10_000);
    return () => { alive = false; lifetime.value++; window.clearInterval(timer); };
  }, [reload, mode, accept]);
  async function run(operation: () => Promise<void>, success: string) {
    if (working.current || busy) return;
    working.current = true;
    setBusy(true); setError(""); setNotice("");
    epoch.current.value++;
    let committed = false;
    try {
      await operation(); committed = true;
      setNotice(success); setCorrection(null); setCompleting(false);
      accept(await reload());
      await changed();
    } catch (cause) {
      setData(null);
      setError(`${committed ? "Änderung gespeichert; Aktualisierung fehlgeschlagen. " : ""}${attendanceErrorMessage(cause)}`);
      setCompleting(false); setCorrection(null);
    } finally { working.current = false; setBusy(false); }
  }
  async function refresh() {
    if (busy) return;
    setBusy(true); setError("");
    try { accept(await reload(mode === "attendance")); }
    catch (cause) { setData(null); setError(attendanceErrorMessage(cause)); }
    finally { setBusy(false); }
  }
  const counts = data ? attendanceCounts(data.members) : null;
  const finalized = data ? isAttendanceFinal(data.state) : false;
  const started = data ? Date.parse(data.server_now) >= Date.parse(data.starts_at) : false;
  const editable = !!data?.can_manage && started && data.event_status === "scheduled";
  const visibleMembers = data ? data.members.filter((person) => person.name.toLocaleLowerCase("de").includes(search.toLocaleLowerCase("de"))
    && (filter === "all" || (person.status ?? "unknown") === filter)) : [];
  return <section className="dev-attendance soft-panel" aria-label="Tatsächliche Anwesenheit">
    <div className="event-card-top"><h4><ClipboardCheck size={20} /> Tatsächliche Anwesenheit</h4>
      <button className="button secondary" disabled={busy} onClick={close}>Ansicht schließen</button></div>
    <p className="muted text-sm">Keine Teilnahmeplanung. Vorbelegte Werte bleiben bis zum verbindlichen Listenabschluss vorläufig.</p>
    {busy && <p role="status">Anwesenheit wird in Supabase geladen oder gespeichert …</p>}
    {error && <p className="notice error" role="alert">{error}</p>}
    {notice && <p className="notice" role="status">{notice}</p>}
    <button className="button secondary" disabled={busy} onClick={() => void refresh()}><RefreshCw size={18} />Anwesenheit aktualisieren</button>
    {data && counts && <>
      <p><strong>{data.title}</strong> · {data.scope_name} · {data.event_status === "scheduled" ? "Geplant" : "Abgesagt"}</p>
      <p>{dateLabel(data.starts_at, { year: "numeric" })} · {timeLabel(data.starts_at)} – {timeLabel(data.ends_at)}</p>
      <p>Dienstleitung: <strong>{data.organizer_name}</strong></p>
      <p className={`attendance-state ${finalized ? "final" : ""}`}>{finalized && <Check size={18} />}
        <strong>{attendanceStateLabels[data.state]}</strong></p>
      <div className="attendance-counts" aria-label="Anwesenheitszahlen">
        <span>Erwartet: <strong>{counts.total}</strong></span><span>Anwesend: <strong>{counts.present}</strong></span>
        <span>Abwesend: <strong>{counts.absent}</strong></span><span>Nicht festgestellt: <strong>{counts.unknown}</strong></span>
      </div>
      {data.initialized_at && <p className="muted text-sm">Begonnen: {dateLabel(data.initialized_at)} {timeLabel(data.initialized_at)} · {data.initialized_by ?? "Historischer Akteur nicht verfügbar"}</p>}
      {data.confirmed_at && <p className="text-sm">Abgeschlossen: {dateLabel(data.confirmed_at)} {timeLabel(data.confirmed_at)} · {data.confirmed_by}</p>}
      {!started && <p className="lock-note">Anwesenheitserfassung ab {dateLabel(data.starts_at)} {timeLabel(data.starts_at)}. Maßgeblich ist die Supabase-Serverzeit, nicht die Gerätezeit.</p>}
      {!data.can_manage && <p className="notice">Abgeschlossene Liste · Nur Leserechte, keine Dienstleitung.</p>}
      {data.primary_organizer && !data.primary_organizer.access_granted && <p className="notice error">Der zugewiesene Organisator hat derzeit keinen freigegebenen Zugang.</p>}
      {data.can_delegate && <details open={mode === "organizer"} className="attendance-delegation">
        <summary>Organisator zuweisen · ausschließlich dieser Termin</summary>
        <OrganizerForm data={data} busy={busy}
          assign={(user, note) => run(() => assignOrganizer(client, eventId, user, note), user ? "Terminbezogene Dienstleitung gespeichert." : "Delegation widerrufen. Anwesenheit und Historie bleiben erhalten.")} />
      </details>}
      {mode === "attendance" && <>
        <div className="form-grid attendance-filters">
          <label>Mitglied suchen<input type="search" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
          <label>Anwesenheitsfilter<select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">Alle Mitglieder</option>{Object.entries(attendanceLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
          </select></label>
        </div>
        <ul className="attendance-members">{visibleMembers.map((person) => <li key={person.user_id} className="attendance-member" aria-label={person.name}>
          <div><strong>{person.name}</strong>
            <p className="muted text-sm">{data.state === "NOT_STARTED" ? "Aktuelle" : "Ursprüngliche"} Rückmeldung: {!person.response_known ? "Historisch nicht gespeichert" : person.response ? responseLabels[person.response] : "Ohne Rückmeldung"}</p>
            <p><strong className={`attendance-status ${person.status ?? "unknown"}`}>
              {person.status === "present" ? <Check size={16} aria-hidden="true" /> : person.status === "absent" ? <X size={16} aria-hidden="true" /> : null}
              {person.status ? attendanceLabels[person.status] : "Noch nicht erfasst"}</strong> · {finalized ? "Bestätigte Liste" : person.origin === "manual" ? "Manuell festgestellt" : "Vorläufig"}</p>
            {person.recorded_at && <p className="muted text-sm">Letzte Erfassung: {dateLabel(person.recorded_at)} {timeLabel(person.recorded_at)}</p>}
          </div>
          {editable && <div className="attendance-buttons">{statuses.map((status) => {
            const label = attendanceLabels[status];
            return <button key={status} className={`button secondary attendance-choice ${status} ${person.status === status ? "selected" : ""}`}
              aria-pressed={person.status === status} disabled={busy || (finalized && (status === "unknown" || person.status === status))}
              onClick={() => finalized ? (setCorrection({ user: person.user_id, name: person.name, status }), setReason(""))
                : void run(() => recordAttendance(client, eventId, person.user_id, status), `Anwesenheit für ${person.name} gespeichert.`)}>
              {status === "present" ? <Check size={16} aria-hidden="true" /> : status === "absent" ? <X size={16} aria-hidden="true" /> : null}{label}</button>;
          })}</div>}
        </li>)}</ul>
        {data.members.length > 0 && visibleMembers.length === 0 && <p>Keine Mitglieder für diese Suche oder diesen Filter.</p>}
        {data.members.length === 0 && <p>Kein gespeicherter Teilnehmerkreis. Ein leerer Dienst kann nicht abgeschlossen werden.</p>}
        {!finalized && data.can_manage && <div className="dev-actions">
          <button className="button" disabled={busy || !canCompleteAttendance(data)} onClick={() => setCompleting(true)}><ClipboardCheck size={18} />Liste abschließen</button>
          <p className="muted text-sm">Vorbelegung: Zusage → vorläufig anwesend, alle anderen Antworten → vorläufig abwesend. Prüfe die tatsächliche Anwesenheit aller {counts.total} Mitglieder vor dem Abschluss. Manuell „Nicht festgestellt“ verhindert den Abschluss.</p>
        </div>}
        {finalized && editable && <p className="notice">Korrekturen benötigen einen Grund. Ursprünglicher Abschluss und Änderungsprotokoll bleiben unverändert erhalten; ein Rücksetzen auf „Nicht festgestellt“ würde den Abschluss ungültig machen und ist gesperrt.</p>}
      </>}
      {completing && <AppDialog title="Anwesenheitsliste verbindlich abschließen" close={() => { if (!busy) setCompleting(false); }}>
        <p>{data.title}: {counts.present} anwesend, {counts.absent} abwesend. Sind die tatsächlichen Anwesenheiten aller {counts.total} Mitglieder geprüft?</p>
        <p>Erst dieser Abschluss macht die Liste verbindlich. Spätere Änderungen sind nur mit protokollierter Begründung möglich.</p>
        <div className="dev-actions"><button className="button secondary" disabled={busy} onClick={() => setCompleting(false)}>Weiter prüfen</button>
          <button className="button" disabled={busy || !canCompleteAttendance(data)} onClick={() => void run(() => completeAttendance(client, eventId), "Anwesenheitsliste verbindlich abgeschlossen.")}>Abschluss bestätigen</button></div>
      </AppDialog>}
      {correction && <AppDialog title="Bestätigte Anwesenheit korrigieren" close={() => { if (!busy) setCorrection(null); }}>
        <p>{correction.name}: neue Anwesenheit <strong>{attendanceLabels[correction.status]}</strong></p>
        <form onSubmit={(event) => { event.preventDefault(); void run(() => recordAttendance(client, eventId, correction.user, correction.status, reason), "Anwesenheit aktualisiert. Unveränderte manuelle Werte erzeugen keinen weiteren Auditeintrag."); }}>
          <label>Begründung der Anwesenheitskorrektur<textarea required minLength={5} maxLength={2000} value={reason} disabled={busy} onChange={(e) => setReason(e.target.value)} /></label>
          <button className="button" disabled={busy || reason.trim().length < 5}>Begründete Korrektur speichern</button>
        </form>
      </AppDialog>}
    </>}
  </section>;
}

function OrganizerForm({ data, busy, assign }: {
  data: AttendanceWorkspace; busy: boolean; assign: (user: string | null, note: string) => Promise<void>;
}) {
  const [user, setUser] = useState(data.primary_organizer?.user_id ?? "");
  const [note, setNote] = useState(data.primary_organizer?.note ?? "");
  return <form className="form-grid" onSubmit={(event) => { event.preventDefault(); void assign(user, note); }}>
    <label>Organisator<select value={user} required disabled={busy} onChange={(e) => setUser(e.target.value)}>
      <option value="">Freigegebenes Mitglied auswählen</option>{data.candidates.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
    </select></label>
    <label>Gültigkeitsumfang<select value="event" disabled><option value="event">Nur dieser Termin · Anwesenheit und Teilnehmerübersicht</option></select></label>
    <label className="span-2">Interne Notiz (optional)<textarea value={note} maxLength={2000} disabled={busy} onChange={(e) => setNote(e.target.value)} /></label>
    <p className="span-2 muted text-sm">Keine allgemeine Administratorrolle und keine Weiterdelegation. Bei Serien gilt die Zuordnung ausschließlich für diese Instanz.</p>
    <div className="dev-actions span-2"><button className="button" disabled={busy || !user || data.event_status !== "scheduled"}><UserRoundCheck size={18} />Dienstleitung speichern</button>
      {data.primary_organizer && <button className="button secondary danger-button" type="button" disabled={busy} onClick={() => void assign(null, "")}>Delegation widerrufen</button>}</div>
  </form>;
}
