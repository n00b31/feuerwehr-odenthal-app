import type {SupabaseClient} from "@supabase/supabase-js";
import {z} from "zod";
import {checked} from "./supabase-repository";
import {calendarSaveSchema} from "@/domain/calendar";
import {vehicleWorkspaceSchema,vehicleRequesterContextSchema,vehicleInputSchema,vehicleRequestSchema,vehicleDecisionReason,type VehicleReservation,
  type VehicleInput,type VehicleState} from "@/domain/vehicles";

export async function readVehicles(client:SupabaseClient,range:{lower_bound:string;upper_bound:string},vehicle:string|null,event:string|null){
  const [workspace,context]=await Promise.all([
    client.rpc("ff_vehicle_workspace",{
      lower_bound:range.lower_bound,upper_bound:range.upper_bound,target_vehicle:vehicle,retained_event:event,
    }),
    client.rpc("ff_vehicle_requesters",{target_vehicle:vehicle}),
  ]);
  return {...vehicleWorkspaceSchema.parse(checked(workspace)),...vehicleRequesterContextSchema.parse(checked(context))};
}
export async function saveVehicle(client:SupabaseClient,input:VehicleInput,vehicle?:{id:string;revision:number}){
  return z.uuid().parse(checked(await client.rpc("ff_save_vehicle",{
    input:vehicleInputSchema.parse(input),target_vehicle:vehicle?.id ?? null,expected_revision:vehicle?.revision ?? 0,
  })));
}
export async function requestVehicle(client:SupabaseClient,input:z.infer<typeof vehicleRequestSchema>){
  return calendarSaveSchema.parse(checked(await client.rpc("ff_request_vehicle",{input:vehicleRequestSchema.parse(input)})));
}
export async function decideVehicle(client:SupabaseClient,item:VehicleReservation,state:VehicleState,reason:string){
  checked(await client.rpc("ff_decide_vehicle",{target_event:item.id,expected_revision:item.revision,next_state:state,
    reason:vehicleDecisionReason(state,item,reason)}));
}
export async function readVehicleNotification(client:SupabaseClient,id:string){
  checked(await client.rpc("ff_read_vehicle_notification",{target_notification:z.uuid().parse(id)}));
}
export async function saveVehicleOption(client:SupabaseClient,kind:"type"|"purpose",key:string,name:string,active:boolean){
  checked(await client.rpc("ff_vehicle_option",{kind,option_key:z.string().regex(/^[a-z0-9_-]{2,40}$/).parse(key),
    option_name:z.string().trim().min(2).max(80).parse(name),is_active:active}));
}
