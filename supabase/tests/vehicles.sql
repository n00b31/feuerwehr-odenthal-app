begin;
do $$ begin if current_database()<>'ff_dev_ci' then raise exception 'Disposable CI required'; end if; end $$;
create function pg_temp.v_assert(value boolean,label text)
returns void language plpgsql as $$ begin
  if value is distinct from true then raise exception 'FAIL: %',label; end if;
  raise notice 'PASS: %',label;
end $$;
create function pg_temp.v_denied(statement text)
returns void language plpgsql as $$ begin
  execute statement; raise exception 'FAIL: unauthorized vehicle operation succeeded';
exception when insufficient_privilege then raise notice 'PASS: vehicle rule/RLS denied';
end $$;
create function pg_temp.v_overlap(statement text)
returns void language plpgsql as $$ begin
  execute statement; raise exception 'FAIL: overlapping binding vehicle operation succeeded';
exception when exclusion_violation then raise notice 'PASS: binding overlap rejected';
end $$;
create function pg_temp.v_spec(name text,owner uuid)
returns jsonb language sql as $$
  select jsonb_build_object('name',name,'unit_id',owner,'type_key','mtf','call_sign','','location','Synthetic CI',
    'description','Synthetic CI vehicle','active',true,'reservable',true,'unit_admin_enabled',false,
    'manager_ids',jsonb_build_array('a0600000-0000-4000-8000-000000000003'),
    'usage_units',jsonb_build_array(current_setting('v.unit'),current_setting('v.other')));
$$;
create function pg_temp.v_payload(title text,kind text default 'reservation')
returns jsonb language sql as $$
  select jsonb_build_object('vehicle_id',current_setting('v.vehicle'),'unit_id',current_setting('v.unit'),
    'responsible_id',auth.uid(),'kind',kind,'title',title,'description','Synthetic CI','destination','','notes','',
    'purpose_key',case when kind='block' then null else 'course' end,
    'starts_at',current_setting('v.start'),'ends_at',current_setting('v.end'));
