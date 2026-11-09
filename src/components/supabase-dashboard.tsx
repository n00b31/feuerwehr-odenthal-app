"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowUpRight, CalendarDays, Check, ChevronRight, Clock3, FileText, HelpCircle, MapPin, Minus, RefreshCw, Truck, UserRound, X } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Access } from "@/data/supabase-repository";
import { setEventResponse } from "@/data/supabase-repository";
import { readDashboard } from "@/data/supabase-dashboard";
import { dashboardCanReply, dashboardEventHref, dashboardGreeting, type DashboardData } from "@/domain/dashboard";
import { eventErrorMessage, responsePresentation, type DevResponse } from "@/domain/dev-events";
import { dateLabel, timeLabel } from "@/domain/time";
import { reportNumber, reportRate } from "@/domain/dev-reports";

function CockpitSection({ id, title, action, children, className = "" }: {
  id: string; title: string; action?: ReactNode; children: ReactNode; className?: string;
}) {
  return <section className={`cockpit-section ${className}`} aria-labelledby={`cockpit-${id}`}>
    <div className="cockpit-section-heading"><h2 id={`cockpit-${id}`}>{title}</h2>{action}</div>{children}
  </section>;
}
const taskLabels = {
  registrations: "Registrierungen prüfen", attendance: "Anwesenheitslisten abschließen",
  organizer: "Dienstleitung zuweisen", vehicles: "Fahrzeuganfragen prüfen",
};
export function SupabaseDashboard({ client, access }: { client: SupabaseClient; access: Access }) {
  const [snapshot, setSnapshot] = useState<DashboardData | null>(null);
  const [error, setError] = useState(""), [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false), [elapsed, setElapsed] = useState(0);
  const [hour, setHour] = useState<number | null>(null);
  const epoch = useRef({ value: 0 }), anchor = useRef(0), working = useRef(false);
  const reload = useCallback(async (retainedError = "") => {
    const version = ++epoch.current.value;
    try {
      const data = await readDashboard(client, access.user_id);
      if (version !== epoch.current.value) return;
      anchor.current = performance.now(); setElapsed(0); setSnapshot(data); setError(retainedError);
    } catch (cause) {
      if (version !== epoch.current.value) return;
      setSnapshot(null);
      const readError = cause && typeof cause === "object" && "code" in cause && cause.code === "PGRST202"
        ? "Cockpit noch nicht verfügbar. Die geprüfte DEV-Migration 034 und das API-Schema prüfen."
        : eventErrorMessage(cause);
      setError([retainedError, readError].filter(Boolean).join(" "));
    }
  }, [client, access.user_id]);
  useEffect(() => {
    const lifetime = epoch.current;
    if (!working.current) void reload();
    const timer = window.setInterval(() => { if (!document.hidden && !working.current) void reload(); }, 30_000);
    return () => { lifetime.value++; window.clearInterval(timer); };
  }, [reload, access]);
  useEffect(() => {
    const tick = () => { setHour(new Date().getHours()); setElapsed(Math.max(0, performance.now() - anchor.current)); };
    tick(); const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, []);
  async function reply(answer: DevResponse) {
    if (working.current || !snapshot?.next_service) return;
    working.current = true; epoch.current.value++; setBusy(true); setError(""); setMessage("");
    try {
      await setEventResponse(client, snapshot.next_service.id, answer);
      setMessage("Rückmeldung in Supabase gespeichert. Sie ist keine bestätigte Anwesenheit.");
      await reload();
    } catch (cause) {
      await reload(eventErrorMessage(cause));
    } finally { working.current = false; setBusy(false); }
  }
  const next = snapshot?.next_service;
  const now = snapshot ? Date.parse(snapshot.server_now) + elapsed : 0;
  const style = responsePresentation(next?.own_response ?? null);
  const StatusIcon = next?.own_response === "yes" ? Check : next?.own_response === "no" ? X : next?.own_response === "maybe" ? HelpCircle : Minus;
  const shortcuts = [
    { href: "/termine/", label: "Termine", icon: CalendarDays },
    { href: "/termine/?bereich=kalender", label: "Gemeinsamer Kalender", icon: CalendarDays },
    ...(snapshot?.vehicles_visible ? [{ href: "/termine/?bereich=fahrzeuge", label: "Fahrzeugkalender", icon: Truck }] : []),
    { href: "/profil/", label: "Mein Dienstbuch", icon: FileText },
    { href: "/dokumente/", label: "Dokumente", icon: FileText },
  ];
  return <div className="cockpit">
    <header className="cockpit-header">
      <div><p className="eyebrow">Mein Feuerwehr-Cockpit</p>
        <h1>{hour === null ? `Hallo, ${access.display_name.trim().split(/\s+/)[0]}` : dashboardGreeting(access.display_name, hour)}</h1>
        <p>{snapshot ? snapshot.units.map(unit => unit.name).join(" · ") : access.unit_name}
          {!!snapshot?.functions.length && <span className="cockpit-functions"> · {snapshot.functions.map(item => item.name).join(" · ")}</span>}</p>
      </div>
      <div className="cockpit-header-actions">
        <Link href="/profil/" className="icon-button" aria-label="Mein Profil öffnen"><UserRound size={20} /></Link>
        <button className="icon-button" aria-label="Cockpit aktualisieren" disabled={busy} onClick={() => void reload()}><RefreshCw size={20} /></button>
      </div>
    </header>
    {error && <p className="notice error" role="alert">{error}</p>}
    {message && <p className="notice" role="status">{message}</p>}
    {!snapshot && !error && <div className="cockpit-loading" role="status">Dein Cockpit wird sicher geladen …</div>}
    {snapshot && <div className="cockpit-grid">
      <CockpitSection id="next" title="Dein nächster Übungsdienst" className={`cockpit-next ${style.className}`}>
        {next ? <>
          <div className="cockpit-date"><CalendarDays size={18} /><time dateTime={next.starts_at}>{dateLabel(next.starts_at, { year: "numeric" })}</time></div>
          <h3>{next.title}</h3>
          <div className="cockpit-event-meta"><span><Clock3 size={17} />{timeLabel(next.starts_at)} – {timeLabel(next.ends_at)}</span>
            <span><MapPin size={17} />{next.location}</span></div>
          <p className="muted text-sm">{next.scope_name} · Europe/Berlin</p>
          <p className={`cockpit-response ${style.className}`}><StatusIcon size={18} aria-hidden="true" />{style.label}</p>
          <div className="cockpit-replies">{([["yes", "Ich komme", Check], ["no", "Ich kann nicht", X], ["maybe", "Vielleicht", HelpCircle]] as const).map(([answer, label, Icon]) =>
            <button key={answer} className={`button secondary ${responsePresentation(answer).className}`}
              aria-pressed={next.own_response === answer} disabled={busy || !dashboardCanReply(next, now)}
              onClick={() => void reply(answer)}><Icon size={18} aria-hidden="true" />{label}</button>)}</div>
          {!dashboardCanReply(next, now) && <p className="muted text-sm">Rückmeldung gesperrt: Beginn, Anmeldeschluss oder festgestellter Teilnehmerkreis. Supabase prüft jede Änderung erneut.</p>}
          <Link className="cockpit-inline-link" href={dashboardEventHref(next.id)}>Termindetails <ArrowUpRight size={17} /></Link>
        </> : <div className="cockpit-empty"><CalendarDays size={28} /><h3>Raum für den nächsten Dienst</h3>
          <p>Aktuell ist kein zukünftiger Übungsdienst für deinen Teilnehmerkreis geplant.</p>
          <Link className="cockpit-inline-link" href="/termine/">Termine öffnen <ArrowUpRight size={17} /></Link></div>}
      </CockpitSection>
      <CockpitSection id="responses" title="Offene Rückmeldungen" className="cockpit-open">
        <p className="cockpit-count"><strong>{snapshot.open_count}</strong> {snapshot.open_count === 1 ? "Rückmeldung offen" : "Rückmeldungen offen"}</p>
        {snapshot.open_events.length ? <ul className="cockpit-list">{snapshot.open_events.map(item => <li key={item.id}>
          <Link href={dashboardEventHref(item.id)}><span><strong>{item.title}</strong><small>{dateLabel(item.starts_at)} · {timeLabel(item.starts_at)} · {item.scope_name}</small></span><ChevronRight size={18} /></Link>
        </li>)}</ul> : <p className="muted">Alles im Blick. Zurzeit wartet kein beantwortbarer Dienst auf deine Rückmeldung.</p>}
      </CockpitSection>
      {!!snapshot.tasks.length && <CockpitSection id="tasks" title="Meine offenen Aufgaben" className="cockpit-tasks">
        <ul className="cockpit-list">{snapshot.tasks.map(task => <li key={task.kind}>
          <Link href={task.kind === "registrations" ? "/administration/" : task.target
            ? dashboardEventHref(task.target, task.kind === "vehicles" ? "fahrzeuge" : "dienste", task.kind === "attendance" || task.kind === "organizer" ? task.kind : undefined)
            : "/termine/"}><span><strong>{task.count} · {taskLabels[task.kind]}</strong><small>In deinem berechtigten Verantwortungsbereich</small></span><ChevronRight size={18} /></Link>
        </li>)}</ul>
      </CockpitSection>}
      <CockpitSection id="information" title="Aktuelle Informationen" className="cockpit-information">
        {snapshot.information.length ? <ul className="cockpit-list">{snapshot.information.map(item => <li key={item.id}>
          <Link href={dashboardEventHref(item.id, "kalender")}><span><strong>{item.title}</strong><small>{dateLabel(item.starts_at)} · {item.scope_name}</small></span><ArrowUpRight size={18} /></Link>
        </li>)}</ul> : <p className="muted">Aktuell gibt es keine für dich sichtbaren organisatorischen Hinweise oder Termine.</p>}
      </CockpitSection>
      <CockpitSection id="year" title={`Mein Feuerwehrjahr ${snapshot.year}`} className="cockpit-year"
        action={<FileText size={20} aria-hidden="true" />}>
        {snapshot.statistics.services === 0 ? <p className="muted">Noch keine bestätigten Dienste für dieses Jahr. Zusagen zählen nicht als Anwesenheit.</p> :
          <dl className="cockpit-metrics"><div><dt>Bestätigte Teilnahmen</dt><dd>{snapshot.statistics.present}</dd></div>
            <div><dt>Ausbildungsstunden</dt><dd>{reportNumber(snapshot.statistics.training_hours)}<small> h</small></dd></div>
            <div><dt>Anwesenheitsquote</dt><dd className={snapshot.statistics.rate === null ? "cockpit-rate-empty" : ""}>{reportRate(snapshot.statistics.rate)}</dd></div></dl>}
        <p className="muted text-sm">Nur abgeschlossene, bestätigte Anwesenheitslisten · zentrale Dienstbuchauswertung.</p>
        <Link className="cockpit-inline-link" href="/profil/">Mein Dienstbuch öffnen <ArrowUpRight size={17} /></Link>
      </CockpitSection>
      <CockpitSection id="vehicles" title="Meine Fahrzeugreservierungen" className="cockpit-vehicles">
        {snapshot.reservations.length ? <ul className="cockpit-list">{snapshot.reservations.map(item => <li key={item.id}>
          <Link href={dashboardEventHref(item.id, "fahrzeuge")}><span><strong>{item.vehicle_name}</strong>
            <small>{dateLabel(item.starts_at)} · {timeLabel(item.starts_at)}</small>
            <span className={`badge ${item.state === "APPROVED" ? "success" : "warning"}`}>{item.state === "APPROVED" ? <Check size={16} /> : <Clock3 size={16} />}
              {item.state === "APPROVED" ? "Genehmigt" : "Anfrage offen · unverbindlich"}</span></span><ChevronRight size={18} /></Link>
        </li>)}</ul> : <p className="muted">Keine aktuellen eigenen Reservierungen oder offenen Anfragen.</p>}
      </CockpitSection>
      <CockpitSection id="shortcuts" title="Schnellzugriffe" className="cockpit-shortcuts">
        <div className="cockpit-shortcut-links">{shortcuts.map(({ href, label, icon: Icon }) =>
          <Link key={href} href={href}><Icon size={20} aria-hidden="true" /><span>{label}</span><ArrowUpRight size={16} /></Link>)}</div>
      </CockpitSection>
    </div>}
  </div>;
}
