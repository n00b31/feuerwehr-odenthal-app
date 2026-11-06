begin;
do $$ begin
  if current_database()<>'ff_dev_ci' then raise exception 'Disposable CI database required'; end if;
end $$;
create function pg_temp.ok(value boolean,label text) returns void language plpgsql as $$
begin
  if value is distinct from true then raise exception 'FAIL: %',label; end if;
  raise notice 'PASS: %',label;
end $$;
create function pg_temp.denied(statement text) returns void language plpgsql as $$
begin
  execute statement; raise exception 'FAIL: expected 42501: %',statement;
exception when insufficient_privilege then raise notice 'PASS: denied %',statement;
end $$;
select set_config('a.unit',(select id::text from public.units where code='scheuren'),true);
select set_config('a.other',(select id::text from public.units where code='blecher'),true);
select set_config('a.function',(select id::text from public.special_functions where code='breathing'),true);
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
select ('81000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'synthetic.attendance.'||i||'@feuerwehr-odenthal.de',
  clock_timestamp(),jsonb_build_object('display_name','Synthetic Attendance '||i) from generate_series(1,9) i;
select ff_private.bootstrap_global_admin('81000000-0000-4000-8000-000000000001',current_setting('a.unit')::uuid);
select set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select public.ff_approve_member(('81000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
  case when i in(6,7,8) then current_setting('a.other')::uuid else current_setting('a.unit')::uuid end) from generate_series(2,9) i;
select public.ff_set_role('81000000-0000-4000-8000-000000000002','UNIT_ADMIN',current_setting('a.unit')::uuid);
select public.ff_set_role('81000000-0000-4000-8000-000000000007','FUNCTION_ADMIN',null,current_setting('a.function')::uuid);
select public.ff_set_role('81000000-0000-4000-8000-000000000008','FIRE_CHIEF');
reset role;
insert into public.function_memberships(user_id,function_id) values
  ('81000000-0000-4000-8000-000000000007',current_setting('a.function')::uuid),
  ('81000000-0000-4000-8000-000000000003',current_setting('a.function')::uuid);
insert into public.events(id,title,event_type,starts_at,ends_at,location,scope_kind,unit_id,function_id,organizer_id)
select ('82000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'Synthetic Attendance Event '||i,'regular',
  clock_timestamp()+case when i=4 then interval '1 hour' else interval '-1 hour' end,
  clock_timestamp()+interval '3 hours','Synthetic location',
  case when i=3 then 'function'::public.ff_scope else 'unit'::public.ff_scope end,
  case when i=3 then null when i=2 then current_setting('a.other')::uuid else current_setting('a.unit')::uuid end,
  case when i=3 then current_setting('a.function')::uuid else null end,'81000000-0000-4000-8000-000000000001'
from generate_series(1,5) i;
insert into public.event_roster(event_id,user_id,unit_snapshot_id,name_snapshot)
select e.id,p.id,m.unit_id,p.display_name from public.events e join public.unit_memberships m on m.valid_until is null
join public.profiles p on p.id=m.user_id where e.scope_kind='unit' and m.unit_id=e.unit_id;
insert into public.event_roster(event_id,user_id,unit_snapshot_id,name_snapshot)
select '82000000-0000-4000-8000-000000000003',p.id,m.unit_id,p.display_name from public.profiles p
join public.function_memberships f on f.user_id=p.id join public.unit_memberships m on m.user_id=p.id and m.valid_until is null
where f.function_id=current_setting('a.function')::uuid and f.valid_until is null;
insert into public.participation_responses(event_id,user_id,response) values
  ('82000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000003','yes'),
  ('82000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000004','no'),
  ('82000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000005','maybe');

select set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select pg_temp.ok(public.ff_attendance_workspace('82000000-0000-4000-8000-000000000001')->>'state'='NOT_STARTED','durable not-started state');
select public.ff_record_attendance('82000000-0000-4000-8000-000000000001',auth.uid(),'absent');
select public.ff_prepare_attendance('82000000-0000-4000-8000-000000000001');
select public.ff_prepare_attendance('82000000-0000-4000-8000-000000000001');
select pg_temp.ok((select count(*)=1 from public.audit_entries where action='attendance_prepared'),'prefill audited exactly once');
select pg_temp.ok((select status='present' and origin='prefill' and response_snapshot='yes' from public.actual_attendance where user_id='81000000-0000-4000-8000-000000000003'),'yes is provisional present with original answer');
select pg_temp.ok((select status='absent' and origin='prefill' from public.actual_attendance where user_id='81000000-0000-4000-8000-000000000004'),'no is provisional absent');
select pg_temp.ok((select status='absent' and origin='prefill' and response_snapshot='maybe' from public.actual_attendance where user_id='81000000-0000-4000-8000-000000000005'),'maybe is only provisional absent');
select pg_temp.ok((select status='absent' and origin='prefill' and response_snapshot is null from public.actual_attendance where user_id='81000000-0000-4000-8000-000000000009'),'unanswered is only provisional absent');
select pg_temp.ok((select status='absent' and origin='manual' from public.actual_attendance where user_id=auth.uid()),'manual value survives preparation');
select pg_temp.ok((select attendance_state='IN_PROGRESS' and attendance_initialized_by=auth.uid() and attendance_initialized_at is not null
  from public.events where id='82000000-0000-4000-8000-000000000001'),'initial actor and time persisted');
select public.ff_set_member_response('82000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000003','no','Synthetic later planning correction');
select pg_temp.ok((select m->>'response'='yes' from jsonb_array_elements(public.ff_attendance_workspace('82000000-0000-4000-8000-000000000001')->'members') m
  where m->>'user_id'='81000000-0000-4000-8000-000000000003'),'original planned answer is immutable even if later planning changes');
select public.ff_record_attendance('82000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000009','unknown');
select public.ff_prepare_attendance('82000000-0000-4000-8000-000000000001');
select pg_temp.ok((select status='unknown' and origin='manual' from public.actual_attendance where user_id='81000000-0000-4000-8000-000000000009'),'initialized unknown never overwritten');
select pg_temp.denied($q$select public.ff_confirm_attendance('82000000-0000-4000-8000-000000000001')$q$);
select pg_temp.denied($q$select public.ff_prepare_attendance('82000000-0000-4000-8000-000000000004')$q$);
select pg_temp.denied($q$select public.ff_record_attendance('82000000-0000-4000-8000-000000000004',auth.uid(),'present')$q$);
select pg_temp.denied($q$select public.ff_prepare_attendance('82000000-0000-4000-8000-000000000002')$q$);
select pg_temp.ok((select count(*)=0 from public.confirmed_attendance),'provisional values are not final data');
select public.ff_set_primary_organizer('82000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000003','Synthetic internal note');
reset role;

select set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000004',true);
set local role authenticated;
select pg_temp.denied($q$select public.ff_record_attendance('82000000-0000-4000-8000-000000000001',auth.uid(),'present')$q$);
select pg_temp.denied($q$select public.ff_record_attendance('82000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000003','absent')$q$);
select pg_temp.denied($q$select public.ff_attendance_workspace('82000000-0000-4000-8000-000000000001')$q$);
select pg_temp.ok((select count(*)=0 from public.actual_attendance),'member cannot read own or other provisional actual values');
reset role;
select set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000008',true);
set local role authenticated;
select pg_temp.ok((select count(*)=0 from public.actual_attendance),'chief cannot read provisional values');
select pg_temp.ok((select count(*)=0 from public.audit_entries where action like 'attendance_%'),'chief cannot read provisional values through audit');
select pg_temp.denied($q$select public.ff_attendance_workspace('82000000-0000-4000-8000-000000000001')$q$);
reset role;

select set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000003',true);
set local role authenticated;
select pg_temp.ok(public.ff_attendance_workspace('82000000-0000-4000-8000-000000000001')->>'can_manage'='true','delegated member leads exact event');
select pg_temp.denied($q$select public.ff_prepare_attendance('82000000-0000-4000-8000-000000000005')$q$);
select pg_temp.denied($q$select public.ff_set_primary_organizer('82000000-0000-4000-8000-000000000001',auth.uid())$q$);
select pg_temp.denied($q$select public.ff_set_role(auth.uid(),'GLOBAL_ADMIN')$q$);
select public.ff_record_attendance('82000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000005','present');
select public.ff_record_attendance('82000000-0000-4000-8000-000000000001',user_id,'absent')
from public.actual_attendance where event_id='82000000-0000-4000-8000-000000000001' and status='unknown';
select public.ff_confirm_attendance('82000000-0000-4000-8000-000000000001');
select public.ff_confirm_attendance('82000000-0000-4000-8000-000000000001');
select public.ff_prepare_attendance('82000000-0000-4000-8000-000000000001');
select pg_temp.ok((select attendance_state='COMPLETED' from public.events where id='82000000-0000-4000-8000-000000000001'),'fully determined list closes');
select pg_temp.ok((select count(*)=1 from public.audit_entries where action='attendance_confirmed'),'completion is idempotent');
select pg_temp.denied($q$select public.ff_record_attendance('82000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000004','present')$q$);
select pg_temp.denied($q$select public.ff_record_attendance('82000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000004','unknown','Synthetic reason')$q$);
select public.ff_record_attendance('82000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000004','present','Synthetic observed late arrival');
select public.ff_record_attendance('82000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000004','present','Synthetic idempotent repeated request');
select pg_temp.ok((select attendance_state='CORRECTED' and attendance_corrected_at is not null from public.events where id='82000000-0000-4000-8000-000000000001'),'correction state and timestamp persist');
select pg_temp.ok((select count(*)=1 from public.audit_entries where action='attendance_corrected' and actor_id=auth.uid()
  and subject_id='81000000-0000-4000-8000-000000000004' and event_id='82000000-0000-4000-8000-000000000001'
  and before_data->>'status'='absent' and after_data->>'status'='present' and after_data->>'recorded_by'=auth.uid()::text
  and after_data->>'recorded_at' is not null and reason='Synthetic observed late arrival'),'correction has actor person event time reason and full before after');
reset role;
select pg_temp.ok((select m->>'status'='absent' from public.attendance_confirmations c,jsonb_array_elements(c.original_snapshot) m
  where c.event_id='82000000-0000-4000-8000-000000000001' and m->>'user_id'='81000000-0000-4000-8000-000000000004'),'original completion snapshot remains unchanged');
select set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000004',true);
set local role authenticated;
select pg_temp.ok((select count(*)=1 from public.confirmed_attendance where user_id=auth.uid() and status='present'),'member reads own confirmed correction only');
select pg_temp.ok((select count(*)=0 from public.confirmed_attendance where user_id<>auth.uid()),'final data never leaks other members to member');
select pg_temp.ok((select e->>'own_attendance'='present' from jsonb_array_elements(public.ff_events_workspace()->'events') e
  where e->>'id'='82000000-0000-4000-8000-000000000001'),'own confirmed attendance returned to event UI');
reset role;
select set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000008',true);
set local role authenticated;
select pg_temp.ok((select count(*)=6 from public.confirmed_attendance),'chief reads all six finalized roster members');
select pg_temp.ok(public.ff_attendance_workspace('82000000-0000-4000-8000-000000000001')->>'can_manage'='false','chief finalized workspace is read only');
select pg_temp.ok(public.ff_attendance_workspace('82000000-0000-4000-8000-000000000001')#>'{primary_organizer,note}'='null'::jsonb,'internal note not exposed to chief');
select pg_temp.ok((select count(*)=0 from public.event_delegations),'chief cannot recover internal note through direct delegation query');
select pg_temp.ok((select count(*)=0 from public.audit_entries where action='event_delegation_changed'),'chief cannot recover internal note through audit');
select pg_temp.denied($q$select public.ff_record_attendance('82000000-0000-4000-8000-000000000001',auth.uid(),'present','Synthetic chief attempt')$q$);
reset role;

select set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select public.ff_set_primary_organizer('82000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000009');
reset role;
select set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000003',true);
set local role authenticated;
select pg_temp.denied($q$select public.ff_record_attendance('82000000-0000-4000-8000-000000000001',auth.uid(),'absent','Synthetic revoked attempt')$q$);
select pg_temp.denied($q$select public.ff_attendance_workspace('82000000-0000-4000-8000-000000000001')$q$);
reset role;
insert into public.event_delegations(event_id,user_id,assigned_by,is_primary)
values('82000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000003','81000000-0000-4000-8000-000000000002',false);
select set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select public.ff_set_primary_organizer('82000000-0000-4000-8000-000000000001',null);
select pg_temp.ok((select count(*)=1 from public.event_delegations where revoked_at is null and not is_primary),'revoking primary preserves secondary organizer');
select pg_temp.ok((select count(*)=6 from public.actual_attendance),'delegation replacement and revocation never alter attendance');
reset role;

select set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000007',true);
set local role authenticated;
select public.ff_prepare_attendance('82000000-0000-4000-8000-000000000003');
select public.ff_record_attendance('82000000-0000-4000-8000-000000000003',auth.uid(),'present');
select pg_temp.denied($q$select public.ff_record_attendance('82000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000003','absent','Synthetic foreign function attempt')$q$);
select pg_temp.ok((select count(*)=0 from public.actual_attendance where event_id='82000000-0000-4000-8000-000000000001'),'function administrator cannot read foreign unit actual values');
reset role;
set local role anon;
select pg_temp.denied($q$select public.ff_attendance_workspace('82000000-0000-4000-8000-000000000001')$q$);
reset role;
\echo 'Attendance state, prefill, final-only RLS, delegation and correction suite passed.'
rollback;
