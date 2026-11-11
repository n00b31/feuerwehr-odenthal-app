#!/usr/bin/env bash
set -euo pipefail
: "${POSTGRES_CONTAINER:?Disposable PostgreSQL required}"
pg() { docker exec -i "$POSTGRES_CONTAINER" psql -X -U postgres -d ff_dev_ci -v ON_ERROR_STOP=1 "$@"; }
pg <<'SQL'
do $$ begin if current_database()<>'ff_dev_ci' then raise exception 'Disposable CI required'; end if; end $$;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
values ('62000000-0000-4000-8000-000000000001','synthetic.parallel.recovery@feuerwehr-odenthal.de',clock_timestamp(),'{"display_name":"Synthetic concurrent recovery"}');
SQL
logs="$(mktemp -d)"
trap 'rm -f "$logs/first.log" "$logs/second.log"; rmdir "$logs"' EXIT
parallel_calls() {
  local first_sql="$1" second_sql="$2" label="$3"
  docker exec -e PGAPPNAME=ff_recovery_first -i "$POSTGRES_CONTAINER" psql -X -At -U postgres -d ff_dev_ci -v ON_ERROR_STOP=1 >"$logs/first.log" 2>&1 <<SQL &
begin;
set local role service_role;
$first_sql
select pg_sleep(4);
commit;
SQL
  local first=$! ready=false blocked=false
  for i in $(seq 1 40); do
    if [[ "$(pg -Atc "select exists(select 1 from pg_stat_activity where application_name='ff_recovery_first' and wait_event='PgSleep')")" == t ]]; then ready=true; break; fi
    sleep .1
  done
  [[ "$ready" == true ]] || { wait "$first" || true; cat "$logs/first.log"; echo "FAIL: first recovery lock not acquired"; exit 1; }
  docker exec -e PGAPPNAME=ff_recovery_second -i "$POSTGRES_CONTAINER" psql -X -At -U postgres -d ff_dev_ci -v ON_ERROR_STOP=1 >"$logs/second.log" 2>&1 <<SQL &
begin;
set local role service_role;
$second_sql
commit;
SQL
  local second=$!
  for i in $(seq 1 40); do
    if [[ "$(pg -Atc "select exists(select 1 from pg_stat_activity where application_name='ff_recovery_second' and wait_event_type='Lock' and cardinality(pg_blocking_pids(pid))>0)")" == t ]]; then blocked=true; break; fi
    sleep .1
  done
  wait "$first" || { cat "$logs/first.log"; exit 1; }
  wait "$second" || { cat "$logs/second.log"; exit 1; }
  [[ "$blocked" == true ]] || { echo "FAIL: recovery concurrency lock not observed"; exit 1; }
  grep -qx 'f' "$logs/second.log" || { cat "$logs/second.log"; echo "FAIL: second $label admitted"; exit 1; }
  echo "PASS: real two-connection lock observed; second $label denied"
}
reserve="select (public.ff_begin_self_password_recovery(' SYNTHETIC.PARALLEL.RECOVERY@FEUERWEHR-ODENTHAL.DE ')->>'accepted')::boolean;"
parallel_calls "$reserve" "$reserve" "in-flight reservation"
grep -qx 't' "$logs/first.log"
[[ "$(pg -Atc "select count(*) from public.password_recovery_requests where user_id='62000000-0000-4000-8000-000000000001'")" == 1 ]]
request_id="$(pg -Atc "select id from public.password_recovery_requests where user_id='62000000-0000-4000-8000-000000000001'")"
pg -c "select public.ff_store_recovery_verifier('$request_id',repeat('x',43));"
claim="select public.ff_claim_recovery_verifier('$request_id') is not null;"
parallel_calls "$claim" "$claim" "PKCE verifier claim"
grep -qx 't' "$logs/first.log"
pg -c "select public.ff_finish_password_recovery('$request_id','auth_accepted');"
pg <<'SQL'
insert into public.password_recovery_requests(user_id,email,requested_at,finished_at,outcome)
values ('62000000-0000-4000-8000-000000000001','synthetic.parallel.recovery@feuerwehr-odenthal.de',clock_timestamp(),clock_timestamp(),'unknown');
SQL
reserve_and_finish="do \$\$ declare reply jsonb; begin
  reply := public.ff_begin_self_password_recovery('synthetic.parallel.recovery@feuerwehr-odenthal.de');
  if (reply->>'accepted')::boolean is distinct from true then raise exception 'Expected one remaining slot'; end if;
  perform public.ff_finish_password_recovery((reply->>'request_id')::uuid,'auth_accepted');
end; \$\$; select true;"
parallel_calls "$reserve_and_finish" "$reserve" "hourly fourth request after a completed third"
grep -qx 't' "$logs/first.log"
[[ "$(pg -Atc "select count(*) from public.password_recovery_requests where user_id='62000000-0000-4000-8000-000000000001'")" == 3 ]]
pg <<'SQL'
update public.password_recovery_requests set requested_at=clock_timestamp()-interval '2 hours',finished_at=clock_timestamp()-interval '2 hours'
  where user_id='62000000-0000-4000-8000-000000000001';
insert into public.password_recovery_requests(user_id,email,requested_at,finished_at,outcome)
values ('62000000-0000-4000-8000-000000000001','synthetic.parallel.recovery@feuerwehr-odenthal.de',clock_timestamp()-interval '4 hours',clock_timestamp()-interval '4 hours','auth_rejected');
SQL
parallel_calls "$reserve_and_finish" "$reserve" "rolling 24-hour sixth request after a completed fifth"
grep -qx 't' "$logs/first.log"
[[ "$(pg -Atc "select count(*) from public.password_recovery_requests where user_id='62000000-0000-4000-8000-000000000001'")" == 5 ]]
echo "PASS: simultaneous requests respect three completed attempts per hour and five per rolling 24 hours"
