import { z } from "zod";
import { devEventTypeSchema } from "./dev-events";
import { csv } from "./export";
import { EVENT_TYPES } from "@/config/app";

const reference = z.object({ id: z.uuid(), name: z.string() });
export const reportScopeSchema = z.enum(["personal", "unit", "function", "organization"]);
export type ReportScope = z.infer<typeof reportScopeSchema>;
export const reportsContextSchema = z.object({
  current_year: z.number().int(), years: z.array(z.number().int()).min(1),
  organization: z.boolean(), configure: z.boolean(),
  personal_units: z.array(reference), units: z.array(reference), functions: z.array(reference),
  event_types: z.array(z.object({ event_type: devEventTypeSchema, is_training_relevant: z.boolean() })),
});
export type ReportsContext = z.infer<typeof reportsContextSchema>;
const count = z.number().int().nonnegative();
export const reportMetricsSchema = z.object({
  services: count, practices: count, training_services: count, eligible: count,
  present: count, absent: count, training_present: count, training_absent: count,
  unknown: count, training_hours: z.number().nonnegative(), service_hours: z.number().nonnegative(),
  participant_hours: z.number().nonnegative(), rate: z.number().min(0).max(100).nullable(),
  pending: count, excluded: count, missing_roster: count,
});
export type ReportMetrics = z.infer<typeof reportMetricsSchema>;
export const reportEventSchema = z.object({
  event_id: z.uuid(), title: z.string(), event_type: devEventTypeSchema,
  scope_name: z.string(), unit_name: z.string(),
  starts_at: z.iso.datetime({ offset: true }), ends_at: z.iso.datetime({ offset: true }),
  hours: z.number().nonnegative().nullable(), training: z.boolean(),
  confirmed_at: z.iso.datetime({ offset: true }), corrected_at: z.iso.datetime({ offset: true }).nullable(),
  own_status: z.enum(["present", "absent", "unknown"]).nullable(), metrics: reportMetricsSchema,
});
export type ReportEvent = z.infer<typeof reportEventSchema>;
export const yearReportSchema = z.object({
  year: z.number().int(), scope: reportScopeSchema, target: z.uuid().nullable(), scope_name: z.string(),
  summary: reportMetricsSchema.extend({ members: count }),
  members: z.array(z.object({ user_id: z.uuid(), name: z.string(), metrics: reportMetricsSchema })),
  units: z.array(reference.extend({ members: count, metrics: reportMetricsSchema })),
  events: z.array(reportEventSchema), page: count, event_count: count, has_more: z.boolean(),
});
export type YearReport = z.infer<typeof yearReportSchema>;
export const reportQuerySchema = z.object({
  wanted_year: z.number().int().min(1900).max(2199),
  report_scope: reportScopeSchema,
  target_scope: z.uuid().nullable(),
  wanted_type: devEventTypeSchema.nullable(),
  page_number: z.number().int().min(0).max(1000),
  export_all: z.boolean(),
}).refine((value) => !["unit", "function"].includes(value.report_scope) || value.target_scope !== null,
  "Einheit beziehungsweise Funktion bewusst auswählen.");
export type ReportQuery = z.infer<typeof reportQuerySchema>;

export const reportNumber = (value: number) => value.toLocaleString("de-DE", { maximumFractionDigits: 2 });
export const reportRate = (value: number | null) => value === null ? "Nicht berechenbar" : `${reportNumber(value)} %`;
const date = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" });
const time = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" });
export type ReportExport = "summary" | "members" | "units" | "events";

