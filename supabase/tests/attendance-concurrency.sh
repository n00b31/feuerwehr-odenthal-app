#!/usr/bin/env bash
set -euo pipefail
: "${POSTGRES_CONTAINER:?Disposable PostgreSQL container required}"
pg() { docker exec -i "$POSTGRES_CONTAINER" psql -X -U postgres -d ff_dev_ci -v ON_ERROR_STOP=1 "$@"; }
pg <<'SQL'
do $$ begin
  if current_database()<>'ff_dev_ci' then raise exception 'Disposable CI database required'; end if;
end $$;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
 ('91000000-0000-4000-8000-000000000001','synthetic.concurrent.1@feuerwehr-odenthal.de',clock_timestamp(),'{"display_name":"Synthetic concurrent admin"}'),
 ('91000000-0000-4000-8000-000000000002','synthetic.concurrent.2@feuerwehr-odenthal.de',clock_timestamp(),'{"display_name":"Synthetic concurrent delegate"}');
select ff_private.bootstrap_global_admin('91000000-0000-4000-8000-000000000001',(select id from public.units where code='scheuren'));
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000001',false);
set role authenticated;
select public.ff_approve_member('91000000-0000-4000-8000-000000000002',(select id from public.units where code='scheuren'));
reset role;
update public.profiles set approved_at=clock_timestamp()-interval '2 days'
  where id in ('91000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000002');
update public.unit_memberships set valid_from=clock_timestamp()-interval '2 days'
  where user_id in ('91000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000002');
insert into public.events(id,title,event_type,starts_at,ends_at,location,scope_kind,unit_id,organizer_id)
values('92000000-0000-4000-8000-000000000001','Synthetic concurrent attendance','regular',clock_timestamp()-interval '1 hour',
 clock_timestamp()+interval '1 hour','Synthetic','unit',(select id from public.units where code='scheuren'),'91000000-0000-4000-8000-000000000001');
insert into public.event_roster(event_id,user_id,unit_snapshot_id,name_snapshot)
select '92000000-0000-4000-8000-000000000001',p.id,m.unit_id,p.display_name from public.profiles p join public.unit_memberships m on m.user_id=p.id and m.valid_until is null;
insert into public.participation_responses(event_id,user_id,response)
select event_id,user_id,'yes' from public.event_roster;
set role authenticated;
select public.ff_set_primary_organizer('92000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000002');
select public.ff_record_attendance('92000000-0000-4000-8000-000000000001',auth.uid(),'absent');
SQL
logs="$(mktemp -d)"
trap 'rm -f "$logs/first.log" "$logs/second.log"; rmdir "$logs"' EXIT
docker exec -e PGAPPNAME=ff_attendance_initializer_1 -i "$POSTGRES_CONTAINER" psql -X -U postgres -d ff_dev_ci -v ON_ERROR_STOP=1 >"$logs/first.log" 2>&1 <<'SQL' &
begin;
set local request.jwt.claim.sub='91000000-0000-4000-8000-000000000001';
set local role authenticated;
select public.ff_prepare_attendance('92000000-0000-4000-8000-000000000001');
select pg_sleep(4);
commit;
SQL
first=$!
ready=false
for i in $(seq 1 30); do
  if [[ "$(pg -Atc "select exists(select 1 from pg_stat_activity where application_name='ff_attendance_initializer_1' and wait_event='PgSleep')")" == t ]]; then ready=true; break; fi
  sleep .1
done
if [[ "$ready" != true ]]; then cat "$logs/first.log"; wait "$first"; echo "First transaction did not hold its event lock"; exit 1; fi
docker exec -e PGAPPNAME=ff_attendance_initializer_2 -i "$POSTGRES_CONTAINER" psql -X -U postgres -d ff_dev_ci -v ON_ERROR_STOP=1 >"$logs/second.log" 2>&1 <<'SQL' &
begin;
set local request.jwt.claim.sub='91000000-0000-4000-8000-000000000002';
set local role authenticated;
select public.ff_prepare_attendance('92000000-0000-4000-8000-000000000001');
commit;
SQL
second=$!
blocked=false
for i in $(seq 1 30); do
  if [[ "$(pg -Atc "select exists(select 1 from pg_stat_activity where application_name='ff_attendance_initializer_2' and wait_event_type='Lock' and cardinality(pg_blocking_pids(pid))>0)")" == t ]]; then blocked=true; break; fi
  sleep .1
done
wait "$first" || { cat "$logs/first.log"; exit 1; }
wait "$second" || { cat "$logs/second.log"; exit 1; }
if [[ "$blocked" != true ]]; then echo "Expected an observed overlapping event-row lock"; exit 1; fi
pg <<'SQL'
do $$ begin
  if (select count(*) from public.actual_attendance where event_id='92000000-0000-4000-8000-000000000001')<>2
    or (select count(*) from public.audit_entries where event_id='92000000-0000-4000-8000-000000000001' and action='attendance_prepared')<>1
    or not exists(select 1 from public.actual_attendance where user_id='91000000-0000-4000-8000-000000000001' and status='absent' and origin='manual')
    or not exists(select 1 from public.actual_attendance where user_id='91000000-0000-4000-8000-000000000002' and status='present' and origin='prefill')
  then raise exception 'Concurrent initialization lost manual values or created duplicate preparation'; end if;
  raise notice 'PASS: two overlapping authorized PostgreSQL connections; lock observed, one prefill, manual value preserved';
end $$;
SQL
