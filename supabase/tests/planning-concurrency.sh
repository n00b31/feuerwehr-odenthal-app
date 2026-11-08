#!/usr/bin/env bash
set -euo pipefail
: "${POSTGRES_CONTAINER:?Disposable PostgreSQL required}"
pg() { docker exec -i "$POSTGRES_CONTAINER" psql -X -U postgres -d ff_dev_ci -v ON_ERROR_STOP=1 "$@"; }
pg <<'SQL'
do $$ begin if current_database()<>'ff_dev_ci' then raise exception 'Disposable CI required'; end if; end $$;
create schema planning_concurrency;
create table planning_concurrency.requests(id int primary key,actor uuid,input jsonb,token text);
grant usage on schema planning_concurrency to authenticated;
grant select on planning_concurrency.requests to authenticated;
set request.jwt.claim.sub='96000000-0000-4000-8000-000000000001';
insert into planning_concurrency.requests
select i,auth.uid(),jsonb_build_object('operation','csv_import','request_id',gen_random_uuid(),'rows',jsonb_build_array(
  jsonb_build_object('title','Synthetic parallel CSV','description','Disposable CI only','location','Synthetic CI','event_type','regular',
    'scope_kind','unit','unit_id',(select id from public.units where code='scheuren'),'function_id',null,'organizer_id',auth.uid(),
    'starts_at',date_trunc('day',clock_timestamp())+interval '20 days 12 hours',
    'ends_at',date_trunc('day',clock_timestamp())+interval '20 days 14 hours'))),null
from generate_series(1,2) i;
update planning_concurrency.requests set token=public.ff_preview_event_plan(input)->>'token';
SQL
logs="$(mktemp -d)"
trap 'rm -f "$logs/first.log" "$logs/second.log"; rmdir "$logs"' EXIT
docker exec -e PGAPPNAME=ff_csv_1 -i "$POSTGRES_CONTAINER" psql -X -U postgres -d ff_dev_ci -v ON_ERROR_STOP=1 >"$logs/first.log" 2>&1 <<'SQL' &
begin;
set local request.jwt.claim.sub='96000000-0000-4000-8000-000000000001';
set local role authenticated;
select public.ff_commit_event_plan(input,token,true) from planning_concurrency.requests where id=1;
select pg_sleep(4);
commit;
SQL
first=$!
ready=false
for i in $(seq 1 40); do
  if [[ "$(pg -Atc "select exists(select 1 from pg_stat_activity where application_name='ff_csv_1' and wait_event='PgSleep')")" == t ]]; then ready=true; break; fi
  sleep .1
done
if [[ "$ready" != true ]]; then wait "$first" || true; cat "$logs/first.log"; echo 'First import did not acquire its transaction lock'; exit 1; fi
docker exec -e PGAPPNAME=ff_csv_2 -i "$POSTGRES_CONTAINER" psql -X -U postgres -d ff_dev_ci -v ON_ERROR_STOP=1 >"$logs/second.log" 2>&1 <<'SQL' &
begin;
set local request.jwt.claim.sub='96000000-0000-4000-8000-000000000001';
set local role authenticated;
select public.ff_commit_event_plan(input,token,true) from planning_concurrency.requests where id=2;
commit;
SQL
second=$!
blocked=false
for i in $(seq 1 40); do
  if [[ "$(pg -Atc "select exists(select 1 from pg_stat_activity where application_name='ff_csv_2' and wait_event_type='Lock' and cardinality(pg_blocking_pids(pid))>0)")" == t ]]; then blocked=true; break; fi
  sleep .1
done
wait "$first" || { cat "$logs/first.log"; exit 1; }
if wait "$second"; then echo 'FAIL: duplicate parallel import succeeded'; exit 1; fi
grep -q 'Vorschau zwischenzeitlich geändert' "$logs/second.log" || { cat "$logs/second.log"; exit 1; }
[[ "$blocked" == true ]] || { echo 'FAIL: overlapping transactions did not wait on the planning lock'; exit 1; }
pg <<'SQL'
set request.jwt.claim.sub='96000000-0000-4000-8000-000000000001';
set role authenticated;
select public.ff_commit_event_plan(input,token,true) from planning_concurrency.requests where id=1;
reset role;
do $$ begin
  if (select count(*) from public.events where title='Synthetic parallel CSV')<>1
    or (select count(*) from ff_private.event_plan_commits where request_id in(select (input->>'request_id')::uuid from planning_concurrency.requests))<>1
  then raise exception 'Concurrent CSV confirmations produced duplicate or partial data'; end if;
  raise notice 'PASS: actual concurrent CSV connections block, only one inserts, stale duplicate is rejected and retry is idempotent';
end $$;
SQL
