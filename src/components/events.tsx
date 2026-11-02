"use client";

import { useState } from "react";
import { Plus, CalendarDays, MapPin, Clock3, ArrowUpRight, Search } from "lucide-react";
import { useDemo } from "./demo-provider";
import { PageHeading, Empty } from "./ui";
import { isAdmin, seesEvent, scopeLabel } from "@/domain/permissions";
import { dateLabel, timeLabel } from "@/domain/time";
import { EVENT_TYPES, RESPONSE_LABELS } from "@/config/app";
import { EventDetail } from "./event-detail";
import { EventForm } from "./event-form";

export function Events() {
  const { state, user, now } = useDemo();
  const [filter, setFilter] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("filter") === "open" ? "open" : "upcoming");
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [scope, setScope] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [create, setCreate] = useState(false);
  const visible = state.events.filter((e) => seesEvent(user, e));
  const events = visible.filter((e) => {
    const future = Date.parse(e.startsAt) > now.getTime();
    const live = !future && Date.parse(e.endsAt) > now.getTime();
    return e.title.toLowerCase().includes(search.toLowerCase()) && (!type || e.type === type) &&
      (!scope || scopeLabel(state, e.scope) === scope) &&
      (filter === "all" || (filter === "upcoming" ? (future || live) && e.status !== "cancelled" :
        filter === "past" ? !future && !live :
          future && e.status !== "cancelled" && e.roster.some((p) => p.userId === user.id) && !e.responses[user.id] && (!e.deadline || Date.parse(e.deadline) > now.getTime())));
  }).sort((a, b) => filter === "past" ? b.startsAt.localeCompare(a.startsAt) : a.startsAt.localeCompare(b.startsAt));
  return <>
    <PageHeading eyebrow="GEMEINSAM PLANEN" title="Dein Dienstplan" description="Wissen, was ansteht. Rückmeldung geben. Gemeinsam bereit sein." action={isAdmin(user) && <button className="button primary" onClick={() => setCreate(true)}><Plus size={18} />Termin erstellen</button>} />
    <div className="card filter-panel"><div className="tabs">{[["upcoming", "Anstehend"], ["open", "Rückmeldung offen"], ["past", "Vergangen"], ["all", "Alle Termine"]].map(([value, name]) => <button key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{name}</button>)}</div><div className="filters"><label className="search-field"><Search size={18} /><input type="search" aria-label="Termine suchen" placeholder="Dienst suchen …" value={search} onChange={(e) => setSearch(e.target.value)} /></label><select aria-label="Dienstart filtern" value={type} onChange={(e) => setType(e.target.value)}><option value="">Alle Dienstarten</option>{Object.entries(EVENT_TYPES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><select aria-label="Bereich filtern" value={scope} onChange={(e) => setScope(e.target.value)}><option value="">Alle sichtbaren Bereiche</option>{[...new Set(visible.map((e) => scopeLabel(state, e.scope)))].map((s) => <option key={s}>{s}</option>)}</select></div></div>
    <div className="result-label">{events.length} {events.length === 1 ? "Termin" : "Termine"} <span>· Uhrzeiten in Europe/Berlin</span></div>
    <div className="event-grid">{events.map((event) => <button className={`card event-card ${event.status === "cancelled" ? "cancelled" : ""}`} key={event.id} onClick={() => setSelected(event.id)}><div className="event-card-top"><span className="badge">{EVENT_TYPES[event.type]}</span><ArrowUpRight size={18} /></div><div className="event-card-date"><CalendarDays size={16} />{dateLabel(event.startsAt, { weekday: "long", year: "numeric" })}</div><h2>{event.title}</h2><p className="muted text-sm">{scopeLabel(state, event.scope)}{event.seriesId && " · Serie"}</p><div className="event-card-meta"><span><Clock3 size={16} />{timeLabel(event.startsAt)} – {timeLabel(event.endsAt)} Uhr</span><span><MapPin size={16} />{event.location}</span></div><div className="event-card-bottom"><span className={`badge ${event.status === "cancelled" ? "danger" : event.responses[user.id] === "yes" ? "success" : Date.parse(event.startsAt) <= now.getTime() ? "" : "warning"}`}>{event.status === "cancelled" ? "Termin abgesagt" : event.responses[user.id] ? RESPONSE_LABELS[event.responses[user.id]] : Date.parse(event.startsAt) <= now.getTime() ? "Rückmeldung gesperrt" : "Rückmeldung offen"}</span><span className="muted text-sm">{event.finalizedAt ? "Anwesenheit abgeschlossen" : Date.parse(event.startsAt) <= now.getTime() && Date.parse(event.endsAt) > now.getTime() ? "Dienst läuft" : "Details ansehen"}</span></div></button>)}</div>
    {!events.length && <Empty title="Hier ist alles aufgeräumt.">Für diese Auswahl gibt es keine Termine. Versuche einen anderen Filter.</Empty>}
    {selected && <EventDetail eventId={selected} close={() => setSelected(null)} />}
    {create && <EventForm close={() => setCreate(false)} />}
  </>;
}
