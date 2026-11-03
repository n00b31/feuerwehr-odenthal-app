"use client";

import { useState } from "react";
import { CheckCheck, CalendarDays, Clock3, ChartNoAxesCombined, Download, Printer } from "lucide-react";
import { useDemo } from "./demo-provider";
import { PageHeading, Metric, Empty, scopeValue, parseScope } from "./ui";
import { confirmedEventCounts, eventCounts, hasConfirmedAttendance, isPractice, personalStatistics, yearEvents } from "@/domain/statistics";
import { isAdmin, manageableScopes, manages, scopeLabel } from "@/domain/permissions";
import { berlinParts, dateLabel } from "@/domain/time";
import { EVENT_TYPES } from "@/config/app";
import { csv } from "@/domain/export";

export function Statistics() {
  const { state, user, now } = useDemo();
  const [year, setYear] = useState(berlinParts(now).year);
  const [view, setView] = useState("personal");
  const scopes = manageableScopes(state, user);
  const [scopeKey, setScopeKey] = useState(scopeValue(scopes[0] ?? { kind: "unit", id: user.unitId }));
  const stats = personalStatistics(state, user.id, year, now);
  const scope = parseScope(scopeKey);
  const adminEvents = yearEvents(state.events, year, now).filter((e) => manages(user, e.scope) && (scope.kind === "organization" || (e.scope.kind !== "organization" && e.scope.kind === scope.kind && e.scope.id === scope.id)));
  const admin = view === "admin" && isAdmin(user);
  const present = adminEvents.reduce((sum, e) => sum + confirmedEventCounts(e).present, 0);
  const hours = adminEvents.reduce((sum, e) => sum + confirmedEventCounts(e).present * (Date.parse(e.endsAt) - Date.parse(e.startsAt)) / 3_600_000, 0);
  const practices = adminEvents.filter(isPractice);
  const confirmedPractices = practices.filter((e) => e.finalizedAt);
  const practiceSlots = confirmedPractices.reduce((sum, e) => sum + e.roster.length, 0);
  const practicePresent = confirmedPractices.reduce((sum, e) => sum + confirmedEventCounts(e).present, 0);
  const byType = Object.entries(EVENT_TYPES).map(([type, label]) => ({
    label, count: adminEvents.filter((e) => e.type === type).length,
    present: adminEvents.filter((e) => e.type === type).reduce((sum, e) => sum + confirmedEventCounts(e).present, 0),
  }));
  const years = [...new Set([berlinParts(now).year, ...state.events.map((e) => berlinParts(e.startsAt).year)])].sort((a, b) => b - a);
  const members = state.users.map((person) => {
    const relevant = adminEvents.filter((e) => e.roster.some((p) => p.userId === person.id));
    const attended = relevant.filter((e) => hasConfirmedAttendance(e, person.id));
    const practice = relevant.filter((e) => isPractice(e) && e.finalizedAt);
    return { person, eligible: relevant.length, count: attended.length, rate: practice.length ? Math.round(practice.filter((e) => hasConfirmedAttendance(e, person.id)).length / practice.length * 100) : 0 };
  }).filter((p) => p.eligible > 0);
  function download() {
    const rows: (string | number)[][] = admin
      ? [["Bereich", scopeLabel(state, scope), "Jahr", year], ["Dienst", "Datum (Berlin)", "Dienstart", "Zusagen (nur Planung)", "Anwesend (bestätigt)", "Abwesend (bestätigt)", "Nicht festgestellt (bestätigt)", "Vorläufig anwesend", "Vorläufig abwesend", "Vorläufig nicht festgestellt", "Liste bestätigt"], ...adminEvents.map((e) => [e.title, dateLabel(e.startsAt, { year: "numeric" }), EVENT_TYPES[e.type], eventCounts(e).yes, confirmedEventCounts(e).present, confirmedEventCounts(e).absent, confirmedEventCounts(e).unknown, e.finalizedAt ? 0 : eventCounts(e).present, e.finalizedAt ? 0 : eventCounts(e).absent, e.finalizedAt ? 0 : eventCounts(e).unknown, e.finalizedAt ? "Ja" : "Nein"])]
      : [["Name", user.name, "Jahr", year], ["Tatsächlich besuchter Dienst", "Datum (Berlin)", "Dienstart", "Stunden"], ...stats.visited.map((e) => [e.title, dateLabel(e.startsAt, { year: "numeric" }), EVENT_TYPES[e.type], (Date.parse(e.endsAt) - Date.parse(e.startsAt)) / 3_600_000])];
    const url = URL.createObjectURL(new Blob([csv(rows)], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url; link.download = `feuerwehr-demo-statistik-${year}.csv`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <>
    <PageHeading eyebrow="TEILNAHME SICHTBAR MACHEN" title="Dein Engagement in Zahlen" description="Nur bestätigte Anwesenheiten zählen. Zusagen und offene Listen bleiben vorläufig." action={<div className="form-actions no-print"><button className="button secondary" onClick={download}><Download size={17} />CSV für Excel</button><button className="button secondary" onClick={() => window.print()}><Printer size={17} />Druck / PDF</button></div>} />
    <div className="card filter-panel no-print"><div className="filters">{isAdmin(user) && <div className="tabs"><button className={!admin ? "active" : ""} onClick={() => setView("personal")}>Meine Statistik</button><button className={admin ? "active" : ""} onClick={() => setView("admin")}>Bereichsstatistik</button></div>}<label>Jahr<select value={year} onChange={(e) => setYear(Number(e.target.value))}>{years.map((y) => <option key={y}>{y}</option>)}</select></label>{admin && <label>Administrierter Bereich<select value={scopeKey} onChange={(e) => setScopeKey(e.target.value)}>{scopes.map((s) => <option key={scopeValue(s)} value={scopeValue(s)}>{scopeLabel(state, s)}</option>)}</select></label>}</div></div>
    <p className="print-heading">{admin ? scopeLabel(state, scope) : user.name} · Jahresstatistik {year} · Demo</p>
    <div className="metrics"><Metric label="Bisherige Übungsdienste" value={admin ? practices.length : stats.practiceCount} note={`${admin ? confirmedPractices.length : stats.confirmedPracticeCount} Listen bestätigt`} icon={<CalendarDays size={20} />} /><Metric label="Tatsächliche Teilnahmen" value={admin ? present : stats.attendanceCount} note={admin ? "Bestätigte Personen-Teilnahmen" : "Alle bestätigten Dienstarten"} icon={<CheckCheck size={20} />} /><Metric label="Übungsdienst-Quote" value={<>{admin ? practiceSlots ? Math.round(practicePresent / practiceSlots * 100) : 0 : stats.rate}<small>%</small></>} note={admin ? "Anwesende / Eingeladene bestätigter Listen" : `${stats.attendedPractices} von ${stats.confirmedPracticeCount} bestätigten Übungen`} icon={<ChartNoAxesCombined size={20} />} /><Metric label="Ausbildungsstunden" value={<>{(admin ? hours : stats.hours).toLocaleString("de-DE", { maximumFractionDigits: 1 })}<small> h</small></>} note={admin ? "Bestätigte Personen × Dienstdauer" : "Volle Dauer bestätigter Dienste"} icon={<Clock3 size={20} />} /></div>
    <div className="notice"><strong>So werden die Zahlen berechnet</strong><p>Jahr {year}, bisher begonnene und nicht abgesagte Termine. Nur „anwesend“ in einer bestätigten Liste zählt als Teilnahme und Ausbildungszeit. Vorbelegte und manuell erfasste Entwürfe zählen nicht. Ungeklärte Einträge bleiben unbekannt, nicht abwesend. Die Quote berücksichtigt nur bestätigte reguläre Übungsdienste und Sonderübungen mit dem damaligen Teilnehmerkreis. Stunden entsprechen der vollen Dienstdauer, nicht einer individuellen Zeiterfassung. Historische Teilnehmerlisten bleiben bei Einheitswechseln erhalten.</p><p>{admin ? adminEvents.filter((e) => !e.finalizedAt).length : stats.pendingCount} offene Listen sind noch nicht in Teilnahmen, Quote und Stunden enthalten.</p>{admin && <p>Bereichsstatistik: dem ausgewählten Bereich zugeordnete Termine; bei „Alle Einheiten“ sämtliche Bereiche.</p>}</div>
    {admin ? <>
      <section className="card list-card"><div className="section-heading"><h2>Nach Dienstart</h2><span className="year-tag">{year}</span></div><div className="type-statistics">{byType.map((t) => <div key={t.label}><span>{t.label}</span><div className="bar-track"><i style={{ width: `${Math.min(100, t.present / Math.max(1, present) * 100)}%` }} /></div><strong>{t.present}</strong><small>{t.count} Termine</small></div>)}</div></section>
      <section className="card list-card"><h2>Teilnehmerzahlen je Dienst</h2><div className="table-scroll"><table><caption className="sr-only">Bestätigte Anwesenheit je Dienst im Jahr {year}</caption><thead><tr><th>Dienst</th><th>Datum</th><th>Zusagen¹</th><th>Anwesend</th><th>Abwesend</th><th>Ungeklärt</th><th>Liste</th></tr></thead><tbody>{adminEvents.map((event) => <tr key={event.id}><th>{event.title}<small>{EVENT_TYPES[event.type]}</small></th><td>{dateLabel(event.startsAt)}</td><td>{eventCounts(event).yes}</td><td>{confirmedEventCounts(event).present}</td><td>{confirmedEventCounts(event).absent}</td><td>{confirmedEventCounts(event).unknown}</td><td>{event.finalizedAt ? "Abgeschlossen" : <><span className="badge warning">Vorläufig</span><small>Entwurf: {eventCounts(event).present} anwesend · {eventCounts(event).absent} abwesend · {eventCounts(event).unknown} ungeklärt</small></>}</td></tr>)}</tbody></table></div><small className="muted">¹ Zusagen sind nur Planungswerte. Die Zahlen in Anwesend/Abwesend/Ungeklärt stammen ausschließlich aus bestätigten Listen; Entwürfe sind separat gekennzeichnet.</small></section>
      <section className="card list-card"><h2>Mitgliederübersicht · historische Teilnehmerkreise</h2><div className="table-scroll"><table><thead><tr><th>Name</th><th>Eingeladene Dienste</th><th>Teilnahmen</th><th>Übungsquote</th></tr></thead><tbody>{members.map((p) => <tr key={p.person.id}><th>{p.person.name}</th><td>{p.eligible}</td><td>{p.count}</td><td>{p.rate}%</td></tr>)}</tbody></table></div></section>
    </> : <section className="card list-card"><div className="section-heading"><h2>Deine besuchten Dienste</h2><span className="badge success">Bestätigt anwesend</span></div>{stats.visited.length ? <div className="table-scroll"><table><thead><tr><th>Dienst</th><th>Datum</th><th>Bereich damals</th><th>Stunden</th><th>Erfassung</th></tr></thead><tbody>{stats.visited.map((e) => <tr key={e.id}><th>{e.title}<small>{EVENT_TYPES[e.type]}</small></th><td>{dateLabel(e.startsAt, { year: "numeric" })}</td><td>{state.units.find((u) => u.id === e.roster.find((p) => p.userId === user.id)?.unitId)?.name}</td><td>{((Date.parse(e.endsAt) - Date.parse(e.startsAt)) / 3_600_000).toLocaleString("de-DE")}</td><td>Abgeschlossen</td></tr>)}</tbody></table></div> : <Empty title="Noch keine bestätigte Teilnahme in diesem Jahr" />}</section>}
    <p className="muted text-sm no-print">Exportvorbereitung: UTF-8-CSV für Excel und Browser-Druckansicht („Als PDF speichern“). Kein natives XLSX und keine serverseitige PDF-Erzeugung.</p>
  </>;
}
