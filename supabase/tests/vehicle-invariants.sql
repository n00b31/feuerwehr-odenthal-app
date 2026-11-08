-- Real PostgreSQL roles and constraints in the disposable CI database only.
begin;
do $$ begin if current_database()<>'ff_dev_ci' then raise exception 'Disposable CI required'; end if; end $$;
create function pg_temp.x_user(i int) returns uuid language sql immutable as $$
  select ('a0621000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid;
$$;
create function pg_temp.x_ok(value boolean,label text) returns void language plpgsql as $$
begin
  if value is distinct from true then raise exception 'FAIL: %',label; end if;
  raise notice 'PASS: %',label;
end $$;
create function pg_temp.x_denied(statement text) returns void language plpgsql as $$
begin
  execute statement; raise exception 'FAIL: unauthorized operation succeeded';
exception when insufficient_privilege then raise notice 'PASS: unauthorized operation rejected';
end $$;
create function pg_temp.x_overlap(statement text) returns void language plpgsql as $$
begin
  execute statement; raise exception 'FAIL: overlapping binding row accepted';
exception when exclusion_violation then raise notice 'PASS: direct binding overlap rejected with 23P01';
end $$;
create function pg_temp.x_payload(title text,vehicle uuid,unit uuid,requester uuid,responsible uuid)
returns jsonb language sql as $$
  select jsonb_build_object('title',title,'vehicle_id',vehicle,'unit_id',unit,'requester_id',requester,
    'responsible_id',responsible,'kind','reservation','purpose_key','course','description','','destination','','notes','',
    'starts_at',current_setting('x.start'),'ends_at',current_setting('x.end'));
$$;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
select pg_temp.x_user(i),'synthetic.invariant.ci.'||i||'@feuerwehr-odenthal.de',clock_timestamp(),
  jsonb_build_object('display_name','Synthetic invariant person '||i) from generate_series(1,8) i;
select set_config('x.a',(select id::text from public.units where code='scheuren'),true);
select set_config('x.b',(select id::text from public.units where code='blecher'),true);
select set_config('x.start',(clock_timestamp()+interval '8 days')::text,true);
select set_config('x.end',(current_setting('x.start')::timestamptz+interval '2 hours')::text,true);
select ff_private.bootstrap_global_admin(pg_temp.x_user(1),current_setting('x.a')::uuid);
select set_config('request.jwt.claim.sub',pg_temp.x_user(1)::text,true);
set local role authenticated;
select public.ff_approve_member(pg_temp.x_user(i),
  case when i in (3,5,6) then current_setting('x.b')::uuid else current_setting('x.a')::uuid end)
  from generate_series(2,7) i;
select public.ff_set_role(pg_temp.x_user(3),'UNIT_ADMIN',current_setting('x.a')::uuid);
select public.ff_set_role(pg_temp.x_user(4),'FUNCTION_ADMIN',null,(select id from public.special_functions order by name limit 1));
select public.ff_set_role(pg_temp.x_user(6),'FIRE_CHIEF');
select set_config('x.vehicle',public.ff_save_vehicle(jsonb_build_object('name','Synthetic invariant vehicle A',
  'unit_id',current_setting('x.a'),'type_key','mtf','call_sign','','location','','description','CI only',
  'active',true,'reservable',true,'unit_admin_enabled',false,'manager_ids',jsonb_build_array(pg_temp.x_user(7)),
  'usage_units',jsonb_build_array(current_setting('x.a'),current_setting('x.b'))))::text,true);
select set_config('x.other',public.ff_save_vehicle(jsonb_build_object('name','Synthetic invariant vehicle B',
  'unit_id',current_setting('x.b'),'type_key','mtf','call_sign','','location','','description','CI only',
  'active',true,'reservable',true,'unit_admin_enabled',false,'manager_ids',jsonb_build_array(pg_temp.x_user(7)),
  'usage_units',jsonb_build_array(current_setting('x.b'))))::text,true);
reset role;

select set_config('request.jwt.claim.sub',pg_temp.x_user(2)::text,true);
set local role authenticated;
select pg_temp.x_ok(jsonb_array_length(public.ff_vehicle_requesters(current_setting('x.vehicle')::uuid)->'requesters')=1,
  'MEMBER requester context contains self only');
select pg_temp.x_denied($q$select public.ff_request_vehicle(pg_temp.x_payload('Forged MEMBER request',
  current_setting('x.vehicle')::uuid,current_setting('x.a')::uuid,pg_temp.x_user(4),pg_temp.x_user(7)))$q$);
select pg_temp.x_denied($q$select public.ff_request_vehicle(pg_temp.x_payload('Forged actor',
  current_setting('x.vehicle')::uuid,current_setting('x.a')::uuid,auth.uid(),auth.uid())
  ||jsonb_build_object('actor_id',pg_temp.x_user(1)))$q$);
select pg_temp.x_denied($q$select public.ff_request_vehicle(pg_temp.x_payload('Explicit null requester',
  current_setting('x.vehicle')::uuid,current_setting('x.a')::uuid,null,auth.uid()))$q$);
reset role;
select set_config('request.jwt.claim.sub',pg_temp.x_user(4)::text,true);
set local role authenticated;
select pg_temp.x_ok(jsonb_array_length(public.ff_vehicle_requesters(current_setting('x.vehicle')::uuid)->'requesters')=1,
  'FUNCTION_ADMIN receives no foreign-requester privilege');
select pg_temp.x_denied($q$select public.ff_request_vehicle(pg_temp.x_payload('Forged function request',
  current_setting('x.vehicle')::uuid,current_setting('x.a')::uuid,pg_temp.x_user(2),pg_temp.x_user(7)))$q$);
reset role;
select set_config('request.jwt.claim.sub',pg_temp.x_user(3)::text,true);
set local role authenticated;
select pg_temp.x_ok(exists(select 1 from jsonb_array_elements(
  public.ff_vehicle_requesters(current_setting('x.vehicle')::uuid)->'requesters') p where p->>'id'=pg_temp.x_user(2)::text),
  'UNIT_ADMIN may request for its authorized unit despite different personal membership');
select pg_temp.x_denied($q$select public.ff_request_vehicle(pg_temp.x_payload('Forged foreign UNIT_ADMIN request',
  current_setting('x.vehicle')::uuid,current_setting('x.b')::uuid,pg_temp.x_user(5),pg_temp.x_user(5)))$q$);
select pg_temp.x_denied($q$select public.ff_request_vehicle(pg_temp.x_payload('Pending target',
  current_setting('x.vehicle')::uuid,current_setting('x.a')::uuid,pg_temp.x_user(8),pg_temp.x_user(7)))$q$);
select set_config('x.onbehalf',(public.ff_request_vehicle(pg_temp.x_payload('Scoped on-behalf request',
  current_setting('x.vehicle')::uuid,current_setting('x.a')::uuid,pg_temp.x_user(2),pg_temp.x_user(7)))->>'id'),true);
select pg_temp.x_ok((select actor_id=auth.uid() and requester_id=pg_temp.x_user(2)
  from public.vehicle_reservations where event_id=current_setting('x.onbehalf')::uuid),
  'authenticated actor, requester and responsible person remain distinct');
select pg_temp.x_denied($q$select public.ff_decide_vehicle(current_setting('x.onbehalf')::uuid,0,'APPROVED')$q$);
select pg_temp.x_denied($q$select public.ff_decide_vehicle(current_setting('x.onbehalf')::uuid,0,'CANCELLED','Creator is not requester')$q$);
reset role;
select pg_temp.x_ok(exists(select 1 from public.audit_entries where event_id=current_setting('x.onbehalf')::uuid
  and action='vehicle_requested' and actor_id=pg_temp.x_user(3) and subject_id=pg_temp.x_user(2)),
  'on-behalf audit preserves authenticated actor and affected requester');
select set_config('request.jwt.claim.sub',pg_temp.x_user(1)::text,true);
set local role authenticated;
select public.ff_decide_vehicle(current_setting('x.onbehalf')::uuid,0,'APPROVED');
reset role;
select set_config('request.jwt.claim.sub',pg_temp.x_user(3)::text,true);
set local role authenticated;
select pg_temp.x_denied($q$select public.ff_decide_vehicle(current_setting('x.onbehalf')::uuid,1,'CANCELLED','Creator is not manager')$q$);
reset role;
select set_config('request.jwt.claim.sub',pg_temp.x_user(2)::text,true);
set local role authenticated;
select pg_temp.x_denied($q$select public.ff_decide_vehicle(current_setting('x.onbehalf')::uuid,1,'CANCELLED','')$q$);
select public.ff_decide_vehicle(current_setting('x.onbehalf')::uuid,1,'CANCELLED','Requester releases approved booking');
reset role;
select set_config('request.jwt.claim.sub',pg_temp.x_user(6)::text,true);
set local role authenticated;
select pg_temp.x_ok(jsonb_array_length(public.ff_vehicle_requesters(current_setting('x.vehicle')::uuid)->'requesters')=7,
  'FIRE_CHIEF can select eligible organization members but not pending accounts');
select set_config('x.chief',(public.ff_request_vehicle(pg_temp.x_payload('Chief on behalf',
  current_setting('x.vehicle')::uuid,current_setting('x.a')::uuid,pg_temp.x_user(2),pg_temp.x_user(7)))->>'id'),true);
select pg_temp.x_denied($q$select public.ff_decide_vehicle(current_setting('x.chief')::uuid,0,'APPROVED')$q$);
reset role;

select set_config('request.jwt.claim.sub',pg_temp.x_user(1)::text,true);
set local role authenticated;
select set_config('x.first',(public.ff_request_vehicle(pg_temp.x_payload('Binding baseline',
  current_setting('x.vehicle')::uuid,current_setting('x.a')::uuid,pg_temp.x_user(2),pg_temp.x_user(7)))->>'id'),true);
select public.ff_decide_vehicle(current_setting('x.first')::uuid,0,'APPROVED');
select set_config('x.collision',(public.ff_request_vehicle(pg_temp.x_payload('Requested collision',
  current_setting('x.vehicle')::uuid,current_setting('x.a')::uuid,pg_temp.x_user(2),pg_temp.x_user(7)))->>'id'),true);
select set_config('x.different',(public.ff_request_vehicle(pg_temp.x_payload('Other resource same time',
  current_setting('x.other')::uuid,current_setting('x.b')::uuid,pg_temp.x_user(5),pg_temp.x_user(5)))->>'id'),true);
select public.ff_decide_vehicle(current_setting('x.different')::uuid,0,'APPROVED');
select set_config('x.adjacent',(public.ff_request_vehicle(pg_temp.x_payload('Adjacent reservation',
  current_setting('x.vehicle')::uuid,current_setting('x.a')::uuid,pg_temp.x_user(2),pg_temp.x_user(7))
  ||jsonb_build_object('starts_at',current_setting('x.end'),'ends_at',current_setting('x.end')::timestamptz+interval '1 hour'))->>'id'),true);
select public.ff_decide_vehicle(current_setting('x.adjacent')::uuid,0,'APPROVED');
reset role;
select pg_temp.x_overlap($q$update public.vehicle_reservations set state='APPROVED'
  where event_id=current_setting('x.collision')::uuid$q$);
update public.events set starts_at=current_setting('x.start')::timestamptz+interval '15 minutes',
  ends_at=current_setting('x.end')::timestamptz-interval '15 minutes' where id=current_setting('x.collision')::uuid;
select pg_temp.x_overlap($q$update public.vehicle_reservations set state='COMPLETED'
  where event_id=current_setting('x.collision')::uuid$q$);
update public.events set starts_at=current_setting('x.start')::timestamptz-interval '1 hour',
  ends_at=current_setting('x.end')::timestamptz+interval '1 hour' where id=current_setting('x.collision')::uuid;
select pg_temp.x_overlap($q$update public.vehicle_reservations set state='APPROVED'
  where event_id=current_setting('x.collision')::uuid$q$);
select pg_temp.x_overlap($q$update public.events set starts_at=starts_at-interval '1 minute'
  where id=current_setting('x.adjacent')::uuid$q$);
select pg_temp.x_ok((select e.starts_at=q.starts_at and e.ends_at=q.ends_at
  and e.starts_at=current_setting('x.end')::timestamptz from public.events e
  join public.vehicle_reservations q on q.event_id=e.id where e.id=current_setting('x.adjacent')::uuid),
  'canonical colliding time edit rolls back both event and copied interval');
select pg_temp.x_denied($q$update public.vehicle_reservations set actor_id=pg_temp.x_user(3)
  where event_id=current_setting('x.first')::uuid$q$);
select pg_temp.x_denied($q$update public.vehicle_reservations set requester_id=pg_temp.x_user(3)
  where event_id=current_setting('x.first')::uuid$q$);
select pg_temp.x_denied($q$update public.event_calendar set resource_id=current_setting('x.other')::uuid
  where event_id=current_setting('x.first')::uuid$q$);
select pg_temp.x_denied($q$delete from public.event_calendar where event_id=current_setting('x.first')::uuid$q$);
select pg_temp.x_ok((select count(*)=3 from public.vehicle_reservations where state='APPROVED'),
  'only adjacent and different-resource binding reservations coexist; cancelled booking releases its slot');
rollback;
