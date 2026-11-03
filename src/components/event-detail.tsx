"use client";

import { useState } from "react";
import { CalendarDays, Clock3, MapPin, UserRound } from "lucide-react";
import { useDemo } from "./demo-provider";
import { Modal } from "./ui";
import { canManageAttendance, manages, scopeLabel } from "@/domain/permissions";
import { dateLabel, timeLabel } from "@/domain/time";
import { ATTENDANCE_LABELS, EVENT_TYPES, RESPONSE_LABELS, REPEAT_LABELS } from "@/config/app";
import type { Event } from "@/domain/model";
import { eventCounts, hasManualAttendance } from "@/domain/statistics";
import { EventForm } from "./event-form";
import { ResponsePicker } from "./response-picker";
import { AttendancePanel } from "./attendance-panel";

export function EventDetail({ eventId, close }: { eventId: string; close: () => void }) {
  const { state, user, now, run } = useDemo();
  const event = state.events.find((e) => e.id === eventId)!;
  const [tab, setTab] = useState<"info" | "attendance">("info");
  const [edit, setEdit] = useState(false);
  const [reason, setReason] = useState("");
  const admin = manages(user, event.scope);
  const attendanceManager = canManageAttendance(user, event);
  const started = Date.parse(event.startsAt) <= now.getTime();
  const counts = eventCounts(event);
  if (edit && admin) return <EventForm existing={event} close={() => setEdit(false)} />;
  return <Modal title={event.title} close={close}>
    <div className="detail-tags"><span className="badge accent">{EVENT_TYPES[event.type]}</span><span className="badge">{scopeLabel(state, event.scope)}</span>{event.seriesId && <span className="badge">Serieninstanz</span>}{event.delegatedOrganizerId && <span className="badge">Terminbezogene Leitung</span>}{event.finalizedAt && <span className="badge success">Anwesenheitsliste bestätigt</span>}{event.status === "cancelled" && <span className="badge danger">Termin abgesagt</span>}</div>
    {event.recurrence && <p className="muted text-sm">{REPEAT_LABELS[event.recurrence.frequency]} · Instanz {event.recurrence.index} von {event.recurrence.total} · Änderungen gelten nur für diese Instanz.</p>}
    {attendanceManager && <div className="tabs"><button className={tab === "info" ? "active" : ""} onClick={() => setTab("info")}>Details & Planung</button><button className={tab === "attendance" ? "active" : ""} onClick={() => setTab("attendance")}>Anwesenheit ({counts.present}/{event.roster.length})</button></div>}
    {tab === "info" || !attendanceManager ? <>
      <div className="detail-meta"><span><CalendarDays size={18} />{dateLabel(event.startsAt, { weekday: "long", year: "numeric" })}</span><span><Clock3 size={18} />{timeLabel(event.startsAt)} – {timeLabel(event.endsAt)} Uhr (Berlin)</span><span><MapPin size={18} />{event.location}</span><span><UserRound size={18} />Verantwortlicher Organisator: {state.users.find((u) => u.id === (event.delegatedOrganizerId ?? event.organizerId))?.name}</span></div>
      {event.delegatedOrganizerId && <p className="muted text-sm">Delegation nur für Teilnehmerliste und Anwesenheit dieser Termininstanz, keine allgemeine Administrationsrolle.</p>}
      {admin && <OrganizerAssignment key={event.delegatedOrganizerId ?? "none"} event={event} />}
      <p className="description">{event.description}</p>
      {event.deadline && <p className="text-sm muted">Anmeldeschluss: {dateLabel(event.deadline)} · {timeLabel(event.deadline)} Uhr</p>}
      <section className="soft-panel"><h3>Deine geplante Teilnahme</h3><p className="muted text-sm">Eine Zusage ist kein bestätigter Anwesenheitsnachweis.</p><ResponsePicker event={event} /><p className="text-sm">Tatsächliche Anwesenheit: <strong>{ATTENDANCE_LABELS[event.attendance[user.id] ?? "unknown"]}</strong> · {event.finalizedAt ? "Liste bestätigt" : "Vorläufig / nicht bestätigt"}</p></section>
      {attendanceManager && <><div className="section-heading"><h3>Planungsübersicht</h3><span className="muted text-sm">{counts.yes} Zusagen · {event.roster.length} eingeladen</span></div><div className="roster-planning">{event.roster.map((p) => <div key={p.userId}><span>{state.users.find((u) => u.id === p.userId)?.name}</span><span className="badge">{event.responses[p.userId] ? RESPONSE_LABELS[event.responses[p.userId]] : "Offen"}</span></div>)}</div></>}
      {admin && <>
        {!started && event.status !== "cancelled" && <div className="form-actions"><button className="button secondary" onClick={() => setEdit(true)}>Diese Instanz bearbeiten</button></div>}
        {event.status !== "cancelled" && !event.finalizedAt && !hasManualAttendance(event) && <section className="danger-zone"><label>Absagegrund<input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Grund für die Absage (mind. 5 Zeichen)" /></label><button className="button danger-button" disabled={reason.trim().length < 5} onClick={() => run({ type: "cancelEvent", eventId, reason })}>Nur diesen Termin absagen</button></section>}
      </>}
    </> : <AttendancePanel key={event.id} event={event} />}
  </Modal>;
}

function OrganizerAssignment({ event }: { event: Event }) {
  const { state, run } = useDemo();
  const [candidate, setCandidate] = useState(event.delegatedOrganizerId ?? "");
  const candidates = state.users.filter((person) => event.roster.some((entry) => entry.userId === person.id));
  return <section className="soft-panel"><h3>Organisator zuweisen</h3><p className="muted text-sm">Nur diese Termininstanz. Auswahl aus dem gespeicherten Teilnehmerkreis, auch bei Sonderfunktionen und historischen Einheitswechseln.</p>
    <form onSubmit={(e) => { e.preventDefault(); run({ type: "assignOrganizer", eventId: event.id, userId: candidate }); }}>
      <label>Verantwortliches Mitglied<select required value={candidate} disabled={event.status === "cancelled"} onChange={(e) => setCandidate(e.target.value)}><option value="">Mitglied auswählen</option>{candidates.map((person) => <option key={person.id} value={person.id}>{person.name} · {state.units.find((unit) => unit.id === person.unitId)?.name}</option>)}</select></label>
      <div className="form-actions"><button className="button secondary" type="submit" disabled={!candidate || candidate === event.delegatedOrganizerId || event.status === "cancelled"}>Organisator zuweisen</button>{event.delegatedOrganizerId && <button className="button secondary" type="button" onClick={() => run({ type: "assignOrganizer", eventId: event.id, userId: null })}>Delegation widerrufen</button>}</div>
    </form>
  </section>;
}
