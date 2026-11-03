"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Clock3, FolderOpen, MapPin, Info, Timer } from "lucide-react";
import { useDemo } from "./demo-provider";
import { Empty, PageHeading } from "./ui";
import { isPractice, personalStatistics } from "@/domain/statistics";
import { seesDocument, seesEvent, scopeLabel } from "@/domain/permissions";
import { berlinParts, dateLabel, timeLabel } from "@/domain/time";
import { EventDetail } from "./event-detail";
import { DateTile, EventType, ResponseBadge } from "./event-parts";
import { ResponsePicker } from "./response-picker";

export function Dashboard() {
  const { state, user, now } = useDemo();
  const [selected, setSelected] = useState<string | null>(null);
  const year = berlinParts(now).year;
  const stats = personalStatistics(state, user.id, year, now);
  const visible = state.events.filter((event) => seesEvent(user, event) && event.status !== "cancelled");
  const upcoming = visible.filter((event) => Date.parse(event.startsAt) > now.getTime()).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const open = upcoming.filter((event) => event.roster.some((person) => person.userId === user.id) && !event.responses[user.id] && (!event.deadline || Date.parse(event.deadline) > now.getTime()))
    .sort((a, b) => (a.deadline ?? a.startsAt).localeCompare(b.deadline ?? b.startsAt));
  const next = upcoming.find(isPractice) ?? upcoming[0];
  const running = visible.find((event) => Date.parse(event.startsAt) <= now.getTime() && Date.parse(event.endsAt) > now.getTime());
  const deadline = open.find((event) => event.deadline);
  const docs = state.documents.filter((doc) => seesDocument(user, doc));

  return <>
    <PageHeading eyebrow={`EINHEIT ${state.units.find((unit) => unit.id === user.unitId)?.name.toLocaleUpperCase("de-DE")}`} title={`Hallo ${user.name.split(" ")[0]}.`} description="Dein Dienst auf einen Blick." />
    <div className="dashboard-top">
      <section className="next-service card" aria-label="Dein nächster Dienst">
        <div className="hero-heading"><span className="eyebrow">{next && isPractice(next) ? "NÄCHSTER ÜBUNGSDIENST" : "NÄCHSTER TERMIN"}</span>{next && <ResponseBadge event={next} userId={user.id} now={now} />}</div>
        {next ? <>
          <div className="hero-title"><DateTile at={next.startsAt} /><div><p className="hero-date">{dateLabel(next.startsAt, { weekday: "long", year: "numeric" })}</p><h2>{next.title}</h2></div></div>
          <EventType type={next.type} />
          <div className="hero-meta"><span><Clock3 size={18} aria-hidden="true" />{timeLabel(next.startsAt)} – {timeLabel(next.endsAt)} Uhr</span><span><MapPin size={18} aria-hidden="true" />{next.location}</span></div>
          <div className="hero-response"><div className="section-heading"><h3>Deine Rückmeldung</h3><span className="muted text-sm">Nur Planung</span></div><ResponsePicker event={next} direct /></div>
          <button className="text-link hero-details" onClick={() => setSelected(next.id)}>Zum Dienst & Rückmeldung <ArrowRight size={17} aria-hidden="true" /></button>
        </> : <Empty title="Aktuell kein weiterer Dienst geplant.">Neue Termine erscheinen hier, sobald sie angelegt sind.</Empty>}
      </section>
      <section className="card list-card open-responses">
        <div className="section-heading"><h2>{open.length ? "Rückmeldungen offen" : "Als Nächstes"}</h2><span className={`badge ${open.length ? "warning" : ""}`}>{open.length ? `${open.length} offen` : "Alles erledigt"}</span></div>
        <p className="muted text-sm">{open.length ? "Zuerst die Termine mit der nächsten Rückmeldefrist." : "Danke fürs Mitplanen. Deine nächsten Termine:"}</p>
        <div className="compact-events">{(open.length ? open : upcoming).slice(0, 3).map((event) => <button key={event.id} className="event-row" onClick={() => setSelected(event.id)}>
          <DateTile at={event.startsAt} /><span className="row-main"><strong>{event.title}</strong><span>{dateLabel(event.startsAt)} · {timeLabel(event.startsAt)} Uhr</span><small>{scopeLabel(state, event.scope)}{event.deadline ? ` · Frist ${dateLabel(event.deadline)}` : ""}</small></span><ArrowRight size={17} aria-hidden="true" />
        </button>)}</div>
        {!upcoming.length && <p className="muted text-sm">Keine anstehenden Termine.</p>}
        <Link href="/termine?filter=open" className="text-link">Rückmeldungen ansehen <ArrowRight size={17} aria-hidden="true" /></Link>
      </section>
    </div>
    <section className="service-book" aria-label="Persönliches Dienstbuch">
      <div className="section-heading"><h2>Dein Dienstbuch <span className="year-tag">{year}</span></h2><Link href="/statistik" className="text-link">Zur Statistik <ArrowRight size={16} aria-hidden="true" /></Link></div>
      <dl className="book-metrics"><div><dt>Besuchte Übungen</dt><dd>{stats.attendedPractices}<small> / {stats.confirmedPracticeCount}</small></dd></div><div><dt>Ausbildungsstunden</dt><dd>{stats.hours.toLocaleString("de-DE", { maximumFractionDigits: 1 })}<small> h</small></dd></div><div><dt>Übungsdienst-Quote</dt><dd>{stats.rate}<small> %</small></dd></div></dl>
      <p className="muted text-sm">Nur bestätigte Anwesenheiten – keine Zusagen oder Entwürfe. {stats.pendingCount} offene Listen noch nicht berücksichtigt.</p>
    </section>
    <div className="dashboard-lower">
      <section className="card list-card"><div className="section-heading"><h2>Hinweise für deinen Dienst</h2><Info size={19} aria-hidden="true" /></div>
        {running && <button className="notice-row" onClick={() => setSelected(running.id)}><Clock3 size={20} aria-hidden="true" /><span><strong>Ein Dienst läuft gerade</strong><small>{running.title} · bis {timeLabel(running.endsAt)} Uhr</small></span><ArrowRight size={17} aria-hidden="true" /></button>}
        {deadline?.deadline && <button className="notice-row" onClick={() => setSelected(deadline.id)}><Timer size={20} aria-hidden="true" /><span><strong>Nächster Anmeldeschluss</strong><small>{deadline.title} · {dateLabel(deadline.deadline)} um {timeLabel(deadline.deadline)} Uhr</small></span><ArrowRight size={17} aria-hidden="true" /></button>}
        <div className="notice-row"><FolderOpen size={20} aria-hidden="true" /><span><strong>Unterlagen bleiben in SharePoint</strong><small>Die Demo verlinkt nur Platzhalter. Freigaben werden zusätzlich in SharePoint benötigt.</small></span></div>
        <p className="muted text-sm">Hinweise aus dem vorhandenen Dienstplan. Ein separates Mitteilungsmodul ist nicht enthalten.</p>
      </section>
      <section className="card list-card"><div className="section-heading"><h2>Deine Dokumente</h2><FolderOpen size={19} aria-hidden="true" /></div>
        {docs.slice(0, 3).map((doc) => <Link className="document-row" key={doc.id} href="/dokumente"><span className="icon-tile"><FolderOpen size={19} aria-hidden="true" /></span><span><strong>{doc.name}</strong><small>{scopeLabel(state, doc.scope)}</small></span><ArrowRight size={17} aria-hidden="true" /></Link>)}
        {!docs.length && <p className="muted text-sm">Für dein Profil sind keine Dokumentbereiche hinterlegt.</p>}
        <Link href="/dokumente" className="text-link">Alle Dokumentbereiche <ArrowRight size={16} aria-hidden="true" /></Link>
      </section>
    </div>
    {selected && <EventDetail eventId={selected} close={() => setSelected(null)} />}
  </>;
}
