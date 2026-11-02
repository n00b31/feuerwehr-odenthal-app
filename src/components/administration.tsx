"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { UsersRound, CalendarDays, ClipboardCheck, Plus, Search, ShieldCheck, ArrowRight } from "lucide-react";
import { useDemo } from "./demo-provider";
import { PageHeading, Metric, Empty, Modal } from "./ui";
import { isAdmin, isGlobalAdmin, manageableScopes, manages, scopeLabel } from "@/domain/permissions";
import { dateLabel, timeLabel } from "@/domain/time";
import { ROLE_LABELS } from "@/config/app";
import type { Role, User } from "@/domain/model";
import { EventDetail } from "./event-detail";
import { EventForm } from "./event-form";

export function Administration() {
  const { state, user, now, run } = useDemo();
  const [tab, setTab] = useState("overview");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [memberId, setMemberId] = useState<string | null>(null);
  const [create, setCreate] = useState(false);
  const [functionId, setFunctionId] = useState(manageableScopes(state, user).find((s) => s.kind === "function")?.id ?? "");
  const [candidate, setCandidate] = useState(state.users[0].id);
  if (!isAdmin(user)) return <><PageHeading eyebrow="ADMINISTRATION" title="Dieser Bereich ist deiner Leitung vorbehalten." description="Dein aktuelles Demo-Profil hat keine Administrationsrolle." /><div className="notice">Der ungeschützte Demo-Profilwechsel ist im Profil möglich. Das ist keine produktive Zugriffssicherung.</div><Link className="button secondary" href="/profil">Zum Demo-Profilwechsel</Link></>;
  const events = state.events.filter((e) => manages(user, e.scope));
  const pending = events.filter((e) => e.status !== "cancelled" && Date.parse(e.startsAt) <= now.getTime() && !e.finalizedAt);
  const members = state.users.filter((p) => manages(user, { kind: "unit", id: p.unitId }) || p.functionIds.some((id) => manages(user, { kind: "function", id })));
  const scopes = manageableScopes(state, user);
  const functions = state.functions.filter((f) => manages(user, { kind: "function", id: f.id }));
  const audit = state.audit.filter((a) => {
    if (isGlobalAdmin(user)) return true;
    const event = state.events.find((e) => e.id === a.targetId);
    if (event) return manages(user, event.scope);
    const person = state.users.find((p) => p.id === a.targetId);
    return person && (manages(user, { kind: "unit", id: person.unitId }) || person.functionIds.some((id) => manages(user, { kind: "function", id })));
  });
  return <>
    <PageHeading eyebrow="VERANTWORTUNG ÜBERNEHMEN" title="Administration" description="Dienste organisieren, Anwesenheit festhalten und dein Team unterstützen." action={<button className="button primary" onClick={() => setCreate(true)}><Plus size={18} />Termin erstellen</button>} />
    <div className="notice icon-notice"><ShieldCheck size={23} /><div><strong>{ROLE_LABELS[user.roles[0].role]}</strong><p>Deine Bereiche: {scopes.map((s) => scopeLabel(state, s)).join(" · ")}. Alle Aktionen sind lokale Demo-Änderungen, keine serverseitig gesicherten Zugriffe.</p></div></div>
    <div className="tabs admin-tabs">{[["overview", "Übersicht"], ["members", "Mitglieder"], ["audit", "Änderungsprotokoll"], ...(isGlobalAdmin(user) ? [["settings", "Globale Einstellungen"]] : [])].map(([value, name]) => <button key={value} className={tab === value ? "active" : ""} onClick={() => setTab(value)}>{name}</button>)}</div>
    {tab === "overview" && <>
      <div className="metrics three"><Metric label="Mitglieder im Bereich" value={members.length} note="Aktuelle Einheiten- / Funktionszuordnung" icon={<UsersRound size={20} />} /><Metric label="Verwaltete Termine" value={events.length} note="In deinen Administrationsbereichen" icon={<CalendarDays size={20} />} /><Metric label="Offene Anwesenheitslisten" value={pending.length} note="Begonnene Dienste ohne Abschluss" icon={<ClipboardCheck size={20} />} /></div>
      <section className="card list-card"><div className="section-heading"><h2>Anwesenheit erfassen</h2><span className="badge warning">{pending.length} offen</span></div>{pending.length ? pending.sort((a, b) => b.startsAt.localeCompare(a.startsAt)).map((event) => <button className="admin-event-row" key={event.id} onClick={() => setSelected(event.id)}><span className="icon-tile"><ClipboardCheck size={20} /></span><span className="row-main"><strong>{event.title}</strong><span>{dateLabel(event.startsAt, { year: "numeric" })} · {scopeLabel(state, event.scope)}</span></span><ArrowRight size={19} /></button>) : <Empty title="Alle begonnenen Listen sind abgeschlossen." />}</section>
      <section className="card list-card"><h2>Termine verwalten</h2><p className="muted text-sm">Termine öffnen, einzelne Serieninstanzen bearbeiten oder absagen. Abgeschlossene Anwesenheiten lassen sich mit Korrekturgrund berichtigen.</p><div className="table-scroll"><table><thead><tr><th>Termin</th><th>Bereich</th><th>Datum</th><th>Status</th><th><span className="sr-only">Aktion</span></th></tr></thead><tbody>{events.slice().sort((a, b) => b.startsAt.localeCompare(a.startsAt)).map((e) => <tr key={e.id}><th>{e.title}{e.seriesId && <small>Unabhängige Serieninstanz</small>}</th><td>{scopeLabel(state, e.scope)}</td><td>{dateLabel(e.startsAt, { year: "numeric" })}</td><td>{e.status === "cancelled" ? "Abgesagt" : e.finalizedAt ? "Abgeschlossen" : "Geplant / offen"}</td><td><button className="button secondary small" onClick={() => setSelected(e.id)} aria-label={`${e.title} verwalten`}>Verwalten</button></td></tr>)}</tbody></table></div></section>
    </>}
    {tab === "members" && <>
      <div className="card list-card"><div className="section-heading"><h2>Dein Mitgliederbereich</h2><span className="badge">{members.length} Personen</span></div><label className="search-field"><Search size={18} /><input type="search" aria-label="Mitglieder suchen" placeholder="Name oder Einheit suchen" value={search} onChange={(e) => setSearch(e.target.value)} /></label><div className="table-scroll"><table><thead><tr><th>Name</th><th>Einheit</th><th>Sonderfunktionen</th><th>Rollen</th><th><span className="sr-only">Aktion</span></th></tr></thead><tbody>{members.filter((p) => `${p.name} ${state.units.find((u) => u.id === p.unitId)?.name}`.toLowerCase().includes(search.toLowerCase())).map((p) => <tr key={p.id}><th>{p.name}</th><td>{state.units.find((u) => u.id === p.unitId)?.name}</td><td>{p.functionIds.map((id) => state.functions.find((f) => f.id === id)?.name).join(", ") || "—"}</td><td>{p.roles.map((r) => ROLE_LABELS[r.role]).join(", ")}</td><td><button className="button secondary small" onClick={() => setMemberId(p.id)} aria-label={`${p.name} bearbeiten`}>Bearbeiten</button></td></tr>)}</tbody></table></div></div>
      {functions.length > 0 && <section className="card list-card"><h2>Person einer Funktion zuordnen</h2><p className="muted text-sm">Mehrfachzuordnungen sind möglich. Bereits angelegte Teilnehmerlisten bleiben unverändert.</p><form className="form-grid" onSubmit={(e) => { e.preventDefault(); run({ type: "functionMember", userId: candidate, functionId, assigned: true }); }}><label>Funktion<select value={functionId} onChange={(e) => setFunctionId(e.target.value)}>{functions.map((f) => <option value={f.id} key={f.id}>{f.name}</option>)}</select></label><label>Demo-Person<select value={candidate} onChange={(e) => setCandidate(e.target.value)}>{state.users.map((p) => <option value={p.id} key={p.id}>{p.name} · {state.units.find((u) => u.id === p.unitId)?.name}</option>)}</select></label><div className="form-actions span-2"><button className="button primary" type="submit">Funktion zuordnen</button></div></form></section>}
    </>}
    {tab === "audit" && <section className="card list-card"><h2>Demo-Änderungsprotokoll</h2><p className="notice">Lokal gespeichert, durch Browserwerkzeuge veränderbar und nicht revisionssicher. Für Produktion sind serverseitige, unveränderbare und aufbewahrungsbezogene Audit-Einträge erforderlich.</p>{audit.length ? <div className="audit-list">{audit.map((entry) => <article key={entry.id}><span className="audit-dot" /><div><div className="section-heading"><strong>{entry.action}</strong><small>{dateLabel(entry.at, { year: "numeric" })} · {timeLabel(entry.at)}</small></div><p>{entry.detail}</p><small className="muted">{state.users.find((p) => p.id === entry.actorId)?.name} · Ziel: {entry.targetId}</small></div></article>)}</div> : <Empty title="Noch keine Änderungen in deinem Bereich." />}</section>}
    {tab === "settings" && isGlobalAdmin(user) && <GlobalSettings />}
    {selected && <EventDetail eventId={selected} close={() => setSelected(null)} />}
    {create && <EventForm close={() => setCreate(false)} />}
    {memberId && <MemberForm member={state.users.find((p) => p.id === memberId)!} close={() => setMemberId(null)} />}
  </>;
}

