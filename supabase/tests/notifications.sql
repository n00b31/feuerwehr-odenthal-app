begin;
do $$ begin if current_database()<>'ff_dev_ci' then raise exception 'Disposable CI required'; end if; end $$;
create function pg_temp.n_user(i int) returns uuid language sql immutable as $$
 select ('a0700000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid;
$$;
create function pg_temp.n_event(i int) returns uuid language sql immutable as $$
 select ('e0700000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid;
$$;
create function pg_temp.n_ok(value boolean,label text) returns void language plpgsql as $$
begin if value is distinct from true then raise exception 'FAIL: %',label; end if; raise notice 'PASS: %',label; end $$;
create function pg_temp.n_deny(statement text) returns void language plpgsql as $$
begin execute statement;raise exception 'FAIL: unauthorized notifications';
exception when insufficient_privilege then raise notice 'PASS: notification action denied'; end $$;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
select pg_temp.n_user(i),'synthetic.notifications.'||i||'@feuerwehr-odenthal.de',case when i<>8 then clock_timestamp() end,
 jsonb_build_object('display_name','Synthetic notification member '||i) from generate_series(1,8) i;
select set_config('n.a',(select id::text from public.units where code='scheuren'),true);
select set_config('n.b',(select id::text from public.units where code='blecher'),true);
select ff_private.bootstrap_global_admin(pg_temp.n_user(1),current_setting('n.a')::uuid);
select set_config('request.jwt.claim.sub',pg_temp.n_user(1)::text,true);
set local role authenticated;
select public.ff_approve_member(pg_temp.n_user(i),case when i in (3,5) then current_setting('n.b')::uuid else current_setting('n.a')::uuid end)
 from generate_series(2,6) i;
select public.ff_set_role(pg_temp.n_user(4),'UNIT_ADMIN',current_setting('n.a')::uuid);
select public.ff_set_role(pg_temp.n_user(5),'FIRE_CHIEF');
reset role;
-- Backdate only newly created synthetic CI memberships, never hosted data.
update public.profiles set approved_at=statement_timestamp()-interval '3 days' where id in (select pg_temp.n_user(i) from generate_series(1,6)i);
update public.unit_memberships set valid_from=statement_timestamp()-interval '3 days' where user_id in (select pg_temp.n_user(i) from generate_series(1,6)i);
update ff_private.notification_config set ready=true,public_key=repeat('B',87),activated_at=statement_timestamp()-interval '3 days';
select set_config('request.jwt.claim.sub',pg_temp.n_user(2)::text,true);
set local role authenticated;
select pg_temp.n_ok(public.ff_notifications()->'preferences'->>'push_enabled'='false','push is opt-in and never enabled by loading inbox');
select set_config('n.device1',public.ff_push_register(jsonb_build_object('endpoint','https://fcm.googleapis.com/fcm/send/synthetic-ci-one',
 'keys',jsonb_build_object('p256dh',repeat('B',87),'auth',repeat('A',22))),'Synthetic phone')::text,true);
select set_config('n.device2',public.ff_push_register(jsonb_build_object('endpoint','https://web.push.apple.com/synthetic-ci-two',
 'keys',jsonb_build_object('p256dh',repeat('B',87),'auth',repeat('A',22))),'Synthetic desktop')::text,true);
select pg_temp.n_ok(jsonb_array_length(public.ff_notifications()->'devices')=2,'multiple own devices');
select public.ff_notification_preferences(true,array['services','changes','reminders','vehicles','administration','information'],true);
select pg_temp.n_ok(not(public.ff_notifications()->'devices'->0 ? 'endpoint')
 and not(public.ff_notifications()->'devices'->0 ? 'auth_key'),'device DTO contains no endpoint or subscription secrets');
select pg_temp.n_deny('select endpoint from public.push_subscriptions');
select pg_temp.n_deny('select public.ff_notification_tick()');
select pg_temp.n_deny('select public.ff_push_claim()');
select pg_temp.n_deny(format('select public.ff_push_complete(%L,%L,201)',gen_random_uuid(),gen_random_uuid()));
select pg_temp.n_deny('select public.ff_push_bootstrap(''x'',''y'')');
select pg_temp.n_deny('select public.ff_notification_configure(false,array[''vehicles''])');
reset role;
select set_config('request.jwt.claim.sub',pg_temp.n_user(3)::text,true);
set local role authenticated;
select pg_temp.n_ok((select count(*)=0 from public.push_subscriptions),'RLS hides foreign devices');
select pg_temp.n_deny(format('select public.ff_push_deactivate(%L)',current_setting('n.device1')));
select pg_temp.n_deny($q$select public.ff_push_register('{"endpoint":"https://fcm.googleapis.com/fcm/send/synthetic-ci-one",
 "keys":{"p256dh":"BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB","auth":"AAAAAAAAAAAAAAAAAAAAAA"}}','Foreign takeover')$q$);
reset role;
insert into public.events(id,title,event_type,starts_at,ends_at,location,scope_kind,unit_id,organizer_id)
select pg_temp.n_event(i),'Synthetic notification service '||i,'regular',
 statement_timestamp()+case when i in(3,4) then interval '-2 hours' when i=5 then interval '1 hour' else interval '12 hours' end,
 statement_timestamp()+case when i in(3,4) then interval '-1 hour' when i=5 then interval '3 hours' else interval '14 hours' end,
 'Synthetic CI','unit',current_setting('n.a')::uuid,pg_temp.n_user(1) from generate_series(1,5)i;
update public.events set attendance_state='COMPLETED' where id=pg_temp.n_event(4);
select set_config('request.jwt.claim.sub',pg_temp.n_user(1)::text,true);
set local role authenticated;
select public.ff_set_primary_organizer(pg_temp.n_event(3),pg_temp.n_user(6),'Synthetic attendance delegation');
reset role;
select set_config('request.jwt.claim.sub',pg_temp.n_user(2)::text,true);
set local role authenticated;
select public.ff_set_response(pg_temp.n_event(1),'yes');
reset role;
do $$ begin for i in 1..10 loop exit when public.ff_notification_tick()=0; end loop; end $$;
select pg_temp.n_ok(auth.uid()=pg_temp.n_user(2),'private recipient evaluation restores caller identity');
select pg_temp.n_ok(exists(select 1 from public.vehicle_notifications where recipient_id=pg_temp.n_user(2)
 and target_id=pg_temp.n_event(1) and event_type='event_created'),'new practice notifies dynamically eligible member');
select pg_temp.n_ok(not exists(select 1 from public.vehicle_notifications where recipient_id=pg_temp.n_user(3)
 and target_id=pg_temp.n_event(1)),'foreign unit receives no practice notification');
select pg_temp.n_ok(not exists(select 1 from public.vehicle_notifications where recipient_id=pg_temp.n_user(2)
 and target_id=pg_temp.n_event(1) and event_type='response_missing'),'answered service never generates missing response reminder');
select pg_temp.n_ok(exists(select 1 from public.vehicle_notifications where recipient_id=pg_temp.n_user(2)
 and target_id=pg_temp.n_event(2) and event_type='response_missing'),'missing response reminder is generated');
select pg_temp.n_ok(exists(select 1 from public.vehicle_notifications where recipient_id=pg_temp.n_user(6)
 and target_id=pg_temp.n_event(3) and event_type='attendance_open'),'delegated organizer receives own open attendance task');
select pg_temp.n_ok(not exists(select 1 from public.vehicle_notifications where recipient_id=pg_temp.n_user(2)
 and target_id=pg_temp.n_event(3)),'ordinary member receives no administrative attendance reminder');
select pg_temp.n_ok(not exists(select 1 from public.vehicle_notifications where target_id=pg_temp.n_event(4)),
 'already finalized attendance never generates open-list reminder');
select pg_temp.n_ok(exists(select 1 from public.vehicle_notifications where recipient_id=pg_temp.n_user(2)
 and target_id=pg_temp.n_event(5) and event_type='service_reminder_two'),'optional two-hour reminder is delivered only after explicit opt-in');
select pg_temp.n_ok(not exists(select 1 from public.vehicle_notifications where recipient_id=pg_temp.n_user(1)
 and target_id=pg_temp.n_event(5) and event_type='service_reminder_two'),'two-hour reminder is disabled by default');
select pg_temp.n_ok(exists(select 1 from public.vehicle_notifications where recipient_id=pg_temp.n_user(1)
 and target_id=pg_temp.n_user(7) and source_kind='registration'),'verified registration notifies GLOBAL_ADMIN');
select pg_temp.n_ok(not exists(select 1 from public.vehicle_notifications where recipient_id in(pg_temp.n_user(4),pg_temp.n_user(5))
 and source_kind='registration'),'UNIT_ADMIN and FIRE_CHIEF do not receive global registration tasks');
select pg_temp.n_ok(not exists(select 1 from public.vehicle_notifications where target_id=pg_temp.n_user(8)),
 'unverified registration never triggers an administrative notice');
select set_config('n.before',(select count(*)::text from public.vehicle_notifications),true);
set local time zone 'Europe/Berlin';
select public.ff_notification_tick();
select pg_temp.n_ok((select count(*)::text from public.vehicle_notifications)=current_setting('n.before'),'repeated cron is idempotent');
select pg_temp.n_ok('2027-03-28 12:00+02'::timestamptz-make_interval(hours=>24)='2027-03-27 11:00+01'::timestamptz
 and '2027-10-31 12:00+01'::timestamptz-make_interval(hours=>24)='2027-10-30 13:00+02'::timestamptz,
 'reminder offsets are actual elapsed hours across both Berlin DST transitions');
update auth.users set email_confirmed_at=clock_timestamp() where id=pg_temp.n_user(8);
select public.ff_notification_tick();
select pg_temp.n_ok(exists(select 1 from public.vehicle_notifications where target_id=pg_temp.n_user(8)
 and recipient_id=pg_temp.n_user(1)),'registration captured before verification is delivered only after real verified state');
update public.events set title='Synthetic changed time',starts_at=starts_at+interval '1 hour',ends_at=ends_at+interval '1 hour',revision=revision+1 where id=pg_temp.n_event(1);
select public.ff_notification_tick();
select pg_temp.n_ok(exists(select 1 from public.vehicle_notifications where recipient_id=pg_temp.n_user(2)
 and target_id=pg_temp.n_event(1) and event_type='event_changed' and message like 'Synthetic changed time%'),'change contains actual title and Berlin date');
update public.events set status='cancelled',revision=revision+1 where id=pg_temp.n_event(1);
select public.ff_notification_tick();
select pg_temp.n_ok(exists(select 1 from public.vehicle_notifications where recipient_id=pg_temp.n_user(2)
 and target_id=pg_temp.n_event(1) and event_type='event_cancelled'),'cancellation notifies eligible member');
update public.events set attendance_state='COMPLETED' where id=pg_temp.n_event(3);
select set_config('request.jwt.claim.sub',pg_temp.n_user(2)::text,true);
set local role authenticated;
select set_config('n.test',public.ff_push_test(current_setting('n.device1')::uuid)::text,true);
select pg_temp.n_deny(format('select public.ff_push_test(%L)',current_setting('n.device1')));
reset role;
select pg_temp.n_ok((select count(*)=1 from ff_private.notification_deliveries where notification_id=current_setting('n.test')::uuid),
 'DEV test queues only selected own device, never every device or member');
select set_config('n.jobs',public.ff_push_claim(current_setting('n.test')::uuid)::text,true);
select pg_temp.n_ok(jsonb_array_length(current_setting('n.jobs')::jsonb)=1,'server atomically claims test job');
select pg_temp.n_ok(public.ff_push_claim(current_setting('n.test')::uuid)='[]'::jsonb,'parallel/repeated claim cannot own active lease');
select pg_temp.n_ok(not public.ff_push_complete((current_setting('n.jobs')::jsonb->0->>'id')::uuid,gen_random_uuid(),201),
 'stale or forged lease cannot acknowledge delivery');
select public.ff_push_complete((current_setting('n.jobs')::jsonb->0->>'id')::uuid,
 (current_setting('n.jobs')::jsonb->0->>'lease_id')::uuid,503);
select pg_temp.n_ok(exists(select 1 from ff_private.notification_deliveries where notification_id=current_setting('n.test')::uuid
 and status='pending' and attempts=1 and error_code='http_503' and next_attempt_at>statement_timestamp()),'temporary failure is logged and bounded retry deferred');
update ff_private.notification_deliveries set next_attempt_at=statement_timestamp()-interval '1 second' where notification_id=current_setting('n.test')::uuid;
select set_config('n.jobs',public.ff_push_claim(current_setting('n.test')::uuid)::text,true);
select public.ff_push_complete((current_setting('n.jobs')::jsonb->0->>'id')::uuid,
 (current_setting('n.jobs')::jsonb->0->>'lease_id')::uuid,410);
select pg_temp.n_ok((select not active from public.push_subscriptions where id=current_setting('n.device1')::uuid),
 'expired push endpoint is automatically deactivated');
insert into public.vehicle_notifications(recipient_id,source_kind,target_id,event_type,category,title,message,dedup_key)
select pg_temp.n_user(2),'test',pg_temp.n_user(2),'dev_test','information','Synthetic rate fixture','No transport',
 'synthetic-hourly-limit:'||i from generate_series(1,20)i;
select jsonb_array_length(public.ff_push_claim());
select pg_temp.n_ok((select count(*)=10 from ff_private.notification_delivery_attempts a
 join ff_private.notification_deliveries d on d.id=a.delivery_id join public.push_subscriptions s on s.id=d.subscription_id
 where s.user_id=pg_temp.n_user(2)),'exact ten-attempt hourly account limit counts retries and all devices together');
select pg_temp.n_ok(public.ff_push_claim()='[]'::jsonb,'repeated claim cannot bypass hourly account limit');
select set_config('request.jwt.claim.sub',pg_temp.n_user(2)::text,true);
set local role authenticated;
select public.ff_notification_preferences(false,array['vehicles']);
select public.ff_notification_read();
select pg_temp.n_ok(public.ff_notifications()->>'unread'='0','own inbox supports mark all read');
select pg_temp.n_ok(not exists(select 1 from public.vehicle_notifications where recipient_id<>auth.uid()),'central inbox RLS hides foreign notices');
select pg_temp.n_deny('select public.ff_notification_admin()');
reset role;
select set_config('request.jwt.claim.sub',pg_temp.n_user(5)::text,true);
set local role authenticated;
select pg_temp.n_deny('select public.ff_notification_admin()');
reset role;
select set_config('request.jwt.claim.sub',pg_temp.n_user(4)::text,true);
set local role authenticated;
select pg_temp.n_ok(public.ff_notification_admin()->>'global'='false','unit administrator has scoped diagnostic view without global settings');
reset role;
select set_config('request.jwt.claim.sub',pg_temp.n_user(1)::text,true);
set local role authenticated;
select public.ff_notification_configure(true,array['services','changes','reminders','vehicles','administration','information']);
select pg_temp.n_ok(public.ff_notification_admin()->>'global'='true','global administrator may configure dispatch categories');
reset role;
select pg_temp.n_ok(not has_function_privilege('authenticated','ff_private.notification_recipient_allowed(uuid,text,uuid)','execute'),
 'recipient impersonation is server-private');
select pg_temp.n_ok(not has_function_privilege('anon','public.ff_notifications(uuid)','execute'),'anonymous inbox denied');
rollback;
