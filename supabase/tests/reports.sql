begin;
do $$ begin
  if current_database()<>'ff_dev_ci' then raise exception 'Disposable CI database required'; end if;
end $$;
create function pg_temp.report_ok(value boolean,label text) returns void language plpgsql as $$
begin
  if value is distinct from true then raise exception 'FAIL: %',label; end if;
  raise notice 'PASS: %',label;
end $$;
create function pg_temp.report_denied(statement text) returns void language plpgsql as $$
begin execute statement; raise exception 'FAIL: expected denial';
exception when insufficient_privilege then raise notice 'PASS: denied %',statement;
end $$;
select set_config('report.unit',(select id::text from public.units where code='scheuren'),true);
select set_config('report.other',(select id::text from public.units where code='blecher'),true);
select set_config('report.function',(select id::text from public.special_functions order by code limit 1),true);
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
select ('91000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
  'synthetic.report.'||i||'@feuerwehr-odenthal.de',clock_timestamp(),
  jsonb_build_object('display_name','Synthetic Report '||i) from generate_series(1,6) i;
select ff_private.bootstrap_global_admin('91000000-0000-4000-8000-000000000001',current_setting('report.unit')::uuid);
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select public.ff_approve_member(('91000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
  current_setting(case when i in (3,5) then 'report.other' else 'report.unit' end)::uuid)
  from generate_series(2,6) i;
select public.ff_set_role('91000000-0000-4000-8000-000000000004','UNIT_ADMIN',current_setting('report.unit')::uuid);
select public.ff_set_role('91000000-0000-4000-8000-000000000005','FIRE_CHIEF');
select public.ff_set_role('91000000-0000-4000-8000-000000000006','FUNCTION_ADMIN',null,current_setting('report.function')::uuid);
reset role;
update public.unit_memberships set valid_from='2025-07-01 00:00Z',valid_until='2026-07-01 00:00Z'
  where user_id='91000000-0000-4000-8000-000000000002';
insert into public.unit_memberships(user_id,unit_id,valid_from)
  values('91000000-0000-4000-8000-000000000002',current_setting('report.other')::uuid,'2026-07-01 00:00Z');
update public.unit_memberships set valid_from='2024-01-01 00:00Z' where user_id='91000000-0000-4000-8000-000000000003';
insert into public.function_memberships(user_id,function_id,valid_from)
select ('91000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
  current_setting('report.function')::uuid,'2024-01-01 00:00Z' from generate_series(2,3) i;

insert into public.events(id,title,event_type,starts_at,ends_at,location,scope_kind,unit_id,function_id,organizer_id,
  status,attendance_state,attendance_prepared_at)
select ('92000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'Synthetic report service '||i,
  kind::public.ff_event_type,stamp,stamp+duration*interval '1 hour','Synthetic report',
  scope::public.ff_scope,case when scope='unit' then current_setting('report.unit')::uuid else null end,
  case when scope='function' then current_setting('report.function')::uuid else null end,
  '91000000-0000-4000-8000-000000000001',
  case when i=6 then 'cancelled' else 'scheduled' end,
  case when i in (5,9) then 'IN_PROGRESS'::public.ff_attendance_list_state else 'COMPLETED'::public.ff_attendance_list_state end,
  clock_timestamp()
from (values
  (1,'regular','2025-08-01 16:00Z'::timestamptz,2.0,'unit'),
  (2,'special','2025-09-01 16:00Z'::timestamptz,1.0,'unit'),
  (3,'breathing','2025-09-15 16:00Z'::timestamptz,1.5,'unit'),
  (4,'community','2025-10-01 16:00Z'::timestamptz,3.0,'unit'),
  (5,'regular','2025-11-01 08:00Z'::timestamptz,9.0,'unit'),
  (6,'regular','2025-12-01 08:00Z'::timestamptz,99.0,'unit'),
  (7,'training','2025-11-15 16:00Z'::timestamptz,2.0,'organization'),
  (8,'training','2025-12-15 16:00Z'::timestamptz,1.0,'function'),
  (9,'regular','2025-01-01 16:00Z'::timestamptz,2.0,'unit'),
  (10,'training','2025-12-31 23:30Z'::timestamptz,2.0,'unit')
) fixture(i,kind,stamp,duration,scope);
insert into public.event_roster(event_id,user_id,unit_snapshot_id,name_snapshot)
select e.id,'91000000-0000-4000-8000-000000000002',current_setting('report.unit')::uuid,'Synthetic historical member'
  from public.events e where e.title like 'Synthetic report service %' and e.title<>'Synthetic report service 9';
insert into public.event_roster(event_id,user_id,unit_snapshot_id,name_snapshot)
select e.id,'91000000-0000-4000-8000-000000000003',current_setting('report.other')::uuid,'Synthetic other member'
  from public.events e where e.scope_kind in ('organization','function');
insert into public.actual_attendance(event_id,user_id,status,origin,recorded_by)
select r.event_id,r.user_id,case when (r.event_id='92000000-0000-4000-8000-000000000002'
  or (r.event_id='92000000-0000-4000-8000-000000000007' and r.user_id='91000000-0000-4000-8000-000000000003'))
  then 'absent'::public.ff_attendance else 'present'::public.ff_attendance end,
  case when r.event_id='92000000-0000-4000-8000-000000000005' then 'prefill' else 'manual' end,
  '91000000-0000-4000-8000-000000000001' from public.event_roster r;
insert into public.attendance_confirmations(event_id,confirmed_by,original_snapshot)
select e.id,'91000000-0000-4000-8000-000000000001',
  (select jsonb_agg(to_jsonb(a)) from public.actual_attendance a where a.event_id=e.id)
  from public.events e where e.attendance_state='COMPLETED';

select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000002',true);
select pg_temp.report_ok(not exists(select 1 from ff_private.report_rows(2025,'personal',null,null)
  where event_id='92000000-0000-4000-8000-000000000009'),'no membership before July, no expected personal row');
set local role authenticated;
select set_config('report.personal',public.ff_year_report(2025)::text,true);
select pg_temp.report_ok((current_setting('report.personal')::jsonb#>>'{summary,training_services}')::int=5,
  'only five completed training services, not pending, cancelled or community');
select pg_temp.report_ok((current_setting('report.personal')::jsonb#>>'{summary,training_present}')::int=4
  and (current_setting('report.personal')::jsonb#>>'{summary,training_absent}')::int=1,'actual present and absent counts');
select pg_temp.report_ok((current_setting('report.personal')::jsonb#>>'{summary,training_hours}')::numeric=6.5,
  'absent zero hours; breathing and training count; provisional and community not training');
select pg_temp.report_ok((current_setting('report.personal')::jsonb#>>'{summary,participant_hours}')::numeric=9.5,
  'all documented service hours include community separately');
select pg_temp.report_ok((current_setting('report.personal')::jsonb#>>'{summary,rate}')::numeric=80,
  'rate uses five eligible completed services, no current-unit reassignment');
select pg_temp.report_ok(jsonb_array_length(current_setting('report.personal')::jsonb->'events')=6
  and current_setting('report.personal')::jsonb#>>'{events,0,title}'='Synthetic report service 8','own final history descending');
select pg_temp.report_ok(public.ff_year_report(2024)#>'{summary,rate}'='null'::jsonb
  and public.ff_year_report(2024)#>>'{summary,training_hours}'='0','empty year has no fabricated rate');
select pg_temp.report_ok(jsonb_array_length(public.ff_year_report(2025,'personal',current_setting('report.other')::uuid)->'events')=0,
  'transfer to current unit does not move historical services');
select pg_temp.report_ok(public.ff_year_report(2026)#>>'{events,0,title}'='Synthetic report service 10'
  and (public.ff_year_report(2026)#>>'{summary,training_hours}')::numeric=2,
  'Berlin January midnight belongs to 2026 despite UTC 2025');
select pg_temp.report_ok(jsonb_array_length(public.ff_year_report(2025,'personal',null,'community')->'events')=1
  and public.ff_year_report(2025,'personal',null,'community')#>>'{summary,training_hours}'='0','event type filter and default classification');
select pg_temp.report_ok((select count(*)=0 from public.actual_attendance where user_id<>auth.uid())
  and (select count(*)=0 from public.confirmed_attendance where user_id<>auth.uid()),'direct RLS hides foreign personal attendance');
select pg_temp.report_denied($q$select public.ff_year_report(2025,'unit',current_setting('report.unit')::uuid)$q$);
select pg_temp.report_denied($q$select public.ff_year_report(2025,'organization')$q$);
select pg_temp.report_denied($q$select public.ff_year_report(2025,'personal','91000000-0000-4000-8000-000000000003')$q$);
select pg_temp.report_denied($q$select public.ff_year_report(null)$q$);
select pg_temp.report_denied($q$select public.ff_year_report(2025,'personal',null,null,-1)$q$);
reset role;

select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000004',true);
set local role authenticated;
select pg_temp.report_ok(public.ff_year_report(2025,'unit',current_setting('report.unit')::uuid)#>>'{summary,members}'='1'
  and jsonb_array_length(public.ff_year_report(2025,'unit',current_setting('report.unit')::uuid)->'members')=1,
  'unit administrator sees historical cohort, not foreign unit or current-year newcomers');
select pg_temp.report_ok(public.ff_year_report(2025,'unit',current_setting('report.unit')::uuid)#>>'{members,0,user_id}'
  ='91000000-0000-4000-8000-000000000002','only authorized member in export payload');
select pg_temp.report_denied($q$select public.ff_year_report(2025,'unit',current_setting('report.other')::uuid,null,0,true)$q$);
select pg_temp.report_denied($q$select public.ff_year_report(2025,'organization')$q$);
reset role;

select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000005',true);
set local role authenticated;
select set_config('report.organization',public.ff_year_report(2025,'organization')::text,true);
select pg_temp.report_ok(current_setting('report.organization')::jsonb#>>'{summary,members}'='2'
  and current_setting('report.organization')::jsonb#>>'{summary,training_services}'='5',
  'FIRE_CHIEF reads organization; people and shared services counted once');
select pg_temp.report_ok((current_setting('report.organization')::jsonb#>>'{summary,participant_hours}')::numeric=10.5
  and (current_setting('report.organization')::jsonb#>>'{summary,training_hours}')::numeric=7.5,
  'participant hours sum unique actual attendees, not responses or function duplicates');
select pg_temp.report_ok(jsonb_array_length(current_setting('report.organization')::jsonb->'units')=5
  and jsonb_array_length(current_setting('report.organization')::jsonb->'members')=0,'all five units, no unnecessary personal organization payload');
select pg_temp.report_denied($q$select public.ff_members_workspace()$q$);
select pg_temp.report_denied($q$select public.ff_set_role('91000000-0000-4000-8000-000000000002','GLOBAL_ADMIN')$q$);
select pg_temp.report_denied($q$select public.ff_set_reporting_type('other',true,'Synthetic attempted change')$q$);
select pg_temp.report_denied($q$select public.ff_record_attendance('92000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000002','absent','Synthetic attempted change')$q$);
reset role;

select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000006',true);
set local role authenticated;
select pg_temp.report_ok(public.ff_year_report(2025,'function',current_setting('report.function')::uuid)#>>'{summary,training_services}'='1'
  and (public.ff_year_report(2025,'function',current_setting('report.function')::uuid)#>>'{summary,training_hours}')::numeric=2,
  'FUNCTION_ADMIN reads only their assigned function and relevant historical memberships');
select pg_temp.report_denied($q$select public.ff_year_report(2025,'unit',current_setting('report.unit')::uuid)$q$);
reset role;

select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select public.ff_record_attendance('92000000-0000-4000-8000-000000000002',
  '91000000-0000-4000-8000-000000000002','present','Synthetic confirmed correction');
reset role;
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select pg_temp.report_ok((public.ff_year_report(2025)#>>'{summary,training_hours}')::numeric=7.5
  and (public.ff_year_report(2025)#>>'{summary,rate}')::numeric=100,'correction automatically updates reports');
reset role;
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select public.ff_confirm_attendance('92000000-0000-4000-8000-000000000005');
select pg_temp.report_ok((public.ff_year_report(2025,'unit',current_setting('report.unit')::uuid)#>>'{summary,training_hours}')::numeric=16.5,
  'explicit confirmation, not provisional prefill, adds nine training hours');
select public.ff_set_reporting_type('community',true,'Synthetic explicit historical classification');
select pg_temp.report_ok(public.ff_year_report(2025,'unit',current_setting('report.unit')::uuid)#>>'{summary,training_services}'='7',
  'classification is explicit, global-admin-only and centrally applied');
reset role;
select pg_temp.report_ok(exists(select 1 from public.audit_entries where action='reporting_classification_changed'),
  'classification change audited without changing attendance or event type');
delete from public.actual_attendance where event_id='92000000-0000-4000-8000-000000000001'
  and user_id='91000000-0000-4000-8000-000000000002';
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select pg_temp.report_ok(public.ff_year_report(2025)#>'{summary,rate}'='null'::jsonb
  and public.ff_year_report(2025)#>>'{summary,unknown}'='1','missing attendance is visible and suppresses misleading rate');
reset role;
delete from public.event_roster where event_id='92000000-0000-4000-8000-000000000001'
  and user_id='91000000-0000-4000-8000-000000000002';
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select pg_temp.report_ok(public.ff_year_report(2025)#>>'{summary,missing_roster}'='1',
  'eligible membership with missing roster is visible, not silently omitted');
reset role;
insert into public.unit_memberships(user_id,unit_id,valid_from,valid_until)
  values('91000000-0000-4000-8000-000000000002',current_setting('report.unit')::uuid,'2025-08-01 00:00Z','2025-08-02 00:00Z');
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select pg_temp.report_ok(public.ff_year_report(2025)#>>'{summary,excluded}'='1'
  and public.ff_year_report(2025)#>'{summary,rate}'='null'::jsonb,'overlapping memberships flagged, not double counted');
reset role;
select pg_temp.report_ok(not has_function_privilege('authenticated',
  'ff_private.report_rows(int,text,uuid,public.ff_event_type)','EXECUTE'),'private all-person row source not callable');
set local role anon;
select pg_temp.report_denied($q$select public.ff_year_report(2025)$q$);
select pg_temp.report_denied($q$select public.ff_reports_context()$q$);
reset role;
do $$ begin
  begin
    update public.events set ends_at=starts_at where id='92000000-0000-4000-8000-000000000002';
    raise exception 'FAIL: negative/zero duration accepted';
  exception when check_violation then raise notice 'PASS: non-positive duration rejected'; end;
  begin
    update public.events set starts_at=null where id='92000000-0000-4000-8000-000000000002';
    raise exception 'FAIL: missing start accepted';
  exception when not_null_violation then raise notice 'PASS: missing start rejected'; end;
  begin
    insert into public.event_roster select * from public.event_roster limit 1;
    raise exception 'FAIL: duplicate attendance key accepted';
  exception when unique_violation then raise notice 'PASS: duplicate roster/attendance key rejected'; end;
  begin
    update public.unit_memberships set valid_until=valid_from where user_id='91000000-0000-4000-8000-000000000003';
    raise exception 'FAIL: invalid membership period accepted';
  exception when check_violation then raise notice 'PASS: invalid membership period rejected'; end;
end $$;

-- Representative annual workload: 250 people, five units, 65 shared services.
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
select ('97000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
  'synthetic.report.scale.'||i||'@feuerwehr-odenthal.de',clock_timestamp(),
  jsonb_build_object('display_name','Synthetic Scale '||i) from generate_series(1,250) i;
update public.profiles p set status='approved',approved_at=clock_timestamp(),
  approved_by='91000000-0000-4000-8000-000000000001',approved_email=a.email
  from auth.users a where a.id=p.id and p.id::text like '97000000-%';
insert into public.unit_memberships(user_id,unit_id,valid_from)
select p.id,u.id,'2023-01-01 00:00Z' from public.profiles p
join (select id,row_number() over(order by code) as n from public.units) u
  on u.n=1+(right(p.id::text,12)::int-1)%5 where p.id::text like '97000000-%';
insert into public.events(id,title,event_type,starts_at,ends_at,location,scope_kind,organizer_id,attendance_state)
select ('98000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'Synthetic Scale Service '||i,'regular',
  '2023-01-01 16:00Z'::timestamptz+i*interval '1 day',
  '2023-01-01 18:00Z'::timestamptz+i*interval '1 day','Synthetic','organization',
  '91000000-0000-4000-8000-000000000001','COMPLETED' from generate_series(1,65) i;
insert into public.event_roster(event_id,user_id,unit_snapshot_id,name_snapshot)
select e.id,m.user_id,m.unit_id,p.display_name from public.events e cross join public.unit_memberships m
  join public.profiles p on p.id=m.user_id where e.id::text like '98000000-%' and p.id::text like '97000000-%';
insert into public.actual_attendance(event_id,user_id,status,origin,recorded_by)
select event_id,user_id,'present','manual','91000000-0000-4000-8000-000000000001'
  from public.event_roster where event_id::text like '98000000-%';
insert into public.attendance_confirmations(event_id,confirmed_by,original_snapshot)
select id,'91000000-0000-4000-8000-000000000001','[]' from public.events where id::text like '98000000-%';
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000005',true);
set local role authenticated;
do $$ declare started timestamptz; result jsonb; begin
  started:=clock_timestamp();
  result:=public.ff_year_report(2023,'organization');
  perform pg_temp.report_ok(result#>>'{summary,members}'='250' and result#>>'{summary,training_services}'='65'
    and (result#>>'{summary,participant_hours}')::numeric=32500,'250 members across five units, no double count');
  perform pg_temp.report_ok(jsonb_array_length(result->'events')=50 and result->>'has_more'='true',
    'annual event history bounded to 50 services');
  raise notice '250-member annual aggregation: % ms',extract(epoch from clock_timestamp()-started)*1000;
end $$;
select pg_temp.report_ok(jsonb_array_length(public.ff_year_report(2023,'organization',null,null,1)->'events')=15,
  'second page returns remaining services');
select pg_temp.report_ok(jsonb_array_length(public.ff_year_report(2023,'organization',null,null,0,true)->'events')=65,
  'server export includes complete authorized history, not only visible page');
reset role;
\echo 'Dutybook eligibility, final-only hours, corrections, scopes, FIRE_CHIEF and direct RLS passed.'
rollback;