export function reportCsv(report: YearReport, kind: ReportExport) {
  const prefix = [report.scope_name, report.year];
  const headers = ["Berichtsbereich / Einheit", "Berichtsjahr"];
  if (kind === "summary") {
    const s = report.summary;
    return csv([[...headers, "Kennzahl", "Wert"],
      ...[
        ["Mitglieder im Berichtsjahr", s.members], ["Abgeschlossene Dienste", s.services],
        ["Übungsdienste", s.practices], ["Ausbildungsrelevante Dienste", s.training_services],
        ["Relevante Personen-Dienste (Nenner)", s.eligible], ["Teilnahmen (Ausbildung)", s.training_present],
        ["Fehlzeiten (Ausbildung)", s.training_absent], ["Anwesenheitsquote", reportRate(s.rate)],
        ["Ausbildungsstunden des Dienstangebots", reportNumber(s.service_hours)],
        ["Ausbildungs-Teilnehmerstunden", reportNumber(s.training_hours)],
        ["Dokumentierte Teilnehmerstunden (alle Arten)", reportNumber(s.participant_hours)],
        ["Offene Listen (ausgeschlossen)", s.pending], ["Ungeklärte Anwesenheiten", s.unknown],
        ["Ungültige Zuordnungen / Zeiten (ausgeschlossen)", s.excluded], ["Fehlende Teilnehmereinträge", s.missing_roster],
      ].map((row) => [...prefix, ...row])]);
  }
  if (kind === "events") return csv([
    [...headers, "Datum (Berlin)", "Dienst", "Terminart", "Einheit damals / Dienstbereich", "Beginn (Berlin)", "Ende (Berlin)",
      "Dauer (h)", "Ausbildungsrelevant", "Anwesend", "Abwesend", "Nicht festgestellt", "Teilnehmerstunden",
      "Eigener Status", "Liste"],
    ...report.events.map((e) => [...prefix, date.format(new Date(e.starts_at)), e.title, EVENT_TYPES[e.event_type],
      e.unit_name, time.format(new Date(e.starts_at)), time.format(new Date(e.ends_at)),
      e.hours === null ? "Ungültige Zeit" : reportNumber(e.hours), e.training ? "Ja" : "Nein",
      e.metrics.present, e.metrics.absent, e.metrics.unknown, reportNumber(e.metrics.participant_hours),
      report.scope !== "personal" ? "Nicht anwendbar" : e.own_status === "present" ? "Anwesend" : e.own_status === "absent" ? "Abwesend" : "Nicht festgestellt",
      e.corrected_at ? "Nachträglich korrigiert" : "Abgeschlossen"]),
  ]);
  if (kind === "members" && !["unit", "function"].includes(report.scope)) {
    throw new Error("Mitgliederexport nur für einen berechtigten Einheits- oder Funktionsbericht.");
  }
  if (kind === "units" && report.scope !== "organization") throw new Error("Einheitenexport nur im organisationsweiten Bericht.");
  const rows = kind === "units"
    ? report.units.map((unit) => ({ name: unit.name, metrics: unit.metrics, members: unit.members }))
    : report.members.map((member) => ({ ...member, members: "" }));
  return csv([[...headers, kind === "units" ? "Einheit" : "Name", "Mitglieder", "Relevante Dienste",
    "Teilnahmen (Ausbildung)", "Fehlzeiten (Ausbildung)", "Anwesenheitsquote",
    "Ausbildungsstunden", "Dokumentierte Teilnehmerstunden"],
  ...rows.map((row) => [...prefix, row.name, row.members, row.metrics.training_services,
    row.metrics.training_present, row.metrics.training_absent, reportRate(row.metrics.rate),
    reportNumber(kind === "units" ? row.metrics.service_hours : row.metrics.training_hours),
    reportNumber(row.metrics.participant_hours)])]);
}

export function reportError(error: unknown): string {
  if (error instanceof z.ZodError) return `Ungültige Berichtsdaten: ${error.issues[0].message}`;
  if (error && typeof error === "object" && "code" in error && error.code === "PGRST202") {
    return "Dienstbuch noch nicht verfügbar. Migration 013 und das Supabase-API-Schema prüfen.";
  }
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message;
  return "Bericht konnte nicht geladen werden. Verbindung und serverseitige Berechtigung prüfen.";
}
