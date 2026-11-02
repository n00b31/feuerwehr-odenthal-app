"use client";

import { useState } from "react";
import { UserRound, ShieldCheck, RotateCcw, Smartphone, Info } from "lucide-react";
import { useDemo } from "./demo-provider";
import { PageHeading, Modal } from "./ui";
import { ROLE_LABELS } from "@/config/app";
import { dateLabel } from "@/domain/time";
import { scopeLabel } from "@/domain/permissions";

export function Profile() {
  const { state, user, selectProfile, reset } = useDemo();
  const [confirm, setConfirm] = useState(false);
  const [search, setSearch] = useState("");
  const named = state.users.slice(0, 4);
  return <>
    <PageHeading eyebrow="DEIN PROFIL" title="Ein Teil des Teams." description="Deine Zuordnung, deine Rollen und die Einstellungen dieser lokalen Demo." />
    <div className="profile-grid">
      <section className="card list-card"><div className="profile-identity"><span className="large-icon"><UserRound size={32} /></span><div><h2>{user.name}</h2><p className="muted">{user.email}</p><span className="badge warning">Fiktive Demo-Person</span></div></div><dl className="profile-details"><div><dt>Einheit</dt><dd>{state.units.find((u) => u.id === user.unitId)?.name}</dd></div><div><dt>Sonderfunktionen</dt><dd>{user.functionIds.length ? user.functionIds.map((id) => state.functions.find((f) => f.id === id)?.name).join(", ") : "Keine zugeordnet"}</dd></div><div><dt>Rollen und Geltungsbereiche</dt><dd>{user.roles.map((r, i) => <span className="role-line" key={i}>{ROLE_LABELS[r.role]}{"scopeId" in r ? ` · ${scopeLabel(state, { kind: r.role === "UNIT_ADMIN" ? "unit" : "function", id: r.scopeId })}` : ""}</span>)}</dd></div></dl><h3>Einheitshistorie</h3>{user.memberships.map((m, i) => <p className="text-sm muted" key={i}>{state.units.find((u) => u.id === m.unitId)?.name} · seit {dateLabel(m.from, { year: "numeric", weekday: undefined })}{m.until ? ` bis ${dateLabel(m.until, { year: "numeric", weekday: undefined })}` : " · aktuell"}</p>)}</section>
      <section className="card list-card"><div className="section-heading"><h2>Demo-Profil wechseln</h2><ShieldCheck size={21} /></div><p className="notice">Dies ist ausdrücklich keine Anmeldung. Jede Person am Gerät kann alle Demo-Rollen auswählen. Keine echten personenbezogenen Daten eingeben.</p><div className="persona-list">{named.map((p) => <button key={p.id} aria-pressed={p.id === user.id} className={`persona ${p.id === user.id ? "selected" : ""}`} onClick={() => selectProfile(p.id)}><span className="avatar">{p.name.split(" ").map((n) => n[0]).join("")}</span><span><strong>{p.name}</strong><small>{ROLE_LABELS[p.roles[0].role]}</small></span><span className="persona-radio" /></button>)}</div><label>Weitere Demo-Personen suchen<input value={search} onChange={(e) => setSearch(e.target.value)} type="search" placeholder="Name oder Einheit" /></label><label>Aktives Demo-Profil<select value={user.id} onChange={(e) => selectProfile(e.target.value)}>{state.users.filter((p) => p.id === user.id || `${p.name} ${state.units.find((u) => u.id === p.unitId)?.name}`.toLowerCase().includes(search.toLowerCase())).map((p) => <option key={p.id} value={p.id}>{p.name} · {state.units.find((u) => u.id === p.unitId)?.name}</option>)}</select></label></section>
      <section className="card list-card"><div className="section-heading"><h2>App auf deinem Gerät</h2><Smartphone size={22} /></div><p>Manifest, App-Symbole und ein Service Worker mit Offline-Hinweisseite sind vorbereitet. In unterstützten Browsern über „Zum Home-Bildschirm“ oder „App installieren“ hinzufügen.</p><p className="muted text-sm">Installation benötigt localhost oder HTTPS. Der Dienstplan ist nicht vollständig offline verfügbar. Änderungen liegen nur im Browser-Speicher dieses Ursprungs; keine Synchronisation zwischen Geräten.</p></section>
      <section className="card list-card"><div className="section-heading"><h2>Demo zurücksetzen</h2><RotateCcw size={21} /></div><p>Erzeugt aktuelle Demodaten neu. Alle lokal erfassten Zusagen, Anwesenheiten, Termine, Dokumentbereiche und Einstellungen werden entfernt.</p><p className="muted text-sm">Datenbasis vom {state.seedDate} · {state.users.length} fiktive Personen · {state.units.length} Einheiten</p><button className="button danger-button" onClick={() => setConfirm(true)}>Demo-Daten zurücksetzen</button></section>
    </div>
    <div className="notice icon-notice"><Info size={24} /><div><strong>Produktive Registrierung ist noch nicht implementiert.</strong><p>Geplant: Entra External ID, verifizierte E-Mail @feuerwehr-odenthal.de, manuelle Adminfreigabe und Einheitszuordnung. Vor Freigabe kein Zugriff. Eine E-Mail-Endung allein ist keine sichere Identitätsprüfung.</p></div></div>
    {confirm && <Modal title="Lokale Demo wirklich zurücksetzen?" close={() => setConfirm(false)}><p>Diese Aktion entfernt alle Änderungen dieser Demo auf diesem Browser-Ursprung. Es gibt keine Wiederherstellung.</p><div className="form-actions"><button className="button secondary" onClick={() => setConfirm(false)}>Abbrechen</button><button className="button danger-button" onClick={() => { reset(); setConfirm(false); }}>Ja, Demo zurücksetzen</button></div></Modal>}
  </>;
}
