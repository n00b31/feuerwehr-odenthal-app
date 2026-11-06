"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Trash2 } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  readMembersWorkspace, setUnitMembership, setFunctionMembership, changeMemberRole, changeMemberStatus,
} from "@/data/supabase-repository";
import { memberErrorMessage, memberRoleSchema, type MembersWorkspace, type ManagedMember, type MemberRole } from "@/domain/dev-members";
import { dateLabel } from "@/domain/time";
import { DEV_ROLE_LABELS } from "@/config/app";

export function SupabaseMembers({ client, actorId, refreshAccess }: {
  client: SupabaseClient; actorId: string; refreshAccess: () => void;
}) {
  const [workspace, setWorkspace] = useState<MembersWorkspace | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const working = useRef(false);
  const lifetime = useRef({ value: 0 });
  useEffect(() => {
    const epoch = lifetime.current;
    const version = ++epoch.value;
    void readMembersWorkspace(client).then((data) => {
      if (version === epoch.value) setWorkspace(data);
    }).catch((cause: unknown) => { if (version === epoch.value) setError(memberErrorMessage(cause)); });
    return () => { epoch.value++; };
  }, [client]);
  async function reload() {
    const version = lifetime.current.value;
    try {
      const data = await readMembersWorkspace(client);
      if (version === lifetime.current.value) setWorkspace(data);
    } catch (cause) {
      if (version === lifetime.current.value) setWorkspace(null);
      throw cause;
    }
  }
  async function run(operation: () => Promise<void>, success: string, target?: string) {
    if (working.current) return;
    const version = lifetime.current.value;
    working.current = true; setBusy(true); setError(""); setMessage("");
    let committed = false;
    try {
      await operation(); committed = true;
      if (version !== lifetime.current.value) return;
      setMessage(success);
      if (target === actorId) { refreshAccess(); return; }
      if (target) await reload();
    } catch (cause) {
      if (version === lifetime.current.value) setError(`${committed ? "Änderung gespeichert, erneutes Laden fehlgeschlagen: " : ""}${memberErrorMessage(cause)}`);
    } finally { working.current = false; if (version === lifetime.current.value) setBusy(false); }
  }
  return <section className="card section-card">
    <div className="event-card-top"><h2>Mitgliederverwaltung</h2><button className="button secondary" disabled={busy || (!workspace && !error)}
      onClick={() => void run(reload, "Mitgliederliste aktualisiert.")}>Mitglieder aktualisieren</button></div>
    <p>Serverseitig geprüfte Bereiche. Mitgliedschaftshistorie und historische Terminlisten bleiben erhalten.
      Ohne aktuelle Einheit besteht kein Mitgliederzugriff. Mitglied ist die Basisrolle der Freigabe, kein frei entziehbares Administrationsrecht.</p>
    {error && <p role="alert" className="notice error">{error}</p>}
    {message && <p role="status" className="notice">{message}</p>}
    {busy && <p role="status">Mitgliederänderung läuft …</p>}
    {!workspace && !error && <p role="status">Mitglieder werden geladen …</p>}
    {workspace && <>
      {!workspace.global_admin && <p className="notice">Nur eigene Einheiten: bestehende einfache Mitgliedschaften beenden oder wiederherstellen.
        Kein Einheitswechsel nach außerhalb, keine Rollen-, Sonderfunktions- oder Statusänderung. Administratorkonten sind schreibgeschützt.</p>}
      <label>Mitglieder suchen<input type="search" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
      {workspace.members.length === 0 && <p>Keine Mitglieder im berechtigten Bereich.</p>}
      {workspace.members.filter((person) => person.display_name.toLocaleLowerCase("de").includes(search.toLocaleLowerCase("de")))
        .map((person) => <MemberRow key={person.user_id} person={person} workspace={workspace} busy={busy}
          run={(operation, success) => run(operation, success, person.user_id)} client={client} />)}
    </>}
  </section>;
}

