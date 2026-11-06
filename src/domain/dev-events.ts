import { z } from "zod";
import { fromBerlin } from "./time";

export const devResponseSchema = z.enum(["yes", "no", "maybe"]);
export type DevResponse = z.infer<typeof devResponseSchema>;
export const devEventTypeSchema = z.enum(["regular", "special", "breathing", "training", "community", "other"]);
export const devEventPayloadSchema = z.object({
  title: z.string().trim().min(3, "Titel: mindestens drei Zeichen.").max(120),
  description: z.string().max(2000),
  event_type: devEventTypeSchema,
  location: z.string().trim().min(1, "Ort erforderlich.").max(200),
  unit_id: z.uuid().nullable(),
  starts_at: z.iso.datetime(),
  ends_at: z.iso.datetime(),
  response_deadline: z.iso.datetime().nullable(),
}).refine((value) => Date.parse(value.ends_at) > Date.parse(value.starts_at),
  "Ende muss nach Beginn liegen.")
  .refine((value) => !value.response_deadline || Date.parse(value.response_deadline) <= Date.parse(value.starts_at),
    "Anmeldeschluss spätestens bei Beginn.");
export type DevEventPayload = z.infer<typeof devEventPayloadSchema>;
export type DevEventDraft = {
  title: string; description: string; event_type: DevEventPayload["event_type"];
  location: string; unit_id: string; start: string; end: string; deadline: string;
};

export function eventPayload(draft: DevEventDraft): DevEventPayload {
  return devEventPayloadSchema.parse({
    title: draft.title, description: draft.description, event_type: draft.event_type,
    location: draft.location, unit_id: draft.unit_id || null,
    starts_at: fromBerlin(draft.start), ends_at: fromBerlin(draft.end),
    response_deadline: draft.deadline ? fromBerlin(draft.deadline) : null,
  });
}

export function responseCounts(participants: { response: DevResponse | null }[]) {
  const counts = { yes: 0, no: 0, maybe: 0, unanswered: 0 };
  for (const item of participants) counts[item.response ?? "unanswered"]++;
  return counts;
}

export function eventErrorMessage(error: unknown) {
  if (error instanceof z.ZodError) return error.issues[0].message;
  if (error instanceof Error && !("code" in error)) return error.message;
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  const message = error && typeof error === "object" && "message" in error ? String(error.message) : "";
  if (code === "42501" || code === "40001") return message || "Keine Berechtigung oder zwischenzeitliche Änderung. Bitte aktualisieren.";
  if (code === "PGRST202" || code === "PGRST204") return "Terminverwaltung noch nicht verfügbar. Migration 006 bis 011 und Data-API-Schema prüfen.";
  if (code === "23514" || code === "22P02" || code === "22007" || code === "22008") return "Ungültige Terminangaben. Datum, Uhrzeit und Pflichtfelder prüfen.";
  return "Supabase-Terminoperation fehlgeschlagen. Verbindung und serverseitige Berechtigung prüfen; kein erfolgreicher Abschluss bestätigt.";
}
