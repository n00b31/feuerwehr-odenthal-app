begin;
do $$ begin if current_database()<>'ff_dev_ci' then raise exception 'Disposable CI required'; end if; end $$;
create function pg_temp.calendar_assert(value boolean,label text)
returns void language plpgsql as $$ begin
  if value is distinct from true then raise exception 'FAIL: %',label; end if;
  raise notice 'PASS: %',label;
end $$;
create function pg_temp.calendar_denied(statement text)
returns void language plpgsql as $$ begin
  execute statement; raise exception 'FAIL: unauthorized statement succeeded';
exception when insufficient_privilege then raise notice 'PASS: unauthorized calendar operation denied';
end $$;
create function pg_temp.calendar_payload(title text,kind text,unit uuid,resource uuid default null)
returns jsonb language sql as $$
  select jsonb_build_object('title',title,'description','Synthetic DEV 0.5 fixture','location','Synthetic location',
    'entry_kind',kind,'all_day',false,'scope_kind',case when unit is null then 'organization' else 'unit' end,
    'unit_id',unit,'function_id',null,'organizer_id',auth.uid(),'audience','scope','unit_ids','[]'::jsonb,
    'resource_id',resource,'category_id',(select id from public.calendar_categories order by name limit 1),
    'starts_at',clock_timestamp()+interval '2 days','ends_at',clock_timestamp()+interval '2 days 2 hours');
$$;
select pg_temp.calendar_assert((select count(*)=5 from public.calendar_resources),'exactly five initial fire-station resources');
select pg_temp.calendar_assert((select count(*)=5 and count(distinct r.unit_id)=5 from public.calendar_resources r
  join public.units u on u.id=r.unit_id where r.resource_type='building' and r.active),'one active building assigned to every existing unit');
