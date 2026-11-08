#!/usr/bin/env bash
set -euo pipefail
: "${POSTGRES_CONTAINER:?Disposable PostgreSQL required}"
pg() { docker exec -i "$POSTGRES_CONTAINER" psql -X -U postgres -d ff_dev_ci -v ON_ERROR_STOP=1 "$@"; }
pg <<'SQL'
do $$ begin if current_database()<>'ff_dev_ci' then raise exception 'Disposable CI required'; end if; end $$;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
 ('96000000-0000-4000-8000-000000000001','synthetic.vehicle.concurrent.1@feuerwehr-odenthal.de',clock_timestamp(),'{"display_name":"Synthetic vehicle approver 1"}'),
 ('96000000-0000-4000-8000-000000000002','synthetic.vehicle.concurrent.2@feuerwehr-odenthal.de',clock_timestamp(),'{"display_name":"Synthetic vehicle approver 2"}');
select set_config('request.jwt.claim.sub',(select user_id::text from public.role_assignments
  where role='GLOBAL_ADMIN' and revoked_at is null and ff_private.is_approved_user(user_id) order by user_id limit 1),false);
set role authenticated;
select public.ff_approve_member('96000000-0000-4000-8000-000000000001',(select id from public.units where code='scheuren'));
select public.ff_approve_member('96000000-0000-4000-8000-000000000002',(select id from public.units where code='scheuren'));
select public.ff_set_role('96000000-0000-4000-8000-000000000001','GLOBAL_ADMIN',null,null,true);
select public.ff_set_role('96000000-0000-4000-8000-000000000002','GLOBAL_ADMIN',null,null,true);
select set_config('request.jwt.claim.sub','96000000-0000-4000-8000-000000000001',false);
select public.ff_save_vehicle(jsonb_build_object('name','Synthetic concurrent vehicle','unit_id',(select id from public.units where code='scheuren'),
  'type_key','mtf','call_sign','','location','','description','Synthetic CI only','active',true,'reservable',true,
  'unit_admin_enabled',false,'manager_ids',jsonb_build_array(auth.uid()),'usage_units',jsonb_build_array((select id from public.units where code='scheuren'))));
select public.ff_request_vehicle(jsonb_build_object('vehicle_id',(select id from public.calendar_resources where name='Synthetic concurrent vehicle'),
  'unit_id',(select id from public.units where code='scheuren'),'responsible_id',auth.uid(),'kind','reservation',
  'purpose_key','course','title','Synthetic parallel request '||i,'description','','destination','','notes','',
  'starts_at',date_trunc('day',clock_timestamp())+interval '3 days 12 hours',
  'ends_at',date_trunc('day',clock_timestamp())+interval '3 days 14 hours')) from generate_series(1,2) i;
SQL
logs="$(mktemp -d)"
trap 'rm -f "$logs/first.log" "$logs/second.log"; rmdir "$logs"' EXIT
docker exec -e PGAPPNAME=ff_vehicle_approval_1 -i "$POSTGRES_CONTAINER" psql -X -U postgres -d ff_dev_ci -v ON_ERROR_STOP=1 >"$logs/first.log" 2>&1 <<'SQL' &
begin;
set local request.jwt.claim.sub='96000000-0000-4000-8000-000000000001';
set local role authenticated;
select public.ff_decide_vehicle((select q.event_id from public.vehicle_reservations q
  where q.event_id=(select event_id from public.vehicle_reservations where requester_id=auth.uid() order by event_id limit 1)),0,'APPROVED');
select pg_sleep(4);
commit;
SQL
first=$!
ready=false
for i in $(seq 1 40); do
  if [[ "$(pg -Atc "select exists(select 1 from pg_stat_activity where application_name='ff_vehicle_approval_1' and wait_event='PgSleep')")" == t ]]; then ready=true; break; fi
  sleep .1
done
if [[ "$ready" != true ]]; then wait "$first" || true; cat "$logs/first.log"; echo "First approval lock not acquired"; exit 1; fi
docker exec -e PGAPPNAME=ff_vehicle_approval_2 -i "$POSTGRES_CONTAINER" psql -X -U postgres -d ff_dev_ci -v ON_ERROR_STOP=1 >"$logs/second.log" 2>&1 <<'SQL' &
begin;
set local request.jwt.claim.sub='96000000-0000-4000-8000-000000000002';
set local role authenticated;
select public.ff_decide_vehicle((select event_id from public.vehicle_reservations
  where requester_id='96000000-0000-4000-8000-000000000001' order by event_id desc limit 1),0,'APPROVED');
commit;
SQL
second=$!
blocked=false
for i in $(seq 1 40); do
  if [[ "$(pg -Atc "select exists(select 1 from pg_stat_activity where application_name='ff_vehicle_approval_2' and wait_event_type='Lock' and cardinality(pg_blocking_pids(pid))>0)")" == t ]]; then blocked=true; break; fi
  sleep .1
done
wait "$first" || { cat "$logs/first.log"; exit 1; }
if wait "$second"; then echo "FAIL: overlapping approval succeeded"; exit 1; fi
grep -q 'Zeitraum verbindlich belegt' "$logs/second.log" || { cat "$logs/second.log"; exit 1; }
[[ "$blocked" == true ]] || { echo "FAIL: no observed concurrent vehicle lock"; exit 1; }
pg <<'SQL'
do $$ begin
  if (select count(*) from public.vehicle_reservations where requester_id='96000000-0000-4000-8000-000000000001' and state='APPROVED')<>1
    or (select count(*) from public.vehicle_reservations where requester_id='96000000-0000-4000-8000-000000000001' and state='REQUESTED')<>1
    or (select count(*) from public.audit_entries where action='vehicle_approved' and subject_id='96000000-0000-4000-8000-000000000001')<>1
  then raise exception 'Parallel approval created duplicate booking or partial audit'; end if;
  raise notice 'PASS: two actual PostgreSQL approvers overlapped; vehicle lock observed, one approval, second rejected with no partial write';
end $$;
SQL
