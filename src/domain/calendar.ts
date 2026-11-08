import { z } from "zod";
import { addLocalDays, berlinParts, dateLabel, fromBerlin, localInput } from "./time";
import { devEventTypeSchema } from "./dev-events";

export const calendarDateSchema = z.iso.date().refine((value) => Number(value.slice(0,4))>=2000 && Number(value.slice(0,4))<=2199);
export type CalendarView = "month" | "week" | "list";
export const calendarKindSchema = z.enum(["information","booking"]);
const instant = z.iso.datetime({ offset: true });
const option = z.object({ id: z.uuid(), name: z.string() });
export const resourceSchema = option.extend({ resource_type: z.enum(["building","room","vehicle","material"]),
  unit_id: z.uuid().nullable(), active: z.boolean(), revision: z.number().int().nonnegative() });
export const calendarContextSchema = z.object({
  organization: z.boolean(), configure: z.boolean(), units: z.array(option), manageable_units: z.array(option),
  functions: z.array(option.extend({ manage: z.boolean() })), resources: z.array(resourceSchema),
  categories: z.array(option.extend({ active: z.boolean() })), organizers: z.array(option),
});
export type CalendarContext = z.infer<typeof calendarContextSchema>;
export const vehicleStateSchema = z.enum(["REQUESTED","APPROVED","REJECTED","CANCELLED","COMPLETED"]);
export const calendarEventSchema = z.object({
  id: z.uuid(), title: z.string(), description: z.string(), starts_at: instant, ends_at: instant, location: z.string(),
  event_type: devEventTypeSchema, status: z.enum(["scheduled","cancelled"]), revision: z.number().int().nonnegative(),
  scope_kind: z.enum(["organization","unit","function"]), unit_id: z.uuid().nullable(), function_id: z.uuid().nullable(),
  organizer_id: z.uuid(), organizer_name: z.string(), scope_name: z.string(),
  entry_kind: z.enum(["participation","information","booking","vehicle"]), all_day: z.boolean(),
  vehicle_state: vehicleStateSchema.nullable().optional(), vehicle_kind: z.enum(["reservation","block"]).nullable().optional(),
  audience: z.enum(["scope","units","leadership"]), category_id: z.uuid().nullable(), category_name: z.string().nullable(),
  resource_id: z.uuid().nullable(), resource_name: z.string().nullable(), can_manage: z.boolean(), unit_ids: z.array(z.uuid()),
}).refine((value) => Date.parse(value.ends_at)>Date.parse(value.starts_at),"Ungültiger Kalenderzeitraum.")
  .refine(value=>value.entry_kind!=="vehicle" || value.vehicle_state==="APPROVED" || value.vehicle_state==="COMPLETED",
    "Gemeinsamer Kalender darf nur verbindliche Fahrzeugvorgänge enthalten.");
export type CalendarEvent = z.infer<typeof calendarEventSchema>;
export const calendarCursorSchema = z.object({ id: z.uuid(), starts_at: instant });
export const calendarPageSchema = z.object({ server_now: instant, events: z.array(calendarEventSchema),
  retained_events: z.array(calendarEventSchema), next_cursor: calendarCursorSchema.nullable() });
export const conflictSchema = z.object({ id: z.uuid().nullable(), title: z.string(), starts_at: instant, ends_at: instant, binding:z.boolean().optional() });
export const calendarSaveSchema = z.object({ id: z.uuid(), conflicts: z.array(conflictSchema) });
export type CalendarConflict = z.infer<typeof conflictSchema>;
export type CalendarFilters = { scopes: string[]; units: string[]; types: string[]; kinds: string[]; categories: string[]; resources: string[]; cancelled: boolean };
export const emptyCalendarFilters: CalendarFilters = { scopes: [], units: [], types: [], kinds: [], categories: [], resources: [], cancelled: true };
export type CalendarDraft = {
  title: string; description: string; location: string; start: string; end: string; all_day: boolean;
  entry_kind: "information" | "booking"; scope_kind: "organization" | "unit" | "function";
  unit_id: string; function_id: string; organizer_id: string; category_id: string; resource_id: string;
  audience: "scope" | "units" | "leadership"; unit_ids: string[];
};
export function calendarBookingResources(context: CalendarContext, scope: Pick<CalendarDraft,"scope_kind"|"unit_id">) {
  return context.resources.filter(resource=>resource.active && resource.resource_type==="building"
    && (context.configure || scope.scope_kind!=="unit" || resource.unit_id===null || resource.unit_id===scope.unit_id));
}
export function preferredCalendarResource(resources: CalendarContext["resources"], unit: string|null) {
  return resources.find(resource=>resource.unit_id===unit) ?? resources[0];
}
export const calendarPayloadSchema = z.object({
  title: z.string().trim().min(3).max(120), description: z.string().max(2000), location: z.string().trim().min(1).max(200),
  event_type: z.literal("other"), response_deadline: z.null(), starts_at: instant, ends_at: instant,
  entry_kind: calendarKindSchema, all_day: z.boolean(), scope_kind: z.enum(["organization","unit","function"]),
  unit_id: z.uuid().nullable(), function_id: z.uuid().nullable(), organizer_id: z.uuid(),
  category_id: z.uuid(), resource_id: z.uuid().nullable(), audience: z.enum(["scope","units","leadership"]),
  unit_ids: z.array(z.uuid()).max(5),
}).refine((v) => Date.parse(v.ends_at)>Date.parse(v.starts_at),"Ende muss nach Beginn liegen.")
  .refine((v) => (v.entry_kind==="booking")===(v.resource_id!==null),"Belegung benötigt ein Gerätehaus.")
  .refine((v) => v.scope_kind==="unit" ? !!v.unit_id && !v.function_id :
    v.scope_kind==="function" ? !!v.function_id && !v.unit_id : !v.unit_id && !v.function_id,"Ungültiger Bereich.")
  .refine((v) => v.audience==="units" ? v.scope_kind==="organization" && v.unit_ids.length>0 : !v.unit_ids.length,"Zieleinheiten prüfen.");

