-- Synthetic identities; never execute against hosted DEV.
begin;
do $$ begin if current_database()<>'ff_dev_ci' then raise exception 'Disposable CI required'; end if; end $$;
create function pg_temp.s_user(i int) returns uuid language sql immutable as $$
  select ('a0630000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid;
$$;
create function pg_temp.s_ok(value boolean,label text) returns void language plpgsql as $$
begin if value is distinct from true then raise exception 'FAIL: %',label; end if; raise notice 'PASS: %',label; end $$;
create function pg_temp.s_deny(statement text) returns void language plpgsql as $$
begin execute statement;raise exception 'FAIL: operation unexpectedly succeeded';
exception when insufficient_privilege or check_violation or serialization_failure then raise notice 'PASS: operation denied'; end $$;
create function pg_temp.s_data(title text,unit uuid) returns jsonb language sql as $$
  select jsonb_build_object('title',title,'description','Synthetic CI','location','Synthetic CI','event_type','regular',
    'scope_kind','unit','unit_id',unit,'function_id',null,'organizer_id',pg_temp.s_user(1));
$$;
create function pg_temp.s_rule(first_day text,count_value int default 3) returns jsonb language sql as $$
  select jsonb_build_object('frequency','weekly','start_date',first_day,'start_time','19:30','end_time','21:30',
    'count',count_value,'end_date',null,'weeks',1,'monthly_mode','day','ordinal',1,'weekday',1);
$$;
create function pg_temp.s_commit(input jsonb) returns jsonb language plpgsql as $$
begin return public.ff_commit_event_plan(input,public.ff_preview_event_plan(input)->>'token',true); end $$;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
select pg_temp.s_user(i),'synthetic.planning.'||i||'@feuerwehr-odenthal.de',clock_timestamp(),
  jsonb_build_object('display_name','Synthetic planning '||i) from generate_series(1,7) i;
select set_config('s.a',(select id::text from public.units where code='scheuren'),true);
select set_config('s.b',(select id::text from public.units where code='blecher'),true);
select set_config('s.fn',(select id::text from public.special_functions order by name limit 1),true);
select ff_private.bootstrap_global_admin(pg_temp.s_user(1),current_setting('s.a')::uuid);
select set_config('request.jwt.claim.sub',pg_temp.s_user(1)::text,true);
set local role authenticated;
select public.ff_approve_member(pg_temp.s_user(i),case when i in(3,5) then current_setting('s.b')::uuid else current_setting('s.a')::uuid end)
  from generate_series(2,6) i;
select public.ff_set_role(pg_temp.s_user(3),'UNIT_ADMIN',current_setting('s.a')::uuid);
select public.ff_set_role(pg_temp.s_user(4),'FUNCTION_ADMIN',null,current_setting('s.fn')::uuid);
select public.ff_set_role(pg_temp.s_user(5),'FIRE_CHIEF');
select public.ff_set_function_membership(pg_temp.s_user(4),current_setting('s.fn')::uuid,true,'Synthetic planning function');
select set_config('s.input',jsonb_build_object('operation','series_create','request_id',gen_random_uuid(),
  'data',pg_temp.s_data('Synthetic series',current_setting('s.a')::uuid),'rule',pg_temp.s_rule('2027-03-23'))::text,true);
select pg_temp.s_ok(jsonb_array_length(public.ff_preview_event_plan(current_setting('s.input')::jsonb)->'rows')=3,'weekly preview has three independent instances');
select set_config('s.result',pg_temp.s_commit(current_setting('s.input')::jsonb)::text,true);
select set_config('s.series',current_setting('s.result')::jsonb->>'series_id',true);
select set_config('s.first',current_setting('s.result')::jsonb->'event_ids'->>0,true);
select set_config('s.second',current_setting('s.result')::jsonb->'event_ids'->>1,true);
select set_config('s.third',current_setting('s.result')::jsonb->'event_ids'->>2,true);
select pg_temp.s_ok((pg_temp.s_commit(current_setting('s.input')::jsonb)->>'replayed')::boolean,'retry is idempotent');
reset role;
select pg_temp.s_ok((select count(distinct id)=3 from public.events where series_id=current_setting('s.series')::uuid),'instances have unique IDs');
select set_config('request.jwt.claim.sub',pg_temp.s_user(2)::text,true);
set local role authenticated;
select public.ff_set_response(current_setting('s.first')::uuid,'yes');
select public.ff_set_response(current_setting('s.second')::uuid,'no');
reset role;
select pg_temp.s_ok((select count(*)=2 from public.participation_responses where event_id in(current_setting('s.first')::uuid,current_setting('s.second')::uuid)
  and user_id=pg_temp.s_user(2)),'separate response lists');
select set_config('request.jwt.claim.sub',pg_temp.s_user(1)::text,true);
set local role authenticated;
select public.ff_approve_member(pg_temp.s_user(7),current_setting('s.a')::uuid);
reset role;
select pg_temp.s_ok(exists(select 1 from ff_private.event_members(current_setting('s.third')::uuid) where user_id=pg_temp.s_user(7)),'late admission sees future series');
select pg_sleep(1.1);
update public.events set starts_at=clock_timestamp()-interval '0.5 second',ends_at=clock_timestamp()+interval '2 hours' where id=current_setting('s.first')::uuid;
set local role authenticated;
select public.ff_prepare_attendance(current_setting('s.first')::uuid);
select public.ff_confirm_attendance(current_setting('s.first')::uuid);
reset role;
select set_config('s.frozen',jsonb_build_object('event',(select to_jsonb(e) from public.events e where id=current_setting('s.first')::uuid),
  'roster',(select jsonb_agg(to_jsonb(r) order by user_id) from public.event_roster r where event_id=current_setting('s.first')::uuid),
  'attendance',(select jsonb_agg(to_jsonb(a) order by user_id) from public.actual_attendance a where event_id=current_setting('s.first')::uuid))::text,true);
set local role authenticated;
select set_config('s.update',jsonb_build_object('operation','series_update','request_id',gen_random_uuid(),'series_id',current_setting('s.series'),
  'anchor_id',current_setting('s.second'),'selection','all','data',pg_temp.s_data('Synthetic changed series',current_setting('s.a')::uuid),
  'rule',pg_temp.s_rule('2028-01-04'))::text,true);
select pg_temp.s_ok((public.ff_preview_event_plan(current_setting('s.update')::jsonb)->>'protected_count')::int=1,'started/final instance is protected');
select pg_temp.s_ok((public.ff_preview_event_plan(current_setting('s.update')::jsonb)->>'response_count')::int=1,'preview warns about response invalidation');
select pg_temp.s_commit(current_setting('s.update')::jsonb);
reset role;
select pg_temp.s_ok((select response='no' and invalidated_at is not null from public.participation_responses
  where event_id=current_setting('s.second')::uuid and user_id=pg_temp.s_user(2)),'raw response retained but invalidated');
select pg_temp.s_ok(current_setting('s.frozen')::jsonb=jsonb_build_object('event',(select to_jsonb(e) from public.events e where id=current_setting('s.first')::uuid),
  'roster',(select jsonb_agg(to_jsonb(r) order by user_id) from public.event_roster r where event_id=current_setting('s.first')::uuid),
  'attendance',(select jsonb_agg(to_jsonb(a) order by user_id) from public.actual_attendance a where event_id=current_setting('s.first')::uuid)),'final event and snapshot unchanged');
set local role authenticated;
select pg_temp.s_commit(current_setting('s.update')::jsonb||jsonb_build_object('request_id',gen_random_uuid(),'selection','single',
  'anchor_id',current_setting('s.third'),'rule',pg_temp.s_rule('2028-05-01')));
reset role;
select pg_temp.s_ok(exists(select 1 from public.event_series_exceptions where event_id=current_setting('s.third')::uuid),'single edit marked as exception');
set local role authenticated;
select pg_temp.s_ok((public.ff_preview_event_plan(current_setting('s.update')::jsonb)->>'protected_count')::int=2,'ordinary bulk edit preserves exception');
select pg_temp.s_commit(jsonb_build_object('operation','series_end','request_id',gen_random_uuid(),'series_id',current_setting('s.series'),
  'anchor_id',current_setting('s.second'),'selection','all','end_date','2028-01-01','reason','Synthetic end including future exception'));
reset role;
select pg_temp.s_ok((select count(*)=2 from public.events where series_id=current_setting('s.series')::uuid and status='cancelled'),'series end cancels future instances including exceptions');
select pg_temp.s_ok((select status='scheduled' from public.events where id=current_setting('s.first')::uuid),'final historic service not cancelled');
set local role authenticated;
select public.ff_set_unit_membership(pg_temp.s_user(7),current_setting('s.b')::uuid,true,'Synthetic transfer after final attendance');
reset role;
select pg_temp.s_ok(not exists(select 1 from ff_private.event_members(current_setting('s.second')::uuid) where user_id=pg_temp.s_user(7)),
  'transfer removes future series eligibility');
select pg_temp.s_ok(exists(select 1 from ff_private.event_members(current_setting('s.first')::uuid) where user_id=pg_temp.s_user(7)),
  'transfer retains frozen historical series membership');
select set_config('s.csv',jsonb_build_object('operation','csv_import','request_id',gen_random_uuid(),'rows',jsonb_build_array(
  pg_temp.s_data('Synthetic CSV',current_setting('s.a')::uuid)||jsonb_build_object('starts_at','2029-01-01T18:30:00Z','ends_at','2029-01-01T20:30:00Z')))::text,true);
set local role authenticated;
select pg_temp.s_deny(format('select public.ff_commit_event_plan(%L::jsonb,%L,false)',current_setting('s.csv'),public.ff_preview_event_plan(current_setting('s.csv')::jsonb)->>'token'));
select pg_temp.s_commit(current_setting('s.csv')::jsonb);
select pg_temp.s_ok(not (public.ff_preview_event_plan(current_setting('s.csv')::jsonb||jsonb_build_object('request_id',gen_random_uuid()))->>'can_commit')::boolean,'reupload detects existing duplicate');
reset role;
select pg_temp.s_ok(exists(select 1 from public.audit_entries where action='event_plan_committed'),'batch audit recorded');
set local role authenticated;
select pg_temp.s_deny(format('select public.ff_preview_event_plan(%L::jsonb)',current_setting('s.csv')::jsonb||
  jsonb_build_object('series_id',current_setting('s.series'))));
select set_config('s.fresh',jsonb_build_object('operation','series_create','request_id',gen_random_uuid(),
  'data',pg_temp.s_data('Synthetic following series',current_setting('s.a')::uuid),'rule',pg_temp.s_rule('2029-03-01'))::text,true);
select set_config('s.fresh_result',pg_temp.s_commit(current_setting('s.fresh')::jsonb)::text,true);
select public.ff_set_primary_organizer((current_setting('s.fresh_result')::jsonb->'event_ids'->>0)::uuid,pg_temp.s_user(2),'Synthetic existing primary assignment');
select pg_temp.s_ok(public.ff_series_workspace((current_setting('s.fresh_result')::jsonb->'event_ids'->>0)::uuid)->'anchor'->>'organizer_id'=pg_temp.s_user(2)::text,
  'planner shows existing effective primary delegation rather than obsolete organizer column');
select set_config('s.follow',jsonb_build_object('operation','series_update','request_id',gen_random_uuid(),
  'series_id',current_setting('s.fresh_result')::jsonb->>'series_id','anchor_id',current_setting('s.fresh_result')::jsonb->'event_ids'->>1,
  'selection','following','data',pg_temp.s_data('Synthetic following updated',current_setting('s.a')::uuid),'rule',pg_temp.s_rule('2029-04-01'))::text,true);
select pg_temp.s_ok(jsonb_array_length(public.ff_preview_event_plan(current_setting('s.follow')::jsonb)->'rows')=2,'following selection includes only anchor and later slots');
select pg_temp.s_commit(current_setting('s.follow')::jsonb);
reset role;
select pg_temp.s_ok((select title='Synthetic following series' from public.events
  where id=(current_setting('s.fresh_result')::jsonb->'event_ids'->>0)::uuid),'following edit preserves earlier future instance');
set local role authenticated;
select set_config('s.cancel',jsonb_build_object('operation','series_cancel','request_id',gen_random_uuid(),
  'series_id',current_setting('s.fresh_result')::jsonb->>'series_id','anchor_id',current_setting('s.fresh_result')::jsonb->'event_ids'->>1,
  'selection','single','reason','Synthetic single cancellation')::text,true);
select pg_temp.s_commit(current_setting('s.cancel')::jsonb);
reset role;
select pg_temp.s_ok((select count(*)=1 from public.events where series_id=(current_setting('s.fresh_result')::jsonb->>'series_id')::uuid and status='cancelled'),
  'single cancellation preserves other instances');
set local role authenticated;
select set_config('s.stale',(current_setting('s.follow')::jsonb||jsonb_build_object('request_id',gen_random_uuid(),'selection','all'))::text,true);
select set_config('s.token',public.ff_preview_event_plan(current_setting('s.stale')::jsonb)->>'token',true);
select set_config('request.jwt.claim.sub',pg_temp.s_user(2)::text,true);
select public.ff_set_response((current_setting('s.fresh_result')::jsonb->'event_ids'->>0)::uuid,'maybe');
select set_config('request.jwt.claim.sub',pg_temp.s_user(1)::text,true);
select pg_temp.s_deny(format('select public.ff_commit_event_plan(%L::jsonb,%L,true)',current_setting('s.stale'),current_setting('s.token')));
select pg_temp.s_deny(format('select public.ff_preview_event_plan(%L::jsonb)',current_setting('s.csv')::jsonb||
  jsonb_build_object('rows',(current_setting('s.csv')::jsonb->'rows')||jsonb_build_array(
    pg_temp.s_data('Synthetic mixed forbidden',current_setting('s.b')::uuid)||jsonb_build_object('title','x','starts_at','2029-06-01T18:30:00Z','ends_at','2029-06-01T20:30:00Z')))));
reset role;
create function pg_temp.reject_second_import() returns trigger language plpgsql as $$
begin
  if new.title='Synthetic rollback second' then raise exception 'Synthetic failure after first insert' using errcode='23514'; end if;
  return new;
end $$;
create trigger synthetic_import_failure before insert on public.events for each row execute function pg_temp.reject_second_import();
set local role authenticated;
select set_config('s.rollback',jsonb_build_object('operation','csv_import','request_id',gen_random_uuid(),'rows',jsonb_build_array(
  pg_temp.s_data('Synthetic rollback first',current_setting('s.a')::uuid)||jsonb_build_object('starts_at','2029-08-01T18:30:00Z','ends_at','2029-08-01T20:30:00Z'),
  pg_temp.s_data('Synthetic rollback second',current_setting('s.a')::uuid)||jsonb_build_object('starts_at','2029-08-02T18:30:00Z','ends_at','2029-08-02T20:30:00Z')))::text,true);
select pg_temp.s_deny(format('select public.ff_commit_event_plan(%L::jsonb,%L,true)',current_setting('s.rollback'),
  public.ff_preview_event_plan(current_setting('s.rollback')::jsonb)->>'token'));
reset role;
drop trigger synthetic_import_failure on public.events;
select pg_temp.s_ok(not exists(select 1 from public.events where title like 'Synthetic rollback %')
  and not exists(select 1 from ff_private.event_plan_commits where request_id=(current_setting('s.rollback')::jsonb->>'request_id')::uuid)
  and not exists(select 1 from public.audit_entries where after_data->>'title' like 'Synthetic rollback %'),'mid-import failure rolls back events, idempotence and audit');
select set_config('request.jwt.claim.sub',pg_temp.s_user(4)::text,true);
set local role authenticated;
select pg_temp.s_commit(jsonb_build_object('operation','series_create','request_id',gen_random_uuid(),'rule',pg_temp.s_rule('2029-09-01',2),
  'data',pg_temp.s_data('Synthetic function series',current_setting('s.a')::uuid)||jsonb_build_object(
    'scope_kind','function','unit_id',null,'function_id',current_setting('s.fn'),'organizer_id',pg_temp.s_user(4))));
reset role;
select pg_temp.s_ok((select count(*)=2 from public.events where title='Synthetic function series' and scope_kind='function'),'FUNCTION_ADMIN creates only authorized function series');
select set_config('request.jwt.claim.sub',pg_temp.s_user(1)::text,true);
set local role authenticated;
select set_config('s.custom',pg_temp.s_commit(jsonb_build_object('operation','series_create','request_id',gen_random_uuid(),
  'data',pg_temp.s_data('Synthetic custom organizer',current_setting('s.a')::uuid)||jsonb_build_object('organizer_id',pg_temp.s_user(2)),
  'rule',pg_temp.s_rule('2029-10-01',2)))::text,true);
reset role;
select pg_temp.s_ok((select count(*)=2 from public.event_delegations where event_id in (
  select value::text::uuid from jsonb_array_elements_text(current_setting('s.custom')::jsonb->'event_ids'))
  and is_primary and revoked_at is null and user_id=pg_temp.s_user(2)),'each new instance has its own approved primary organizer delegation');
select set_config('request.jwt.claim.sub',pg_temp.s_user(3)::text,true);
set local role authenticated;
select pg_temp.s_deny(format('select public.ff_preview_event_plan(%L::jsonb)',current_setting('s.csv')::jsonb||
  jsonb_build_object('rows',jsonb_build_array(pg_temp.s_data('Synthetic foreign',current_setting('s.b')::uuid)||
    jsonb_build_object('starts_at','2029-02-01T18:30:00Z','ends_at','2029-02-01T20:30:00Z')))));
reset role;
select set_config('request.jwt.claim.sub',pg_temp.s_user(5)::text,true);
set local role authenticated;
select pg_temp.s_deny(format('select public.ff_preview_event_plan(%L::jsonb)',current_setting('s.input')));
reset role;
select set_config('request.jwt.claim.sub',pg_temp.s_user(2)::text,true);
set local role authenticated;
select pg_temp.s_deny(format('select public.ff_preview_event_plan(%L::jsonb)',current_setting('s.input')));
reset role;
select pg_temp.s_ok(ff_private.berlin_instant('2027-10-31','02:30')='2027-10-31T00:30:00Z','server repeated hour matches earlier browser instant');
select pg_temp.s_deny('select ff_private.berlin_instant(''2027-03-28'',''02:30'')');
select pg_temp.s_ok(jsonb_array_length(ff_private.series_dates(pg_temp.s_rule('2027-01-31')||'{"frequency":"monthly"}'))=3,'monthly generation');
select pg_temp.s_ok(not has_function_privilege('authenticated','ff_private.build_event_plan(jsonb)','execute'),'private planning engine is not public');
rollback;
