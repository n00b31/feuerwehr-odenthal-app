import { z } from "zod";
import { devResponseSchema } from "./dev-events";
import { reportMetricsSchema } from "./dev-reports";

const reference = z.object({ id: z.uuid(), name: z.string() });
const instant = z.iso.datetime({ offset: true });
export const dashboardEventSchema = z.object({
  id: z.uuid(), title: z.string(), starts_at: instant, ends_at: instant,
  location: z.string(), scope_name: z.string(), own_response: devResponseSchema.nullable(),
  response_deadline: instant.nullable(), can_reply: z.boolean(),
});
export const dashboardSchema = z.object({
  actor_id: z.uuid(), server_now: instant, year: z.number().int(),
  units: z.array(reference), functions: z.array(reference),
  next_service: dashboardEventSchema.nullable(), open_count: z.number().int().nonnegative(),
  open_events: z.array(dashboardEventSchema).max(3),
  statistics: reportMetricsSchema,
  information: z.array(z.object({ id: z.uuid(), title: z.string(), starts_at: instant, scope_name: z.string() })).max(3),
  reservations: z.array(z.object({ id: z.uuid(), vehicle_name: z.string(), starts_at: instant,
    state: z.enum(["REQUESTED", "APPROVED"]) })).max(2),
  tasks: z.array(z.object({ kind: z.enum(["registrations", "attendance", "organizer", "vehicles"]),
    count: z.number().int().positive(), target: z.uuid().nullable() })).max(4)
    .refine(rows => new Set(rows.map(row => row.kind)).size === rows.length, "Doppelte Aufgaben."),
  vehicles_visible: z.boolean(),
});
export type DashboardData = z.infer<typeof dashboardSchema>;
export type DashboardEvent = z.infer<typeof dashboardEventSchema>;
export function dashboardGreeting(name: string, hour: number) {
  const first = name.trim().split(/\s+/)[0];
  return `${hour < 5 ? "Guten Abend" : hour < 11 ? "Guten Morgen" : hour < 18 ? "Guten Tag" : "Guten Abend"}, ${first}`;
}
export function dashboardEventHref(id: string, section: "dienste" | "kalender" | "fahrzeuge" = "dienste", task?: "attendance" | "organizer") {
  z.uuid().parse(id);
  return `/termine/?bereich=${section}&${section === "fahrzeuge" ? "vorgang" : "termin"}=${id}${task ? `&aufgabe=${task}` : ""}${section === "dienste" ? `#event-${id}` : ""}`;
}
export function dashboardCanReply(item: DashboardEvent, now: number) {
  return item.can_reply && now < Date.parse(item.starts_at)
    && (!item.response_deadline || now < Date.parse(item.response_deadline));
}
