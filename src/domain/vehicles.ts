import { z } from "zod";
import { fromBerlin } from "./time";
import { resourceSchema,vehicleStateSchema } from "./calendar";

export {vehicleStateSchema};
export type VehicleState=z.infer<typeof vehicleStateSchema>;
export const vehicleStatus:Record<VehicleState,{label:string;symbol:string;tone:string}>={
  REQUESTED:{label:"Angefragt",symbol:"◷",tone:"warning"},
  APPROVED:{label:"Genehmigt",symbol:"✓",tone:"success"},
  REJECTED:{label:"Abgelehnt",symbol:"✕",tone:"danger"},
  CANCELLED:{label:"Storniert",symbol:"−",tone:"neutral"},
  COMPLETED:{label:"Abgeschlossen",symbol:"✓",tone:"accent"},
};
const instant=z.iso.datetime({offset:true});
const option=z.object({id:z.uuid(),name:z.string()});
const configOption=z.object({key:z.string(),name:z.string(),active:z.boolean()});
export const vehicleSchema=resourceSchema.extend({
  resource_type:z.literal("vehicle"),unit_id:z.uuid(),type_key:z.string(),call_sign:z.string(),location:z.string(),
  description:z.string(),reservable:z.boolean(),unit_admin_enabled:z.boolean(),can_manage:z.boolean(),current_access:z.boolean(),
  usage_units:z.array(z.uuid()),manager_ids:z.array(z.uuid()),
});
export type Vehicle=z.infer<typeof vehicleSchema>;
export const vehicleReservationSchema=z.object({
  id:z.uuid(),event_id:z.uuid(),vehicle_id:z.uuid(),vehicle_name:z.string(),requester_id:z.uuid(),requester_name:z.string(),
  actor_id:z.uuid().optional(),actor_name:z.string().optional(),
  responsible_id:z.uuid(),responsible_name:z.string(),unit_id:z.uuid(),unit_name:z.string(),
  kind:z.enum(["reservation","block"]),state:vehicleStateSchema,title:z.string(),description:z.string(),
  starts_at:instant,ends_at:instant,requested_at:instant,purpose_key:z.string().nullable(),
  destination:z.string(),notes:z.string(),revision:z.number().int().nonnegative(),can_manage:z.boolean(),own:z.boolean(),
  decided_at:instant.nullable(),decided_by:z.uuid().nullable(),decision_reason:z.string().nullable(),
  cancelled_at:instant.nullable(),cancelled_by:z.uuid().nullable(),cancellation_reason:z.string().nullable(),
  completed_at:instant.nullable(),completed_by:z.uuid().nullable(),
}).refine(v=>Date.parse(v.ends_at)>Date.parse(v.starts_at),"Ungültiger Reservierungszeitraum.");
export type VehicleReservation=z.infer<typeof vehicleReservationSchema>;
export const vehicleWorkspaceSchema=z.object({
  server_now:instant,configure:z.boolean(),vehicles:z.array(vehicleSchema),units:z.array(option),own_units:z.array(option),
  people:z.array(option.extend({units:z.array(z.uuid())})),types:z.array(configOption),purposes:z.array(configOption),
  items:z.array(vehicleReservationSchema),retained:vehicleReservationSchema.nullable(),tasks:z.array(vehicleReservationSchema),
  tasks_total:z.number().int().nonnegative(),notifications:z.array(z.object({
    id:z.uuid(),recipient_id:z.uuid(),event_id:z.uuid(),message:z.string(),created_at:instant,read_at:instant.nullable(),
  })),
});
export const vehicleRequesterContextSchema=z.object({
  actor_name:z.string(),request_units:z.array(option),requesters:z.array(option.extend({units:z.array(z.uuid())})),
});
export type VehicleWorkspace=z.infer<typeof vehicleWorkspaceSchema>&z.infer<typeof vehicleRequesterContextSchema>;
export const vehicleInputSchema=z.object({
  name:z.string().trim().min(2).max(120),unit_id:z.uuid(),type_key:z.string().min(2).max(40),
  call_sign:z.string().max(80),location:z.string().max(200),description:z.string().max(2000),
  active:z.boolean(),reservable:z.boolean(),unit_admin_enabled:z.boolean(),
  manager_ids:z.array(z.uuid()).min(1,"Mindestens ein Fahrzeugverwalter erforderlich.").max(20),
  usage_units:z.array(z.uuid()).min(1,"Mindestens eine Nutzungseinheit erforderlich.").max(5),
});
export type VehicleInput=z.infer<typeof vehicleInputSchema>;
export const vehicleRequestSchema=z.object({
  vehicle_id:z.uuid(),unit_id:z.uuid(),responsible_id:z.uuid(),kind:z.enum(["reservation","block"]),
  requester_id:z.uuid().optional(),
  title:z.string().trim().min(3).max(120),description:z.string().max(2000),destination:z.string().max(200),notes:z.string().max(2000),
  purpose_key:z.string().nullable(),starts_at:instant,ends_at:instant,
}).refine(v=>v.kind==="block" || !!v.purpose_key,"Verwendungszweck erforderlich.")
  .refine(v=>Date.parse(v.ends_at)>Date.parse(v.starts_at),"Ende muss nach Beginn liegen.")
  .refine(v=>Date.parse(v.ends_at)-Date.parse(v.starts_at)<=43*86400000,"Höchstens 43 Tage reservieren.");
export type VehicleRequestDraft=Omit<z.infer<typeof vehicleRequestSchema>,"starts_at"|"ends_at">&{start:string;end:string};
export function vehicleRequestPayload(draft:VehicleRequestDraft){
  return vehicleRequestSchema.parse({...draft,starts_at:fromBerlin(draft.start),ends_at:fromBerlin(draft.end)});
}
export function bindingVehicle(item:Pick<VehicleReservation,"state">){
  return item.state==="APPROVED" || item.state==="COMPLETED";
}
export function vehicleOverlap(a:{starts_at:string;ends_at:string},b:{starts_at:string;ends_at:string}){
  return Date.parse(a.starts_at)<Date.parse(b.ends_at) && Date.parse(a.ends_at)>Date.parse(b.starts_at);
}
export function vehicleDecisionReason(state:VehicleState,item:Pick<VehicleReservation,"state">,reason:string){
  return z.string().trim().max(2000).min(state==="REJECTED" || state==="CANCELLED" && item.state==="APPROVED" ? 5 : 0,
    "Ablehnung oder Stornierung genehmigter Nutzung: mindestens fünf Zeichen Begründung.").parse(reason);
}
