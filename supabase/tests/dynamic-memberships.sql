-- Synthetic database identities only; never execute against hosted DEV.
begin;
do $$ begin if current_database()<>'ff_dev_ci' then raise exception 'Disposable CI required'; end if; end $$;
create function pg_temp.d_user(i int) returns uuid language sql immutable as $$
  select ('a0620000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid;
$$;
create function pg_temp.d_ok(value boolean,label text) returns void language plpgsql as $$
begin
  if value is distinct from true then raise exception 'FAIL: %',label; end if;
  raise notice 'PASS: %',label;
end $$;
create function pg_temp.d_denied(statement text) returns void language plpgsql as $$
begin
  execute statement; raise exception 'FAIL: unauthorized operation succeeded';
exception when insufficient_privilege then raise notice 'PASS: authorization rejected';
end $$;
create function pg_temp.d_payload(title text,unit uuid) returns jsonb language sql as $$
  select jsonb_build_object('title',title,'description','Synthetic CI','event_type','regular','unit_id',unit,'location','Synthetic CI',
    'starts_at',clock_timestamp()+interval '4 days','ends_at',clock_timestamp()+interval '4 days 2 hours');
$$;
create function pg_temp.d_transfer_and_flush(person uuid,unit uuid) returns void language plpgsql as $$
begin
  perform public.ff_set_unit_membership(person,unit,true,'Synthetic transfer with same-statement deferred checks');
  set constraints all immediate;
  set constraints all deferred;
end $$;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
select pg_temp.d_user(i),'synthetic.membership.ci.'||i||'@feuerwehr-odenthal.de',clock_timestamp(),
  jsonb_build_object('display_name','Synthetic membership person '||i) from generate_series(1,8) i;
select set_config('d.a',(select id::text from public.units where code='scheuren'),true);
select set_config('d.b',(select id::text from public.units where code='blecher'),true);
select set_config('d.fn',(select id::text from public.special_functions order by name limit 1),true);
select ff_private.bootstrap_global_admin(pg_temp.d_user(1),current_setting('d.a')::uuid);
select set_config('request.jwt.claim.sub',pg_temp.d_user(1)::text,true);
set local role authenticated;
select public.ff_approve_member(pg_temp.d_user(i),case when i in (2,5) then current_setting('d.a')::uuid else current_setting('d.b')::uuid end)
  from generate_series(2,6) i;
select public.ff_set_role(pg_temp.d_user(4),'UNIT_ADMIN',current_setting('d.a')::uuid);
select public.ff_set_role(pg_temp.d_user(5),'FUNCTION_ADMIN',null,current_setting('d.fn')::uuid);
select public.ff_set_role(pg_temp.d_user(6),'FIRE_CHIEF');
select public.ff_set_function_membership(pg_temp.d_user(i),current_setting('d.fn')::uuid,true,'Synthetic initial function assignment')
  from unnest(array[2,5]) i;
select set_config('d.event_a',public.ff_create_single_event(pg_temp.d_payload('Synthetic dynamic A',current_setting('d.a')::uuid))::text,true);
select set_config('d.event_b',public.ff_create_single_event(pg_temp.d_payload('Synthetic dynamic B',current_setting('d.b')::uuid))::text,true);
reset role;
insert into public.events(id,title,event_type,starts_at,ends_at,location,scope_kind,function_id,organizer_id)
values('e0620000-0000-4000-8000-000000000001','Synthetic dynamic organization','regular',
  clock_timestamp()+interval '4 days',clock_timestamp()+interval '4 days 2 hours','CI','organization',null,pg_temp.d_user(1)),
 ('e0620000-0000-4000-8000-000000000002','Synthetic dynamic function','regular',
  clock_timestamp()+interval '4 days',clock_timestamp()+interval '4 days 2 hours','CI','function',current_setting('d.fn')::uuid,pg_temp.d_user(1)),
 ('e0620000-0000-4000-8000-000000000003','Synthetic explicitly invited organization','regular',
  clock_timestamp()+interval '4 days',clock_timestamp()+interval '4 days 2 hours','CI','organization',null,pg_temp.d_user(1));
insert into public.event_series(id,title,scope_kind,unit_id,frequency,occurrence_count,local_start,duration_minutes,created_by)
values('f0620000-0000-4000-8000-000000000001','Synthetic dynamic series','unit',current_setting('d.a')::uuid,
  'weekly',2,(clock_timestamp()+interval '4 days') at time zone 'Europe/Berlin',120,pg_temp.d_user(1));
insert into public.events(id,series_id,instance_number,title,event_type,starts_at,ends_at,location,scope_kind,unit_id,organizer_id)
select ('e0620000-0000-4000-8000-'||lpad((i+3)::text,12,'0'))::uuid,'f0620000-0000-4000-8000-000000000001',i,
  'Synthetic dynamic series '||i,'regular',clock_timestamp()+interval '4 days'+(i-1)*interval '7 days',
  clock_timestamp()+interval '4 days 2 hours'+(i-1)*interval '7 days','CI','unit',current_setting('d.a')::uuid,pg_temp.d_user(1)
from generate_series(1,2) i;
set local role authenticated;
select public.ff_set_event_participants('e0620000-0000-4000-8000-000000000003',0,array[pg_temp.d_user(2)]);
reset role;
select set_config('request.jwt.claim.sub',pg_temp.d_user(7)::text,true);
set local role authenticated;
select pg_temp.d_denied($q$select public.ff_set_response(current_setting('d.event_a')::uuid,'yes')$q$);
reset role;
select set_config('request.jwt.claim.sub',pg_temp.d_user(1)::text,true);
set local role authenticated;
select public.ff_approve_member(pg_temp.d_user(7),current_setting('d.a')::uuid);
select public.ff_set_function_membership(pg_temp.d_user(7),current_setting('d.fn')::uuid,true,'Synthetic function admission after creation');
select public.ff_add_unit_membership(pg_temp.d_user(2),current_setting('d.b')::uuid,'Synthetic additional membership');
select public.ff_add_unit_membership(pg_temp.d_user(2),current_setting('d.b')::uuid,'Synthetic idempotent membership');
reset role;
set constraints all immediate;
set constraints all deferred;
select pg_temp.d_ok((select count(*)=2 from public.unit_memberships where user_id=pg_temp.d_user(2) and valid_until is null),
  'multiple current units and idempotent addition without duplicate membership');
select pg_temp.d_ok((select count(*)=4 from ff_private.event_members(current_setting('d.event_a')::uuid)),
  'new member enters existing future unit event');
select pg_temp.d_ok((select count(*)=7 and count(distinct user_id)=7 from ff_private.event_members('e0620000-0000-4000-8000-000000000001')),
  'organization event considers multiple units but each person once');
select pg_temp.d_ok((select count(*)=3 from ff_private.event_members('e0620000-0000-4000-8000-000000000002')),
  'existing future function event incorporates new function membership');
select pg_temp.d_ok((select count(*)=1 and min(user_id::text)=pg_temp.d_user(2)::text
  from ff_private.event_members('e0620000-0000-4000-8000-000000000003')),
  'explicit invitations never expand after unit admission');
select set_config('request.jwt.claim.sub',pg_temp.d_user(2)::text,true);
set local role authenticated;
select pg_temp.d_ok((select count(*)=1 and min(unit_id::text)=current_setting('d.a') from public.ff_my_access()),
  'multi-member Auth workspace stays a single verified identity and retains the original primary unit');
reset role;
select set_config('request.jwt.claim.sub',pg_temp.d_user(7)::text,true);
set local role authenticated;
select pg_temp.d_ok((select count(*)=3 from public.events where id in (
  current_setting('d.event_a')::uuid,'e0620000-0000-4000-8000-000000000004','e0620000-0000-4000-8000-000000000005')),
  'new member reads existing single event and both independent series instances');
select public.ff_set_response(current_setting('d.event_a')::uuid,'yes');
select pg_temp.d_denied($q$select public.ff_set_response('e0620000-0000-4000-8000-000000000003','yes')$q$);
select pg_temp.d_denied($q$select public.ff_add_unit_membership(auth.uid(),current_setting('d.b')::uuid,'Forged additional unit')$q$);
reset role;
select set_config('request.jwt.claim.sub',pg_temp.d_user(2)::text,true);
set local role authenticated;
select public.ff_set_response(current_setting('d.event_a')::uuid,'yes');
select public.ff_set_response('e0620000-0000-4000-8000-000000000001','yes');
select public.ff_set_response('e0620000-0000-4000-8000-000000000002','yes');
select public.ff_set_response('e0620000-0000-4000-8000-000000000003','yes');
select public.ff_set_response('e0620000-0000-4000-8000-000000000004','yes');
select public.ff_set_response('e0620000-0000-4000-8000-000000000005','no');
reset role;
select set_config('d.old_response',(select to_jsonb(p)::text from public.participation_responses p
  where event_id=current_setting('d.event_a')::uuid and user_id=pg_temp.d_user(2)),true);
select set_config('request.jwt.claim.sub',pg_temp.d_user(1)::text,true);
set local role authenticated;
select pg_temp.d_transfer_and_flush(pg_temp.d_user(2),current_setting('d.b')::uuid);
reset role;
set constraints all immediate;
set constraints all deferred;
select pg_temp.d_ok((select response='yes' and invalidated_at is not null
  and updated_at=(current_setting('d.old_response')::jsonb->>'updated_at')::timestamptz
  from public.participation_responses where event_id=current_setting('d.event_a')::uuid and user_id=pg_temp.d_user(2)),
  'stale future reply preserves original answer and timestamp while becoming invalid');
select pg_temp.d_ok((select count(*)=2 from public.participation_responses where user_id=pg_temp.d_user(2)
  and event_id in ('e0620000-0000-4000-8000-000000000004','e0620000-0000-4000-8000-000000000005') and invalidated_at is not null),
  'each future series response is invalidated independently');
select pg_temp.d_ok((select count(*)=3 from public.participation_responses where user_id=pg_temp.d_user(2)
  and event_id in ('e0620000-0000-4000-8000-000000000001','e0620000-0000-4000-8000-000000000002','e0620000-0000-4000-8000-000000000003')
  and invalidated_at is null),'transfer does not transiently invalidate continuing organization, function or explicit organization answers');
select pg_temp.d_ok(exists(select 1 from public.audit_entries where action='future_response_invalidated'
  and subject_id=pg_temp.d_user(2) and event_id=current_setting('d.event_a')::uuid and actor_id=pg_temp.d_user(1)),
  'eligibility loss is audited with actual administrator, person and event');
select set_config('request.jwt.claim.sub',pg_temp.d_user(2)::text,true);
set local role authenticated;
select pg_temp.d_ok((select count(*)=0 from public.events where id=current_setting('d.event_a')::uuid),
  'stale stored roster and answer do not grant future old-unit visibility');
select pg_temp.d_denied($q$select public.ff_set_response(current_setting('d.event_a')::uuid,'no')$q$);
select public.ff_set_response(current_setting('d.event_b')::uuid,'yes');
reset role;
select set_config('request.jwt.claim.sub',pg_temp.d_user(4)::text,true);
set local role authenticated;
select pg_temp.d_ok((select count(*)=0 from public.profiles where id=pg_temp.d_user(2)),
  'old-unit administrator cannot read a foreign live profile via stale future roster');
reset role;
select set_config('request.jwt.claim.sub',pg_temp.d_user(1)::text,true);
set local role authenticated;
select public.ff_set_unit_membership(pg_temp.d_user(2),current_setting('d.a')::uuid,true,'Synthetic return to A');
select public.ff_set_function_membership(pg_temp.d_user(2),current_setting('d.fn')::uuid,false,'Synthetic function exit');
reset role;
set constraints all immediate;
set constraints all deferred;
select set_config('request.jwt.claim.sub',pg_temp.d_user(2)::text,true);
set local role authenticated;
select pg_temp.d_ok((select item->'own_response'='null'::jsonb from jsonb_array_elements(public.ff_events_page()->'events') item
  where item->>'id'=current_setting('d.event_a')),
  'returning to a unit does not automatically revive an invalidated reply');
select public.ff_set_response(current_setting('d.event_a')::uuid,'maybe');
select pg_temp.d_denied($q$select public.ff_set_response('e0620000-0000-4000-8000-000000000002','yes')$q$);
reset role;
select pg_temp.d_ok((select response='maybe' and invalidated_at is null from public.participation_responses
  where event_id=current_setting('d.event_a')::uuid and user_id=pg_temp.d_user(2)),
  'only a new explicitly authorized response replaces invalidation');

select set_config('request.jwt.claim.sub',pg_temp.d_user(5)::text,true);
set local role authenticated;
select public.ff_set_response(current_setting('d.event_a')::uuid,'no');
select public.ff_set_response('e0620000-0000-4000-8000-000000000002','yes');
reset role;
select set_config('request.jwt.claim.sub',pg_temp.d_user(1)::text,true);
set local role authenticated;
select public.ff_set_account_status(pg_temp.d_user(5),'suspended','Synthetic suspension before service start');
reset role;
set constraints all immediate;
set constraints all deferred;
select set_config('d.suspended_start',clock_timestamp()::text,true);
select pg_sleep(.01);
select set_config('request.jwt.claim.sub',pg_temp.d_user(5)::text,true);
set local role authenticated;
select pg_temp.d_denied($q$select public.ff_set_response(current_setting('d.event_a')::uuid,'yes')$q$);
reset role;
select set_config('request.jwt.claim.sub',pg_temp.d_user(1)::text,true);
set local role authenticated;
select public.ff_reactivate_member(pg_temp.d_user(5),'Synthetic explicit account reactivation');
reset role;
set constraints all immediate;
set constraints all deferred;
select pg_temp.d_ok((select count(*)=2 from public.participation_responses where user_id=pg_temp.d_user(5) and invalidated_at is not null),
  'suspension invalidates future answers; reactivation does not revive them');
insert into public.events(id,title,event_type,starts_at,ends_at,location,scope_kind,function_id,organizer_id)
values('e0620000-0000-4000-8000-000000000006','Synthetic service started during suspension','special',
  current_setting('d.suspended_start')::timestamptz,current_setting('d.suspended_start')::timestamptz+interval '2 hours',
  'CI','function',current_setting('d.fn')::uuid,pg_temp.d_user(1));
select pg_temp.d_ok(not exists(select 1 from ff_private.event_members('e0620000-0000-4000-8000-000000000006')
  where user_id=pg_temp.d_user(5)),'current reactivation cannot retroactively qualify a person suspended at service start');
set local role authenticated;
select public.ff_record_attendance('e0620000-0000-4000-8000-000000000006',pg_temp.d_user(7),'present');
reset role;

-- Establish a real ordered start boundary rather than backdating newly created memberships.
select set_config('d.start',clock_timestamp()::text,true);
select pg_sleep(.01);
update public.events set starts_at=current_setting('d.start')::timestamptz,ends_at=current_setting('d.start')::timestamptz+interval '2 hours'
  where id=current_setting('d.event_a')::uuid;
select set_config('request.jwt.claim.sub',pg_temp.d_user(1)::text,true);
set local role authenticated;
select public.ff_approve_member(pg_temp.d_user(8),current_setting('d.a')::uuid);
select public.ff_prepare_attendance(current_setting('d.event_a')::uuid);
reset role;
select pg_temp.d_ok((select count(*)=4 from public.event_roster where event_id=current_setting('d.event_a')::uuid and included)
  and not exists(select 1 from public.event_roster where event_id=current_setting('d.event_a')::uuid and user_id=pg_temp.d_user(8) and included),
  'first initialization freezes start-time membership and excludes a later approval');
select pg_temp.d_ok((select count(*)=1 from public.actual_attendance where event_id=current_setting('d.event_a')::uuid and status='present')
  and (select count(*)=3 from public.actual_attendance where event_id=current_setting('d.event_a')::uuid and status='absent'),
  'valid yes prefilled present; maybe, no response and other answers prefilled absent');
set local role authenticated;
select public.ff_confirm_attendance(current_setting('d.event_a')::uuid);
reset role;
select set_config('d.roster',(select jsonb_agg(to_jsonb(r) order by user_id)::text from public.event_roster r
  where event_id=current_setting('d.event_a')::uuid),true);
select set_config('d.actual',(select jsonb_agg(to_jsonb(a) order by user_id)::text from public.actual_attendance a
  where event_id=current_setting('d.event_a')::uuid),true);
select set_config('d.report',(select jsonb_agg(to_jsonb(r) order by event_id)::text
  from ff_private.report_rows_for_user(extract(year from current_setting('d.start')::timestamptz at time zone 'Europe/Berlin')::int,
    'personal',null,null,pg_temp.d_user(7)) r),true);
set local role authenticated;
select public.ff_set_unit_membership(pg_temp.d_user(7),current_setting('d.b')::uuid,true,'Synthetic transfer after final attendance');
select public.ff_prepare_attendance(current_setting('d.event_a')::uuid);
reset role;
set constraints all immediate;
set constraints all deferred;
select pg_temp.d_ok((select jsonb_agg(to_jsonb(r) order by user_id)::text=current_setting('d.roster')
  from public.event_roster r where event_id=current_setting('d.event_a')::uuid)
  and (select jsonb_agg(to_jsonb(a) order by user_id)::text=current_setting('d.actual')
    from public.actual_attendance a where event_id=current_setting('d.event_a')::uuid),
  'later transfer and repeated preparation preserve final roster, snapshots and actual attendance byte-for-byte');
select pg_temp.d_ok((select jsonb_agg(to_jsonb(r) order by event_id)::text=current_setting('d.report')
  from ff_private.report_rows_for_user(extract(year from current_setting('d.start')::timestamptz at time zone 'Europe/Berlin')::int,
    'personal',null,null,pg_temp.d_user(7)) r),'historical unit, hours and final reporting remain unchanged');
select set_config('request.jwt.claim.sub',pg_temp.d_user(7)::text,true);
set local role authenticated;
select pg_temp.d_ok((select count(*)=1 from public.events where id=current_setting('d.event_a')::uuid),
  'historical participant still reads their completed old-unit service');
select pg_temp.d_denied($q$select public.ff_set_response(current_setting('d.event_a')::uuid,'no')$q$);
reset role;
rollback;
