import test from "node:test";
import assert from "node:assert/strict";
import { calendarRange,moveCalendar,calendarPayload,eventsOnDay,weekPlacement,type CalendarDraft,type CalendarEvent } from "./calendar";

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
  const event={id:"1",starts_at:"2026-11-06T23:00:00Z",ends_at:"2026-11-07T23:00:00Z"} as CalendarEvent;
  assert.equal(eventsOnDay([event],"2026-11-07").length,1);
  assert.equal(eventsOnDay([event],"2026-11-08").length,0);
});
test("repeated autumn hours remain visible on the temporal week grid",() => {
  const event={starts_at:"2026-10-25T00:30:00Z",ends_at:"2026-10-25T01:30:00Z"} as CalendarEvent;
  assert.equal(weekPlacement(event,"2026-10-25").top,75);
  assert.ok(weekPlacement(event,"2026-10-25").height>=44);
});
