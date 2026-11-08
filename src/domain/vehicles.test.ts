import {test} from "node:test";
import assert from "node:assert/strict";
import {createClient} from "@supabase/supabase-js";
import {vehicleStateSchema,vehicleDecisionReason,vehicleRequestPayload,vehicleInputSchema,vehicleOverlap,
  bindingVehicle,vehicleStatus,vehicleWorkspaceSchema,type VehicleRequestDraft} from "./vehicles";
import {calendarEventSchema} from "./calendar";
import {readVehicles,requestVehicle} from "../data/supabase-vehicles";

const id="a0600000-0000-4000-8000-000000000001";
const draft:VehicleRequestDraft={vehicle_id:id,unit_id:id,responsible_id:id,kind:"reservation",title:"Synthetic request",
  description:"",destination:"",notes:"",purpose_key:"course",start:"2026-03-29T00:00",end:"2026-03-30T00:00"};
test("vehicle states have explicit labels and symbols; requests are never binding",()=>{
  for(const state of vehicleStateSchema.options){assert.ok(vehicleStatus[state].label);assert.ok(vehicleStatus[state].symbol);}
  assert.equal(bindingVehicle({state:"REQUESTED"}),false);assert.equal(bindingVehicle({state:"CANCELLED"}),false);
  assert.equal(bindingVehicle({state:"APPROVED"}),true);assert.equal(bindingVehicle({state:"COMPLETED"}),true);
});
test("vehicle intervals use Berlin DST and half-open adjacency",()=>{
  const input=vehicleRequestPayload(draft);
  assert.equal(Date.parse(input.ends_at)-Date.parse(input.starts_at),23*3600000);
  assert.equal(vehicleOverlap(input,{starts_at:input.ends_at,ends_at:"2026-03-30T23:00:00Z"}),false);
  assert.equal(vehicleOverlap(input,{starts_at:"2026-03-29T10:00:00Z",ends_at:"2026-03-29T12:00:00Z"}),true);
  assert.throws(()=>vehicleRequestPayload({...draft,start:"2026-03-29T02:30"}));
  assert.throws(()=>vehicleRequestPayload({...draft,end:draft.start}));
  assert.throws(()=>vehicleRequestPayload({...draft,end:"2026-06-01T09:00"}));
});
test("rejection and cancellation of approved reservation require an explicit reason",()=>{
  assert.throws(()=>vehicleDecisionReason("REJECTED",{state:"REQUESTED"},""));
  assert.throws(()=>vehicleDecisionReason("CANCELLED",{state:"APPROVED"}," "));
  assert.equal(vehicleDecisionReason("CANCELLED",{state:"REQUESTED"},""),"");
  assert.equal(vehicleDecisionReason("REJECTED",{state:"REQUESTED"},"  No availability  "),"No availability");
});
test("vehicle ownership, managers and allowed units are explicit, not technical roles",()=>{
  const input={name:"Synthetic vehicle",unit_id:id,type_key:"mtf",active:true,reservable:true,call_sign:"",location:"",
    description:"",unit_admin_enabled:false,manager_ids:[id],usage_units:[id]};
  assert.ok(vehicleInputSchema.safeParse(input).success);
  assert.equal(vehicleInputSchema.safeParse({...input,manager_ids:[]}).success,false);
  assert.equal(vehicleInputSchema.safeParse({...input,usage_units:[]}).success,false);
});
test("workspace is validated and malformed server data is not a success-shaped fallback",()=>{
  assert.equal(vehicleWorkspaceSchema.safeParse({vehicles:[]}).success,false);
  assert.equal(calendarEventSchema.safeParse({entry_kind:"vehicle",vehicle_state:"REQUESTED"}).success,false);
});
test("real SDK vehicle requests send only declared PostgREST parameters",async()=>{
  const calls:{name:string;body:Record<string,unknown>}[]=[];
  const workspace={server_now:"2026-11-08T12:00:00Z",configure:false,vehicles:[],units:[],own_units:[],people:[],
    types:[],purposes:[],items:[],retained:null,tasks:[],tasks_total:0,notifications:[]};
  const context={actor_name:"Synthetic actor",request_units:[],requesters:[]};
  const client=createClient("https://syntheticci.supabase.co","sb_publishable_SYNTHETIC_CI_ONLY",{
    auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
    global:{fetch:async(input,init)=>{
      const name=String(input).split("/").at(-1)!;
      calls.push({name,body:JSON.parse(String(init?.body))});
      return new Response(JSON.stringify(name==="ff_vehicle_workspace" ? workspace :
        name==="ff_vehicle_requesters" ? context : {id,conflicts:[]}),{
        status:200,headers:{"content-type":"application/json"},
      });
    }},
  });
  await readVehicles(client,{lower_bound:"2026-11-01T00:00:00Z",upper_bound:"2026-11-08T00:00:00Z"},id,null);
  assert.deepEqual(Object.keys(calls[0].body).sort(),["lower_bound","upper_bound","target_vehicle","retained_event"].sort());
  assert.deepEqual(calls[1],{name:"ff_vehicle_requesters",body:{target_vehicle:id}});
  await requestVehicle(client,vehicleRequestPayload({...draft,requester_id:id}));
  assert.deepEqual(Object.keys(calls[2].body),["input"]);assert.equal(calls[2].name,"ff_request_vehicle");
  assert.equal((calls[2].body.input as Record<string,unknown>).requester_id,id);
});
test("vehicle intervals cover containment, equal bounds and equivalent offset representations",()=>{
  const a={starts_at:"2026-11-09T10:00:00Z",ends_at:"2026-11-09T12:00:00Z"};
  for(const b of [
    a,{starts_at:"2026-11-09T09:00:00Z",ends_at:"2026-11-09T13:00:00Z"},
    {starts_at:"2026-11-09T11:00:00Z",ends_at:"2026-11-09T11:30:00Z"},
    {starts_at:a.starts_at,ends_at:"2026-11-09T13:00:00Z"},
    {starts_at:"2026-11-09T09:00:00Z",ends_at:a.ends_at},
    {starts_at:"2026-11-09T11:00:00+01:00",ends_at:"2026-11-09T13:00:00+01:00"},
  ])assert.equal(vehicleOverlap(a,b),true);
  assert.equal(vehicleOverlap(a,{starts_at:"2026-11-09T09:00:00Z",ends_at:a.starts_at}),false);
  const winter=vehicleRequestPayload({...draft,start:"2026-10-25T00:00",end:"2026-10-26T00:00"});
  assert.equal(Date.parse(winter.ends_at)-Date.parse(winter.starts_at),25*3600000);
});
