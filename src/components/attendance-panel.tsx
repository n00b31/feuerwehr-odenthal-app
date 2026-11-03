"use client";

import { useEffect, useRef, useState } from "react";
import { Check, LockKeyhole } from "lucide-react";
import { useDemo } from "./demo-provider";
import type { Attendance, Event } from "@/domain/model";
import { eventCounts, isPractice } from "@/domain/statistics";
import { ATTENDANCE_LABELS, RESPONSE_LABELS } from "@/config/app";
import { dateLabel, timeLabel } from "@/domain/time";

export function AttendancePanel({ event }: { event: Event }) {
  const { state, now, run } = useDemo();
  const [reason, setReason] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const attempted = useRef(false);
  const started = Date.parse(event.startsAt) <= now.getTime();
  const needsPreparation = isPractice(event) && started && event.status !== "cancelled" && !event.finalizedAt && !event.attendancePreparedAt;
  const disabled = !started || event.status === "cancelled" || needsPreparation;
  const counts = eventCounts(event);

  useEffect(() => {
    if (needsPreparation && !attempted.current) {
      attempted.current = true;
      run({ type: "prepareAttendance", eventId: event.id });
    }
  }, [needsPreparation, event.id, run]);

  function saveAttendance(userId: string, value: Attendance) {
    if (event.finalizedAt && reason.trim().length < 5) { setError("Bitte zuerst einen Korrekturgrund mit mindestens 5 Zeichen eingeben."); return; }
    if (run({ type: "attendance", eventId: event.id, userId, value, reason })) setError("");
  }

  return <>
    <div className="notice"><strong>{event.finalizedAt ? "Bestätigte Ist-Anwesenheit." : "Vorläufige Anwesenheit – noch kein Nachweis."}</strong><p>{event.finalizedAt ? "Diese Liste zählt für Statistik und Ausbildungsstunden. Korrekturen benötigen eine Begründung; nicht festgestellte Einträge bleiben ungeklärt." : "Werte vor Ort prüfen und die gesamte Liste bestätigen. Erst dann zählen sie für Statistik und Ausbildungsstunden. „Nicht festgestellt“ bleibt ungeklärt."}</p></div>
    <div className="detail-tags"><span className="badge success">{counts.present} anwesend</span><span className="badge">{counts.absent} abwesend</span><span className="badge">{counts.unknown} nicht festgestellt</span><span className={`badge ${event.finalizedAt ? "success" : "warning"}`}>{event.finalizedAt ? "Abgeschlossen · Korrekturen möglich" : "Vorläufig · nicht bestätigt"}</span></div>
    {event.finalizedAt && <><p className="muted text-sm">Liste bestätigt am {dateLabel(event.finalizedAt, { year: "numeric" })} um {timeLabel(event.finalizedAt)} Uhr (Berlin).</p><label>Korrekturgrund (Pflicht für jede nachträgliche Änderung)<input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="z. B. verspätete Rückmeldung der Ausbilderin" /></label></>}
    {(!started || event.status === "cancelled") && <p className="lock-note"><LockKeyhole size={16} />{started ? "Dieser Termin wurde abgesagt." : "Die Erfassung wird zum tatsächlichen Dienstbeginn freigegeben."}</p>}
    {needsPreparation && <button className="button secondary" onClick={() => run({ type: "prepareAttendance", eventId: event.id })}>Vorbelegung erneut versuchen</button>}
    <label>Teilnehmer suchen<input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name" /></label>
    <div className="attendance-list">{event.roster.filter((p) => state.users.find((u) => u.id === p.userId)?.name.toLowerCase().includes(search.toLowerCase())).map((p) => {
      const person = state.users.find((u) => u.id === p.userId)!;
      const entryState = event.finalizedAt ? "Bestätigt" : event.attendancePrefilledIds?.includes(p.userId) ? "Vorläufig · aus Rückmeldung" : Object.hasOwn(event.attendance, p.userId) ? "Vorläufig · manuell erfasst" : "Noch nicht erfasst";
      return <div className="attendance-row" key={p.userId}><span><strong>{person.name}</strong><small>Planung: {event.responses[p.userId] ? RESPONSE_LABELS[event.responses[p.userId]] : "Offen"} · {state.units.find((u) => u.id === p.unitId)?.name}</small><small>{entryState}</small></span><select aria-label={`Anwesenheit ${person.name}`} disabled={disabled} value={event.attendance[p.userId] ?? "unknown"} onChange={(e) => saveAttendance(p.userId, e.target.value as Attendance)}>{Object.entries(ATTENDANCE_LABELS).map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select></div>;
    })}</div>
    {error && <p role="alert" className="error">{error}</p>}
    {!event.finalizedAt && <button className="button primary" disabled={disabled} onClick={() => run({ type: "finalize", eventId: event.id })}><Check size={18} />Anwesenheitsliste bestätigen</button>}
    <p className="muted text-sm">Mit der Bestätigung übernimmst du die geprüften Werte für die gesamte Liste. Jede Erfassung, Bestätigung und begründete Korrektur wird im lokalen Demo-Änderungsprotokoll gespeichert. Dieses Protokoll ist nicht revisionssicher.</p>
  </>;
}