function MemberRow({ person, workspace, client, busy, run }: {
  person: ManagedMember; workspace: MembersWorkspace; client: SupabaseClient; busy: boolean;
  run: (operation: () => Promise<void>, success: string) => Promise<void>;
}) {
  const [unit, setUnit] = useState(person.unit_id ?? workspace.units[0]?.id ?? "");
  const [role, setRole] = useState<MemberRole>("UNIT_ADMIN");
  const [scope, setScope] = useState("");
  const [special, setSpecial] = useState("");
  const [reason, setReason] = useState("");
  const ready = !busy && reason.trim().length >= 5;
  const scopeOptions = role === "UNIT_ADMIN" ? workspace.units : role === "FUNCTION_ADMIN" ? workspace.functions : [];
  const canAssign = person.status === "approved" || person.status === "suspended";
  const currentUnit = person.unit_id;
  const requiresScope = role === "UNIT_ADMIN" || role === "FUNCTION_ADMIN";
  const selectionComplete = !requiresScope || !!scope;
  const roleAssigned = selectionComplete && person.roles.some((item) => item.role === role
    && item.unit_id === (role === "UNIT_ADMIN" ? scope : null)
    && item.function_id === (role === "FUNCTION_ADMIN" ? scope : null));
  return <details className="dev-member">
    <summary><strong>{person.display_name}</strong> · {person.unit_name ?? "Ohne aktuelle Einheit"} · {person.status === "approved" ? "Freigegeben" : person.status === "suspended" ? "Deaktiviert" : person.status === "pending" ? "Wartet auf Freigabe" : "Abgelehnt"}</summary>
    <p>{person.access_granted ? "Serverseitiger Zugang aktiv." : "Kein serverseitiger Mitgliederzugriff."}</p>
    <ul>{person.unit_history.map((item, index) => <li key={`${item.unit_id}-${index}`}>{item.unit_name} · seit {dateLabel(item.valid_from, { year: "numeric" })}
      {item.valid_until ? ` · beendet ${dateLabel(item.valid_until, { year: "numeric" })}` : " · aktuell"}</li>)}</ul>
    {(person.can_change_membership || workspace.global_admin) && <label>Änderungsgrund für {person.display_name}<input value={reason}
      onChange={(e) => setReason(e.target.value)} minLength={5} maxLength={2000} disabled={busy} /></label>}
    {person.can_change_membership && <form className="form-grid soft-panel" onSubmit={(e) => {
      e.preventDefault(); void run(() => setUnitMembership(client, person.user_id, unit, true, reason), "Einheitszuordnung gespeichert.");
    }}>
      <label>Einheit für {person.display_name}<select value={unit} onChange={(e) => setUnit(e.target.value)} required disabled={busy}>
        <option value="">Einheit auswählen</option>{workspace.units.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <button className="button" disabled={!ready || !unit || !canAssign}>Einheitszuordnung speichern</button>
      {currentUnit && <button type="button" className="button secondary danger-button" disabled={!ready}
        onClick={() => void run(() => setUnitMembership(client, person.user_id, currentUnit, false, reason), "Mitgliedschaft beendet; Historie erhalten.")}>Aktuelle Mitgliedschaft beenden</button>}
    </form>}
    {workspace.global_admin && <>
      <h3>Rollen für {person.display_name}</h3>
      <ul className="member-role-list" aria-label={`Zugewiesene Rollen für ${person.display_name}`}>{person.roles.map((item) => {
        const assignedRole = item.role;
        const scopeName = item.unit_id ? workspace.units.find((u) => u.id === item.unit_id)?.name ?? item.unit_id
          : item.function_id ? workspace.functions.find((f) => f.id === item.function_id)?.name ?? item.function_id : "";
        return <li className="member-role assigned" key={`${item.role}-${item.unit_id}-${item.function_id}`}>
        <div className="member-role-description"><strong>{DEV_ROLE_LABELS[assignedRole]}{scopeName && ` · ${scopeName}`}</strong>
          <span className="member-role-status"><Check size={18} aria-hidden="true" />Zugewiesen</span>
          {assignedRole === "MEMBER" && <small>Basisrolle · nicht einzeln entziehbar</small>}
        </div>
        {assignedRole !== "MEMBER" && <button className="button secondary danger-button member-role-remove" disabled={!ready} onClick={() => void run(() =>
          changeMemberRole(client, { target_user: person.user_id, wanted_role: assignedRole, target_unit: item.unit_id, target_function: item.function_id, assign: false }),
          "Rollenentzug protokolliert.")}><Trash2 size={18} aria-hidden="true" />Rolle {DEV_ROLE_LABELS[assignedRole]}{scopeName && ` · ${scopeName}`} entfernen</button>}
      </li>; })}</ul>
      <form className="form-grid soft-panel" onSubmit={(e) => {
        e.preventDefault(); void run(() => changeMemberRole(client, {
          target_user: person.user_id, wanted_role: role === "MEMBER" ? "UNIT_ADMIN" : role,
          target_unit: role === "UNIT_ADMIN" ? scope : null, target_function: role === "FUNCTION_ADMIN" ? scope : null, assign: true,
        }), "Rollenzuweisung protokolliert.");
      }}>
        <label>Neue Rolle für {person.display_name}<select value={role} disabled={busy} onChange={(e) => { setRole(memberRoleSchema.parse(e.target.value)); setScope(""); }}>
          {memberRoleSchema.options.filter((item) => item !== "MEMBER").map((item) => <option key={item} value={item}>{DEV_ROLE_LABELS[item]}</option>)}</select></label>
        {(role === "UNIT_ADMIN" || role === "FUNCTION_ADMIN") && <label>Rollenbereich<select value={scope} required disabled={busy} onChange={(e) => setScope(e.target.value)}>
          <option value="">Bereich auswählen</option>{scopeOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
        <div className={`member-role-state ${roleAssigned ? "assigned" : ""}`} role="status">
          {roleAssigned && <Check size={18} aria-hidden="true" />}
          <span>{DEV_ROLE_LABELS[role]} · {!selectionComplete ? "Rollenbereich auswählen" : roleAssigned ? "Bereits zugewiesen" : "Nicht zugewiesen"}</span>
        </div>
        <button className="button secondary" disabled={!ready || !person.access_granted}>Rolle zuweisen</button>
      </form>
      <h3>Sonderfunktionen für {person.display_name}</h3>
      <ul>{person.functions.map((item) => <li key={item.id}>{item.name} <button className="button secondary" disabled={!ready}
        onClick={() => void run(() => setFunctionMembership(client, person.user_id, item.id, false, reason), "Sonderfunktion beendet; Historie erhalten.")}>Sonderfunktion {item.name} entfernen</button></li>)}</ul>
      <form className="form-grid soft-panel" onSubmit={(e) => {
        e.preventDefault(); void run(() => setFunctionMembership(client, person.user_id, special, true, reason), "Sonderfunktion zugeordnet.");
      }}>
        <label>Sonderfunktion<select value={special} onChange={(e) => setSpecial(e.target.value)} required disabled={busy}>
          <option value="">Funktion auswählen</option>{workspace.functions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <button className="button" disabled={!ready || !special || !person.access_granted}>Sonderfunktion zuweisen</button>
      </form>
      {(person.status === "approved" || person.status === "suspended") && <button className="button secondary danger-button" disabled={!ready}
        onClick={() => void run(() => changeMemberStatus(client, person.user_id, person.status === "suspended", reason),
          person.status === "suspended" ? "Mitglied reaktiviert." : "Mitglied deaktiviert.")}>{person.status === "suspended" ? "Mitglied reaktivieren" : "Mitglied deaktivieren"}</button>}
      <p className="muted text-sm">Der letzte aktive globale Administrator ist serverseitig vor Rechteentzug, Deaktivierung und Verlust der letzten Einheit geschützt.
        Einheitswechsel entzieht keine ausdrücklich vergebenen scoped Adminrollen; diese separat prüfen. Reaktivierung erfordert unverändert verifizierte E-Mail und aktuelle Einheit.</p>
    </>}
  </details>;
}
