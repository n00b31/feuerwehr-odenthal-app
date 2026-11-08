import test from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { readCalendar } from "../data/supabase-calendar";
import { calendarRange,moveCalendar,calendarPayload,calendarInterval,eventsOnDay,weekPlacement,weekColumns,emptyCalendarFilters,type CalendarDraft,type CalendarEvent } from "./calendar";

test("month grids are 42 Monday-based days including adjacent month events",() => {
  const range=calendarRange("2026-11-07","month");
  assert.equal(range.start,"2026-10-26"); assert.equal(range.days.length,42); assert.equal(range.end,"2026-12-07");
  assert.equal(moveCalendar("2026-12-31","month",1),"2027-01-01");
});
test("weeks and chronological list ranges navigate independently",() => {
  assert.equal(calendarRange("2026-11-08","week").start,"2026-11-02");
  assert.equal(calendarRange("2026-11-07","list").start,"2026-11-07");
  assert.equal(moveCalendar("2026-11-07","week",-1),"2026-10-31");
});
const draft: CalendarDraft={title:"Synthetic calendar",description:"",location:"Test",start:"2026-03-29T00:00",end:"2026-03-29T00:00",
  all_day:true,entry_kind:"information",scope_kind:"organization",unit_id:"",function_id:"",organizer_id:"11000000-0000-4000-8000-000000000001",
  category_id:"21000000-0000-4000-8000-000000000001",resource_id:"",audience:"scope",unit_ids:[]};
const fixture:CalendarEvent={...calendarPayload(draft),id:"31000000-0000-4000-8000-000000000001",
  organizer_name:"Synthetic organizer",scope_name:"Organization",status:"scheduled",revision:0,
  category_name:"Synthetic category",resource_name:null,can_manage:true};
test("all-day events span actual 23/25-hour Berlin days, with exclusive stored end",() => {
  let value=calendarPayload(draft);
  assert.equal((Date.parse(value.ends_at)-Date.parse(value.starts_at))/3600000,23);
  value=calendarPayload({...draft,start:"2026-10-25T00:00",end:"2026-10-25T00:00"});
  assert.equal((Date.parse(value.ends_at)-Date.parse(value.starts_at))/3600000,25);
  assert.equal(value.response_deadline,null); assert.equal(value.event_type,"other");
});
test("nonexistent DST wall clocks and invalid booking/scope combinations fail explicitly",() => {
  assert.throws(() => calendarPayload({...draft,all_day:false,start:"2026-03-29T02:30",end:"2026-03-29T04:00"}),/existiert/);
  assert.throws(() => calendarPayload({...draft,entry_kind:"booking"}),/Gerätehaus/);
  assert.throws(() => calendarPayload({...draft,audience:"units"}),/Zieleinheiten/);
});
test("cross-midnight events use half-open day intersections, no duplicate midnight event",() => {
  const event={...fixture,starts_at:"2026-11-06T23:00:00Z",ends_at:"2026-11-07T23:00:00Z"};
  assert.equal(eventsOnDay([event],"2026-11-07").length,1);
  assert.equal(eventsOnDay([event],"2026-11-08").length,0);
});
test("repeated autumn hours remain visible on the temporal week grid",() => {
  const event={...fixture,starts_at:"2026-10-25T00:30:00Z",ends_at:"2026-10-25T01:30:00Z"};
  assert.equal(weekPlacement(event,"2026-10-25").top,75);
  assert.ok(weekPlacement(event,"2026-10-25").height>=44);
});
test("three concurrent week entries use separate visual lanes, all-day entries use the header",()=>{
  const events=[1,2,3].map(i=>({...fixture,id:`31000000-0000-4000-8000-00000000000${i}`,all_day:false}));
  assert.equal(weekColumns([...events,fixture],"2026-03-29").items.length,3);
  assert.equal(weekColumns(events,"2026-03-29").lanes,3);
});
test("multi-day details include the inclusive last day and repeated-hour offsets",()=>{
  assert.match(calendarInterval({...fixture,ends_at:"2026-03-31T22:00:00Z"}),/31\./);
  const interval=calendarInterval({...fixture,all_day:false,starts_at:"2026-10-25T00:30:00Z",ends_at:"2026-10-25T01:30:00Z"});
  assert.match(interval,/MESZ/);assert.match(interval,/MEZ/);
});
test("calendar SDK requests contain only RPC parameters, not view metadata, on every cursor page",async()=>{
  const requests: Record<string,unknown>[]=[];
  const range=calendarRange("2026-11-07","month");
  const client=createClient("https://syntheticci.supabase.co","synthetic-public-key",{
    auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
    global:{fetch:async(input,init)=>{
      const url=new URL(typeof input==="string" || input instanceof URL ? input : input.url);
      if(url.pathname.endsWith("/ff_calendar_context")) return Response.json({
        organization:false,configure:false,units:[],manageable_units:[],functions:[],
        resources:[],categories:[],organizers:[],
      });
      assert.equal(url.pathname,"/rest/v1/rpc/ff_calendar_page");
      const body:Record<string,unknown>=JSON.parse(String(init?.body));
      assert.deepEqual(Object.keys(body).sort(),[
        "lower_bound","upper_bound","scopes","wanted_units","wanted_types","wanted_kinds",
        "wanted_categories","wanted_resources","show_cancelled","after_start","after_id","retained_ids",
      ].sort());
      assert.equal(body.lower_bound,range.lower_bound);
      assert.equal(body.upper_bound,range.upper_bound);
      assert.deepEqual(body.retained_ids,[fixture.id]);
      requests.push(body);
      return Response.json({server_now:"2026-11-07T10:00:00Z",events:[],retained_events:[],
        next_cursor:requests.length===1 ? {id:fixture.id,starts_at:fixture.starts_at} : null});
    }},
  });
  const result=await readCalendar(client,range,emptyCalendarFilters,[fixture.id]);
  assert.equal(result.events.length,0);
  assert.equal(requests.length,2);
  assert.equal(requests[0].after_id,null);
  assert.equal(requests[1].after_id,fixture.id);
  assert.equal(requests[1].after_start,fixture.starts_at);
});
