"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Moon, Sun, LogOut, RefreshCw, ShieldCheck } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabasePublicConfig } from "@/config/supabase";
import { DEV_ROLE_LABELS } from "@/config/app";
import { approveMember, type Access, type DevData, type PendingRegistration } from "@/data/supabase-repository";
import { authErrorMessage, callbackUrl, emailSchema, registrationSchema } from "@/auth/validation";
import { resetAuthCallback, useDevAuth } from "@/auth/use-dev-auth";
import { BrandLogo } from "./branding";
import { useTheme } from "./theme-provider";
import { PageHeading } from "./ui";
import { dateLabel } from "@/domain/time";
import { SupabaseEvents, type EventEditorState } from "./supabase-events";
import { SupabaseMembers } from "./supabase-members";
import { SidebarNavigation, BottomNavigation } from "./navigation";

export function SupabaseDev() {
  const [client, setClient] = useState<SupabaseClient | null>(null);
  const [setupError, setSetupError] = useState("");
  const { screen, refresh, clear } = useDevAuth(client);
  const { resolved, setPreference, error: themeError } = useTheme();
  const pathname = usePathname().replace(/\/+$/, "") || "/";
  const [operationError, setOperationError] = useState("");
  const [busy, setBusy] = useState(false);
  const [eventEditor, setEventEditor] = useState<EventEditorState | null>(null);
  if (eventEditor && (screen.phase === "blocked" || screen.phase === "signed-out" || screen.phase === "error")) setEventEditor(null);

  useEffect(() => {
    let current = true;
    async function initialize() {
      try {
        const { getSupabaseClient } = await import("@/data/supabase-client");
        if (!current) return;
        if (getSupabasePublicConfig().status !== "configured") {
          setSetupError("Project URL und Publishable Key fehlen. Die Anleitung docs/supabase-dev-setup.md beschreibt die Einrichtung des bestehenden Projekts und der GitHub-Variablen.");
          return;
        }
        setClient(getSupabaseClient());
      } catch (error) {
        if (current) setSetupError(error instanceof Error ? error.message : "Supabase DEV konnte nicht initialisiert werden.");
      }
    }
    void initialize();
    return () => { current = false; };
  }, []);

  async function signOut() {
    if (!client) return;
    clear();
    resetAuthCallback();
    setBusy(true);
    setOperationError("");
    try {
      const { error } = await client.auth.signOut({ scope: "local" });
      if (error) throw error;
    } catch (error) {
      setOperationError(authErrorMessage(error));
    } finally {
      setBusy(false);
      refresh();
    }
  }

  const access = screen.phase === "active" || screen.phase === "blocked" ? screen.access : null;
  const active = screen.phase === "active";
  const managesMembers = active && screen.access.roles.some((role) => role === "GLOBAL_ADMIN" || role === "UNIT_ADMIN");
  return <div className="app-shell dev-shell">
    <a className="skip-link" href="#main">Zum Inhalt springen</a>
    {active && <aside className="sidebar"><SidebarNavigation pathname={pathname} unitName={screen.access.unit_name ?? ""}
      admin={managesMembers} logo /></aside>}
    <div className={active ? "main-shell" : "dev-guest-shell"}>
    <header className="topbar">
      <Link href="/" className="header-brand"><BrandLogo /></Link>
      <div className="topbar-actions">
        <button className="icon-button" aria-label="Farbschema wechseln" onClick={() => setPreference(resolved === "dark" ? "light" : "dark")}>{resolved === "dark" ? <Sun size={20} /> : <Moon size={20} />}</button>
        {client && <button className="button secondary" onClick={() => void signOut()} disabled={busy}><LogOut size={18} />Abmelden / Sitzung entfernen</button>}
      </div>
    </header>
    <div className="demo-strip" role="region" aria-label="DEV-Testbetrieb"><span className="demo-tag">DEV</span><span>Supabase-Testbetrieb · nur autorisierte Testkonten · kein Demo-Profilwechsel</span></div>
    <main id="main" className="content" tabIndex={-1}>
      {(themeError || operationError) && <p className="notice error" role="alert">{themeError || operationError}</p>}
      {setupError ? <section className="card section-card"><h1>Supabase DEV noch nicht eingerichtet</h1><p>{setupError}</p><p>Kein Zugriff auf Feuerwehrinhalte. Es wird nicht auf lokale Demo-Identitäten zurückgefallen.</p></section>
        : screen.phase === "loading" ? <p role="status">Sitzung und serverseitige Freigabe werden geprüft …</p>
        : screen.phase === "error" ? <section className="card section-card"><h1>DEV-Zugriff nicht verfügbar</h1><p className="error" role="alert">{screen.error}</p><button className="button" onClick={refresh}>Erneut prüfen</button><p>Ein Fehler öffnet niemals den Mitgliederbereich. Bei einem abgelaufenen Bestätigungslink zuerst die Sitzung entfernen und erneut anmelden.</p></section>
        : screen.phase === "signed-out" && client ? <AuthForm client={client} refresh={refresh} />
        : screen.phase === "blocked" ? <section className="card section-card auth-card">
          <ShieldCheck aria-hidden="true" /><h1>{access?.account_status === "pending" ? "Wartet auf Freigabe" : access?.account_status === "suspended" ? "Zugang gesperrt" : access?.account_status === "rejected" ? "Registrierung abgelehnt" : "Erneute Prüfung erforderlich"}</h1>
          <p>Hallo {screen.access.display_name}. Eine bestätigte E-Mail allein reicht nicht aus. Erst die Administratorfreigabe mit gültiger Einheitszuordnung öffnet den Mitgliederbereich.</p>
          <p>Keine Termine, Dokumente, Rollenlisten oder Statistiken werden geladen. Bei E-Mail-Wechsel oder entfallener Zuordnung ist eine erneute Prüfung nötig.</p>
          <button className="button" onClick={refresh}><RefreshCw size={18} />Freigabestatus prüfen</button>
        </section>
        : screen.phase === "active" && client ? <DevWorkspace client={client} access={screen.access} data={screen.data} pathname={pathname} refresh={refresh} eventEditor={eventEditor} setEventEditor={setEventEditor} />
        : null}
    </main>
    <footer className="footer"><span>Feuerwehr Odenthal · Supabase DEV</span><span>Keine Offline-Freigabe · Europe/Berlin</span></footer>
    </div>
    {active && <BottomNavigation pathname={pathname} admin={managesMembers} />}
  </div>;
}

