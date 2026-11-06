"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BookOpen, CalendarDays, Check, Clock3, Download, Percent, RefreshCw, Users, X } from "lucide-react";
import { EVENT_TYPES } from "@/config/app";
import type { Access } from "@/data/supabase-repository";
import { readReportsContext, readYearReport, setReportingType } from "@/data/supabase-reports";
import { reportCsv, reportError, reportNumber, reportRate, reportQuerySchema, type ReportEvent, type ReportExport,
  type ReportMetrics, type ReportQuery, type ReportsContext, type ReportScope, type YearReport } from "@/domain/dev-reports";
import { dateLabel } from "@/domain/time";
import { AppDialog } from "./app-dialog";
import { Empty, Metric } from "./ui";

type Filters = { scope: ReportScope; target: string; year: number | null; type: keyof typeof EVENT_TYPES | ""; page: number };
const initialFilters: Filters = { scope: "personal", target: "", year: null, type: "", page: 0 };

export function SupabaseReports({ client, access, personalOnly = false }: {
  client: SupabaseClient; access: Access; personalOnly?: boolean;
}) {
  const [context, setContext] = useState<ReportsContext | null>(null);
  const [filters, setFilters] = useState(initialFilters);
  const [loaded, setLoaded] = useState<{ key: string; report: YearReport } | null>(null);
  const [contextError, setContextError] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [reload, setReload] = useState(0);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("name");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const exportRequest = useRef<AbortController | null>(null);
  const query: ReportQuery | null = context ? {
    wanted_year: filters.year ?? context.current_year, report_scope: filters.scope,
    target_scope: filters.target || null, wanted_type: filters.type || null,
    page_number: filters.page, export_all: false,
  } : null;
  const queryKey = JSON.stringify(query);
  const report = loaded?.key === queryKey ? loaded.report : null;
  const selected = report?.events.find((event) => event.event_id === selectedId);
  const targets = !context ? [] : filters.scope === "personal" ? context.personal_units
    : filters.scope === "function" ? context.functions : context.units;
  const authorized = !!context && (filters.scope === "personal"
    ? !filters.target || context.personal_units.some((unit) => unit.id === filters.target)
    : filters.scope === "organization" ? context.organization && (!filters.target || context.units.some((unit) => unit.id === filters.target))
    : targets.some((scope) => scope.id === filters.target));

  useEffect(() => {
    let current = true;
    async function load() {
      try {
        const next = await readReportsContext(client);
        if (current) { setContext(next); setContextError(""); }
      } catch (reason) {
        if (current) { setContext(null); setLoaded(null); setContextError(reportError(reason)); }
      }
    }
    void load();
    return () => { current = false; exportRequest.current?.abort(); };
  }, [client, access, reload]);

  useEffect(() => {
    let current = true;
    async function load() {
      if (queryKey === "null") return;
      setBusy(true); setError("");
      try {
        const request = reportQuerySchema.parse(JSON.parse(queryKey));
        if (!authorized) throw new Error("Berichtsberechtigung geändert oder kein Bereich gewählt. Bitte einen berechtigten Bereich auswählen.");
        const next = await readYearReport(client, request);
        if (current) setLoaded({ key: queryKey, report: next });
      } catch (reason) {
        if (current) { setLoaded(null); setError(reportError(reason)); }
      } finally { if (current) setBusy(false); }
    }
    void load();
    return () => { current = false; };
  }, [client, access, queryKey, authorized, reload]);

  function change(next: Partial<Filters>) {
    setSelectedId(null);
    setFilters((previous) => ({ ...previous, ...next, page: next.page ?? 0 }));
  }
  async function download(kind: ReportExport) {
    if (!query) return;
    const controller = new AbortController();
    exportRequest.current?.abort(); exportRequest.current = controller;
    setExporting(true); setError("");
    try {
      const current = await readYearReport(client, { ...query, export_all: true, page_number: 0 }, controller.signal);
      controller.signal.throwIfAborted();
      const url = URL.createObjectURL(new Blob([reportCsv(current, kind)], { type: "text/csv;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url; link.download = `feuerwehr-dienstbuch-${current.scope}-${current.year}-${kind}.csv`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (reason) { setLoaded(null); setError(reportError(reason)); }
    finally { setExporting(false); }
  }

  const members = report?.members.filter((member) => member.name.toLocaleLowerCase("de-DE").includes(search.toLocaleLowerCase("de-DE")))
    .sort((a, b) => sort === "name" ? a.name.localeCompare(b.name, "de-DE")
      : sort === "rate" ? (a.metrics.rate === null && b.metrics.rate === null ? a.name.localeCompare(b.name, "de-DE")
        : a.metrics.rate === null ? 1 : b.metrics.rate === null ? -1 : b.metrics.rate - a.metrics.rate)
      : sort === "hours" ? b.metrics.training_hours - a.metrics.training_hours
      : b.metrics.training_present - a.metrics.training_present) ?? [];
  return <section className="dutybook" aria-label="Digitales Feuerwehr-Dienstbuch">
    <div className="section-heading"><div><div className="eyebrow">BESTÄTIGTE ANWESENHEIT · SUPABASE</div>
      <h2>{filters.scope === "personal" ? "Mein Dienstbuch" : filters.scope === "organization" ? "Wehrleiter-Dashboard" : "Jahresstatistik"}</h2></div>
      <button className="button secondary" onClick={() => setReload((value) => value + 1)} disabled={exporting}><RefreshCw size={17} />Bericht aktualisieren</button>
    </div>
    {(contextError || error) && <div className="notice error" role="alert">{contextError || error}
      <button className="button secondary" onClick={() => setReload((value) => value + 1)}>Erneut laden</button>
      {filters.scope !== "personal" && <button className="button secondary" onClick={() => change({ scope: "personal", target: "" })}>Mein Dienstbuch öffnen</button>}
    </div>}
    {!context && !contextError && <p role="status">Berichtsberechtigungen werden geprüft …</p>}
    {context && <>
      <div className="card filter-panel"><div className="filters">
        {!personalOnly && <label>Berichtsansicht<select value={filters.scope} disabled={exporting}
          onChange={(event) => {
            const scope = event.target.value as ReportScope;
            change({ scope, target: scope === "unit" ? context.units[0]?.id ?? "" : scope === "function" ? context.functions[0]?.id ?? "" : "" });
          }}>
          <option value="personal">Mein Dienstbuch</option>
          {context.units.length>0 && <option value="unit">Jahresstatistik der Einheit</option>}
          {context.functions.length>0 && <option value="function">Statistik der Sonderfunktion</option>}
          {context.organization && <option value="organization">Wehrleiter-Dashboard</option>}
        </select></label>}
        <label>Berichtsjahr<select value={filters.year ?? context.current_year} disabled={exporting}
          onChange={(event) => change({ year: Number(event.target.value) })}>
          {context.years.map((year) => <option key={year} value={year}>{year}</option>)}
        </select></label>
        {(filters.scope !== "personal" || context.personal_units.length>1) && <label>{filters.scope === "function" ? "Sonderfunktion" : "Einheit"}
          <select value={filters.target} disabled={exporting} onChange={(event) => change({ target: event.target.value })}>
            {["personal","organization"].includes(filters.scope) && <option value="">Alle Einheiten</option>}
            {targets.map((target) => <option key={target.id} value={target.id}>{target.name}</option>)}
          </select></label>}
        <label>Terminart<select value={filters.type} disabled={exporting}
          onChange={(event) => change({ type: event.target.value as Filters["type"] })}>
          <option value="">Alle Terminarten</option>
          {context.event_types.map((type) => <option key={type.event_type} value={type.event_type}>{EVENT_TYPES[type.event_type]}</option>)}
        </select></label>
      </div></div>
      {busy && <p className="muted text-sm" role="status">Bericht wird aktualisiert; Auswahl und geöffnete Details bleiben erhalten …</p>}
      {report && authorized && <>
        <ReportCards report={report} />
        <div className="notice"><strong>Nachvollziehbare Jahreszahlen</strong>
          <p>Nur begonnene, nicht abgesagte Dienste mit abgeschlossener oder korrigierter Liste. Ausbildungsquote: bestätigte Teilnahmen / relevante Personen-Dienste. Mitgliedschaft und Funktion gelten zum Dienstbeginn; die Einheit stammt aus dem historischen Teilnehmerstand. Mehrfachfunktionen erzeugen keine zusätzlichen Teilnahmen.</p>
          <p>Stunden entsprechen der geplanten Termindauer (verstrichene Zeit); keine individuelle Zeiterfassung. Ausbildung: {context.event_types.filter((type) => type.is_training_relevant).map((type) => EVENT_TYPES[type.event_type]).join(", ") || "keine Terminart"}. Andere Tätigkeitsmodule und PDF-Berichte sind noch nicht implementiert.</p>
          <p>Mitgliederzahlen berücksichtigen Zeiträume im Berichtsjahr, nicht nur den heutigen Bestand. Einheitszahlen können sich bei einem Wechsel überschneiden; die Organisationszahl zählt Personen und Dienste jeweils nur einmal. Die Quote ist nach Personen-Diensten gewichtet, kein Mittelwert von Einheitsquoten.</p>
          <p>{report.summary.pending} offene Listen sind ausgeschlossen. Änderungen bestätigter Anwesenheiten fließen beim nächsten Laden automatisch ein.</p>
        </div>
        {(report.summary.unknown>0 || report.summary.excluded>0 || report.summary.missing_roster>0) && <p className="notice warning" role="alert">
          Unvollständige Daten: {report.summary.unknown} ungeklärte Anwesenheiten, {report.summary.missing_roster} fehlende Teilnehmereinträge,
          {" "}{report.summary.excluded} ungültige Zuordnungen oder Zeitangaben. Diese werden nicht als Abwesenheit gewertet.
          Ungültige Datensätze sind aus Kennzahlen ausgeschlossen; bei ungeklärter Ausbildung oder ungültigen Daten wird keine verlässliche Quote angezeigt.
        </p>}
        <div className="form-actions"><button className="button secondary" disabled={exporting || busy} onClick={() => void download("summary")}><Download size={17} />Kennzahlen als CSV</button>
          <button className="button secondary" disabled={exporting || busy} onClick={() => void download("events")}><Download size={17} />Dienste als CSV</button>
          {["unit","function"].includes(filters.scope) && <button className="button secondary" disabled={exporting || busy} onClick={() => void download("members")}>Mitglieder als CSV</button>}
          {filters.scope === "organization" && <button className="button secondary" disabled={exporting || busy} onClick={() => void download("units")}>Einheiten als CSV</button>}
        </div>
        <p className="muted text-sm">UTF-8-CSV mit Excel-Trennzeichen, deutschen Zahlen und Zeiten in Europe/Berlin. Der Export lädt alle berechtigten Dienste des gewählten Jahres/Filters erneut serverseitig, nicht nur diese Seite.</p>
        {report.units.length>0 && <section className="card section-card"><h3>Einheiten im Vergleich</h3><div className="table-scroll" tabIndex={0} role="region" aria-label="Einheitsvergleich horizontal scrollen"><table>
          <caption className="sr-only">Einheitsvergleich {report.year}</caption><thead><tr><th>Einheit</th><th>Mitglieder</th><th>Ausbildungen</th><th>Quote</th><th>Teilnehmerstunden</th></tr></thead>
          <tbody>{report.units.map((unit) => <tr key={unit.id}><th scope="row">{unit.name}</th><td>{unit.members}</td><td>{unit.metrics.training_services}</td>
            <td>{reportRate(unit.metrics.rate)}{unit.metrics.rate !== null && <div className="bar-track" aria-hidden="true"><i style={{ width: `${unit.metrics.rate}%` }} /></div>}</td>
            <td>{reportNumber(unit.metrics.participant_hours)} h</td></tr>)}</tbody></table></div></section>}
        {["unit","function"].includes(filters.scope) && <section className="card section-card"><h3>Mitgliederübersicht</h3>
          <div className="filters"><label>Mitglied suchen<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
            <label>Mitglieder sortieren<select value={sort} onChange={(event) => setSort(event.target.value)}>
              <option value="name">Name</option><option value="attendance">Teilnahmen absteigend</option><option value="rate">Quote absteigend</option><option value="hours">Ausbildungsstunden absteigend</option>
            </select></label></div>
          <div className="table-scroll" tabIndex={0} role="region" aria-label="Mitgliederübersicht horizontal scrollen"><table><caption className="sr-only">Berechtigte Mitglieder im Bericht {report.year}</caption>
            <thead><tr><th>Name</th><th>Relevante Dienste</th><th>Teilnahmen</th><th>Fehlzeiten</th><th>Quote</th><th>Ausbildungsstunden</th></tr></thead>
            <tbody>{members.map((member) => <tr key={member.user_id}><th scope="row">{member.name}</th><td>{member.metrics.training_services}</td>
              <td>{member.metrics.training_present}</td><td>{member.metrics.training_absent}</td><td>{reportRate(member.metrics.rate)}</td><td>{reportNumber(member.metrics.training_hours)} h</td></tr>)}</tbody>
          </table></div>{members.length===0 && <p>Keine passenden Mitglieder im gewählten Zeitraum.</p>}
        </section>}
        <section className="card section-card"><div className="section-heading"><h3>{filters.scope === "personal" ? "Meine Diensthistorie" : "Abgeschlossene Dienste"}</h3>
          <span className="year-tag">{report.event_count} Dienste · {report.year}</span></div>
          {report.events.length===0 ? <Empty title="Keine abgeschlossenen Dienste für diese Auswahl">
            Es wird keine Anwesenheitsquote erfunden. Ein anderes Berichtsjahr oder einen anderen Filter auswählen.
          </Empty> : <div className="table-scroll" tabIndex={0} role="region" aria-label="Diensthistorie horizontal scrollen"><table><caption className="sr-only">Bestätigte Dienste, neueste zuerst</caption>
            <thead><tr><th>Datum / Dienst</th><th>Einheit / Bereich</th><th>Dauer</th><th>{filters.scope === "personal" ? "Eigener Status" : "Anwesend / Abwesend"}</th><th>Details</th></tr></thead>
            <tbody>{report.events.map((event) => <tr key={event.event_id}><th scope="row">{dateLabel(event.starts_at, { year: "numeric" })}<small>{event.title} · {EVENT_TYPES[event.event_type]}</small></th>
              <td>{event.unit_name}</td><td>{event.hours === null ? "Ungültige Zeit" : `${reportNumber(event.hours)} h`}</td>
              <td>{filters.scope === "personal" ? <AttendanceLabel event={event} /> : `${event.metrics.present} / ${event.metrics.absent}`}</td>
              <td><button className="button secondary" aria-label={`Dienst öffnen: ${event.title}`} onClick={() => setSelectedId(event.event_id)}>Öffnen</button></td></tr>)}</tbody>
          </table></div>}
          <div className="form-actions"><button className="button secondary" disabled={busy || filters.page===0} onClick={() => change({ page: filters.page-1 })}>Vorherige Seite</button>
            <span>Seite {report.page+1}</span><button className="button secondary" disabled={busy || !report.has_more} onClick={() => change({ page: filters.page+1 })}>Nächste Seite</button></div>
        </section>
      </>}
      {!personalOnly && context.configure && <details className="card section-card"><summary>Ausbildungsrelevanz verwalten</summary>
        <p>Nur globale Administration. Eine Änderung gilt ausdrücklich für alle Berichtsjahre dieser Terminart und wird mit Begründung protokolliert. Anwesenheiten und ursprüngliche Terminarten bleiben unverändert.</p>
        {context.event_types.map((type) => <ReportingType key={type.event_type} client={client} type={type}
          changed={() => setReload((value) => value+1)} />)}
      </details>}
    </>}
    {selected && authorized && <AppDialog title={selected.title} close={() => setSelectedId(null)}>
      <p>{EVENT_TYPES[selected.event_type]} · {selected.unit_name}</p>
      <p>Beginn: {dateLabel(selected.starts_at, { year: "numeric" })}<br />Ende: {dateLabel(selected.ends_at, { year: "numeric" })}</p>
      <p>Dauer: {selected.hours === null ? "Ungültige Zeit" : `${reportNumber(selected.hours)} h`} · {selected.training ? "Ausbildungsrelevant" : "Keine Ausbildung"}</p>
      {filters.scope === "personal" ? <AttendanceLabel event={selected} /> : <p>{selected.metrics.present} anwesend · {selected.metrics.absent} abwesend · {reportNumber(selected.metrics.participant_hours)} Teilnehmerstunden</p>}
      <p>Abgeschlossen: {dateLabel(selected.confirmed_at, { year: "numeric" })}{selected.corrected_at && <> · Korrigiert: {dateLabel(selected.corrected_at, { year: "numeric" })}</>}</p>
      <p className="muted">Nur lesbare Berichtsinformationen. Einzelanwesenheiten anderer Mitglieder können hier weder eingesehen noch verändert werden.</p>
    </AppDialog>}
  </section>;
}

function AttendanceLabel({ event }: { event: ReportEvent }) {
  return <span className={`badge ${event.own_status === "present" ? "success" : event.own_status === "absent" ? "danger" : "neutral"}`}>
    {event.own_status === "present" ? <Check size={16} aria-hidden="true" /> : event.own_status === "absent" ? <X size={16} aria-hidden="true" /> : null}
    {event.own_status === "present" ? "Anwesend" : event.own_status === "absent" ? "Abwesend" : "Nicht festgestellt"}
  </span>;
}
function ReportCards({ report }: { report: YearReport }) {
  const s: ReportMetrics = report.summary;
  const personal = report.scope === "personal";
  return <div className="metrics dutybook-metrics">
    {!personal && <Metric label="Mitglieder im Berichtsjahr" value={report.summary.members} note="Historisch, eindeutig je Person" icon={<Users size={20} />} />}
    {!personal && <Metric label="Durchgeführte Übungsdienste" value={s.practices} note="Reguläre Dienste und Sonderübungen" icon={<CalendarDays size={20} />} />}
    {report.scope === "organization" && <Metric label="Einheiten im Bericht" value={report.units.length} note="Gesamtwerte ohne Doppelzählungen" icon={<Users size={20} />} />}
    <Metric label={personal ? "Relevante abgeschlossene Dienste" : "Ausbildungsrelevante Dienste"} value={s.training_services} note="Nur bestätigte Ausbildungslisten" icon={<CalendarDays size={20} />} />
    {personal && <Metric label="Besuchte Ausbildungsdienste" value={s.training_present} note="Tatsächlich bestätigt anwesend" icon={<Check size={20} />} />}
    {personal && <Metric label="Nicht besuchte Ausbildungsdienste" value={s.training_absent} note="Bestätigt abwesend, nicht unbekannt" icon={<X size={20} />} />}
    {!personal && <Metric label="Ø Anwesende je Dienst" value={s.average_attendance === null ? "—" : reportNumber(s.average_attendance)} note={`${s.services} abgeschlossene Dienste aller Arten`} icon={<Users size={20} />} />}
    <Metric label="Ausbildungsquote" value={s.rate === null ? "—" : reportRate(s.rate)} note={s.rate === null ? "Keine verlässliche Quote / keine Daten" : `${s.training_present} von ${s.eligible} relevanten Personen-Diensten`} icon={<Percent size={20} />} />
    <Metric label="Ausbildungsstunden" value={`${reportNumber(personal ? s.training_hours : s.service_hours)} h`} note={personal ? "Eigene bestätigte Ausbildungszeit" : "Summe der angebotenen Dienstdauern"} icon={<Clock3 size={20} />} />
    <Metric label={personal ? "Dokumentierte Dienststunden" : "Gesamte Teilnehmerstunden"} value={`${reportNumber(s.participant_hours)} h`} note="Alle bestätigten Dienstarten, nur Anwesende" icon={<BookOpen size={20} />} />
  </div>;
}
function ReportingType({ client, type, changed }: {
  client: SupabaseClient; type: ReportsContext["event_types"][number]; changed: () => void;
}) {
  const [relevant, setRelevant] = useState<boolean | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const value = relevant ?? type.is_training_relevant;
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!window.confirm("Diese Ausbildungszuordnung ändert auch historische Jahresberichte dieser Terminart. Wirklich mit Begründung speichern?")) return;
    setBusy(true); setError("");
    try { await setReportingType(client, type.event_type, value, reason); setRelevant(null); setReason(""); changed(); }
    catch (failure) { setError(reportError(failure)); }
    finally { setBusy(false); }
  }
  return <form className="reporting-type" onSubmit={(event) => void submit(event)}>
    <label className="check-label"><input type="checkbox" checked={value} disabled={busy} onChange={(event) => setRelevant(event.target.checked)} />{EVENT_TYPES[type.event_type]}: ausbildungsrelevant</label>
    <label>Begründung für {EVENT_TYPES[type.event_type]}<input value={reason} onChange={(event) => setReason(event.target.value)} minLength={5} maxLength={2000} required disabled={busy} /></label>
    <button className="button secondary" disabled={busy || value===type.is_training_relevant}>Zuordnung speichern</button>
    {error && <p className="notice error" role="alert">{error}</p>}
  </form>;
}
