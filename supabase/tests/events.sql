begin;
do $$ begin
  if current_database() <> 'ff_dev_ci' then raise exception 'Disposable CI database required'; end if;
end; $$;
create function pg_temp.assert_event(value boolean, label text)
returns void language plpgsql as $$
begin
  if value is distinct from true then raise exception 'FAIL: %', label; end if;
  raise notice 'PASS: %', label;
end; $$;
create function pg_temp.denied(statement text)
returns void language plpgsql as $$
begin
  execute statement; raise exception 'FAIL: expected permission denial: %', statement;
exception when insufficient_privilege then raise notice 'PASS: denied %', statement;
end; $$;
create function pg_temp.conflict(statement text)
returns void language plpgsql as $$
begin
  execute statement; raise exception 'FAIL: expected stale revision: %', statement;
exception when serialization_failure then raise notice 'PASS: stale revision rejected';
end; $$;
create function pg_temp.payload(title text, unit uuid)
returns jsonb language sql as $$
  select jsonb_build_object('title',title,'description','Synthetic event test','event_type','regular',
    'location','Synthetic test location','unit_id',unit,
    'starts_at',clock_timestamp()+interval '2 days','ends_at',clock_timestamp()+interval '2 days 2 hours');
$$;
select set_config('events.unit',(select id::text from public.units where code='scheuren'),true);
select set_config('events.other_unit',(select id::text from public.units where code='blecher'),true);
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
select ('70000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
  'synthetic.events.'||i||'@feuerwehr-odenthal.de',clock_timestamp(),
  jsonb_build_object('display_name','Synthetic Event Member '||i) from generate_series(1,6) i;
select ff_private.bootstrap_global_admin('70000000-0000-4000-8000-000000000001',current_setting('events.unit')::uuid);
select set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select public.ff_approve_member('70000000-0000-4000-8000-000000000002',current_setting('events.unit')::uuid);
select public.ff_approve_member('70000000-0000-4000-8000-000000000003',current_setting('events.unit')::uuid);
select public.ff_approve_member('70000000-0000-4000-8000-000000000004',current_setting('events.other_unit')::uuid);
select public.ff_approve_member('70000000-0000-4000-8000-000000000005',current_setting('events.other_unit')::uuid);
select public.ff_approve_member('70000000-0000-4000-8000-000000000006',current_setting('events.other_unit')::uuid);
select public.ff_set_role('70000000-0000-4000-8000-000000000003','UNIT_ADMIN',current_setting('events.unit')::uuid);
select public.ff_set_role('70000000-0000-4000-8000-000000000006','FIRE_CHIEF');
select set_config('events.id',public.ff_create_single_event(pg_temp.payload('Synthetic shared event',current_setting('events.unit')::uuid))::text,true);
select set_config('events.foreign',public.ff_create_single_event(pg_temp.payload('Synthetic foreign event',current_setting('events.other_unit')::uuid))::text,true);
select pg_temp.assert_event((select series_id is null and revision=0 from public.events where id=current_setting('events.id')::uuid),'new event is an independent single instance');
select pg_temp.assert_event((select count(*)=3 from public.event_roster where event_id=current_setting('events.id')::uuid),'approved same-unit members snapshotted atomically');
select pg_temp.assert_event((select count(*)=0 from public.actual_attendance),'creation does not manufacture attendance');
select pg_temp.denied($q$select public.ff_create_single_event(pg_temp.payload('Invalid future',current_setting('events.unit')::uuid)||jsonb_build_object('ends_at','infinity'))$q$);
reset role;

select set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select pg_temp.assert_event((select count(*)=1 from public.events),'member only sees their unit event');
select pg_temp.assert_event(jsonb_array_length(public.ff_events_workspace()->'events')=1,'workspace enforces event visibility');
select pg_temp.assert_event(public.ff_events_workspace()#>'{events,0,participants}'='null'::jsonb,'member sees no other response identities');
select pg_temp.assert_event(public.ff_events_workspace()->'manageable_units'='[]'::jsonb,'member cannot create by UI capability');
select public.ff_set_response(current_setting('events.id')::uuid,'yes');
select public.ff_set_response(current_setting('events.id')::uuid,'no');
select pg_temp.assert_event((select count(*)=1 and min(response::text)='no' from public.participation_responses),'one current centrally stored answer after change');
select pg_temp.denied($q$select public.ff_set_response(current_setting('events.foreign')::uuid,'yes')$q$);
select pg_temp.denied($q$select public.ff_create_single_event(pg_temp.payload('Forged creation',current_setting('events.unit')::uuid))$q$);
select pg_temp.denied($q$select public.ff_update_single_event(current_setting('events.id')::uuid,0,pg_temp.payload('Forged edit',current_setting('events.unit')::uuid))$q$);
select pg_temp.denied($q$select public.ff_cancel_single_event(current_setting('events.id')::uuid,0,'Forged cancellation')$q$);
select pg_temp.denied($q$select public.ff_set_member_response(current_setting('events.id')::uuid,auth.uid(),'yes','Forged override')$q$);
select pg_temp.denied($q$insert into public.participation_responses(event_id,user_id,response) values(current_setting('events.foreign')::uuid,auth.uid(),'yes')$q$);
reset role;

select set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000003',true);
set local role authenticated;
select pg_temp.assert_event(jsonb_array_length(public.ff_events_workspace()->'manageable_units')=1,'unit administration gets only its own create scope');
select pg_temp.assert_event((select jsonb_array_length(item->'participants')=3 from jsonb_array_elements(public.ff_events_workspace()->'events') item where item->>'id'=current_setting('events.id')),'admin sees participant roster including unanswered');
select pg_temp.assert_event((select item->>'response'='no' from jsonb_array_elements(public.ff_events_workspace()#>'{events,0,participants}') item where item->>'user_id'='70000000-0000-4000-8000-000000000002'),'admin reads changed member response');
select pg_temp.denied($q$select public.ff_create_single_event(pg_temp.payload('Foreign creation',current_setting('events.other_unit')::uuid))$q$);
select pg_temp.denied($q$select public.ff_cancel_single_event(current_setting('events.foreign')::uuid,0,'Foreign cancellation')$q$);
select public.ff_update_single_event(current_setting('events.id')::uuid,0,pg_temp.payload('Synthetic edited event',current_setting('events.unit')::uuid));
select pg_temp.assert_event((select revision=1 and title='Synthetic edited event' from public.events where id=current_setting('events.id')::uuid),'scoped edit increments revision');
select pg_temp.conflict($q$select public.ff_update_single_event(current_setting('events.id')::uuid,0,pg_temp.payload('Stale edit',current_setting('events.unit')::uuid))$q$);
select pg_temp.conflict($q$select public.ff_cancel_single_event(current_setting('events.id')::uuid,0,'Stale cancellation')$q$);
select pg_temp.denied($q$select public.ff_update_single_event(current_setting('events.id')::uuid,1,pg_temp.payload('Scope change',current_setting('events.other_unit')::uuid))$q$);
reset role;

-- Move only disposable test data across the exact server-time boundary.
update public.events set starts_at=clock_timestamp()-interval '1 second',ends_at=clock_timestamp()+interval '2 hours'
where id=current_setting('events.id')::uuid;
select set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select pg_temp.denied($q$select public.ff_set_response(current_setting('events.id')::uuid,'yes')$q$);
reset role;
select set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000003',true);
set local role authenticated;
select pg_temp.denied($q$select public.ff_update_single_event(current_setting('events.id')::uuid,1,pg_temp.payload('Started edit',current_setting('events.unit')::uuid))$q$);
select pg_temp.denied($q$select public.ff_set_member_response(current_setting('events.id')::uuid,'70000000-0000-4000-8000-000000000002','yes','')$q$);
select public.ff_set_member_response(current_setting('events.id')::uuid,'70000000-0000-4000-8000-000000000002','yes','Synthetic admin correction');
select public.ff_set_event_delegate(current_setting('events.id')::uuid,'70000000-0000-4000-8000-000000000002');
reset role;
select set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select public.ff_set_member_response(current_setting('events.id')::uuid,'70000000-0000-4000-8000-000000000003','maybe','Synthetic delegated correction');
select pg_temp.denied($q$select public.ff_set_member_response(current_setting('events.foreign')::uuid,auth.uid(),'yes','Synthetic foreign override')$q$);
select pg_temp.denied($q$select public.ff_cancel_single_event(current_setting('events.id')::uuid,1,'Delegate cannot cancel')$q$);
reset role;
select set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000003',true);
set local role authenticated;
select public.ff_set_event_delegate(current_setting('events.id')::uuid,null);
reset role;
select set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select pg_temp.denied($q$select public.ff_set_member_response(current_setting('events.id')::uuid,auth.uid(),'yes','Revoked delegate')$q$);
reset role;

select set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000006',true);
set local role authenticated;
select pg_temp.assert_event(jsonb_array_length(public.ff_events_workspace()->'events')=2,'fire chief retains organizational reading');
select pg_temp.denied($q$select public.ff_cancel_single_event(current_setting('events.id')::uuid,1,'Read-only chief')$q$);
reset role;
select set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select public.ff_cancel_single_event(current_setting('events.id')::uuid,1,'Synthetic cancellation');
select pg_temp.assert_event((select status='cancelled' and revision=2 from public.events where id=current_setting('events.id')::uuid),'global administration cancels without deleting');
select pg_temp.assert_event((select count(*)=2 from public.participation_responses where event_id=current_setting('events.id')::uuid),'cancellation retains current responses');
select pg_temp.assert_event((select count(*)=2 from public.audit_entries where action='response_changed' and event_id=current_setting('events.id')::uuid),'normal response changes are audited');
select pg_temp.assert_event((select count(*)=2 from public.audit_entries where action='response_corrected' and reason is not null),'leader corrections retain actor, member, reason and previous answer');
select pg_temp.assert_event((select count(*)=0 from public.actual_attendance),'planned corrections never create actual attendance');
select pg_temp.denied($q$select public.ff_set_member_response(current_setting('events.id')::uuid,'70000000-0000-4000-8000-000000000002','yes','Cancelled event')$q$);
reset role;
set local role anon;
select pg_temp.denied('select public.ff_events_workspace()');
reset role;
rollback;
