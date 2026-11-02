"use client";

import { useState, type FormEvent } from "react";
import { FolderOpen, ArrowUpRight, Plus, ShieldCheck, Link2, Search } from "lucide-react";
import { useDemo } from "./demo-provider";
import { PageHeading, Modal, ScopeSelect, Empty } from "./ui";
import { isAdmin, manageableScopes, scopeLabel, seesDocument } from "@/domain/permissions";
import type { Scope } from "@/domain/model";

export function Documents() {
  const { state, user } = useDemo();
  const [create, setCreate] = useState(false);
  const [search, setSearch] = useState("");
  const [placeholder, setPlaceholder] = useState(false);
  const docs = state.documents.filter((d) => seesDocument(user, d) && `${d.name} ${d.description}`.toLowerCase().includes(search.toLowerCase()));
  return <>
    <PageHeading eyebrow="WISSEN TEILEN" title="Deine Dokumentbereiche" description="Unterlagen für deinen Dienst. Übersichtlich nach Einheit und Funktion." action={isAdmin(user) && <button className="button primary" onClick={() => setCreate(true)}><Plus size={18} />Bereich hinzufügen</button>} />
    <div className="notice icon-notice"><ShieldCheck size={24} /><div><strong>Eine Übersicht, kein Dokumentenspeicher.</strong><p>Die App verlinkt auf SharePoint. Sichtbarkeit in der App ersetzt keine SharePoint-Berechtigung. Alle vorinstallierten Links sind ausdrücklich nicht aufrufbare Demo-Platzhalter.</p></div></div>
    <label className="search-field standalone-search"><Search size={18} /><input type="search" placeholder="Dokumentbereich suchen …" aria-label="Dokumentbereich suchen" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
    <div className="document-grid">{docs.map((doc) => {
      const demo = new URL(doc.url).hostname === "example.invalid";
      return <article className="card document-card" key={doc.id}><div className="event-card-top"><span className="large-icon"><FolderOpen size={28} strokeWidth={1.5} /></span><span className={`badge ${demo ? "warning" : ""}`}>{demo ? "Demo-Platzhalter" : "Externer Link"}</span></div><h2>{doc.name}</h2><p>{doc.description}</p><div className="detail-tags"><span className="badge">{scopeLabel(state, doc.scope)}</span>{doc.visibility === "admins" && <span className="badge">Nur Administration</span>}</div><div className="doc-link">{demo ? <button className="text-link" onClick={() => setPlaceholder(true)}><Link2 size={17} />Demo-Link erklären <ArrowUpRight size={17} /></button> : <a className="text-link" href={doc.url} target="_blank" rel="noopener noreferrer">SharePoint-Freigabelink öffnen <ArrowUpRight size={17} /></a>}</div></article>;
    })}</div>
    {!docs.length && <Empty title="Kein sichtbarer Dokumentbereich">Für dein aktuelles Profil und diese Suche sind keine Bereiche vorhanden.</Empty>}
    {create && <DocumentForm close={() => setCreate(false)} />}
    {placeholder && <Modal title="Hier würde SharePoint öffnen" close={() => setPlaceholder(false)}><p>Dieser Bereich enthält keine echten Dokumente. Die Adresse unter <code>example.invalid</code> ist bewusst nicht erreichbar.</p><p>Später trägt die Administration einen echten SharePoint-Freigabelink ein. Zugriffe und Freigaben müssen zusätzlich in SharePoint eingerichtet werden.</p><button className="button primary" onClick={() => setPlaceholder(false)}>Verstanden</button></Modal>}
  </>;
}
function DocumentForm({ close }: { close: () => void }) {
  const { state, user, run } = useDemo();
  const [scope, setScope] = useState<Scope>(manageableScopes(state, user)[0]);
  const [error, setError] = useState("");
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    if (run({ type: "addDocument", input: {
      name: String(data.get("name")).trim(), description: String(data.get("description")).trim(),
      url: String(data.get("url")).trim(), scope, visibility: data.get("visibility") === "admins" ? "admins" : "members",
    } })) close();
    else setError("Bereich nicht gespeichert. Bitte Fehlermeldung unten beachten.");
  }
  return <Modal title="Dokumentbereich hinzufügen" close={close}><form className="form-grid" onSubmit={submit}><label className="span-2">Name<input required minLength={3} maxLength={120} name="name" /></label><label className="span-2">Beschreibung<textarea name="description" rows={3} maxLength={1000} /></label><ScopeSelect value={scope} onChange={setScope} /><label>Sichtbarkeit<select name="visibility"><option value="members">Mitglieder des Bereichs</option><option value="admins">Nur Administration des Bereichs</option></select></label><label className="span-2">SharePoint-Freigabelink<input name="url" type="url" required defaultValue="https://example.invalid/sharepoint/neuer-bereich" /></label><p className="notice span-2">Nur HTTPS-Adressen unter *.sharepoint.com und Demo-Platzhalter unter example.invalid sind erlaubt. Keine Dokumente oder Zugangsdaten werden hochgeladen.</p>{error && <p className="error span-2" role="alert">{error}</p>}<div className="form-actions span-2"><button type="button" className="button secondary" onClick={close}>Abbrechen</button><button type="submit" className="button primary">Bereich speichern</button></div></form></Modal>;
}
