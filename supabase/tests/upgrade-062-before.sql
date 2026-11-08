-- Install after 001-025, before 026-032, in an independent disposable database.
do $$ begin if current_database()<>'ff_dev_ci' then raise exception 'Disposable CI required'; end if; end $$;
create schema upgrade_test;
create table upgrade_test.snapshot(key text primary key,value jsonb not null);
create function upgrade_test.original_data() returns jsonb language sql stable as $$
  select jsonb_build_object(
    'auth',(select jsonb_agg(to_jsonb(x) order by id) from auth.users x),
    'profiles',(select jsonb_agg(to_jsonb(x) order by id) from public.profiles x),
    'memberships',(select jsonb_agg(to_jsonb(x) order by id) from public.unit_memberships x),
    'roles',(select jsonb_agg(to_jsonb(x) order by id) from public.role_assignments x),
    'functions',(select jsonb_agg(to_jsonb(x) order by id) from public.function_memberships x),
    'events',(select jsonb_agg(to_jsonb(x)-'participant_mode' order by id) from public.events x),
    'rosters',(select jsonb_agg(to_jsonb(x)-'included'-'invited' order by event_id,user_id) from public.event_roster x),
    'responses',(select jsonb_agg(to_jsonb(x)-'invalidated_at' order by event_id,user_id) from public.participation_responses x),
    'attendance',(select jsonb_agg(to_jsonb(x) order by event_id,user_id) from public.actual_attendance x),
    'confirmations',(select jsonb_agg(to_jsonb(x) order by event_id) from public.attendance_confirmations x),
    'reservations',(select jsonb_agg(to_jsonb(x)-'actor_id'-'starts_at'-'ends_at' order by event_id) from public.vehicle_reservations x),
    'calendar',(select jsonb_agg(to_jsonb(x) order by event_id) from public.event_calendar x),
    'resources',(select jsonb_agg(to_jsonb(x) order by id) from public.calendar_resources x),
    'vehicles',(select jsonb_agg(to_jsonb(x) order by resource_id) from public.vehicles x),
    'notifications',(select jsonb_agg(to_jsonb(x) order by id) from public.vehicle_notifications x),
    'audit',(select jsonb_agg(to_jsonb(x) order by id) from public.audit_entries x));
$$;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
select ('a0622000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
  'synthetic.upgrade.ci.'||i||'@feuerwehr-odenthal.de',clock_timestamp(),
  jsonb_build_object('display_name','Synthetic legacy upgrade person '||i) from generate_series(1,2) i;
select ff_private.bootstrap_global_admin('a0622000-0000-4000-8000-000000000001',(select id from public.units where code='scheuren'));
set request.jwt.claim.sub='a0622000-0000-4000-8000-000000000001';
select public.ff_approve_member('a0622000-0000-4000-8000-000000000002',(select id from public.units where code='scheuren'));
update public.profiles set approved_at='2024-01-01 00:00Z';
update public.unit_memberships set valid_from='2024-01-01 00:00Z';
insert into public.events(id,title,event_type,starts_at,ends_at,location,scope_kind,unit_id,organizer_id,attendance_state)
values('e0622000-0000-4000-8000-000000000001','Synthetic legacy confirmed event','regular',
  '2025-06-01 18:00 Europe/Berlin','2025-06-01 20:00 Europe/Berlin','CI','unit',
  (select id from public.units where code='scheuren'),'a0622000-0000-4000-8000-000000000001','COMPLETED');
insert into public.event_roster(event_id,user_id,unit_snapshot_id,name_snapshot)
select 'e0622000-0000-4000-8000-000000000001',p.id,m.unit_id,p.display_name
  from public.profiles p join public.unit_memberships m on m.user_id=p.id;
insert into public.participation_responses(event_id,user_id,response)
select event_id,user_id,'yes' from public.event_roster;
insert into public.actual_attendance(event_id,user_id,status,origin,recorded_by)
select event_id,user_id,'present','manual','a0622000-0000-4000-8000-000000000001' from public.event_roster;
insert into public.attendance_confirmations(event_id,confirmed_by,original_snapshot)
values('e0622000-0000-4000-8000-000000000001','a0622000-0000-4000-8000-000000000001','[]');
select public.ff_save_vehicle(jsonb_build_object('name','Synthetic legacy upgrade vehicle',
  'unit_id',(select id from public.units where code='scheuren'),'type_key','mtf','call_sign','','location','','description','CI',
  'active',true,'reservable',true,'unit_admin_enabled',false,'manager_ids',jsonb_build_array(auth.uid()),
  'usage_units',jsonb_build_array((select id from public.units where code='scheuren'))));
select public.ff_request_vehicle(jsonb_build_object('title','Synthetic legacy booking '||i,
  'vehicle_id',(select id from public.calendar_resources where name='Synthetic legacy upgrade vehicle'),
  'unit_id',(select id from public.units where code='scheuren'),'responsible_id',auth.uid(),'kind','reservation',
  'purpose_key','course','description','','destination','','notes','',
  'starts_at',clock_timestamp()+interval '8 days','ends_at',clock_timestamp()+interval '8 days 2 hours'))
from generate_series(1,2) i;
select public.ff_decide_vehicle((select id from public.events where title='Synthetic legacy booking 1'),0,'APPROVED');
set request.jwt.claim.role='authenticated';
set request.jwt.claims='{"iss":"https://orxinqhhbtjpkzwlfaxq.supabase.co/auth/v1"}';
select public.ff_dev_seed_history('orxinqhhbtjpkzwlfaxq','SEED DEV041-HISTORY-V1');
insert into upgrade_test.snapshot values
  ('data',upgrade_test.original_data()),
  ('seed_hash',to_jsonb(ff_private.history_data_hash())),
  ('fixture',(select to_jsonb(x) from ff_private.dev_fixture_sets x where fixture_key='DEV041-HISTORY-V1')),
  ('organization_report',public.ff_year_report(2025,'organization')),
  ('personal_report',public.ff_year_report(2025)),
  ('seed_personal_report',public.ff_dev_personal_report(ff_private.history_id('member:scheuren:1'),2025));
