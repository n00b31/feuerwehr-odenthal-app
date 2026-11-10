#!/usr/bin/env bash
set -euo pipefail
: "${POSTGRES_CONTAINER:?Disposable PostgreSQL required}"
pg() { docker exec -i "$POSTGRES_CONTAINER" psql -X -U postgres -d ff_dev_ci -v ON_ERROR_STOP=1 "$@"; }
pg <<'SQL'
do $$ begin if current_database()<>'ff_dev_ci' then raise exception 'Disposable CI required'; end if; end $$;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
values('a0720000-0000-4000-8000-000000000090','synthetic.lifecycle.concurrent@feuerwehr-odenthal.de',clock_timestamp(),'{"display_name":"Synthetic lifecycle concurrency"}');
select set_config('request.jwt.claim.sub',(select user_id::text from public.role_assignments
 where role='GLOBAL_ADMIN' and revoked_at is null and ff_private.is_approved_user(user_id) order by user_id limit 1),false);
set role authenticated;
select public.ff_approve_member('a0720000-0000-4000-8000-000000000090',(select id from public.units where code='scheuren'));
reset role;
update ff_private.notification_config set ready=true,public_key=repeat('B',87) where singleton;
create function public.synthetic_lifecycle_concurrent(scenario int,second_call boolean)
returns void language plpgsql as $$
declare device uuid:=('c0720000-0000-4000-8000-'||lpad(scenario::text,12,'0'))::uuid;
  payload jsonb:=jsonb_build_object('endpoint','https://wns2-am3p.notify.windows.com/concurrent-'||scenario,
    'keys',jsonb_build_object('p256dh',repeat('B',87),'auth',repeat('A',22)));
begin
  if scenario=1 then
    if second_call then perform public.ff_push_remove(device);
    else perform public.ff_push_reactivate(device,payload,'Concurrent first'); end if;
  elsif scenario=2 then
    if not second_call then perform public.ff_push_remove(device);
    else
      begin perform public.ff_push_reactivate(device,payload,'Stale concurrent');
        raise exception 'FAIL: stale reactivation recreated removed device';
      exception when sqlstate 'PT404' then raise notice 'PASS: stale reactivation rejected after deletion'; end;
    end if;
  else perform public.ff_push_register(payload,'Concurrent register');
  end if;
end;
$$;
insert into public.push_subscriptions(id,user_id,endpoint,p256dh,auth_key,device_name,active)
select ('c0720000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'a0720000-0000-4000-8000-000000000090',
 'https://wns2-am3p.notify.windows.com/concurrent-'||i,repeat('B',87),repeat('A',22),'Concurrent fixture',false from generate_series(1,2)i;
SQL
logs="$(mktemp -d)"
trap 'rm -f "$logs/first.log" "$logs/second.log"; rmdir "$logs"' EXIT
for scenario in 1 2 3; do
  docker exec -e PGAPPNAME=ff_lifecycle_first -i "$POSTGRES_CONTAINER" psql -X -U postgres -d ff_dev_ci -v ON_ERROR_STOP=1 >"$logs/first.log" 2>&1 <<SQL &
begin;
select set_config('request.jwt.claim.sub','a0720000-0000-4000-8000-000000000090',true);
set local role authenticated;
select public.synthetic_lifecycle_concurrent($scenario,false);
select pg_sleep(4);
commit;
SQL
  first=$!
  ready=false
  for i in $(seq 1 40); do
    if [[ "$(pg -Atc "select exists(select 1 from pg_stat_activity where application_name='ff_lifecycle_first' and wait_event='PgSleep')")" == t ]]; then ready=true; break; fi
    sleep .1
  done
  [[ "$ready" == true ]] || { wait "$first" || true; echo "FAIL: first lifecycle transaction not ready"; exit 1; }
  docker exec -e PGAPPNAME=ff_lifecycle_second -i "$POSTGRES_CONTAINER" psql -X -U postgres -d ff_dev_ci -v ON_ERROR_STOP=1 >"$logs/second.log" 2>&1 <<SQL &
begin;
select set_config('request.jwt.claim.sub','a0720000-0000-4000-8000-000000000090',true);
set local role authenticated;
select public.synthetic_lifecycle_concurrent($scenario,true);
commit;
SQL
  second=$!
  blocked=false
  for i in $(seq 1 35); do
    if [[ "$(pg -Atc "select exists(select 1 from pg_stat_activity where application_name='ff_lifecycle_second' and wait_event_type='Lock' and cardinality(pg_blocking_pids(pid))>0)")" == t ]]; then blocked=true; break; fi
    sleep .1
  done
  wait "$first" || { cat "$logs/first.log"; exit 1; }
  wait "$second" || { cat "$logs/second.log"; exit 1; }
  [[ "$blocked" == true ]] || { echo "FAIL: real overlapping lifecycle lock not observed"; exit 1; }
  if [[ "$scenario" == 3 ]]; then expected=1; else expected=0; fi
  [[ "$(pg -Atc "select count(*) from public.push_subscriptions where endpoint='https://wns2-am3p.notify.windows.com/concurrent-$scenario'")" == "$expected" ]]
  echo "PASS: real simultaneous lifecycle scenario $scenario serialized, resulting devices=$expected"
done
pg -c 'drop function public.synthetic_lifecycle_concurrent(int,boolean);'
