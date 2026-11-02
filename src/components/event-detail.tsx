"use client";

import { useState } from "react";
import { CalendarDays, Clock3, MapPin, UserRound, LockKeyhole, Check, X, HelpCircle } from "lucide-react";
import { useDemo } from "./demo-provider";
import { Modal } from "./ui";
import { manages, responseBlock, scopeLabel } from "@/domain/permissions";
import { dateLabel, timeLabel } from "@/domain/time";
import { ATTENDANCE_LABELS, EVENT_TYPES, RESPONSE_LABELS, REPEAT_LABELS } from "@/config/app";
import type { Attendance, Response } from "@/domain/model";
import { eventCounts } from "@/domain/statistics";
import { EventForm } from "./event-form";

export function EventDetail({ eventId, close }: { eventId: string; close: () => void }) {
  const { state, user, now, run } = useDemo();
  const event = state.events.find((e) => e.id === eventId)!;
  const [tab, setTab] = useState<"info" | "attendance">("info");
  const [edit, setEdit] = useState(false);
  const [reason, setReason] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const admin = manages(user, event.scope);
  const block = responseBlock(user, event, now);
  const started = Date.parse(event.startsAt) <= now.getTime();
  const counts = eventCounts(event);
  if (edit) return <EventForm existing={event} close={() => setEdit(false)} />;
  function saveAttendance(userId: string, value: Attendance) {
    if (event.finalizedAt && reason.trim().length < 5) { setError("Bitte zuerst einen Korrekturgrund mit mindestens 5 Zeichen eingeben."); return; }
    if (run({ type: "attendance", eventId, userId, value, reason })) setError("");
  }
  return <Modal title={event.title} close={close}>
    <div className="detail-tags"><span className="badge accent">{EVENT_TYPES[event.type]}</span><span className="badge">{scopeLabel(state, event.scope)}</span>{event.seriesId && <span className="badge">Serieninstanz</span>}{event.status === "cancelled" && <span className="badge danger">Termin abgesagt</span>}</div>
    {event.recurrence && <p className="muted text-sm">{REPEAT_LABELS[event.recurrence.frequency]} · Instanz {event.recurrence.index} von {event.recurrence.total} · Änderungen gelten nur für diese Instanz.</p>}
    {admin && <div className="tabs"><button className={tab === "info" ? "active" : ""} onClick={() => setTab("info")}>Details & Planung</button><button className={tab === "attendance" ? "active" : ""} onClick={() => setTab("attendance")}>Anwesenheit ({counts.present}/{event.roster.length})</button></div>}
    {tab === "info" ? <>
      <div className="detail-meta"><span><CalendarDays size={18} />{dateLabel(event.startsAt, { weekday: "long", year: "numeric" })}</span><span><Clock3 size={18} />{timeLabel(event.startsAt)} – {timeLabel(event.endsAt)} Uhr (Berlin)</span><span><MapPin size={18} />{event.location}</span><span><UserRound size={18} />Organisation: {state.users.find((u) => u.id === event.organizerId)?.name}</span></div>
      <p className="description">{event.description}</p>
      {event.deadline && <p className="text-sm muted">Anmeldeschluss: {dateLabel(event.deadline)} · {timeLabel(event.deadline)} Uhr</p>}
      <section className="soft-panel"><h3>Deine geplante Teilnahme</h3><p className="muted text-sm">Eine Zusage ist keine erfasste Anwesenheit.</p><div className="response-options">{(["yes", "maybe", "no"] as Response[]).map((response) => {
        const Icon = response === "yes" ? Check : response === "no" ? X : HelpCircle;
        return <button key={response} disabled={!!block} aria-pressed={event.responses[user.id] === response} className={`button ${event.responses[user.id] === response ? "primary" : "secondary"}`} onClick={() => run({ type: "respond", eventId, response })}><Icon size={17} />{RESPONSE_LABELS[response]}</button>;
      })}</div>{block && <p className="lock-note"><LockKeyhole size={15} />{block}</p>}<p className="text-sm">Tatsächliche Anwesenheit: <strong>{ATTENDANCE_LABELS[event.attendance[user.id] ?? "unknown"]}</strong></p></section>
      {admin && <><div className="section-heading"><h3>Planungsübersicht</h3><span className="muted text-sm">{counts.yes} Zusagen · {event.roster.length} eingeladen</span></div><div className="roster-planning">{event.roster.map((p) => <div key={p.userId}><span>{state.users.find((u) => u.id === p.userId)?.name}</span><span className="badge">{event.responses[p.userId] ? RESPONSE_LABELS[event.responses[p.userId]] : "Offen"}</span></div>)}</div>
        {!started && event.status !== "cancelled" && <div className="form-actions"><button className="button secondary" onClick={() => setEdit(true)}>Diese Instanz bearbeiten</button></div>}
        {event.status !== "cancelled" && !event.finalizedAt && !Object.values(event.attendance).some((a) => a !== "unknown") && <section className="danger-zone"><label>Absagegrund<input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Grund für die Absage (mind. 5 Zeichen)" /></label><button className="button danger-button" disabled={reason.trim().length < 5} onClick={() => run({ type: "cancelEvent", eventId, reason })}>Nur diesen Termin absagen</button></section>}
      </>}
    </> : <>
      <div className="notice"><strong>Ist-Anwesenheit, nicht Zusagen.</strong><p>Erst ab Dienstbeginn erfassbar. „Nicht festgestellt“ zählt nicht als Teilnahme. Abschließen ist auch mit ungeklärten Einträgen möglich.</p></div>
      <div className="detail-tags"><span className="badge success">{counts.present} anwesend</span><span className="badge">{counts.absent} abwesend</span><span className="badge">{counts.unknown} nicht festgestellt</span><span className={`badge ${event.finalizedAt ? "success" : "warning"}`}>{event.finalizedAt ? "Abgeschlossen · Korrekturen möglich" : "Erfassung offen"}</span></div>
      {event.finalizedAt && <label>Korrekturgrund (Pflicht für jede nachträgliche Änderung)<input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="z. B. verspätete Rückmeldung der Ausbilderin" /></label>}
      {(!started || event.status === "cancelled") && <p className="lock-note"><LockKeyhole size={16} />{started ? "Dieser Termin wurde abgesagt." : "Die Erfassung wird zum tatsächlichen Dienstbeginn freigegeben."}</p>}
      <label>Teilnehmer suchen<input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name" /></label>
      <div className="attendance-list">{event.roster.filter((p) => state.users.find((u) => u.id === p.userId)?.name.toLowerCase().includes(search.toLowerCase())).map((p) => {
        const person = state.users.find((u) => u.id === p.userId)!;
        return <div className="attendance-row" key={p.userId}><span><strong>{person.name}</strong><small>Planung: {event.responses[p.userId] ? RESPONSE_LABELS[event.responses[p.userId]] : "Offen"} · {state.units.find((u) => u.id === p.unitId)?.name}</small></span><select aria-label={`Anwesenheit ${person.name}`} disabled={!started || event.status === "cancelled"} value={event.attendance[p.userId] ?? "unknown"} onChange={(e) => saveAttendance(p.userId, e.target.value as Attendance)}>{Object.entries(ATTENDANCE_LABELS).map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select></div>;
      })}</div>
      {error && <p role="alert" className="error">{error}</p>}
      {!event.finalizedAt && <button className="button primary" disabled={!started || event.status === "cancelled"} onClick={() => run({ type: "finalize", eventId })}><Check size={18} />Anwesenheitsliste abschließen</button>}
      <p className="muted text-sm">Jede Erfassung und Korrektur wird im Demo-Änderungsprotokoll gespeichert. Dieses lokale Protokoll ist nicht revisionssicher.</p>
    </>}
  </Modal>;
}
