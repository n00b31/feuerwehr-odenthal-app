"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, CalendarDays, CheckCheck, Clock3, FolderOpen, ArrowUpRight, MapPin, Shield, Flame, UsersRound } from "lucide-react";
import { useDemo } from "./demo-provider";
import { Metric, PageHeading } from "./ui";
import { personalStatistics } from "@/domain/statistics";
import { seesDocument, seesEvent, scopeLabel } from "@/domain/permissions";
import { berlinParts, dateLabel, timeLabel } from "@/domain/time";
import { EVENT_TYPES } from "@/config/app";
import { EventDetail } from "./event-detail";

export function Dashboard() {
  const { state, user, now } = useDemo();
  const [selected, setSelected] = useState<string | null>(null);
  const year = berlinParts(now).year;
  const stats = personalStatistics(state, user.id, year, now);
  const upcoming = state.events.filter((e) => seesEvent(user, e) && e.status !== "cancelled" && Date.parse(e.startsAt) > now.getTime()).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const open = upcoming.filter((e) => e.roster.some((p) => p.userId === user.id) && !e.responses[user.id] && (!e.deadline || Date.parse(e.deadline) > now.getTime()));
  const next = upcoming[0];
  const docs = state.documents.filter((d) => seesDocument(user, d));
  return <>
    <PageHeading eyebrow="DEIN ÜBERBLICK" title={`Hallo ${user.name.split(" ")[0]}. Schön, dass du da bist.`} description={`Alles für deinen Dienst in ${state.units.find((u) => u.id === user.unitId)?.name}. Gemeinsam bleiben wir einsatzbereit.`} action={<Link className="button secondary" href="/termine"><CalendarDays size={17} />Dienstplan ansehen</Link>} />
    <div className="dashboard-top">
      <section className="next-service card">
        <div className="hero-copy"><div className="hero-tag"><span className="pulse-dot" /> DEIN NÄCHSTER DIENST</div><div className="hero-date">{next ? dateLabel(next.startsAt, { weekday: "long", day: "numeric", month: "long" }) : "Gemeinsam bereit."}</div><h2>{next?.title ?? "Aktuell keine neuen Termine"}</h2><p>{next ? EVENT_TYPES[next.type] : "Hier findest du deinen nächsten Dienst, sobald er geplant ist."}</p>{next && <><div className="hero-meta"><span><Clock3 size={17} />{timeLabel(next.startsAt)} – {timeLabel(next.endsAt)} Uhr</span><span><MapPin size={17} />{next.location}</span></div><button className="button primary" onClick={() => setSelected(next.id)}>Zum Dienst & Rückmeldung <ArrowRight size={17} /></button></>}</div>
        <div className="hero-art" aria-hidden="true"><div className="art-ring" /><Shield className="art-shield" size={156} strokeWidth={0.65} /><Flame className="art-flame" size={66} strokeWidth={1.3} /><span>GEMEINSAM<br /><strong>EINSATZBEREIT.</strong></span><div className="art-coordinates">51°02′ N &nbsp; 07°07′ O</div></div>
      </section>
      <section className="response-card card"><div className="icon-tile accent"><UsersRound size={23} /></div><div><h2>Dein Team plant mit dir.</h2><p>{open.length ? `${open.length} Termine warten auf deine Rückmeldung. Deine Zusage hilft bei der Planung.` : "Alle offenen Rückmeldungen sind erledigt. Danke fürs Mitplanen!"}</p></div><Link href="/termine?filter=open" className="text-link">Rückmeldungen ansehen <ArrowRight size={17} /></Link><div className="response-bottom"><div className="avatar-stack"><span>LW</span><span>MK</span><span>TH</span></div><small>Jede Rückmeldung zählt.</small></div></section>
    </div>
    <div className="section-heading"><h2>Dein Jahr in Zahlen <span className="year-tag">{year}</span></h2><Link href="/statistik" className="text-link">Zur Statistik <ArrowRight size={16} /></Link></div>
    <div className="metrics"><Metric label="Tatsächliche Teilnahmen" value={stats.attendanceCount} note="Erfasste Anwesenheiten, keine Zusagen" icon={<CheckCheck size={20} />} /><Metric label="Übungsdienst-Quote" value={<>{stats.rate}<small>%</small></>} note={`${stats.attendedPractices} von ${stats.practiceCount} bisherigen Übungen`} icon={<ChartIcon />} /><Metric label="Ausbildungsstunden" value={<>{stats.hours.toLocaleString("de-DE", { maximumFractionDigits: 1 })}<small> h</small></>} note="Aus tatsächlich besuchten Diensten" icon={<Clock3 size={20} />} /><Metric label="Offene Rückmeldungen" value={open.length} note="Deine Planung macht den Unterschied" icon={<CalendarDays size={20} />} /></div>
    <div className="dashboard-lower">
      <section className="card list-card"><div className="section-heading"><h2>Als Nächstes</h2><Link href="/termine" className="text-link">Alle Termine <ArrowRight size={16} /></Link></div><div>{upcoming.slice(0, 3).map((event) => <button key={event.id} className="event-row" onClick={() => setSelected(event.id)}><div className="date-tile"><strong>{dateLabel(event.startsAt, { day: "2-digit", weekday: undefined, month: undefined })}</strong><span>{dateLabel(event.startsAt, { month: "short", day: undefined, weekday: undefined })}</span></div><div className="row-main"><strong>{event.title}</strong><span>{scopeLabel(state, event.scope)} · {timeLabel(event.startsAt)} Uhr</span></div><span className={`badge ${event.responses[user.id] === "yes" ? "success" : ""}`}>{event.responses[user.id] === "yes" ? "Zugesagt" : event.responses[user.id] === "no" ? "Abgesagt" : event.responses[user.id] === "maybe" ? "Vielleicht" : "Offen"}</span><ArrowUpRight size={18} className="muted" /></button>)}{!upcoming.length && <p className="muted">Keine anstehenden Termine.</p>}</div></section>
      <section className="card list-card"><div className="section-heading"><h2>Griffbereit</h2><FolderOpen size={19} className="muted" /></div><p className="muted text-sm">Wichtige Unterlagen an einem Ort.</p>{docs.slice(0, 3).map((doc) => <Link className="document-row" key={doc.id} href="/dokumente"><span className="icon-tile"><FolderOpen size={19} /></span><span><strong>{doc.name}</strong><small>Demo-Dokumentbereich</small></span><ArrowUpRight size={17} /></Link>)}<Link href="/dokumente" className="text-link">Alle Dokumentbereiche <ArrowRight size={16} /></Link></section>
    </div>
    {selected && <EventDetail eventId={selected} close={() => setSelected(null)} />}
  </>;
}
function ChartIcon() { return <span className="mini-bars" aria-hidden="true"><i /><i /><i /><i /></span>; }
