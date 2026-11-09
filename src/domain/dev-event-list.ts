import { z } from "zod";

export const monthKeySchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Monat im Format JJJJ-MM erforderlich.")
  .refine((value) => Number(value.slice(0, 4)) >= 2000 && Number(value.slice(0, 4)) <= 9998, "Jahr muss zwischen 2000 und 9998 liegen.");
export const eventCursorSchema = z.object({ starts_at: z.iso.datetime({ offset: true }), id: z.uuid() });
export type EventCursor = z.infer<typeof eventCursorSchema>;
export type EventListQuery = {
  view: "upcoming" | "past" | "month" | "open_attendance"; month: string; status: "all" | "scheduled" | "cancelled";
};
export const defaultEventList: EventListQuery = { view: "upcoming", month: "", status: "all" };
export function eventListParameters(query: EventListQuery = defaultEventList, cursor: EventCursor | null = null, retained: string[] = []) {
  return {
    list_view: z.enum(["upcoming", "past", "month", "open_attendance"]).parse(query.view),
    month_key: query.view === "month" ? monthKeySchema.parse(query.month) : null,
    status_filter: z.enum(["all", "scheduled", "cancelled"]).parse(query.status),
    after_start: cursor ? eventCursorSchema.parse(cursor).starts_at : null,
    after_id: cursor ? cursor.id : null,
    retained_ids: z.array(z.uuid()).max(100).parse(retained),
  };
}
export function monthLabel(value: string) {
  const parsed = monthKeySchema.parse(value);
  return new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric", timeZone: "Europe/Berlin" })
    .format(new Date(`${parsed}-15T12:00:00Z`));
}
