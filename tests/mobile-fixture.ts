import type {BrowserContext} from "@playwright/test";
import {connect,store,attendanceEvent,admin,member,unit} from "./supabase-events-fixture";
import {emptyInbox} from "./notification-fixture";

export async function mobileFixture(context:BrowserContext,role:"global"|"unit"|"member"|"delegate"="global",baseline=false){
  const state=store();
  state.now=Date.parse("2026-11-10T10:00:00Z");
  state.memberAdmin=role==="unit";
  const actor=role==="global"?admin:member;
  const inbox=emptyInbox(actor);
  const calendarQueries:Record<string,unknown>[]=[],notificationQueries:(string|null)[]=[];
  const api=baseline?"https://orxinqhhbtjpkzwlfaxq.supabase.co":"https://syntheticci.supabase.co";
  state.events=Array.from({length:4},(_,i)=>({...attendanceEvent(state,86400000+i*10800000),
    id:`30000000-0000-4000-8000-${String(i+1).padStart(12,"0")}`,
    title:["Gemeinsame Atemschutzübung – Menschenrettung und Wasserversorgung am Gerätehaus Scheuren",
      "Technische Hilfeleistung bei Verkehrsunfällen","Ausbildung an tragbaren Leitern","Gemeinsamer Übungsdienst mit Scherf"][i],
    description:"Isolierte Testdaten: Gemeinsame Ausbildung mit ausführlicher Einweisung, Stationsarbeit und anschließender Nachbesprechung.",
    location:"Gerätehaus Scheuren",event_type:i===2?"training":"regular"}));
  for(const [index,response] of (["yes","no","maybe"] as const).entries())state.answers.set(`${state.events[index].id}:${actor}`,response);
  if(role==="delegate")state.delegates.set(state.events[0].id,{user:member,note:"Isolierter delegierter Dienst"});
  await connect(context,state,actor,api);
  const statistics={services:0,practices:0,training_services:0,eligible:0,present:0,absent:0,training_present:0,
    training_absent:0,unknown:0,training_hours:0,service_hours:0,participant_hours:0,rate:null,
    average_attendance:null,pending:0,excluded:0,missing_roster:0};
  await context.route(`${api}/**`,async route=>{
    const request=route.request(),name=new URL(request.url()).pathname.split("/").at(-1);
    const respond=(data:unknown)=>route.fulfill({contentType:"application/json",body:JSON.stringify(data)});
    if(name==="ff_calendar_context")return respond({organization:role==="global",configure:false,
      units:[{id:unit,name:"Scheuren"}],manageable_units:[],functions:[],resources:[],categories:[],organizers:[]});
    if(name==="ff_calendar_page" || name==="ff_calendar_upcoming"){
      const input=request.postDataJSON();calendarQueries.push(input);
      const visible=state.events.filter(event=>name==="ff_calendar_upcoming"?Date.parse(event.ends_at)>state.now:
        Date.parse(event.starts_at)<Date.parse(input.upper_bound)&&Date.parse(event.ends_at)>Date.parse(input.lower_bound))
        .sort((a,b)=>Date.parse(a.starts_at)-Date.parse(b.starts_at)||a.id.localeCompare(b.id));
      const events=visible.slice(0,name==="ff_calendar_upcoming"?input.page_size:visible.length);
      const last=events.at(-1);
      return respond({server_now:new Date(state.now).toISOString(),
        next_cursor:last&&events.length<visible.length?{id:last.id,starts_at:last.starts_at}:null,retained_events:[],
        events:events.map(event=>({...event,organizer_id:admin,organizer_name:"Synthetic Admin",scope_kind:"unit",scope_name:"Scheuren",
        function_id:null,own_response:state.answers.get(`${event.id}:${actor}`)??null,entry_kind:"participation",all_day:false,
        audience:"scope",category_id:null,category_name:null,resource_id:null,resource_name:null,can_manage:role==="global",unit_ids:[]}))});
    }
    if(name==="ff_vehicle_workspace")return respond({server_now:new Date(state.now).toISOString(),configure:false,vehicles:[],
      units:[{id:unit,name:"Scheuren"}],own_units:[{id:unit,name:"Scheuren"}],people:[],types:[],purposes:[],
      items:[],retained:null,tasks:[],tasks_total:0,notifications:[]});
    if(name==="ff_vehicle_requesters")return respond({actor_name:"Synthetic Member",request_units:[],requesters:[]});
    if(name==="ff_event_planning_context")return respond({actor_id:actor,actor_name:"Synthetic Admin",server_now:new Date(state.now).toISOString(),
      units:[{id:unit,name:"Scheuren",manageable:role==="global" || role==="unit"}],functions:[],organization:role==="global",
      organizers:[{id:actor,name:"Synthetic Admin",unit_ids:[unit],function_ids:[]}]});
    if(name==="ff_reports_context")return respond({current_year:2026,years:[2026],organization:false,configure:false,
      personal_units:[{id:unit,name:"Scheuren"}],units:[],functions:[],event_types:[]});
    if(name==="ff_year_report"){
      const input=request.postDataJSON();
      return respond({year:input.wanted_year,scope:input.report_scope,target:input.target_scope,scope_name:"Synthetic Member",
        summary:{...statistics,members:1},members:[],units:[],events:[],page:input.page_number,event_count:0,has_more:false});
    }
    if(name==="ff_notifications"){
      const id=request.postDataJSON().notice_id;notificationQueries.push(id);
      return respond({...inbox,notices:id?inbox.notices.filter(notice=>notice.id===id):inbox.notices});
    }
    if(name==="ff_notification_read"){
      const id=request.postDataJSON().notice_id;
      inbox.notices.forEach(notice=>{if(!id||notice.id===id)notice.read_at=new Date(state.now).toISOString();});
      inbox.unread=inbox.notices.filter(notice=>!notice.read_at).length;
      return respond(null);
    }
    if(name==="ff_push_current")return respond(null);
    return route.fallback();
  });
  return {state,actor,inbox,calendarQueries,notificationQueries};
}