$$;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
select ('a0600000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
  'synthetic.vehicle.'||i||'@feuerwehr-odenthal.de',clock_timestamp(),
  jsonb_build_object('display_name','Synthetic vehicle actor '||i) from generate_series(1,7) i;
select set_config('v.unit',(select id::text from public.units where code='scheuren'),true);
select set_config('v.other',(select id::text from public.units where code='blecher'),true);
select set_config('v.start',(date_trunc('day',clock_timestamp())+interval '2 days 12 hours')::text,true);
select set_config('v.end',(date_trunc('day',clock_timestamp())+interval '2 days 14 hours')::text,true);
select ff_private.bootstrap_global_admin('a0600000-0000-4000-8000-000000000001',current_setting('v.unit')::uuid);
select set_config('request.jwt.claim.sub','a0600000-0000-4000-8000-000000000001',true);
set local role authenticated;
select public.ff_approve_member('a0600000-0000-4000-8000-000000000002',current_setting('v.unit')::uuid);
select public.ff_approve_member('a0600000-0000-4000-8000-000000000003',current_setting('v.unit')::uuid);
select public.ff_approve_member('a0600000-0000-4000-8000-000000000004',current_setting('v.unit')::uuid);
select public.ff_approve_member('a0600000-0000-4000-8000-000000000005',current_setting('v.other')::uuid);
select public.ff_approve_member('a0600000-0000-4000-8000-000000000006',current_setting('v.other')::uuid);
select public.ff_approve_member('a0600000-0000-4000-8000-000000000007',current_setting('v.other')::uuid);
select public.ff_set_role('a0600000-0000-4000-8000-000000000004','UNIT_ADMIN',current_setting('v.unit')::uuid,null,true);
select public.ff_set_role('a0600000-0000-4000-8000-000000000005','UNIT_ADMIN',current_setting('v.other')::uuid,null,true);
select public.ff_set_role('a0600000-0000-4000-8000-000000000006','FIRE_CHIEF',null,null,true);
select set_config('v.vehicle',public.ff_save_vehicle(pg_temp.v_spec('Synthetic MTF',current_setting('v.unit')::uuid))::text,true);
select set_config('v.foreign',public.ff_save_vehicle(pg_temp.v_spec('Synthetic foreign HLF',current_setting('v.other')::uuid)
  ||jsonb_build_object('type_key','hlf','manager_ids',jsonb_build_array('a0600000-0000-4000-8000-000000000001')))::text,true);
select pg_temp.v_assert((select resource_type='vehicle' from public.calendar_resources where id=current_setting('v.vehicle')::uuid),'vehicle uses existing resource architecture');
select pg_temp.v_assert(jsonb_array_length(public.ff_vehicle_workspace(current_setting('v.start')::timestamptz,
  current_setting('v.end')::timestamptz)->'vehicles')=2,'GLOBAL_ADMIN vehicle overview');
select public.ff_vehicle_option('type','expandable','Configurable vehicle type');
select public.ff_vehicle_option('purpose','expandable','Configurable service purpose');
select pg_temp.v_denied($q$select public.ff_save_calendar_resource(jsonb_build_object('name','Forged building','resource_type','building','active',true),
  current_setting('v.vehicle')::uuid)$q$);
reset role;

select set_config('request.jwt.claim.sub','a0600000-0000-4000-8000-000000000002',true);
set local role authenticated;
select set_config('v.first',(public.ff_request_vehicle(pg_temp.v_payload('Synthetic first request'))->>'id'),true);
select set_config('v.second',(public.ff_request_vehicle(pg_temp.v_payload('Synthetic overlapping request'))->>'id'),true);
select set_config('v.cross',(public.ff_request_vehicle(pg_temp.v_payload('Synthetic shared foreign vehicle')
  ||jsonb_build_object('vehicle_id',current_setting('v.foreign')))->>'id'),true);
select pg_temp.v_assert((select state='REQUESTED' and requester_id=auth.uid() from public.vehicle_reservations
  where event_id=current_setting('v.cross')::uuid),'MEMBER requests explicitly shared vehicle owned by another unit');
select pg_temp.v_assert((select state='REQUESTED' from public.vehicle_reservations where event_id=current_setting('v.first')::uuid),'MEMBER creates REQUESTED');
select pg_temp.v_assert((select count(*)=0 from public.events where id=current_setting('v.first')::uuid),'REQUESTED is not exposed as booked shared-calendar event');
select pg_temp.v_assert((public.ff_vehicle_workspace(current_setting('v.start')::timestamptz,current_setting('v.end')::timestamptz,
  current_setting('v.vehicle')::uuid)->'items'->0->>'own')::boolean,'own vehicle calendar includes requests');
select pg_temp.v_denied($q$select public.ff_decide_vehicle(current_setting('v.first')::uuid,0,'APPROVED')$q$);
select pg_temp.v_denied($q$select public.ff_request_vehicle(pg_temp.v_payload('Invalid reversed request')||jsonb_build_object('ends_at',current_setting('v.start')))$q$);
select pg_temp.v_denied($q$select public.ff_request_vehicle(pg_temp.v_payload('Forged other-unit request')||jsonb_build_object('unit_id',current_setting('v.other')))$q$);
select pg_temp.v_denied($q$select public.ff_request_vehicle(pg_temp.v_payload('Unauthorized vehicle block','block'))$q$);
select pg_temp.v_denied($q$update public.vehicle_reservations set state='APPROVED' where event_id=current_setting('v.first')::uuid$q$);
select pg_temp.v_denied($q$update public.events set ends_at=ends_at+interval '1 hour' where id=current_setting('v.first')::uuid$q$);
select pg_temp.v_denied($q$delete from public.vehicle_reservations where event_id=current_setting('v.first')::uuid$q$);
reset role;
select set_config('request.jwt.claim.sub','a0600000-0000-4000-8000-000000000007',true);
set local role authenticated;
select pg_temp.v_assert((select count(*)=0 from public.vehicle_reservations where event_id=current_setting('v.first')::uuid),'foreign MEMBER cannot read pending requests');
select pg_temp.v_assert((select count(*)=0 from public.vehicle_notifications),'notifications are recipient-only');
select pg_temp.v_denied($q$select public.ff_decide_vehicle(current_setting('v.first')::uuid,0,'APPROVED')$q$);
reset role;
select set_config('request.jwt.claim.sub','a0600000-0000-4000-8000-000000000004',true);
set local role authenticated;
select pg_temp.v_denied($q$select public.ff_decide_vehicle(current_setting('v.first')::uuid,0,'APPROVED')$q$);
reset role;
select set_config('request.jwt.claim.sub','a0600000-0000-4000-8000-000000000005',true);
set local role authenticated;
select pg_temp.v_denied($q$select public.ff_save_vehicle(pg_temp.v_spec('Forged foreign edit',current_setting('v.unit')::uuid),current_setting('v.vehicle')::uuid)$q$);
reset role;

select set_config('request.jwt.claim.sub','a0600000-0000-4000-8000-000000000003',true);
set local role authenticated;
select pg_temp.v_assert(jsonb_array_length(public.ff_vehicle_workspace(current_setting('v.start')::timestamptz,current_setting('v.end')::timestamptz)->'tasks')=2,'assigned manager has approval tasks without technical role');
select public.ff_decide_vehicle(current_setting('v.first')::uuid,0,'APPROVED');
select pg_temp.v_assert((select state='APPROVED' and decided_by=auth.uid() and decided_at is not null
  from public.vehicle_reservations where event_id=current_setting('v.first')::uuid),'manager approval records actor and time');
select pg_temp.v_denied($q$select public.ff_decide_vehicle(current_setting('v.second')::uuid,0,'APPROVED')$q$);
select pg_temp.v_denied($q$select public.ff_decide_vehicle(current_setting('v.second')::uuid,0,'REJECTED','')$q$);
select pg_temp.v_denied($q$select public.ff_decide_vehicle(current_setting('v.first')::uuid,1,'CANCELLED','')$q$);
select pg_temp.v_denied($q$select public.ff_decide_vehicle(current_setting('v.first')::uuid,1,'COMPLETED')$q$);
select pg_temp.v_overlap($q$select public.ff_request_vehicle(pg_temp.v_payload('Colliding maintenance','block'))$q$);
select pg_temp.v_denied($q$select public.ff_save_vehicle(pg_temp.v_spec('Wrong vehicle',current_setting('v.other')::uuid),current_setting('v.foreign')::uuid)$q$);
select pg_temp.v_denied($q$select public.ff_save_vehicle(pg_temp.v_spec('Rights expansion',current_setting('v.unit')::uuid)
  ||jsonb_build_object('unit_admin_enabled',true),current_setting('v.vehicle')::uuid)$q$);
select pg_temp.v_assert((select count(*)>0 from public.vehicle_notifications where recipient_id=auth.uid()),'manager gets persisted internal notifications');
reset role;
select set_config('request.jwt.claim.sub','a0600000-0000-4000-8000-000000000002',true);
set local role authenticated;
select pg_temp.v_assert((select count(*)=1 from public.events where id=current_setting('v.first')::uuid),'APPROVED has one shared canonical event');
select pg_temp.v_assert((select count(*)=0 from public.event_roster where event_id=current_setting('v.first')::uuid),'vehicle reservation has no attendance/RSVP roster');
select pg_temp.v_assert((public.ff_vehicle_workspace(current_setting('v.start')::timestamptz,current_setting('v.end')::timestamptz,
  current_setting('v.vehicle')::uuid,current_setting('v.first')::uuid)->'retained'->>'state')='APPROVED','vehicle-specific retained detail');
select public.ff_read_vehicle_notification((select id from public.vehicle_notifications where recipient_id=auth.uid() limit 1));
select pg_temp.v_assert((select count(*)>0 from public.vehicle_notifications where read_at is not null),'notification read state persisted');
select public.ff_decide_vehicle(current_setting('v.first')::uuid,1,'CANCELLED','Applicant cancels approved reservation');
select pg_temp.v_assert((select cancelled_by=auth.uid() and cancelled_at is not null and state='CANCELLED'
  from public.vehicle_reservations where event_id=current_setting('v.first')::uuid),'own cancellation preserves history and actor');
reset role;
select pg_temp.v_assert(exists(select 1 from public.vehicle_notifications where event_id=current_setting('v.first')::uuid
  and recipient_id='a0600000-0000-4000-8000-000000000003' and event_type='vehicle_requested'),
  'central inbox classifies request for assigned vehicle manager');
select pg_temp.v_assert(exists(select 1 from public.vehicle_notifications where event_id=current_setting('v.first')::uuid
  and recipient_id='a0600000-0000-4000-8000-000000000002' and event_type='vehicle_approved'),
  'central inbox classifies approval for applicant');
select set_config('request.jwt.claim.sub','a0600000-0000-4000-8000-000000000003',true);
set local role authenticated;
select public.ff_decide_vehicle(current_setting('v.second')::uuid,0,'REJECTED','Synthetic rejection reason');
select set_config('v.block',(public.ff_request_vehicle(pg_temp.v_payload('Synthetic maintenance block','block'))->>'id'),true);
select pg_temp.v_assert((select state='APPROVED' and kind='block' from public.vehicle_reservations where event_id=current_setting('v.block')::uuid),'authorized maintenance block is binding');
reset role;
select pg_temp.v_assert(exists(select 1 from public.vehicle_notifications where event_id=current_setting('v.second')::uuid
  and recipient_id='a0600000-0000-4000-8000-000000000002' and event_type='vehicle_rejected'),
  'central inbox classifies rejection for applicant');
select set_config('request.jwt.claim.sub','a0600000-0000-4000-8000-000000000002',true);
set local role authenticated;
select pg_temp.v_assert(jsonb_array_length(public.ff_request_vehicle(pg_temp.v_payload('Warned conflicting request'))->'conflicts')=1,'binding block warns on request without pretending approval');
select set_config('v.waiting',(public.ff_request_vehicle(pg_temp.v_payload('Request waiting for maintenance'))->>'id'),true);
reset role;
select set_config('request.jwt.claim.sub','a0600000-0000-4000-8000-000000000003',true);
set local role authenticated;
select pg_temp.v_denied($q$select public.ff_decide_vehicle(current_setting('v.waiting')::uuid,0,'APPROVED')$q$);
select public.ff_decide_vehicle(current_setting('v.block')::uuid,0,'CANCELLED','Maintenance explicitly cancelled');
select public.ff_decide_vehicle(current_setting('v.waiting')::uuid,0,'APPROVED');
reset role;

select set_config('request.jwt.claim.sub','a0600000-0000-4000-8000-000000000001',true);
set local role authenticated;
select public.ff_save_vehicle(pg_temp.v_spec('Synthetic MTF',current_setting('v.unit')::uuid)||jsonb_build_object('unit_admin_enabled',true),current_setting('v.vehicle')::uuid,0);
reset role;
select set_config('request.jwt.claim.sub','a0600000-0000-4000-8000-000000000004',true);
set local role authenticated;
select pg_temp.v_assert((public.ff_vehicle_workspace(current_setting('v.start')::timestamptz,current_setting('v.end')::timestamptz)->'vehicles'->1) is not null,'UNIT_ADMIN reads permitted fleet');
select public.ff_decide_vehicle(current_setting('v.waiting')::uuid,1,'CANCELLED','Explicit configured unit administration');
reset role;
select set_config('request.jwt.claim.sub','a0600000-0000-4000-8000-000000000001',true);
set local role authenticated;
select public.ff_save_vehicle(pg_temp.v_spec('Synthetic MTF',current_setting('v.unit')::uuid)
  ||jsonb_build_object('manager_ids',jsonb_build_array(auth.uid()),'active',false),current_setting('v.vehicle')::uuid,1);
reset role;
select set_config('request.jwt.claim.sub','a0600000-0000-4000-8000-000000000003',true);
set local role authenticated;
select pg_temp.v_denied($q$select public.ff_save_vehicle(pg_temp.v_spec('Revoked manager edit',current_setting('v.unit')::uuid),current_setting('v.vehicle')::uuid,2)$q$);
select pg_temp.v_assert((select count(*)=0 from public.vehicle_notifications where event_id=current_setting('v.second')::uuid),'revoked manager cannot read historical private pending notifications');
select pg_temp.v_denied($q$select public.ff_request_vehicle(pg_temp.v_payload('Inactive request'))$q$);
reset role;
select set_config('request.jwt.claim.sub','a0600000-0000-4000-8000-000000000006',true);
set local role authenticated;
select pg_temp.v_assert(jsonb_array_length(public.ff_vehicle_workspace(current_setting('v.start')::timestamptz,current_setting('v.end')::timestamptz)->'vehicles')=2,'FIRE_CHIEF reads fleet organization-wide');
select pg_temp.v_denied($q$select public.ff_save_vehicle(pg_temp.v_spec('Chief technical change',current_setting('v.unit')::uuid),current_setting('v.vehicle')::uuid,2)$q$);
select pg_temp.v_denied($q$select public.ff_decide_vehicle(current_setting('v.waiting')::uuid,2,'APPROVED')$q$);
reset role;
select pg_temp.v_assert((select count(*)>=10 from public.audit_entries where action like 'vehicle_%'),'vehicle mutations audited');
select set_config('request.jwt.claim.sub','a0600000-0000-4000-8000-000000000001',true);
set local role authenticated;
select public.ff_vehicle_option('type','dev060_ci','Synthetic classification');
select public.ff_vehicle_option('type','dev060_ci','Renamed classification',false);
select public.ff_vehicle_option('purpose','dev060_ci','Synthetic purpose');
select public.ff_vehicle_option('purpose','dev060_ci','Renamed purpose',false);
reset role;
select pg_temp.v_assert((select count(*)=2 from public.audit_entries
  where action='vehicle_option_saved' and before_data->>'key'='dev060_ci'
    and before_data->>'active'='true' and after_data->>'active'='false'
    and before_data->>'name' like 'Synthetic %' and after_data->>'name' like 'Renamed %'),
  'classification and purpose updates audit exact previous/new values');
select set_config('request.jwt.claim.sub','a0600000-0000-4000-8000-000000000002',true);
set local role authenticated;
select pg_temp.v_denied($q$select public.ff_vehicle_option('type','dev060_ci','Forged MEMBER configuration')$q$);
reset role;
select set_config('request.jwt.claim.sub','a0600000-0000-4000-8000-000000000001',true);
set local role authenticated;
select set_config('v.completed',(public.ff_request_vehicle(pg_temp.v_payload('Synthetic completed usage')
  ||jsonb_build_object('vehicle_id',current_setting('v.foreign')))->>'id'),true);
select public.ff_decide_vehicle(current_setting('v.completed')::uuid,0,'APPROVED');
reset role;
update public.events set starts_at=clock_timestamp()-interval '2 hours',ends_at=clock_timestamp()-interval '1 hour'
  where id=current_setting('v.completed')::uuid;
set local role authenticated;
select public.ff_decide_vehicle(current_setting('v.completed')::uuid,1,'COMPLETED');
select pg_temp.v_assert((select state='COMPLETED' and completed_at is not null and completed_by=auth.uid()
  from public.vehicle_reservations where event_id=current_setting('v.completed')::uuid),'successful completion documents actor/time only');
select public.ff_save_vehicle(pg_temp.v_spec('Synthetic foreign HLF',current_setting('v.other')::uuid)
  ||jsonb_build_object('type_key','hlf','manager_ids',jsonb_build_array(auth.uid()),'usage_units',jsonb_build_array(current_setting('v.other'))),
  current_setting('v.foreign')::uuid,0);
reset role;
select set_config('request.jwt.claim.sub','a0600000-0000-4000-8000-000000000002',true);
set local role authenticated;
select pg_temp.v_assert((select count(*)=0 from public.calendar_resources where id=current_setting('v.foreign')::uuid),'revoked usage hides current foreign vehicle resource');
select pg_temp.v_assert((select count(*)=1 from public.vehicle_reservations where event_id=current_setting('v.cross')::uuid),'own request history survives usage revocation');
select pg_temp.v_denied($q$select public.ff_request_vehicle(pg_temp.v_payload('Revoked cross-unit usage')
  ||jsonb_build_object('vehicle_id',current_setting('v.foreign')))$q$);
select pg_temp.v_assert(not exists(select 1 from public.vehicle_reservations where event_id=current_setting('v.completed')::uuid),'own old request does not grant future foreign reservation visibility');
reset role;
select set_config('request.jwt.claim.sub','a0600000-0000-4000-8000-000000000001',true);
select pg_temp.v_assert(ff_private.seed_dev_vehicles('orxinqhhbtjpkzwlfaxq')='{"vehicles":4,"reservations":5}'::jsonb,'operator-only reproducible synthetic DEV fixtures');
select set_config('v.seedhash',(select md5(string_agg(to_jsonb(q)::text,'' order by q.event_id)) from public.vehicle_reservations q where dev_seed_key like 'DEV060-%'),true);
select pg_temp.v_assert(ff_private.seed_dev_vehicles('orxinqhhbtjpkzwlfaxq')='{"vehicles":4,"reservations":5}'::jsonb,'repeat seed creates no duplicates');
select pg_temp.v_assert(current_setting('v.seedhash')=(select md5(string_agg(to_jsonb(q)::text,'' order by q.event_id))
  from public.vehicle_reservations q where dev_seed_key like 'DEV060-%'),'repeat seed preserves existing fixture rows');
set local role authenticated;
select pg_temp.v_assert(jsonb_array_length(public.ff_calendar_context()->'resources')=5,'legacy DEV0.5.1 context retains five buildings only');
select pg_temp.v_assert(not exists(select 1 from jsonb_array_elements(public.ff_calendar_page(
  current_date::timestamp at time zone 'Europe/Berlin',(current_date+14)::timestamp at time zone 'Europe/Berlin')->'events') e
  where e->>'entry_kind'='vehicle'),'legacy DEV0.5.1 calendar API remains compatible before frontend merge');
select pg_temp.v_assert((select count(*)=2 from jsonb_array_elements(public.ff_calendar_vehicle_page(
  current_date::timestamp at time zone 'Europe/Berlin',(current_date+14)::timestamp at time zone 'Europe/Berlin',
  wanted_kinds=>array['vehicle'])->'events') e where e->>'id' in
  (select event_id::text from public.vehicle_reservations where dev_seed_key in ('DEV060-reservation-2','DEV060-reservation-5'))),
  'negotiated DEV0.6 calendar exposes canonical approved reservation and block, not requests');
rollback;
