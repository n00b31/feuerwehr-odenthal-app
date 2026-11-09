#!/usr/bin/env bash
set -euo pipefail
: "${POSTGRES_CONTAINER:?Disposable PostgreSQL required}"
pg() { docker exec -i "$POSTGRES_CONTAINER" psql -X -U postgres -d ff_dev_ci -v ON_ERROR_STOP=1 "$@"; }
pg <<'SQL'
do $$ begin if current_database()<>'ff_dev_ci' then raise exception 'Disposable CI required'; end if; end $$;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
values('a0700000-0000-4000-8000-000000000090','synthetic.concurrent.push@feuerwehr-odenthal.de',clock_timestamp(),'{"display_name":"Synthetic concurrent Push"}');
select set_config('request.jwt.claim.sub',(select user_id::text from public.role_assignments
 where role='GLOBAL_ADMIN' and revoked_at is null and ff_private.is_approved_user(user_id) order by user_id limit 1),false);
set role authenticated;
select public.ff_approve_member('a0700000-0000-4000-8000-000000000090',(select id from public.units where code='scheuren'));
reset role;
update ff_private.notification_config set ready=true,public_key=repeat('B',87);
insert into public.notification_preferences(user_id,push_enabled) values('a0700000-0000-4000-8000-000000000090',true);
insert into public.push_subscriptions(id,user_id,endpoint,p256dh,auth_key,device_name)
values('c0700000-0000-4000-8000-000000000090','a0700000-0000-4000-8000-000000000090',
 'https://fcm.googleapis.com/fcm/send/synthetic-concurrent',repeat('B',87),repeat('A',22),'Synthetic concurrent device');
insert into public.vehicle_notifications(id,recipient_id,source_kind,target_id,event_type,category,title,message,dedup_key)
values('d0700000-0000-4000-8000-000000000090','a0700000-0000-4000-8000-000000000090','test',
 'a0700000-0000-4000-8000-000000000090','dev_test','information','Synthetic concurrent notification','No real delivery','synthetic-concurrent');
SQL
logs="$(mktemp -d)"
trap 'rm -f "$logs/first.log" "$logs/second.log"; rmdir "$logs"' EXIT
docker exec -e PGAPPNAME=ff_push_first -i "$POSTGRES_CONTAINER" psql -X -At -U postgres -d ff_dev_ci -v ON_ERROR_STOP=1 >"$logs/first.log" 2>&1 <<'SQL' &
begin;
set local role service_role;
select jsonb_array_length(public.ff_push_claim('d0700000-0000-4000-8000-000000000090'));
select pg_sleep(4);
commit;
SQL
first=$!
ready=false
for i in $(seq 1 40); do
  if [[ "$(pg -Atc "select exists(select 1 from pg_stat_activity where application_name='ff_push_first' and wait_event='PgSleep')")" == t ]]; then ready=true; break; fi
  sleep .1
done
[[ "$ready" == true ]] || { wait "$first" || true; echo "FAIL: first Push lease not acquired"; exit 1; }
docker exec -e PGAPPNAME=ff_push_second -i "$POSTGRES_CONTAINER" psql -X -At -U postgres -d ff_dev_ci -v ON_ERROR_STOP=1 >"$logs/second.log" 2>&1 <<'SQL' &
begin;
set local role service_role;
select jsonb_array_length(public.ff_push_claim('d0700000-0000-4000-8000-000000000090'));
commit;
SQL
second=$!
blocked=false
for i in $(seq 1 40); do
  if [[ "$(pg -Atc "select exists(select 1 from pg_stat_activity where application_name='ff_push_second' and wait_event_type='Lock' and cardinality(pg_blocking_pids(pid))>0)")" == t ]]; then blocked=true; break; fi
  sleep .1
done
wait "$first" || { cat "$logs/first.log"; exit 1; }
wait "$second" || { cat "$logs/second.log"; exit 1; }
[[ "$blocked" == true ]] || { echo "FAIL: simultaneous Push lock not observed"; exit 1; }
grep -qx '1' "$logs/first.log"
grep -qx '0' "$logs/second.log"
[[ "$(pg -Atc "select count(*)=1 and max(attempt)=1 from ff_private.notification_delivery_attempts a join ff_private.notification_deliveries d on d.id=a.delivery_id where d.notification_id='d0700000-0000-4000-8000-000000000090'")" == t ]]
echo "PASS: real simultaneous worker calls serialize; exactly one lease and one counted attempt"
