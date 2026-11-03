"use client";

import { useState } from "react";
import { Plus, MapPin, Clock3, ArrowRight, Search } from "lucide-react";
import { useDemo } from "./demo-provider";
import { PageHeading, Empty } from "./ui";
import { isAdmin, seesEvent, scopeLabel } from "@/domain/permissions";
import { dateLabel, timeLabel } from "@/domain/time";
import { EVENT_TYPES } from "@/config/app";
import { EventDetail } from "./event-detail";
import { EventForm } from "./event-form";
import { DateTile, EventType, ResponseBadge } from "./event-parts";

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
    <PageHeading eyebrow="GEMEINSAM PLANEN" title="Dein Dienstplan" description="Alle Dienste, klare Rückmeldungen. Zeiten in Europe/Berlin." action={isAdmin(user) && <button className="button primary" onClick={() => setCreate(true)}><Plus size={18} />Termin erstellen</button>} />
    <div className="card filter-panel"><div className="tabs" role="group" aria-label="Terminansicht">{[["upcoming", "Anstehend"], ["open", "Rückmeldung offen"], ["past", "Vergangen"], ["all", "Alle Termine"]].map(([value, name]) => <button key={value} aria-pressed={filter === value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{name}</button>)}</div><div className="filters"><label className="search-field"><Search size={18} /><input type="search" aria-label="Termine suchen" placeholder="Dienst suchen …" value={search} onChange={(e) => setSearch(e.target.value)} /></label><select aria-label="Dienstart filtern" value={type} onChange={(e) => setType(e.target.value)}><option value="">Alle Dienstarten</option>{Object.entries(EVENT_TYPES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><select aria-label="Bereich filtern" value={scope} onChange={(e) => setScope(e.target.value)}><option value="">Alle sichtbaren Bereiche</option>{[...new Set(visible.map((e) => scopeLabel(state, e.scope)))].map((s) => <option key={s}>{s}</option>)}</select></div></div>
    <div className="result-label">{events.length} {events.length === 1 ? "Termin" : "Termine"} <span>· Uhrzeiten in Europe/Berlin</span></div>
    <div className="card event-list">{events.map((event) => <button className={`event-list-item ${event.status === "cancelled" ? "cancelled" : ""}`} key={event.id} onClick={() => setSelected(event.id)}>
      <DateTile at={event.startsAt} />
      <span className="event-list-main"><span className="event-list-date">{dateLabel(event.startsAt, { weekday: "long", year: "numeric" })} · {scopeLabel(state, event.scope)}{event.seriesId && " · Serie"}</span><h2>{event.title}</h2><EventType type={event.type} /><span className="event-list-meta"><span><Clock3 size={16} aria-hidden="true" />{timeLabel(event.startsAt)} – {timeLabel(event.endsAt)} Uhr</span><span><MapPin size={16} aria-hidden="true" />{event.location}</span></span></span>
      <span className="event-list-status"><ResponseBadge event={event} userId={user.id} now={now} /><span className="muted text-sm">{event.finalizedAt ? "Anwesenheit abgeschlossen" : Date.parse(event.startsAt) <= now.getTime() && Date.parse(event.endsAt) > now.getTime() ? "Dienst läuft" : "Details & Rückmeldung"}</span></span><ArrowRight className="event-list-arrow" size={19} aria-hidden="true" />
    </button>)}</div>
    {!events.length && <Empty title="Hier ist alles aufgeräumt.">Für diese Auswahl gibt es keine Termine. Versuche einen anderen Filter.</Empty>}
    {selected && <EventDetail eventId={selected} close={() => setSelected(null)} />}
    {create && <EventForm close={() => setCreate(false)} />}
  </>;
}