function AuthForm({ client, refresh }: { client: SupabaseClient; refresh: () => void }) {
  const [register, setRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    setError("");
    const parsed = register ? registrationSchema.safeParse({ email, password, displayName }) : emailSchema.safeParse(email);
    if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
    setBusy(true);
    try {
      if (register) {
        const input = registrationSchema.parse({ email, password, displayName });
        const { data, error } = await client.auth.signUp({
          email: input.email.toLowerCase(), password: input.password,
          options: { data: { display_name: input.displayName }, emailRedirectTo: callbackUrl(window.location.origin) },
        });
        if (error) throw error;
        if (data.session) {
          const signOut = await client.auth.signOut({ scope: "local" });
          if (signOut.error) throw signOut.error;
          setError("E-Mail-Verifizierung ist im Projekt nicht korrekt aktiviert. Administrator muss Confirm email einschalten; der Zugriff bleibt bis zur Freigabe gesperrt.");
        } else {
          setMessage("Wenn die Adresse registriert werden kann, wurde eine Bestätigung angefordert. Bitte E-Mail im selben Browser öffnen. Danach wartest du auf Administratorfreigabe. Der DEV-Mailversand ist auf autorisierte Testadressen begrenzt.");
        }
      } else {
        const { error } = await client.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
        if (error) throw error;
        refresh();
      }
    } catch (error) {
      setError(authErrorMessage(error));
    } finally {
      setPassword("");
      setBusy(false);
    }
  }
  async function resend() {
    setError(""); setMessage("");
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
    setBusy(true);
    try {
      const { error } = await client.auth.resend({ type: "signup", email: parsed.data.toLowerCase(), options: { emailRedirectTo: callbackUrl(window.location.origin) } });
      if (error) throw error;
      setMessage("Bestätigung erneut angefordert, sofern die Adresse berechtigt ist. DEV-Versandlimit beachten.");
    } catch (error) { setError(authErrorMessage(error)); }
    finally { setBusy(false); }
  }
  return <section className="card section-card auth-card">
    <PageHeading eyebrow="SUPABASE DEV" title={register ? "Testkonto registrieren" : "Anmelden"} description="Nur autorisierte Feuerwehr-Testadressen. E-Mail bestätigen und anschließend die Administratorfreigabe abwarten." />
    <form onSubmit={(event) => void submit(event)} className="form-grid">
      {register && <label>Anzeigename (Testdaten)<input autoComplete="nickname" value={displayName} onChange={(event) => setDisplayName(event.target.value)} required minLength={2} maxLength={120} disabled={busy} /></label>}
      <label>Feuerwehr-E-Mail<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required disabled={busy} /></label>
      <label>Passwort<input type="password" autoComplete={register ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} required minLength={register ? 12 : 1} maxLength={128} disabled={busy} /></label>
      <button className="button" disabled={busy}>{busy ? "Anfrage läuft …" : register ? "Registrierung anfordern" : "Anmelden"}</button>
    </form>
    {message && <p className="notice" role="status">{message}</p>}
    {error && <p className="notice error" role="alert">{error}</p>}
    <div className="dev-actions">
      <button className="button secondary" disabled={busy} onClick={() => { setRegister(!register); setError(""); setMessage(""); setPassword(""); }}>{register ? "Zur Anmeldung" : "Testkonto registrieren"}</button>
      <button className="button secondary" disabled={busy} onClick={() => void resend()}>Bestätigung erneut senden</button>
    </div>
    <p className="muted text-sm">Die Domainprüfung im Formular ist nur Bedienhilfe. Auth-Hook, Datenbankfreigabe und RLS sind die serverseitige Zugriffsschranke. Keine produktiven Daten eingeben.</p>
  </section>;
}