export function calendarPayload(draft: CalendarDraft) {
  const start = draft.all_day ? `${calendarDateSchema.parse(draft.start.slice(0,10))}T00:00` : draft.start;
  // Form end day is inclusive; stored timestamps always use half-open intervals.
  const end = draft.all_day ? `${addLocalDays(calendarDateSchema.parse(draft.end.slice(0,10)),1)}T00:00` : draft.end;
  return calendarPayloadSchema.parse({ ...draft, starts_at: fromBerlin(start), ends_at: fromBerlin(end),
    event_type: "other", response_deadline: null, unit_id: draft.unit_id || null, function_id: draft.function_id || null,
    resource_id: draft.entry_kind==="booking" ? draft.resource_id || null : null });
}
export function calendarDraft(event: CalendarEvent): CalendarDraft {
  return { ...event, start: localInput(event.starts_at),
    end: event.all_day ? `${addLocalDays(berlinParts(event.ends_at).date,-1)}T00:00` : localInput(event.ends_at),
    entry_kind: calendarKindSchema.parse(event.entry_kind), unit_id: event.unit_id ?? "",
    function_id: event.function_id ?? "", resource_id: event.resource_id ?? "", category_id: event.category_id ?? "" };
}
export function calendarRange(date: string, view: CalendarView) {
  calendarDateSchema.parse(date);
  const first = view==="month" ? `${date.slice(0,7)}-01` : date;
  const weekday = (new Date(`${first}T12:00:00Z`).getUTCDay()+6)%7;
  const start = view==="list" ? first : addLocalDays(first,-weekday);
  const count = view==="month" ? 42 : view==="week" ? 7 : 31;
  const days = Array.from({ length: count },(_,i) => addLocalDays(start,i));
  return { days, start, end: addLocalDays(start,count),
    lower_bound: fromBerlin(`${start}T00:00`), upper_bound: fromBerlin(`${addLocalDays(start,count)}T00:00`) };
}
export function moveCalendar(date: string, view: CalendarView, direction: number) {
  if (view!=="month") return calendarDateSchema.parse(addLocalDays(date,direction*(view==="week" ? 7 : 31)));
  const [year,month] = date.split("-").map(Number);
  return calendarDateSchema.parse(new Date(Date.UTC(year,month-1+direction,1)).toISOString().slice(0,10));
}
export function eventsOnDay(events: CalendarEvent[], day: string) {
  const lower = Date.parse(fromBerlin(`${day}T00:00`));
  const upper = Date.parse(fromBerlin(`${addLocalDays(day,1)}T00:00`));
  return events.filter((e) => Date.parse(e.starts_at)<upper && Date.parse(e.ends_at)>lower)
    .sort((a,b) => Date.parse(a.starts_at)-Date.parse(b.starts_at) || a.id.localeCompare(b.id));
}
export function calendarTime(instant: string) {
  return new Intl.DateTimeFormat("de-DE",{ timeZone: "Europe/Berlin",hour: "2-digit",minute: "2-digit",timeZoneName: "short" }).format(new Date(instant));
}
export function calendarInterval(event:Pick<CalendarEvent,"starts_at"|"ends_at"|"all_day">) {
  const start=berlinParts(event.starts_at).date;
  const end=event.all_day ? addLocalDays(berlinParts(event.ends_at).date,-1) : berlinParts(event.ends_at).date;
  const label=(day:string)=>dateLabel(`${day}T12:00:00Z`,{year:"numeric"});
  return event.all_day ? `${label(start)}${end===start ? "" : ` – ${label(end)}`} · Ganztägig`
    : `${label(start)} ${calendarTime(event.starts_at)} – ${end===start ? "" : `${label(end)} `}${calendarTime(event.ends_at)}`;
}
export function weekPlacement(event: CalendarEvent, day: string) {
  const start = berlinParts(event.starts_at), end = berlinParts(event.ends_at);
  const minutes = (time: string) => Number(time.slice(0,2))*60+Number(time.slice(3));
  const lower = start.date<day ? 0 : minutes(start.time);
  const upper = end.date>day ? 1440 : minutes(end.time);
  const actualMinutes = (Date.parse(event.ends_at)-Date.parse(event.starts_at))/60000;
  return { top: lower/2, height: Math.max(44,(upper>lower ? upper-lower : actualMinutes)/2) };
}
export function weekColumns(events: CalendarEvent[],day: string) {
  const laneEnds: number[]=[];
  const items=eventsOnDay(events,day).filter(e=>!e.all_day).map(event=>{
    const placement=weekPlacement(event,day);
    let lane=laneEnds.findIndex(end=>end<=placement.top);
    if(lane<0) lane=laneEnds.length;
    laneEnds[lane]=placement.top+placement.height;
    return {event,...placement,lane};
  });
  return {items,lanes:Math.max(1,laneEnds.length)};
}
