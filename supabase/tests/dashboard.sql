begin;
do $$ begin if current_database()<>'ff_dev_ci' then raise exception 'Disposable CI required'; end if; end $$;
create function pg_temp.d_user(i int) returns uuid language sql immutable as $$
  select ('a0640000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid;
$$;
create function pg_temp.d_event(i int) returns uuid language sql immutable as $$
  select ('e0640000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid;
$$;
create function pg_temp.d_ok(value boolean,label text) returns void language plpgsql as $$
begin if value is distinct from true then raise exception 'FAIL: %',label; end if; raise notice 'PASS: %',label; end $$;
create function pg_temp.d_deny(statement text) returns void language plpgsql as $$
begin execute statement;raise exception 'FAIL: unauthorized dashboard access';
exception when insufficient_privilege then raise notice 'PASS: dashboard denied'; end $$;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
select pg_temp.d_user(i),'synthetic.cockpit.'||i||'@feuerwehr-odenthal.de',clock_timestamp(),
  jsonb_build_object('display_name','Synthetic cockpit '||i) from generate_series(1,9) i;
select set_config('d.a',(select id::text from public.units where code='scheuren'),true);
select set_config('d.b',(select id::text from public.units where code='blecher'),true);
select set_config('d.fn',(select id::text from public.special_functions order by name limit 1),true);
select ff_private.bootstrap_global_admin(pg_temp.d_user(1),current_setting('d.a')::uuid);
select set_config('request.jwt.claim.sub',pg_temp.d_user(1)::text,true);
set local role authenticated;
select public.ff_approve_member(pg_temp.d_user(i),case when i in(3,5) then current_setting('d.b')::uuid else current_setting('d.a')::uuid end)
  from generate_series(2,8) i;
select public.ff_set_role(pg_temp.d_user(4),'UNIT_ADMIN',current_setting('d.a')::uuid);
select public.ff_set_role(pg_temp.d_user(5),'FIRE_CHIEF');
select public.ff_set_role(pg_temp.d_user(7),'FUNCTION_ADMIN',null,current_setting('d.fn')::uuid);
select public.ff_set_function_membership(pg_temp.d_user(7),current_setting('d.fn')::uuid,true,'Synthetic function');
select set_config('d.vehicle',public.ff_save_vehicle(jsonb_build_object('name','Synthetic cockpit vehicle',
  'unit_id',current_setting('d.a'),'type_key','mtf','call_sign','','location','Synthetic CI','description','',
  'active',true,'reservable',true,'unit_admin_enabled',false,
  'manager_ids',jsonb_build_array(pg_temp.d_user(6)),'usage_units',jsonb_build_array(current_setting('d.a'),current_setting('d.b'))))::text,true);
reset role;
insert into public.events(id,title,event_type,starts_at,ends_at,location,scope_kind,unit_id,organizer_id)
select pg_temp.d_event(i),'Synthetic cockpit event '||i,case when i=6 then 'community'::public.ff_event_type else 'regular'::public.ff_event_type end,
  statement_timestamp()+i*interval '1 day',statement_timestamp()+i*interval '1 day'+interval '2 hours',
  'Synthetic CI','unit',case when i=7 then current_setting('d.b')::uuid else current_setting('d.a')::uuid end,pg_temp.d_user(1)
  from generate_series(1,9) i;
insert into public.events(id,title,event_type,starts_at,ends_at,location,scope_kind,function_id,organizer_id)
values(pg_temp.d_event(10),'Synthetic cockpit function','regular',statement_timestamp()+interval '12 hours',
  statement_timestamp()+interval '14 hours','Synthetic CI','function',current_setting('d.fn')::uuid,pg_temp.d_user(1));
insert into public.events(id,title,event_type,starts_at,ends_at,location,scope_kind,unit_id,organizer_id)
select pg_temp.d_event(i),'Synthetic cockpit information '||i,'other',statement_timestamp()+interval '1 day',
  statement_timestamp()+interval '2 days','Synthetic CI',
  case when i=13 then 'organization'::public.ff_scope else 'unit'::public.ff_scope end,
  case when i=13 then null when i=12 then current_setting('d.b')::uuid else current_setting('d.a')::uuid end,pg_temp.d_user(1)
  from generate_series(11,14) i;
insert into public.event_calendar(event_id,entry_kind,audience,category_id,archived_at)
select pg_temp.d_event(i),'information','scope',(select id from public.calendar_categories where name='Organisatorischer Termin'),
  case when i=14 then clock_timestamp() else null end from generate_series(11,14) i;
update public.events set status='cancelled' where id=pg_temp.d_event(3);
update public.events set response_deadline=statement_timestamp()-interval '1 hour' where id=pg_temp.d_event(4);
select set_config('request.jwt.claim.sub',pg_temp.d_user(2)::text,true);
set local role authenticated;
select public.ff_set_response(pg_temp.d_event(2),'yes');
select public.ff_set_response(pg_temp.d_event(5),'yes');
reset role;
update public.participation_responses set invalidated_at=clock_timestamp() where event_id=pg_temp.d_event(5);
select set_config('request.jwt.claim.sub',pg_temp.d_user(2)::text,true);
set local role authenticated;
select set_config('d.snapshot',public.ff_dashboard()::text,true);
select pg_temp.d_ok(current_setting('d.snapshot')::jsonb->>'actor_id'=pg_temp.d_user(2)::text,'only current authenticated identity');
select pg_temp.d_ok(current_setting('d.snapshot')::jsonb->'next_service'->>'id'=pg_temp.d_event(1)::text,'nearest relevant practice');
select pg_temp.d_ok((current_setting('d.snapshot')::jsonb->>'open_count')::int=5,'exact open count excludes cancelled, answered, foreign and expired; invalidated answers reopen');
select pg_temp.d_ok(jsonb_array_length(current_setting('d.snapshot')::jsonb->'open_events')=3,'only three open previews');
select pg_temp.d_ok(current_setting('d.snapshot')::jsonb->'open_events'->0->>'id'=pg_temp.d_event(1)::text
  and current_setting('d.snapshot')::jsonb->'open_events'->1->>'id'=pg_temp.d_event(5)::text,'open previews chronologically sorted');
select pg_temp.d_ok(current_setting('d.snapshot')::jsonb->'tasks'='[]'::jsonb,'ordinary member has no foreign administrative tasks');
select pg_temp.d_ok(current_setting('d.snapshot')::jsonb->'statistics'=public.ff_year_report(
  extract(year from statement_timestamp() at time zone 'Europe/Berlin')::int)->'summary','metrics reuse exact canonical personal report');
select pg_temp.d_ok(current_setting('d.snapshot')::jsonb->'statistics'->'rate'='null'::jsonb,'unavailable statistics never fabricated as zero percent');
select pg_temp.d_ok(not (current_setting('d.snapshot')::jsonb->'next_service' ? 'participants'),'no other members or responses exposed');
select pg_temp.d_ok(jsonb_array_length(current_setting('d.snapshot')::jsonb->'information')=2,'only own-unit and organizational information, no archived or foreign entries');
select public.ff_set_response(pg_temp.d_event(1),'yes');
select pg_temp.d_ok((public.ff_dashboard()->>'open_count')::int=4,'direct RSVP updates shared data and open count');
reset role;
select set_config('request.jwt.claim.sub',pg_temp.d_user(1)::text,true);
set local role authenticated;
select public.ff_add_unit_membership(pg_temp.d_user(2),current_setting('d.b')::uuid,'Synthetic additional unit');
select pg_temp.d_ok(jsonb_array_length(public.ff_dashboard()->'tasks')>0,'global admin receives real actionable queues');
select pg_temp.d_ok(exists(select 1 from jsonb_array_elements(public.ff_dashboard()->'tasks') t where t->>'kind'='registrations' and (t->>'count')::int=1),'only global sees actual pending registration count');
reset role;
select set_config('request.jwt.claim.sub',pg_temp.d_user(2)::text,true);
set local role authenticated;
select pg_temp.d_ok(jsonb_array_length(public.ff_dashboard()->'units')=2,'current multiple memberships reflected');
select pg_temp.d_ok((public.ff_dashboard()->>'open_count')::int=5,'additional membership dynamically adds one event without duplicates');
select set_config('d.request',(public.ff_request_vehicle(jsonb_build_object('vehicle_id',current_setting('d.vehicle'),
  'unit_id',current_setting('d.a'),'requester_id',auth.uid(),'responsible_id',auth.uid(),'kind','reservation',
  'title','Synthetic cockpit own request','description','','destination','','notes','','purpose_key','course',
  'starts_at',statement_timestamp()+interval '20 days','ends_at',statement_timestamp()+interval '20 days 2 hours'))->>'id'),true);
select pg_temp.d_ok(jsonb_array_length(public.ff_dashboard()->'reservations')=1,'own pending request is visible');
reset role;
select set_config('request.jwt.claim.sub',pg_temp.d_user(6)::text,true);
set local role authenticated;
select pg_temp.d_ok(exists(select 1 from jsonb_array_elements(public.ff_dashboard()->'tasks') t where t->>'kind'='vehicles'),'explicit vehicle manager receives authorized queue');
select pg_temp.d_ok(public.ff_dashboard()->'reservations'='[]'::jsonb,'manager personal card never leaks foreign requests');
reset role;
select set_config('request.jwt.claim.sub',pg_temp.d_user(5)::text,true);
set local role authenticated;
select pg_temp.d_ok(public.ff_dashboard()->'tasks'='[]'::jsonb,'FIRE_CHIEF gains no technical administration');
select pg_temp.d_ok(public.ff_dashboard()->'reservations'='[]'::jsonb,'FIRE_CHIEF personal card excludes other requesters');
reset role;
select set_config('request.jwt.claim.sub',pg_temp.d_user(7)::text,true);
set local role authenticated;
select pg_temp.d_ok(exists(select 1 from jsonb_array_elements(public.ff_dashboard()->'tasks') t
  where t->>'kind'='organizer' and t->>'target'=pg_temp.d_event(10)::text and (t->>'count')::int=1),'FUNCTION_ADMIN receives only authorized function queue');
select pg_temp.d_ok(public.ff_dashboard()->'next_service'->>'id'=pg_temp.d_event(10)::text,'function membership selects relevant service');
reset role;
select pg_sleep(1.1);
update public.events set starts_at=clock_timestamp()-interval '0.5 second',ends_at=clock_timestamp()+interval '1 hour' where id=pg_temp.d_event(9);
select set_config('request.jwt.claim.sub',pg_temp.d_user(1)::text,true);
set local role authenticated;
select public.ff_set_primary_organizer(pg_temp.d_event(9),pg_temp.d_user(8),'Synthetic delegated attendance');
reset role;
select set_config('request.jwt.claim.sub',pg_temp.d_user(8)::text,true);
set local role authenticated;
select pg_temp.d_ok(exists(select 1 from jsonb_array_elements(public.ff_dashboard()->'tasks') t where t->>'kind'='attendance' and (t->>'count')::int=1),'event delegation receives only authorized attendance task');
select pg_temp.d_deny(format('select public.ff_set_response(%L,''yes'')',pg_temp.d_event(9)));
reset role;
select set_config('request.jwt.claim.sub',pg_temp.d_user(4)::text,true);
set local role authenticated;
select pg_temp.d_ok(exists(select 1 from jsonb_array_elements(public.ff_dashboard()->'tasks') t where t->>'kind'='attendance'),'UNIT_ADMIN can see own scope attendance tasks');
select pg_temp.d_ok(not exists(select 1 from jsonb_array_elements(public.ff_dashboard()->'tasks') t where t->>'kind' in ('registrations','vehicles')),'UNIT_ADMIN gets neither global registrations nor implicit vehicle rights');
reset role;
select set_config('request.jwt.claim.sub',pg_temp.d_user(1)::text,true);
set local role authenticated;
select public.ff_prepare_attendance(pg_temp.d_event(9));
select public.ff_record_attendance(pg_temp.d_event(9),m.user_id,'present')
  from public.event_roster m where m.event_id=pg_temp.d_event(9);
select public.ff_confirm_attendance(pg_temp.d_event(9));
reset role;
select set_config('request.jwt.claim.sub',pg_temp.d_user(2)::text,true);
set local role authenticated;
select pg_temp.d_ok(public.ff_dashboard()->'statistics'=public.ff_year_report(extract(year from statement_timestamp() at time zone 'Europe/Berlin')::int)->'summary','nonempty confirmed statistics exactly match existing RPC');
select pg_temp.d_ok((public.ff_dashboard()->'statistics'->>'present')::int=1,'confirmed attendance, never RSVP, counts as participation');
reset role;
select set_config('request.jwt.claim.sub',pg_temp.d_user(9)::text,true);
set local role authenticated;
select pg_temp.d_deny('select public.ff_dashboard()');
reset role;
select pg_temp.d_ok(not has_function_privilege('anon','public.ff_dashboard()','execute'),'anonymous API cannot execute dashboard');
select pg_temp.d_ok(not has_function_privilege('authenticated','ff_private.dashboard_event(uuid)','execute'),'private event helper not exposed');
rollback;
