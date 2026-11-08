import {test} from "node:test";
import assert from "node:assert/strict";
import {seriesDates,seriesRuleSchema,csvRecords,csvTemplate,parseEventCsv,CSV_HEADERS,localInterval,localDate,
  CSV_BYTE_LIMIT,type PlanningContext,type SeriesRule} from "./event-planning";
import {fromBerlin,localInput} from "./time";

const unit="b0630000-0000-4000-8000-000000000001",other="b0630000-0000-4000-8000-000000000002";
const person="a0630000-0000-4000-8000-000000000001",fn="c0630000-0000-4000-8000-000000000001";
const context:PlanningContext={actor_id:person,actor_name:"Synthetic planner",server_now:"2026-11-08T12:00:00Z",organization:true,
  units:[{id:unit,name:"Synthetic Alpha",manageable:true},{id:other,name:"Synthetic Beta",manageable:false}],
  functions:[{id:fn,name:"Synthetic Function",manageable:true}],
  organizers:[{id:person,name:"Synthetic planner",unit_ids:[unit],function_ids:[fn]}]};
const rule=(values:Partial<SeriesRule>={}):SeriesRule=>seriesRuleSchema.parse({
  start_date:"2027-03-23",start_time:"19:30",end_time:"21:30",frequency:"weekly",count:3,end_date:null,...values});
const csv=(row="23.03.2027;19:30;21:30;Synthetic service;;CI;Synthetic Alpha;regular;;")=>CSV_HEADERS.join(";")+"\r\n"+row+"\r\n";

for(const [frequency,days] of [["daily",1],["weekly",7],["biweekly",14],["threeweekly",21],["custom_weeks",28]] as const)
  test(`${frequency} retains Berlin wall time across summer transition`,()=>{
    const dates=seriesDates(rule({frequency,weeks:4}));
    assert.equal(dates.length,3);assert.equal(localInput(dates[0].starts_at),"2027-03-23T19:30");
    assert.equal(Date.parse(localInput(dates[1].starts_at).slice(0,10))-Date.parse("2027-03-23"),days*86400000);
    assert.ok(dates.every(d=>localInput(d.starts_at).endsWith("T19:30")));
  });