select pg_temp.calendar_assert((select count(*)=5 from public.audit_entries where after_data->>'source'='DEV051-firestations'),
  'repeated fire-station migration creates no duplicate resources or audit rows');
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
select ('a0500000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'synthetic.calendar.'||i||'@feuerwehr-odenthal.de',
  clock_timestamp(),jsonb_build_object('display_name','Synthetic Calendar '||i) from generate_series(1,7) i;
select set_config('cal.unit',(select id::text from public.units where code='scheuren'),true);
select set_config('cal.other',(select id::text from public.units where code='blecher'),true);
select set_config('cal.function',(select id::text from public.special_functions order by code limit 1),true);
select set_config('cal.lower',((current_date+2)::timestamp at time zone 'Europe/Berlin')::text,true);
select set_config('cal.upper',((current_date+5)::timestamp at time zone 'Europe/Berlin')::text,true);
select ff_private.bootstrap_global_admin('a0500000-0000-4000-8000-000000000001',current_setting('cal.unit')::uuid);
select set_config('request.jwt.claim.sub','a0500000-0000-4000-8000-000000000001',true);
set local role authenticated;
select public.ff_approve_member('a0500000-0000-4000-8000-000000000002',current_setting('cal.unit')::uuid);
select public.ff_approve_member('a0500000-0000-4000-8000-000000000003',current_setting('cal.unit')::uuid);
select public.ff_approve_member('a0500000-0000-4000-8000-000000000004',current_setting('cal.other')::uuid);
select public.ff_approve_member('a0500000-0000-4000-8000-000000000005',current_setting('cal.unit')::uuid);
select public.ff_approve_member('a0500000-0000-4000-8000-000000000006',current_setting('cal.other')::uuid);
select public.ff_approve_member('a0500000-0000-4000-8000-000000000007',(select id from public.units where code='eikamp'));
select public.ff_set_role('a0500000-0000-4000-8000-000000000003','UNIT_ADMIN',current_setting('cal.unit')::uuid,null,true);
select public.ff_set_function_membership('a0500000-0000-4000-8000-000000000005',current_setting('cal.function')::uuid,true,'Synthetic calendar function');
select public.ff_set_role('a0500000-0000-4000-8000-000000000005','FUNCTION_ADMIN',null,current_setting('cal.function')::uuid,true);
select public.ff_set_role('a0500000-0000-4000-8000-000000000006','FIRE_CHIEF',null,null,true);
select pg_temp.calendar_assert(jsonb_array_length(public.ff_calendar_context()->'resources')=5,'GLOBAL_ADMIN sees all five buildings');
select set_config('cal.resource',(select id::text from public.calendar_resources where unit_id=current_setting('cal.unit')::uuid and resource_type='building'),true);
select set_config('cal.foreign_resource',(select id::text from public.calendar_resources where unit_id=current_setting('cal.other')::uuid and resource_type='building'),true);
select pg_temp.calendar_assert(public.ff_save_calendar_event(pg_temp.calendar_payload('Synthetic global cross-unit booking','booking',
  current_setting('cal.unit')::uuid,current_setting('cal.foreign_resource')::uuid))->>'id' is not null,
  'GLOBAL_ADMIN may coordinate an authorized cross-unit resource booking');
select set_config('cal.info',(public.ff_save_calendar_event(pg_temp.calendar_payload('Synthetic public information','information',null))->>'id'),true);
select set_config('cal.private',(public.ff_save_calendar_event(pg_temp.calendar_payload('Synthetic leadership booking','booking',current_setting('cal.unit')::uuid,
  current_setting('cal.resource')::uuid)||jsonb_build_object('audience','leadership'))->>'id'),true);
select set_config('cal.multi',(public.ff_save_calendar_event(pg_temp.calendar_payload('Synthetic multiple units','information',null)||
  jsonb_build_object('audience','units','unit_ids',jsonb_build_array(current_setting('cal.unit'),current_setting('cal.other'))))->>'id'),true);
select set_config('cal.function_event',(public.ff_save_calendar_event(pg_temp.calendar_payload('Synthetic function event','information',null)||
  jsonb_build_object('scope_kind','function','function_id',current_setting('cal.function'),'organizer_id','a0500000-0000-4000-8000-000000000005'))->>'id'),true);
select set_config('cal.service',public.ff_create_single_event(jsonb_build_object('title','Synthetic existing service','description','',
  'location','Test','unit_id',current_setting('cal.unit'),'event_type','regular',
  'starts_at',clock_timestamp()+interval '2 days','ends_at',clock_timestamp()+interval '2 days 1 hour'))::text,true);
select pg_temp.calendar_assert((select count(*)=0 from public.event_roster where event_id=current_setting('cal.info')::uuid),'information has no RSVP roster');
select pg_temp.calendar_assert((select count(*)=1 from jsonb_array_elements(public.ff_calendar_page(current_setting('cal.lower')::timestamptz,
  current_setting('cal.upper')::timestamptz)->'events') e where e->>'id'=current_setting('cal.service')),'existing service has one canonical calendar identity');
select pg_temp.calendar_assert((select count(*)=count(distinct e->>'id') from jsonb_array_elements(public.ff_calendar_page(
  current_setting('cal.lower')::timestamptz,current_setting('cal.upper')::timestamptz)->'events') e),'calendar introduces no duplicates');
select pg_temp.calendar_assert((select count(*)=0 from jsonb_array_elements(public.ff_events_page()->'events') e
  where e->>'id'=current_setting('cal.info')),'information does not pollute legacy duty management');
select pg_temp.calendar_assert((select count(*)=0 from jsonb_array_elements(public.ff_events_workspace()->'events') e
  where e->>'id'=current_setting('cal.info')),'information also excluded from compatibility workspace');
select pg_temp.calendar_assert((select after_data->'unit_ids' @> jsonb_build_array(current_setting('cal.unit'))
  from public.audit_entries where event_id=current_setting('cal.multi')::uuid and action='calendar_event_saved' limit 1),
  'audits capture explicit target unit identities');
select set_config('cal.distant',(public.ff_save_calendar_event(pg_temp.calendar_payload('Synthetic distant information','information',null)||
  jsonb_build_object('starts_at',clock_timestamp()+interval '80 days','ends_at',clock_timestamp()+interval '80 days 2 hours'))->>'id'),true);
select set_config('cal.past',(public.ff_save_calendar_event(pg_temp.calendar_payload('Synthetic past information','information',null)||
  jsonb_build_object('starts_at',clock_timestamp()-interval '2 days','ends_at',clock_timestamp()-interval '1 day'))->>'id'),true);
select pg_temp.calendar_assert(jsonb_array_length(public.ff_calendar_upcoming()->'events')=5,
  'mobile calendar initially returns exactly five visible upcoming entries');
select pg_temp.calendar_assert(public.ff_calendar_upcoming()->'next_cursor'<>'null'::jsonb,
  'mobile upcoming entries expose more available results');
select pg_temp.calendar_assert((select count(*)=1 from jsonb_array_elements(public.ff_calendar_upcoming(page_size=>400)->'events') e
  where e->>'id'=current_setting('cal.distant')),'upcoming list includes next entries beyond the 42-day calendar window');
select pg_temp.calendar_assert(not exists(select 1 from jsonb_array_elements(public.ff_calendar_upcoming(page_size=>400)->'events') e
  where (e->>'ends_at')::timestamptz<=statement_timestamp()),'completed events are excluded using server time');
select pg_temp.calendar_assert(not exists(select 1 from (
  select (e->>'starts_at')::timestamptz starts,lag((e->>'starts_at')::timestamptz) over(order by position) previous
  from jsonb_array_elements(public.ff_calendar_upcoming(page_size=>400)->'events') with ordinality x(e,position)) ordered
  where previous>starts),'upcoming list preserves chronological ordering');
reset role;

select set_config('request.jwt.claim.sub','a0500000-0000-4000-8000-000000000002',true);
set local role authenticated;
select pg_temp.calendar_assert(jsonb_array_length(public.ff_calendar_context()->'resources')=1
  and (select count(*)=1 from public.calendar_resources where unit_id=current_setting('cal.unit')::uuid),
  'MEMBER resource SELECT/RLS is limited to own building');
select pg_temp.calendar_assert((select count(*)=1 from public.events where id=current_setting('cal.info')::uuid),'global information visible to member');
select pg_temp.calendar_assert((select count(*)=0 from public.events where id=current_setting('cal.private')::uuid),'leadership booking hidden by event RLS');
select pg_temp.calendar_assert((select count(*)=0 from public.event_calendar where event_id=current_setting('cal.private')::uuid),'metadata RLS also protects private event');
select pg_temp.calendar_assert((select count(*)=1 from public.events where id=current_setting('cal.multi')::uuid),'target unit member sees multi-unit information');
select pg_temp.calendar_assert((select count(*)=0 from public.events where id=current_setting('cal.function_event')::uuid),'function event protected');
select pg_temp.calendar_assert(not exists(select 1 from jsonb_array_elements(public.ff_calendar_upcoming(page_size=>400,
  retained_ids=>array[current_setting('cal.private')::uuid])->'events') e
  where e->>'id' in(current_setting('cal.private'),current_setting('cal.function_event'))),
  'upcoming query preserves member visibility and does not expose private or unrelated function entries');
select pg_temp.calendar_assert(jsonb_array_length(public.ff_calendar_upcoming(
  retained_ids=>array[current_setting('cal.private')::uuid])->'retained_events')=0,
  'forged retained IDs cannot expose private upcoming entries');
select pg_temp.calendar_assert(public.ff_calendar_conflicts(current_setting('cal.resource')::uuid,current_setting('cal.lower')::timestamptz,
  current_setting('cal.upper')::timestamptz)#>>'{0,title}'='Bereits belegt (Details geschützt)','busy interval does not leak private title');
select pg_temp.calendar_assert(public.ff_calendar_conflicts(current_setting('cal.resource')::uuid,current_setting('cal.lower')::timestamptz,
  current_setting('cal.upper')::timestamptz)#>'{0,id}'='null'::jsonb,'busy interval does not leak private identity');
select pg_temp.calendar_denied($q$select public.ff_save_calendar_event(pg_temp.calendar_payload('Unauthorized information','information',null))$q$);
select pg_temp.calendar_denied($q$select public.ff_save_calendar_resource(jsonb_build_object('name','Forged resource','resource_type','building','active',true))$q$);
select pg_temp.calendar_denied($q$select public.ff_set_response(current_setting('cal.info')::uuid,'yes')$q$);
select public.ff_set_response(current_setting('cal.service')::uuid,'yes');
reset role;

select set_config('request.jwt.claim.sub','a0500000-0000-4000-8000-000000000003',true);
set local role authenticated;
select pg_temp.calendar_assert(jsonb_array_length(public.ff_calendar_context()->'resources')=1,'UNIT_ADMIN sees own authorized building');
select pg_temp.calendar_assert(jsonb_array_length(public.ff_save_calendar_event(pg_temp.calendar_payload('Synthetic overlap warning','booking',
  current_setting('cal.unit')::uuid,current_setting('cal.resource')::uuid))->'conflicts')=1,'overlap warns without blocking permitted save');
select set_config('cal.own',(public.ff_save_calendar_event(pg_temp.calendar_payload('Synthetic own information','information',current_setting('cal.unit')::uuid))->>'id'),true);
select public.ff_save_calendar_event(pg_temp.calendar_payload('Synthetic changed information','information',current_setting('cal.unit')::uuid),
  current_setting('cal.own')::uuid,0);
select pg_temp.calendar_assert((select title='Synthetic changed information' and revision=1 from public.events where id=current_setting('cal.own')::uuid),'organizational editing increments revision');
select public.ff_change_calendar_event(current_setting('cal.own')::uuid,1,'cancel','Synthetic cancellation');
select public.ff_change_calendar_event(current_setting('cal.own')::uuid,2,'archive','Synthetic archive');
select pg_temp.calendar_assert((select count(*)=0 from jsonb_array_elements(public.ff_calendar_page(
  current_setting('cal.lower')::timestamptz,current_setting('cal.upper')::timestamptz)->'events') e
  where e->>'id'=current_setting('cal.own')),'archived event leaves calendar without deletion');
select pg_temp.calendar_denied($q$select public.ff_save_calendar_event(pg_temp.calendar_payload('Forged foreign unit','information',current_setting('cal.other')::uuid))$q$);
select pg_temp.calendar_denied($q$select public.ff_save_calendar_event(pg_temp.calendar_payload('Forged foreign resource','booking',
  current_setting('cal.unit')::uuid,current_setting('cal.foreign_resource')::uuid))$q$);
select pg_temp.calendar_denied($q$select public.ff_save_calendar_category('Forged category')$q$);
select pg_temp.calendar_denied($q$update public.calendar_resources set active=false where id=current_setting('cal.resource')::uuid$q$);
select pg_temp.calendar_denied($q$select public.ff_save_calendar_event(pg_temp.calendar_payload('Forged organization','information',null))$q$);
reset role;

select set_config('request.jwt.claim.sub','a0500000-0000-4000-8000-000000000006',true);
set local role authenticated;
select pg_temp.calendar_assert((public.ff_calendar_context()->>'organization')::boolean and not(public.ff_calendar_context()->>'configure')::boolean,
  'FIRE_CHIEF has explicit organization calendar authority, no technical configuration');
select pg_temp.calendar_assert(jsonb_array_length(public.ff_calendar_context()->'resources')=5,'FIRE_CHIEF reads organization-wide building resources');
select public.ff_save_calendar_event(pg_temp.calendar_payload('Synthetic chief organization event','information',null));
select pg_temp.calendar_denied($q$select public.ff_save_calendar_category('Forged chief category')$q$);
select pg_temp.calendar_denied($q$select public.ff_set_account_status('a0500000-0000-4000-8000-000000000002','suspended','Forbidden chief suspension')$q$);
reset role;
select set_config('request.jwt.claim.sub','a0500000-0000-4000-8000-000000000007',true);
set local role authenticated;
select pg_temp.calendar_assert((select count(*)=0 from public.events where id=current_setting('cal.multi')::uuid),'unselected unit cannot see targeted event');
reset role;
select set_config('request.jwt.claim.sub','a0500000-0000-4000-8000-000000000005',true);
set local role authenticated;
select public.ff_save_calendar_event(pg_temp.calendar_payload('Synthetic function administration','information',null)||
  jsonb_build_object('scope_kind','function','function_id',current_setting('cal.function')));
select pg_temp.calendar_denied($q$select public.ff_save_calendar_event(pg_temp.calendar_payload('Forged function global event','information',null))$q$);
reset role;
select set_config('request.jwt.claim.sub','a0500000-0000-4000-8000-000000000001',true);
set local role authenticated;
select public.ff_save_calendar_event(pg_temp.calendar_payload('Synthetic DST full day','information',null)||
  jsonb_build_object('all_day',true,'starts_at','2026-03-28T23:00:00Z','ends_at','2026-03-29T22:00:00Z'));
select pg_temp.calendar_assert(public.ff_year_report(2026)->'summary'->>'pending'='0','informational past events do not manufacture pending dutybooks');
select pg_temp.calendar_assert(jsonb_array_length(public.ff_calendar_page('2026-03-28T23:00:00Z','2026-03-29T22:00:00Z',
  wanted_kinds=>array['information'])->'events')=1,'Berlin 23-hour day query includes all-day event');
select public.ff_save_calendar_event(pg_temp.calendar_payload('Synthetic autumn full day','information',null)||
  jsonb_build_object('all_day',true,'starts_at','2026-10-24T22:00:00Z','ends_at','2026-10-25T23:00:00Z'));
select pg_temp.calendar_assert(jsonb_array_length(public.ff_calendar_page('2026-10-24T22:00:00Z','2026-10-25T23:00:00Z',
  wanted_kinds=>array['information'])->'events')=1,'Berlin 25-hour day includes all-day event');
select pg_temp.calendar_assert(jsonb_array_length(public.ff_calendar_conflicts(current_setting('cal.resource')::uuid,
  (select max(e.ends_at) from public.events e join public.event_calendar c on c.event_id=e.id where c.resource_id=current_setting('cal.resource')::uuid),
  (select max(e.ends_at)+interval '1 hour' from public.events e join public.event_calendar c on c.event_id=e.id where c.resource_id=current_setting('cal.resource')::uuid)))=0,
  'back-to-back bookings do not overlap');
select public.ff_save_calendar_event(pg_temp.calendar_payload('Synthetic edited building booking','booking',
  current_setting('cal.unit')::uuid,current_setting('cal.resource')::uuid),
  (select id from public.events where title='Synthetic overlap warning'),0);
select pg_temp.calendar_assert((select revision=1 from public.events where title='Synthetic edited building booking'),
  'building booking can be edited without changing its resource identity');
select public.ff_change_calendar_event((select id from public.events where title='Synthetic edited building booking'),1,'cancel','Synthetic booking cancellation');
select pg_temp.calendar_assert(jsonb_array_length(public.ff_calendar_conflicts(current_setting('cal.resource')::uuid,
  current_setting('cal.lower')::timestamptz,current_setting('cal.upper')::timestamptz))=1,
  'cancelled booking no longer contributes a resource conflict');
select pg_temp.calendar_assert((select count(*)=2 from jsonb_array_elements(public.ff_calendar_page(
  current_setting('cal.lower')::timestamptz,current_setting('cal.upper')::timestamptz,
  wanted_types=>array['regular']::public.ff_event_type[],wanted_kinds=>array['information'])->'events') e
  where e->>'id' in (current_setting('cal.service'),current_setting('cal.info'))),
  'service type and organizational kind combine with OR within feature group');
select pg_temp.calendar_assert((select count(*)=1 from jsonb_array_elements(public.ff_calendar_page(
  current_setting('cal.lower')::timestamptz,current_setting('cal.upper')::timestamptz,
  wanted_units=>array[current_setting('cal.unit')::uuid],wanted_kinds=>array['information'])->'events') e
  where e->>'id'=current_setting('cal.multi')),'unit filter includes explicitly targeted multi-unit entry');
select pg_temp.calendar_assert(jsonb_array_length(public.ff_calendar_page(current_setting('cal.lower')::timestamptz,
  current_setting('cal.upper')::timestamptz,retained_ids=>array[current_setting('cal.own')::uuid])->'retained_events')=0,
  'retained archived entry is explicitly no longer available');
select pg_temp.calendar_denied($q$select public.ff_update_single_event(current_setting('cal.info')::uuid,0,
  pg_temp.calendar_payload('Forged legacy editing','information',null)||jsonb_build_object('event_type','regular'))$q$);
select pg_temp.calendar_denied($q$select public.ff_cancel_single_event(current_setting('cal.info')::uuid,0,'Forbidden legacy cancellation')$q$);
select pg_temp.calendar_denied($q$insert into public.calendar_resources(name,resource_type) values('Forged direct write','building')$q$);
do $$ begin
  begin
    perform public.ff_save_calendar_resource(jsonb_build_object('name','Synthetic stale resource','resource_type','building',
      'unit_id',current_setting('cal.unit'),'active',true),current_setting('cal.resource')::uuid,99);
    raise exception 'FAIL: stale resource accepted';
  exception when serialization_failure then raise notice 'PASS: stale resource revision rejected';
  end;
end $$;
do $$ declare i int; begin
  for i in 1..401 loop
    perform public.ff_save_calendar_event(pg_temp.calendar_payload('Synthetic cursor '||i,'information',null)||
      jsonb_build_object('starts_at','2028-01-02T00:00:00Z'::timestamptz+i*interval '1 minute',
        'ends_at','2028-01-02T01:00:00Z'::timestamptz+i*interval '1 minute'));
  end loop;
end $$;
do $$ declare first jsonb; second jsonb; begin
  first:=public.ff_calendar_page('2028-01-01T23:00:00Z','2028-01-02T23:00:00Z');
  perform pg_temp.calendar_assert(jsonb_array_length(first->'events')=400 and first->'next_cursor'<>'null'::jsonb,'400-entry bounded first cursor page');
  second:=public.ff_calendar_page('2028-01-01T23:00:00Z','2028-01-02T23:00:00Z',
    after_start=>(first#>>'{next_cursor,starts_at}')::timestamptz,after_id=>(first#>>'{next_cursor,id}')::uuid);
  perform pg_temp.calendar_assert(jsonb_array_length(second->'events')=1 and second->'next_cursor'='null'::jsonb,'final cursor page has remaining entry, no silent truncation');
end $$;
select pg_temp.calendar_denied($q$select public.ff_prepare_attendance(current_setting('cal.info')::uuid)$q$);
select pg_temp.calendar_assert((select count(*)>0 from public.audit_entries where action like 'calendar_%'),'calendar changes audited');
rollback;
