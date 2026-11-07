-- Entirely disposable CI fixture. Never execute this test against hosted DEV.
begin;
do $$ begin
  if current_database()<>'ff_dev_ci' then raise exception 'History seed test is CI-only'; end if;
end $$;
create function pg_temp.history_ok(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %',label; end if; raise notice 'PASS: %',label; end $$;
create function pg_temp.history_denied(statement text) returns void language plpgsql as $$
begin
  begin execute statement; exception when insufficient_privilege then raise notice 'PASS: denied %',statement; return; end;
  raise exception 'FAIL: unauthorized history operation allowed: %',statement;
end $$;
select set_config('history.unit',(select id::text from public.units where code='scheuren'),true);
select pg_temp.history_ok((select count(*)=5 from public.units)
  and not exists(select 1 from public.units where code='odenthal' or name='Odenthal')
  and exists(select 1 from public.units where code='scherf' and name='Scherf'),'five units; organization is not a unit; Scherf corrected');
select pg_temp.history_ok(exists(select 1 from public.audit_entries where action='unit_reference_corrected'
  and before_data->>'id'=after_data->>'id'),'Scherf correction preserves UUID and audit evidence');
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
  select ('d1000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
    'synthetic.history.ci.'||i||'@feuerwehr-odenthal.de',clock_timestamp(),
    jsonb_build_object('display_name','Synthetic existing CI member '||i) from generate_series(1,4) i;
select ff_private.bootstrap_global_admin('d1000000-0000-4000-8000-000000000001',current_setting('history.unit')::uuid);
select set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"iss":"https://orxinqhhbtjpkzwlfaxq.supabase.co/auth/v1"}',true);
set local role authenticated;
select public.ff_approve_member(('d1000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,current_setting('history.unit')::uuid)
  from generate_series(2,4) i;
select public.ff_set_role('d1000000-0000-4000-8000-000000000003','UNIT_ADMIN',current_setting('history.unit')::uuid);
select public.ff_set_role('d1000000-0000-4000-8000-000000000004','FIRE_CHIEF');
reset role;
update public.unit_memberships set valid_from='2025-01-01 00:00 Europe/Berlin'
  where user_id in ('d1000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000002');
insert into public.events(id,title,event_type,starts_at,ends_at,location,scope_kind,unit_id,organizer_id,attendance_state)
  values('d2000000-0000-4000-8000-000000000001','Synthetic protected existing event','regular',
    '2025-06-01 18:00 Europe/Berlin','2025-06-01 20:00 Europe/Berlin','CI','unit',
    current_setting('history.unit')::uuid,'d1000000-0000-4000-8000-000000000001','COMPLETED');
insert into public.event_roster(event_id,user_id,unit_snapshot_id,name_snapshot)
  select 'd2000000-0000-4000-8000-000000000001',id,current_setting('history.unit')::uuid,display_name
    from public.profiles where id in ('d1000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000002');
insert into public.actual_attendance(event_id,user_id,status,origin,recorded_by)
  select event_id,user_id,'present','manual','d1000000-0000-4000-8000-000000000001'
  from public.event_roster where event_id='d2000000-0000-4000-8000-000000000001';
insert into public.attendance_confirmations(event_id,confirmed_by,original_snapshot)
  values('d2000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','[]');
select set_config('history.protected',ff_private.history_protected_hash(),true);
select set_config('history.high',ff_private.history_id('member:scheuren:1')::text,true);
select set_config('history.low',ff_private.history_id('member:scheuren:2')::text,true);
select set_config('history.entrant',ff_private.history_id('member:scheuren:9')::text,true);
select set_config('history.transfer',ff_private.history_id('member:scherf:8')::text,true);
select set_config('history.empty',ff_private.history_id('member:voiswinkel:10')::text,true);
set local role authenticated;
select pg_temp.history_denied($q$select public.ff_dev_seed_history('wrong-project','SEED DEV041-HISTORY-V1')$q$);
select pg_temp.history_denied($q$select public.ff_dev_seed_history('orxinqhhbtjpkzwlfaxq','wrong-confirmation')$q$);
select set_config('request.jwt.claims','{"iss":"https://otherproject.supabase.co/auth/v1"}',true);
select pg_temp.history_denied($q$select public.ff_dev_seed_history('orxinqhhbtjpkzwlfaxq','SEED DEV041-HISTORY-V1')$q$);
select set_config('request.jwt.claims','{"iss":"https://orxinqhhbtjpkzwlfaxq.supabase.co/auth/v1"}',true);
select set_config('history.result',public.ff_dev_seed_history('orxinqhhbtjpkzwlfaxq','SEED DEV041-HISTORY-V1')::text,true);
select pg_temp.history_ok(current_setting('history.result')::jsonb->>'members'='50'
  and current_setting('history.result')::jsonb->>'events'='262','50 distinct non-login members and 262 deterministic events');
select pg_temp.history_ok(current_setting('history.result')::jsonb->>'protected_fingerprint'=current_setting('history.protected'),
  'existing accounts, roles, memberships, events, attendance, confirmations and audit unchanged');
select pg_temp.history_ok((current_setting('history.result')::jsonb#>>'{years,0,events}')::int=131
  and (current_setting('history.result')::jsonb#>>'{years,1,events}')::int=131
  and (current_setting('history.result')::jsonb#>>'{years,0,completed}')::int=129,'both years fully covered; final and excluded lists separated');
select pg_temp.history_ok(public.ff_dev_seed_history('orxinqhhbtjpkzwlfaxq','SEED DEV041-HISTORY-V1')->>'fingerprint'
  =current_setting('history.result')::jsonb->>'fingerprint','repeat seed is read-only, no duplicate or overwritten records');
select pg_temp.history_ok(jsonb_array_length(public.ff_reports_context()->'seed_people')=50,
  'overseer receives explicitly marked non-login report identities');
select pg_temp.history_ok((public.ff_dev_personal_report(current_setting('history.high')::uuid,2025)#>>'{summary,rate}')::numeric=100
  and (public.ff_dev_personal_report(current_setting('history.low')::uuid,2025)#>>'{summary,rate}')::numeric<50,
  'high and low individual attendance; not identical patterns');
select pg_temp.history_ok(public.ff_dev_personal_report(current_setting('history.empty')::uuid,2026)->>'event_count'='0'
  and public.ff_dev_personal_report(current_setting('history.empty')::uuid,2026)#>'{summary,rate}'='null'::jsonb
  and public.ff_dev_personal_report(current_setting('history.empty')::uuid,2026)#>>'{summary,pending}'='1',
  'member without final history: provisional presence creates neither hours nor fabricated quote');
select pg_temp.history_ok(not exists(select 1 from jsonb_array_elements(
  public.ff_dev_personal_report(current_setting('history.entrant')::uuid,2025,null,null,0,true)->'events') e
  where (e->>'starts_at')::timestamptz<'2025-07-01 00:00 Europe/Berlin'::timestamptz),
  'midyear entrance never counts earlier services');
select pg_temp.history_ok(exists(select 1 from jsonb_array_elements(
  public.ff_dev_personal_report(current_setting('history.transfer')::uuid,2026,null,null,0,true)->'events') e where e->>'unit_name'='Scherf')
  and exists(select 1 from jsonb_array_elements(
  public.ff_dev_personal_report(current_setting('history.transfer')::uuid,2026,null,null,0,true)->'events') e where e->>'unit_name'='Blecher'),
  'historical transfer retains old and new unit attribution');
select pg_temp.history_denied($q$select public.ff_dev_personal_report('d1000000-0000-4000-8000-000000000002',2025)$q$);
reset role;
select pg_temp.history_ok((select count(*)=4 from auth.users)
  and (select count(*)=50 from public.profiles where dev_seed_key is not null and auth_user_id is null
    and display_name like 'DEV TEST | Testmitglied %')
  and not exists(select 1 from public.role_assignments r join public.profiles p on p.id=r.user_id where p.dev_seed_key is not null),
  'zero synthetic Auth accounts, password/email operations or role assignments');
select pg_temp.history_ok(not exists(select 1 from public.profiles where dev_seed_key is null and auth_user_id is distinct from id),
  'all existing and future real profiles retain mandatory matching Auth binding');
select pg_temp.history_ok(not exists(select 1 from public.event_roster r join public.events e on e.id=r.event_id
  join public.profiles p on p.id=r.user_id where p.dev_seed_key is distinct from e.dev_seed_key),
  'seeded and regular rosters are logically isolated');
select pg_temp.history_ok((select count(distinct round((s->>'rate')::numeric,1))>=4
  from jsonb_array_elements(current_setting('history.result')::jsonb->'statistics') s where s->>'report_year'='2025'),
  'at least four different unit quotas');
select pg_temp.history_ok((select sum((s->>'training_participant_hours')::numeric)
  from jsonb_array_elements(current_setting('history.result')::jsonb->'statistics') s where s->>'report_year'='2025')
  <>(select sum((s->>'training_participant_hours')::numeric)
  from jsonb_array_elements(current_setting('history.result')::jsonb->'statistics') s where s->>'report_year'='2026'),
  'training participant hours deliberately differ across years');
select set_config('history.expected',(
  select jsonb_build_object('training',sum(case when a.status='present' and t.is_training_relevant
    then extract(epoch from e.ends_at-e.starts_at)/3600 else 0 end),
    'participant',sum(case when a.status='present' then extract(epoch from e.ends_at-e.starts_at)/3600 else 0 end))::text
  from public.events e join public.actual_attendance a on a.event_id=e.id
  join public.attendance_confirmations c on c.event_id=e.id join public.event_type_reporting t using(event_type)
  where e.status='scheduled' and e.attendance_state='COMPLETED'
    and extract(year from e.starts_at at time zone 'Europe/Berlin')=2025),true);
set local role authenticated;
select pg_temp.history_ok((public.ff_year_report(2025,'organization')#>>'{summary,training_hours}')::numeric
  =(current_setting('history.expected')::jsonb->>'training')::numeric
  and (public.ff_year_report(2025,'organization')#>>'{summary,participant_hours}')::numeric
  =(current_setting('history.expected')::jsonb->>'participant')::numeric,
  'central reports match independent final-only training and all-type hours, never inverted RSVPs');
select pg_temp.history_ok(public.ff_year_report(2025,'organization')#>>'{summary,missing_roster}'='0'
  and public.ff_year_report(2025,'organization')#>>'{summary,excluded}'='0','no missing rosters or inconsistent historical membership periods');
select pg_temp.history_ok(jsonb_array_length(public.ff_year_report(2025,'organization',null,null,0,true)->'events')=130,
  'full CSV source includes all 129 seeded final services plus protected existing final event');
select set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000002',true);
select pg_temp.history_ok(public.ff_year_report(2025)#>>'{summary,training_hours}'='2'
  and jsonb_array_length(public.ff_reports_context()->'seed_people')=0,'existing MEMBER personal book unchanged; no synthetic identity switch');
select pg_temp.history_denied($q$select public.ff_dev_personal_report(current_setting('history.high')::uuid,2025)$q$);
select pg_temp.history_denied($q$select public.ff_dev_seed_history('orxinqhhbtjpkzwlfaxq','SEED DEV041-HISTORY-V1')$q$);
select set_config('request.jwt.claim.sub',current_setting('history.high'),true);
select pg_temp.history_ok(not ff_private.is_active() and (select count(*)=0 from public.actual_attendance),
  'forged synthetic subject still has no active Auth identity or attendance access');
select pg_temp.history_denied($q$select public.ff_year_report(2025)$q$);
select set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000003',true);
select pg_temp.history_ok(public.ff_year_report(2025,'unit',current_setting('history.unit')::uuid)->>'scope'='unit',
  'UNIT_ADMIN retains assigned-unit reporting');
select pg_temp.history_denied($q$select public.ff_year_report(2025,'organization')$q$);
select pg_temp.history_denied($q$select public.ff_dev_personal_report(current_setting('history.high')::uuid,2025)$q$);
select set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000004',true);
select pg_temp.history_ok(public.ff_year_report(2025,'organization')->>'scope'='organization'
  and public.ff_dev_personal_report(current_setting('history.high')::uuid,2025)->>'seed_member'=current_setting('history.high'),
  'FIRE_CHIEF has readonly organization and synthetic report access, no technical seed privilege');
select pg_temp.history_denied($q$select public.ff_dev_seed_history('orxinqhhbtjpkzwlfaxq','SEED DEV041-HISTORY-V1')$q$);
select set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000001',true);
select pg_temp.history_denied($q$select public.ff_set_role(current_setting('history.high')::uuid,'GLOBAL_ADMIN')$q$);
select pg_temp.history_ok(public.ff_dev_remove_history('orxinqhhbtjpkzwlfaxq',
  current_setting('history.result')::jsonb->>'fingerprint')->>'dry_run'='true','cleanup defaults to non-mutating preview');
select pg_temp.history_denied($q$select public.ff_dev_remove_history('orxinqhhbtjpkzwlfaxq',
  current_setting('history.result')::jsonb->>'fingerprint',null,false)$q$);
select set_config('ff.fixture_cleanup','DEV041-HISTORY-V1',true);
select pg_temp.history_denied($q$delete from public.attendance_confirmations where event_id='d2000000-0000-4000-8000-000000000001'$q$);
-- Actual removal is exercised only in this disposable rollback-only CI database.
select pg_temp.history_ok(public.ff_dev_remove_history('orxinqhhbtjpkzwlfaxq',
  current_setting('history.result')::jsonb->>'fingerprint','REMOVE DEV041-HISTORY-V1',false)->>'removed'='true',
  'authorized pristine synthetic cleanup only; immutable real confirmations preserved');
select pg_temp.history_ok(public.ff_dev_history_inventory('orxinqhhbtjpkzwlfaxq')->>'protected_fingerprint'
  =current_setting('history.protected'),'cleanup preserves original data and existing immutable audit');
select pg_temp.history_denied($q$select public.ff_dev_seed_history('orxinqhhbtjpkzwlfaxq','SEED DEV041-HISTORY-V1')$q$);
rollback;