test("monthly day-of-month clamps without permanently shifting the anchor",()=>{
  assert.deepEqual(seriesDates(rule({frequency:"monthly",start_date:"2028-01-31"})).map(x=>localInput(x.starts_at)),
    ["2028-01-31T19:30","2028-02-29T19:30","2028-03-31T19:30"]);
});
test("monthly first Monday and third Thursday",()=>{
  assert.deepEqual(seriesDates(rule({frequency:"monthly",monthly_mode:"ordinal",start_date:"2027-01-01",weekday:1,ordinal:1})).map(x=>localInput(x.starts_at).slice(0,10)),
    ["2027-01-04","2027-02-01","2027-03-01"]);
  assert.deepEqual(seriesDates(rule({frequency:"monthly",monthly_mode:"ordinal",start_date:"2027-01-01",weekday:4,ordinal:3})).map(x=>localInput(x.starts_at).slice(0,10)),
    ["2027-01-21","2027-02-18","2027-03-18"]);
});
test("fifth weekdays skip months without that occurrence",()=>{
  const dates=seriesDates(rule({frequency:"monthly",monthly_mode:"ordinal",start_date:"2027-01-01",weekday:1,ordinal:5}));
  assert.equal(dates.length,3);assert.ok(dates.every(d=>Number(localInput(d.starts_at).slice(8,10))>=29));
});
test("inclusive end date and explicit count both bound generation",()=>{
  assert.equal(seriesDates(rule({end_date:"2027-03-30",count:52})).length,2);
  assert.equal(seriesDates(rule({end_date:"2027-03-30",count:null})).length,2);
  assert.equal(seriesDates(rule({frequency:"monthly",count:52})).length,52);
});
test("unlimited, over-limit, reverse end and excessive horizon are rejected",()=>{
  assert.throws(()=>seriesDates(rule({count:null,end_date:null})));
  assert.throws(()=>seriesDates(rule({count:53})));
  assert.throws(()=>seriesDates(rule({frequency:"daily",count:null,end_date:"2027-06-01"})),/52/);
  assert.throws(()=>seriesDates(rule({end_date:"2027-01-01"})),/vor dem Start/);
  assert.throws(()=>seriesDates(rule({end_date:"2033-01-01"})),/fünf Jahre/);
});
test("nonexistent DST times are rejected and repeated times choose the earlier instant",()=>{
  assert.throws(()=>seriesDates(rule({start_date:"2027-03-28",start_time:"02:30"})),/existiert/);
  const first=seriesDates(rule({frequency:"daily",start_date:"2027-10-31",start_time:"02:30",end_time:"04:00",count:1}))[0];
  assert.equal(first.starts_at,"2027-10-31T00:30:00.000Z");
  assert.equal(first.starts_at,fromBerlin("2027-10-31T02:30"));
});
test("overnight intervals retain local end dates, equal times and invalid dates fail",()=>{
  assert.equal(localInput(localInterval("2027-12-31","23:30","01:30").ends_at),"2028-01-01T01:30");
  assert.throws(()=>localInterval("2027-01-01","12:00","12:00"),/gleich/);
  assert.throws(()=>localDate("29.02.2027"));assert.equal(localDate("29.02.2028"),"2028-02-29");
});
test("German/ISO dates, type names and UTF-8 BOM parse",()=>{
  for(const date of ["23.03.2027","2027-03-23"]){
    const row=parseEventCsv("\uFEFF"+csv(`${date};19:30;21:30;Synthetic service;;CI;Synthetic Alpha;regular;;`),context)[0];
    assert.deepEqual(row.errors,[]);assert.equal(row.event?.unit_id,unit);
  }
});
test("quoted semicolons, line breaks and escaped quotes preserve row numbers",()=>{
  const rows=parseEventCsv(csv('2027-03-23;19:30;21:30;"Synthetic; ""quoted""";"First\nSecond";CI;Synthetic Alpha;regular;;'),context);
  assert.equal(rows[0].event?.title,'Synthetic; "quoted"');assert.equal(rows[0].event?.description,"First\nSecond");
  assert.equal(rows[0].line,2);
});
for(const [label,row] of [
  ["missing title","2027-03-23;19:30;21:30;;;CI;Synthetic Alpha;regular;;"],
  ["unknown unit","2027-03-23;19:30;21:30;Synthetic service;;CI;Unknown;regular;;"],
  ["foreign unit","2027-03-23;19:30;21:30;Synthetic service;;CI;Synthetic Beta;regular;;"],
  ["invalid clock","2027-03-23;25:30;21:30;Synthetic service;;CI;Synthetic Alpha;regular;;"],
  ["past date","2020-03-23;19:30;21:30;Synthetic service;;CI;Synthetic Alpha;regular;;"],
  ["excessive horizon","2032-03-23;19:30;21:30;Synthetic service;;CI;Synthetic Alpha;regular;;"],
  ["invalid date","2027-02-31;19:30;21:30;Synthetic service;;CI;Synthetic Alpha;regular;;"],
  ["unknown type","2027-03-23;19:30;21:30;Synthetic service;;CI;Synthetic Alpha;unknown;;"],
  ["unknown organizer","2027-03-23;19:30;21:30;Synthetic service;;CI;Synthetic Alpha;regular;;Unknown"],
] as const)test(`CSV ${label} is a visible row error`,()=>{
  const preview=parseEventCsv(csv(row),context);assert.equal(preview[0].event,null);assert.ok(preview[0].errors.length);
});
test("function scope, self organizer and ambiguous scopes",()=>{
  const valid=parseEventCsv(csv("2027-03-23;19:30;21:30;Synthetic function;;CI;;regular;Synthetic Function;"),context)[0];
  assert.equal(valid.event?.scope_kind,"function");assert.equal(valid.event?.organizer_id,person);
  assert.ok(parseEventCsv(csv("2027-03-23;19:30;21:30;Synthetic function;;CI;Synthetic Alpha;regular;Synthetic Function;"),context)[0].errors.length);
});
test("known organizers must have current eligible scope membership",()=>{
  const ctx={...context,organizers:[...context.organizers,{id:"a0630000-0000-4000-8000-000000000002",
    name:"Synthetic outsider",unit_ids:[other],function_ids:[]}]};
  const row=parseEventCsv(csv("2027-03-23;19:30;21:30;Synthetic service;;CI;Synthetic Alpha;regular;;Synthetic outsider"),ctx)[0];
  assert.equal(row.event,null);assert.match(row.errors.join(" "),/Terminbereich/);
});
test("duplicate CSV rows are marked without discarding original values",()=>{
  const line="2027-03-23;19:30;21:30;Synthetic service;;CI;Synthetic Alpha;regular;;";
  const rows=parseEventCsv(csv(line+"\r\n"+line.replace("Synthetic service","SYNTHETIC   SERVICE")),context);
  assert.equal(rows.length,2);assert.equal(rows[1].duplicate,true);assert.ok(rows[1].errors.length);
});
test("malformed quotes, wrong headers, byte and row limits fail explicitly",()=>{
  assert.throws(()=>csvRecords('"unfinished'),/geschlossen/);
  assert.throws(()=>csvRecords('"closed"x'),/quotierten/);
  assert.throws(()=>parseEventCsv("Datum,Titel\n2027-01-01,Test",context),/Spalten exakt/);
  assert.throws(()=>csvRecords("x".repeat(CSV_BYTE_LIMIT+1)),/512 KiB/);
  assert.throws(()=>parseEventCsv(csv(Array.from({length:201},()=>"a;b;c;d;e;f;g;h;i;j").join("\n")),context),/200/);
});
test("Excel template is BOM/CRLF/semicolon, explicit example and roundtrips for unit/function admins",()=>{
  for(const ctx of [context,{...context,units:context.units.map(u=>({...u,manageable:false}))}]){
    const text=csvTemplate(ctx);assert.ok(text.startsWith("\uFEFF"));assert.ok(text.includes("\r\n"));
    assert.ok(text.includes("BEISPIEL"));assert.ok(text.includes("Synthetic Beta"));
    const parsed=parseEventCsv(text,ctx);assert.equal(parsed.length,1);assert.deepEqual(parsed[0].errors,[]);
  }
});
