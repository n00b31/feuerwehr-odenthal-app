import { ATTENDANCE_LABELS, EVENT_TYPES, RESPONSE_LABELS, ROLE_LABELS } from "../config/app";
import { eventSchema, roleSchema, type AuditDisplay, type AuditEntry, type DemoState, type Role } from "./model";
import { scopeLabel } from "./permissions";
import { dateLabel, timeLabel } from "./time";

const unreadable = "Die Details konnten nicht aufbereitet werden. Die Originaldaten stehen unter „Technische Details“.";
const attendanceLabels: Record<string, string> = ATTENDANCE_LABELS;
const responseLabels: Record<string, string> = RESPONSE_LABELS;
const eventDetailsSchema = eventSchema.pick({
  title: true, description: true, type: true, startsAt: true, endsAt: true,
  location: true, scope: true, deadline: true,
}).partial();

function nameOf(items: { id: string; name: string }[], id: string, missing: string) {
  return items.find((item) => item.id === id)?.name ?? missing;
}
function instantLabel(instant: string) {
  return `${dateLabel(instant, { year: "numeric" })} · ${timeLabel(instant)} Uhr (Berlin)`;
}
function parseJson(text: string): unknown {
  try { return JSON.parse(text); }
  catch (error) {
    if (error instanceof SyntaxError) return undefined;
    throw error;
  }
}
function eventDetails(state: DemoState, text: string) {
  const parsed = eventDetailsSchema.safeParse(parseJson(text));
  if (!parsed.success || !Object.keys(parsed.data).length) return null;
  const value = parsed.data;
  return [
    value.title !== undefined && `Titel: ${value.title}`,
    value.type && `Dienstart: ${EVENT_TYPES[value.type]}`,
    value.startsAt && `Beginn: ${instantLabel(value.startsAt)}`,
    value.endsAt && `Ende: ${instantLabel(value.endsAt)}`,
    value.location !== undefined && `Ort: ${value.location}`,
    value.scope && `Bereich: ${scopeLabel(state, value.scope)}`,
    value.description !== undefined && `Beschreibung: ${value.description || "keine"}`,
    value.deadline && `Anmeldeschluss: ${instantLabel(value.deadline)}`,
  ].filter(Boolean).join("; ");
}

