import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { checked } from "./supabase-repository";
import { calendarContextSchema, calendarPageSchema, calendarCursorSchema, calendarPayloadSchema,
  calendarSaveSchema, conflictSchema, type CalendarFilters } from "@/domain/calendar";

export async function readCalendar(client: SupabaseClient, range: { lower_bound: string; upper_bound: string },
  filters: CalendarFilters, retained: string[] = []) {
  const context = calendarContextSchema.parse(checked(await client.rpc("ff_calendar_context")));
  let cursor: z.infer<typeof calendarCursorSchema> | null = null;
  const events = new Map<string,z.infer<typeof calendarPageSchema>["events"][number]>();
  let result: z.infer<typeof calendarPageSchema>;
  for (let page=0; ; page++) {
    if (page>=10) throw new Error("Kalenderbereich überschreitet 4.000 Termine. Filter bitte eingrenzen.");
    result = calendarPageSchema.parse(checked(await client.rpc("ff_calendar_page", { ...range,
      scopes: filters.scopes, wanted_units: filters.units, wanted_types: filters.types, wanted_kinds: filters.kinds,
      wanted_categories: filters.categories, wanted_resources: filters.resources, show_cancelled: filters.cancelled,
      after_start: cursor?.starts_at ?? null, after_id: cursor?.id ?? null, retained_ids: retained })));
    for (const item of result.events) events.set(item.id,item);
    if (!result.next_cursor) break;
    if (cursor?.id===result.next_cursor.id) throw new Error("Kalendercursor wurde nicht weitergesetzt; keine verlässliche Liste.");
    cursor = result.next_cursor;
  }
  return { ...result, events: [...events.values()], context };
}
export async function saveCalendarEvent(client: SupabaseClient,input: z.infer<typeof calendarPayloadSchema>,event?: {id: string; revision: number}) {
  return calendarSaveSchema.parse(checked(await client.rpc("ff_save_calendar_event", {
    input: calendarPayloadSchema.parse(input), target_event: event?.id ?? null, expected_revision: event?.revision ?? 0 })));
}
export async function changeCalendarEvent(client: SupabaseClient,event: {id: string; revision: number},action: "cancel" | "archive",reason: string) {
  checked(await client.rpc("ff_change_calendar_event",{ target_event: z.uuid().parse(event.id), expected_revision: event.revision,
    next_action: action, reason: z.string().trim().min(5,"Begründung: mindestens fünf Zeichen.").max(2000).parse(reason) }));
}
export async function calendarConflicts(client: SupabaseClient,resource: string,start: string,end: string,id?: string) {
  return z.array(conflictSchema).parse(checked(await client.rpc("ff_calendar_conflicts",{
    target_resource: z.uuid().parse(resource), lower_bound: start, upper_bound: end, excluded_event: id ?? null })));
}
export async function saveCalendarResource(client: SupabaseClient,name: string,unitId: string|null,event?: {id: string; revision: number},active=true) {
  return z.uuid().parse(checked(await client.rpc("ff_save_calendar_resource",{ input: {
    name: z.string().trim().min(2).max(120).parse(name), unit_id: unitId, resource_type: "building",active },
    target_resource: event?.id ?? null, expected_revision: event?.revision ?? 0 })));
}
export async function saveCalendarCategory(client: SupabaseClient,name: string,id: string|null=null,active=true) {
  return z.uuid().parse(checked(await client.rpc("ff_save_calendar_category",{
    category_name: z.string().trim().min(2).max(80).parse(name), target_category: id,is_active: active })));
}
