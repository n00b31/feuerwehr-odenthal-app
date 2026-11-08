import {z} from "zod";
import type {SupabaseClient} from "@supabase/supabase-js";
import {checked} from "./supabase-repository";
import {planningContextSchema,planPreviewSchema,plannedEventSchema,seriesRuleSchema,frequencySchema,type PlanRequest} from "@/domain/event-planning";

const instanceSchema=plannedEventSchema.safeExtend({
  id:z.uuid(),instance_number:z.number().int().min(1).max(52),status:z.enum(["scheduled","cancelled"]),
  protected:z.boolean(),exception:z.boolean(),
});
const workspaceSchema=z.object({
  series:z.object({id:z.uuid(),title:z.string(),frequency:frequencySchema,occurrence_count:z.number().int(),
    rule:seriesRuleSchema.nullable(),revision:z.number().int(),ended_on:z.string().nullable()}),
  anchor:plannedEventSchema.safeExtend({id:z.uuid(),instance_number:z.number().int()}),
  instances:z.array(instanceSchema).max(52),
});
export type SeriesWorkspace=z.infer<typeof workspaceSchema>;
export const planningResultSchema=z.object({
  event_ids:z.array(z.uuid()).min(1).max(200),series_id:z.uuid().nullable(),
  count:z.number().int().min(1).max(200),replayed:z.boolean(),
});
export async function readPlanningContext(client:SupabaseClient) {
  return planningContextSchema.parse(checked(await client.rpc("ff_event_planning_context")));
}
export async function readSeriesWorkspace(client:SupabaseClient,eventId:string) {
  return workspaceSchema.parse(checked(await client.rpc("ff_series_workspace",{target_event:z.uuid().parse(eventId)})));
}
export async function previewEventPlan(client:SupabaseClient,input:PlanRequest) {
  z.uuid().parse(input.request_id);
  return planPreviewSchema.parse(checked(await client.rpc("ff_preview_event_plan",{input})));
}
export async function commitEventPlan(client:SupabaseClient,input:PlanRequest,token:string,confirmed:boolean) {
  z.uuid().parse(input.request_id);z.string().regex(/^[a-f0-9]{64}$/).parse(token);z.literal(true).parse(confirmed);
  return planningResultSchema.parse(checked(await client.rpc("ff_commit_event_plan",{input,expected_token:token,confirmed})));
}