export function auditDisplay(state: DemoState, entry: AuditEntry): AuditDisplay {
  if (entry.display) return entry.display;
  const person = (id: string) => nameOf(state.users, id, "Person nicht mehr verfügbar");
  const unit = (id: string) => nameOf(state.units, id, "Einheit nicht mehr verfügbar");
  const specialFunction = (id: string) => nameOf(state.functions, id, "Sonderfunktion nicht mehr verfügbar");
  const event = state.events.find((item) => item.id === entry.targetId);
  const targetPerson = state.users.find((item) => item.id === entry.targetId);
  const targetUnit = state.units.find((item) => item.id === entry.targetId);
  const targetFunction = state.functions.find((item) => item.id === entry.targetId);
  const targetDocument = state.documents.find((item) => item.id === entry.targetId);
  const target = event ? `Termin: ${event.title} · ${instantLabel(event.startsAt)} · ${scopeLabel(state, event.scope)}`
    : targetPerson ? `Mitglied: ${targetPerson.name}`
      : targetUnit ? `Einheit: ${targetUnit.name}`
        : targetFunction ? `Sonderfunktion: ${targetFunction.name}`
          : targetDocument ? `Dokumentbereich: ${targetDocument.name}`
            : entry.targetId === "demo" ? "Demo-Daten" : "Protokollziel nicht mehr verfügbar";

  function detail() {
    if (entry.action === "Anwesenheit erfasst" || entry.action === "Anwesenheit korrigiert") {
      const match = /^(.+?): (present|absent|unknown) → (present|absent|unknown)(; Grund: [\s\S]*)?$/.exec(entry.detail);
      return match ? `${person(match[1])}: ${attendanceLabels[match[2]]} → ${attendanceLabels[match[3]]}${match[4] ?? ""}` : unreadable;
    }
    if (entry.action === "Rückmeldung") {
      const match = /^(.*): (yes|no|maybe)$/.exec(entry.detail);
      return match ? `${match[1]}: ${responseLabels[match[2]]}` : unreadable;
    }
    if (entry.action === "Organisator zugewiesen" || entry.action === "Delegation widerrufen") {
      const match = /^(.*?) → (.*?); nur diese Termininstanz, keine Rollenänderung\.$/.exec(entry.detail);
      const organizer = (id: string) => id === "keine Delegation" ? "Keine Delegation" : person(id);
      return match ? `${organizer(match[1])} → ${organizer(match[2])}; nur diese Termininstanz, keine Rollenänderung.` : unreadable;
    }
    if (entry.action === "Anwesenheit vorläufig vorbelegt") {
      const marker = "Vorbelegung: ";
      const start = entry.detail.indexOf(marker);
      if (start < 0) return unreadable;
      const parsed = eventSchema.shape.attendance.safeParse(parseJson(entry.detail.slice(start + marker.length)));
      if (!parsed.success) return unreadable;
      const values = Object.values(parsed.data);
      return `Vorläufig vorbelegt: ${values.filter((value) => value === "present").length} anwesend, ${values.filter((value) => value === "absent").length} abwesend, ${values.filter((value) => value === "unknown").length} nicht festgestellt. Vorhandene Einträge unverändert; Liste noch nicht bestätigt.`;
    }
    if (entry.action === "Termin erstellt") {
      const match = event?.seriesId ? /^([\s\S]*); Serie [^;]+; Instanz (\d+)$/.exec(entry.detail) : null;
      return match ? `${match[1]}; Serieninstanz ${match[2]}` : entry.detail;
    }
    if (entry.action === "Termininstanz bearbeitet") {
      const prefix = "Vorher: ", separator = "; Nachher: ";
      if (!entry.detail.startsWith(prefix)) return unreadable;
      let index = entry.detail.indexOf(separator, prefix.length);
      while (index >= 0) {
        const before = eventDetails(state, entry.detail.slice(prefix.length, index));
        const after = eventDetails(state, entry.detail.slice(index + separator.length));
        if (before && after) return `Vorher: ${before}\nNachher: ${after}`;
        index = entry.detail.indexOf(separator, index + separator.length);
      }
      return unreadable;
    }
    if (entry.action === "Mitglied zugeordnet") {
      const match = /^(.*?); Funktionen: (.*?) → (.*?); Funktionen: (.*?)\. Historische Teilnehmerlisten unverändert\.$/.exec(entry.detail);
      const functions = (ids: string) => ids ? ids.split(", ").map(specialFunction).join(", ") : "keine";
      return match ? `Einheit: ${unit(match[1])} → ${unit(match[3])}; Sonderfunktionen: ${functions(match[2])} → ${functions(match[4])}. Historische Teilnehmerlisten unverändert.` : unreadable;
    }
    if (entry.action === "Funktionszuordnung geändert") {
      const match = /^(.*): (zugeordnet|entfernt)\. Historische Teilnehmerlisten unverändert\.$/.exec(entry.detail);
      return match ? `${specialFunction(match[1])}: ${match[2]}. Historische Teilnehmerlisten unverändert.` : unreadable;
    }
    if (entry.action === "Rollen geändert") {
      const match = /^([\s\S]*) → ([\s\S]*)$/.exec(entry.detail);
      if (!match) return unreadable;
      const before = roleSchema.array().safeParse(parseJson(match[1]));
      const after = roleSchema.array().safeParse(parseJson(match[2]));
      if (!before.success || !after.success) return unreadable;
      const roles = (values: Role[]) => values.map((role) => `${ROLE_LABELS[role.role]}${"scopeId" in role ? ` · ${role.role === "UNIT_ADMIN" ? unit(role.scopeId) : specialFunction(role.scopeId)}` : ""}`).join(", ");
      return `${roles(before.data)} → ${roles(after.data)}`;
    }
    return entry.detail;
  }
  return { actor: person(entry.actorId), target, detail: detail() };
}