function MemberForm({ member, close }: { member: User; close: () => void }) {
  const { state, user, run } = useDemo();
  const [unitId, setUnitId] = useState(member.unitId);
  const [roles, setRoles] = useState<Role[]>(member.roles);
  const [error, setError] = useState("");
  const global = isGlobalAdmin(user);
  const units = state.units.filter((u) => manages(user, { kind: "unit", id: u.id }));
  const functions = state.functions.filter((f) => manages(user, { kind: "function", id: f.id }));
  const hasRole = (role: Role) => roles.some((r) => JSON.stringify(r) === JSON.stringify(role));
  function toggle(role: Role) { setRoles(hasRole(role) ? roles.filter((r) => JSON.stringify(r) !== JSON.stringify(role)) : [...roles, role]); }
  function saveRoles(e: FormEvent) { e.preventDefault(); if (!run({ type: "roles", userId: member.id, roles })) setError("Rollen nicht gespeichert. Fehlermeldung unten beachten."); }
  return <Modal title={`${member.name} · Zuordnungen`} close={close}><p className="muted text-sm">Fiktive Demo-Person · historische Teilnehmerlisten und Anwesenheiten bleiben unverändert. Neue Zuordnungen wirken auf künftig neu erstellte Termine.</p>
    {units.some((u) => u.id === member.unitId) && <form onSubmit={(e) => { e.preventDefault(); if (run({ type: "member", userId: member.id, unitId, functionIds: member.functionIds })) setError(""); else setError("Einheitszuordnung nicht gespeichert."); }}><label>Einheit<select value={unitId} onChange={(e) => setUnitId(e.target.value)}>{units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label><button className="button secondary" type="submit">Einheitszuordnung speichern</button></form>}
    {functions.length > 0 && <section className="soft-panel"><h3>Sonderfunktionen</h3>{functions.map((f) => <label className="checkbox-label" key={f.id}><input type="checkbox" checked={member.functionIds.includes(f.id)} onChange={(e) => run({ type: "functionMember", userId: member.id, functionId: f.id, assigned: e.target.checked })} />{f.name}</label>)}</section>}
    {global && <form onSubmit={saveRoles}><h3>Rollen zentral vergeben</h3><p className="muted text-sm">Mehrere Rollen mit unabhängigen Geltungsbereichen sind möglich.</p>{([{ role: "MEMBER" }, { role: "GLOBAL_ADMIN" }, ...state.units.map((u) => ({ role: "UNIT_ADMIN", scopeId: u.id })), ...state.functions.map((f) => ({ role: "FUNCTION_ADMIN", scopeId: f.id }))] as Role[]).map((role) => <label className="checkbox-label" key={JSON.stringify(role)}><input type="checkbox" checked={hasRole(role)} onChange={() => toggle(role)} />{ROLE_LABELS[role.role]}{"scopeId" in role ? ` · ${scopeLabel(state, { kind: role.role === "UNIT_ADMIN" ? "unit" : "function", id: role.scopeId })}` : ""}</label>)}<button className="button primary" type="submit">Rollen speichern</button></form>}
    {error && <p className="error" role="alert">{error}</p>}
  </Modal>;
}

function GlobalSettings() {
  const { state, run } = useDemo();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"addUnit" | "addFunction">("addFunction");
  return <div className="profile-grid"><section className="card list-card"><h2>Einheiten konfigurieren</h2><p className="muted text-sm">Fachlogik referenziert IDs, keine fest verdrahteten Einheitsnamen.</p>{state.units.map((unit) => <form className="inline-form" key={unit.id} onSubmit={(e) => { e.preventDefault(); const data = new FormData(e.currentTarget); run({ type: "renameUnit", unitId: unit.id, name: String(data.get("name")) }); }}><label className="grow">{unit.id}<input name="name" required minLength={2} maxLength={80} defaultValue={unit.name} aria-label={`Name ${unit.name}`} /></label><button className="button secondary" type="submit">Speichern</button></form>)}</section><section className="card list-card"><h2>Einheit oder Sonderfunktion hinzufügen</h2><form onSubmit={(e) => { e.preventDefault(); if (run({ type: kind, name })) setName(""); }}><label>Art<select value={kind} onChange={(e) => setKind(e.target.value as "addUnit" | "addFunction")}><option value="addFunction">Sonderfunktion</option><option value="addUnit">Einheit</option></select></label><label>Name<input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={80} /></label><button className="button primary" type="submit"><Plus size={17} />Anlegen</button></form><h3 className="mt-6">Aktive Sonderfunktionen</h3><div className="detail-tags">{state.functions.map((f) => <span className="badge" key={f.id}>{f.name}</span>)}</div><p className="muted text-sm">Die Demo hat keine künstliche Begrenzung auf fünf Einheiten oder 250 Benutzer. Die Anfangsdaten enthalten fünf Einheiten mit je 50 Personen.</p></section></div>;
}