function DevWorkspace({ client, access, data, pathname, refresh, eventEditor, setEventEditor }: { client: SupabaseClient; access: Access; data: DevData; pathname: string; refresh: () => void; eventEditor: EventEditorState | null; setEventEditor: (value: EventEditorState | null) => void }) {
  const globalAdmin = access.roles.includes("GLOBAL_ADMIN");
  const managesMembers = globalAdmin || access.roles.includes("UNIT_ADMIN");
  const year = Number(new Intl.DateTimeFormat("en", { year: "numeric", timeZone: "Europe/Berlin" }).format(new Date()));
  const ownAttendance = data.attendance.filter((item) => item.report_year === year);
  return <>
    <PageHeading eyebrow="GESCHÜTZTER DEV-BEREICH" title={pathname === "/administration" ? "Administration" : `Hallo ${access.display_name}`} description={`${access.unit_name} · ${access.roles.map((role) => DEV_ROLE_LABELS[role]).join(", ")} · live durch Supabase geprüft`} action={<button className="button secondary" onClick={refresh}><RefreshCw size={18} />Aktualisieren</button>} />
    <p className="notice">DEV 0.3.4: Termine, Teilnahme, Anwesenheit und Mitgliederverwaltung liegen zentral in Supabase. Hintergrundprüfungen erhalten die Arbeitsansicht. Keine Übernahme lokaler Demo-Daten.</p>
    {pathname === "/administration" ? managesMembers
      ? <>{globalAdmin && <section className="card section-card"><h2>Wartende Testregistrierungen</h2>{data.registrations.length === 0 && <p>Keine wartenden Registrierungen.</p>}{data.registrations.map((person) => <ApprovalRow key={person.user_id} client={client} person={person} units={data.units} refresh={refresh} />)}</section>}
        <SupabaseMembers client={client} actorId={access.user_id} refreshAccess={refresh} /></>
      : <p className="notice error" role="alert">Keine Berechtigung zur Mitgliederverwaltung. Direkte API-Aufrufe werden ebenfalls serverseitig geprüft.</p>
    : pathname === "/dokumente" ? <section className="card section-card"><h2>Dokumentenbereiche</h2><p>App-Sichtbarkeit ersetzt keine SharePoint-Berechtigung.</p>{data.documents.length === 0 && <p>Noch keine sichtbaren DEV-Dokumentenbereiche.</p>}{data.documents.map((item) => <article key={item.id}><h3>{item.name}</h3><p>{item.description}</p><a href={item.sharepoint_url} target="_blank" rel="noopener noreferrer">SharePoint öffnen</a></article>)}</section>
    : pathname === "/statistik" ? <section className="card section-card"><h2>Bestätigte eigene Anwesenheiten {year}</h2><p>{ownAttendance.filter((item) => item.status === "present").length} tatsächliche Teilnahmen · {ownAttendance.reduce((sum, item) => sum + item.training_hours, 0).toFixed(1)} Ausbildungsstunden</p><p>Nur serverseitig bestätigte Listen. Zusagen, vorläufige Werte und unbekannte Anwesenheiten zählen nicht als Teilnahme.</p>{ownAttendance.map((item) => <p key={item.event_id}>{item.title} · {dateLabel(item.starts_at)} · {item.status === "present" ? "Anwesend" : item.status === "absent" ? "Abwesend" : "Nicht festgestellt"}</p>)}</section>
    : pathname === "/profil" ? <section className="card section-card"><h2>Verifiziertes DEV-Profil</h2><p>{access.display_name} · Einheit {access.unit_name}</p><p>Status: Freigegeben. Kein Identitäts- oder Rollenwechsel über lokale Demo-Profile.</p><p>Die Sitzung liegt ausschließlich unter einem projekt- und unterpfadbezogenen SDK-Speicherschlüssel in diesem Browser. Zum Entfernen „Abmelden / Sitzung entfernen“ verwenden.</p></section>
    : <SupabaseEvents client={client} initial={data} preferredUnit={access.unit_id} editor={eventEditor} setEditor={setEventEditor} />}
  </>;
}

function ApprovalRow({ client, person, units, refresh }: { client: SupabaseClient; person: PendingRegistration; units: DevData["units"]; refresh: () => void }) {
  const [unit, setUnit] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function approve(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      await approveMember(client, person.user_id, unit);
      refresh();
    } catch (error) { setError(authErrorMessage(error)); }
    finally { setBusy(false); }
  }
  return <form className="dev-approval" onSubmit={(event) => void approve(event)}>
    <h3>{person.display_name}</h3><p>{person.email} · {person.email_verified ? "E-Mail bestätigt" : "E-Mail noch nicht bestätigt"}</p>
    <label>Einheit für {person.display_name}<select value={unit} onChange={(event) => setUnit(event.target.value)} required disabled={busy || !person.email_verified}><option value="">Einheit bewusst auswählen</option>{units.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    <button className="button" disabled={busy || !person.email_verified || !unit}>{busy ? "Freigabe läuft …" : `${person.display_name} freigeben`}</button>
    {error && <p className="error" role="alert">{error}</p>}
  </form>;
}
