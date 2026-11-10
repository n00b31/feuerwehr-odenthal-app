begin;
do $$ begin if current_database()<>'ff_dev_ci' then raise exception 'Disposable CI required'; end if; end $$;
create function pg_temp.l_user(i int) returns uuid language sql immutable as $$
 select ('a0720000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid;
$$;
create function pg_temp.l_ok(value boolean,label text) returns void language plpgsql as $$
begin if value is distinct from true then raise exception 'FAIL: %',label; end if; raise notice 'PASS: %',label; end $$;
create function pg_temp.l_subscription(suffix text) returns jsonb language sql immutable as $$
 select jsonb_build_object('endpoint','https://wns2-am3p.notify.windows.com/'||suffix,
   'keys',jsonb_build_object('p256dh',repeat('B',87),'auth',repeat('A',22)));
$$;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
select pg_temp.l_user(i),'synthetic.lifecycle.'||i||'@feuerwehr-odenthal.de',clock_timestamp(),
 jsonb_build_object('display_name','Synthetic lifecycle '||i) from generate_series(1,3)i;
select ff_private.bootstrap_global_admin(pg_temp.l_user(1),(select id from public.units where code='scheuren'));
select set_config('request.jwt.claim.sub',pg_temp.l_user(1)::text,true);
set local role authenticated;
select public.ff_approve_member(pg_temp.l_user(2),(select id from public.units where code='scheuren'));
select public.ff_approve_member(pg_temp.l_user(3),(select id from public.units where code='blecher'));
reset role;
update ff_private.notification_config set ready=true,public_key=repeat('B',87) where singleton;
select set_config('request.jwt.claim.sub',pg_temp.l_user(2)::text,true);
set local role authenticated;
select set_config('l.one',public.ff_push_register(pg_temp.l_subscription('lifecycle-one'),'Synthetic Edge')::text,true);
select set_config('l.two',public.ff_push_register(pg_temp.l_subscription('lifecycle-two'),'Synthetic iPhone')::text,true);
select pg_temp.l_ok(public.ff_push_register(pg_temp.l_subscription('lifecycle-one'),'Synthetic Edge')::text=current_setting('l.one'),
 'idempotent registration reuses one endpoint and device ID');
select set_config('l.test',public.ff_push_test(current_setting('l.one')::uuid)::text,true);
do $$ begin perform public.ff_push_test(current_setting('l.one')::uuid);raise exception 'FAIL: minute quota';
exception when sqlstate 'PT429' then raise notice 'PASS: precise minute quota'; end $$;
reset role;
select set_config('l.job',(public.ff_push_claim(current_setting('l.test')::uuid)->0)::text,true);
select pg_temp.l_ok(public.ff_push_ready((current_setting('l.job')::jsonb->>'id')::uuid,
 (current_setting('l.job')::jsonb->>'lease_id')::uuid),'first own test is eligible');
select public.ff_push_complete((current_setting('l.job')::jsonb->>'id')::uuid,
 (current_setting('l.job')::jsonb->>'lease_id')::uuid,201);
set local role authenticated;
select pg_temp.l_ok(public.ff_push_test_status(current_setting('l.test')::uuid)->>'status'='accepted',
 'own authorized test status distinguishes actual provider acceptance');
reset role;
insert into public.vehicle_notifications(recipient_id,source_kind,target_id,event_type,category,title,message,dedup_key)
values(pg_temp.l_user(2),'test',pg_temp.l_user(2),'dev_test','information','Synthetic stale lease','No transport','lifecycle-stale');
select set_config('l.notice',(select id::text from public.vehicle_notifications where dedup_key='lifecycle-stale'),true);
select set_config('l.job',(select j::text from jsonb_array_elements(public.ff_push_claim(current_setting('l.notice')::uuid))j
 where j#>>'{subscription,endpoint}' like '%lifecycle-one'),true);
set local role authenticated;
select public.ff_push_deactivate(current_setting('l.one')::uuid);
do $$ begin perform public.ff_push_test(current_setting('l.one')::uuid);raise exception 'FAIL: inactive test';
exception when sqlstate 'PT409' then raise notice 'PASS: explicit inactive device'; end $$;
select pg_temp.l_ok(public.ff_push_reactivate(current_setting('l.one')::uuid,pg_temp.l_subscription('lifecycle-one'),
 'Synthetic Edge')::text=current_setting('l.one'),'reactivation preserves existing own identity');
do $$ begin for i in 1..3 loop
  perform public.ff_push_deactivate(current_setting('l.one')::uuid);
  perform public.ff_push_reactivate(current_setting('l.one')::uuid,pg_temp.l_subscription('lifecycle-one'),'Synthetic Edge');
end loop; end $$;
reset role;
select pg_temp.l_ok(not public.ff_push_ready((current_setting('l.job')::jsonb->>'id')::uuid,
 (current_setting('l.job')::jsonb->>'lease_id')::uuid),'old lease cancelled before transport');
select pg_temp.l_ok(not public.ff_push_complete((current_setting('l.job')::jsonb->>'id')::uuid,
 (current_setting('l.job')::jsonb->>'lease_id')::uuid,410),'late expired result cannot disable the reactivated device');
select pg_temp.l_ok((select active from public.push_subscriptions where id=current_setting('l.one')::uuid)
 and (select active from public.push_subscriptions where id=current_setting('l.two')::uuid),'both devices remain active');
update public.vehicle_notifications set created_at=statement_timestamp()-interval '2 minutes'
 where recipient_id=pg_temp.l_user(2) and source_kind='test';
set local role authenticated;
select set_config('l.test2',public.ff_push_test(current_setting('l.one')::uuid)::text,true);
reset role;
select set_config('l.job',(public.ff_push_claim(current_setting('l.test2')::uuid)->0)::text,true);
select public.ff_push_complete((current_setting('l.job')::jsonb->>'id')::uuid,
 (current_setting('l.job')::jsonb->>'lease_id')::uuid,201);
set local role authenticated;
select pg_temp.l_ok(public.ff_push_test_status(current_setting('l.test2')::uuid)->>'status'='accepted','test after reactivation is accepted');
select public.ff_push_remove(current_setting('l.one')::uuid);
select pg_temp.l_ok(not exists(select 1 from public.push_subscriptions where id=current_setting('l.one')::uuid),'permanent removal hides and deletes device');
select public.ff_push_deactivate(null,'https://wns2-am3p.notify.windows.com/lifecycle-one');
select pg_temp.l_ok(exists(select 1 from public.push_subscriptions where id=current_setting('l.two')::uuid and active),
 'logout after remote removal is idempotent and preserves the other device');
do $$ begin perform public.ff_push_reactivate(current_setting('l.one')::uuid,pg_temp.l_subscription('lifecycle-one'),'Removed');
 raise exception 'FAIL: removed identity resurrected'; exception when sqlstate 'PT404' then raise notice 'PASS: stale reactivation denied'; end $$;
select set_config('l.new',public.ff_push_register(pg_temp.l_subscription('lifecycle-one'),'New Edge')::text,true);
select pg_temp.l_ok(current_setting('l.new')<>current_setting('l.one'),'explicit registration after removal creates fresh identity');
reset role;
select pg_temp.l_ok(exists(select 1 from ff_private.notification_deliveries where notification_id=current_setting('l.test')::uuid
 and subscription_id is null and status='accepted'),'historical acceptance preserved without retained subscription keys');
select pg_temp.l_ok(exists(select 1 from ff_private.notification_delivery_attempts a join ff_private.notification_deliveries d on d.id=a.delivery_id
 where d.notification_id=current_setting('l.test')::uuid and a.result_code=201),'audit attempts survive removal');
update public.vehicle_notifications set created_at=statement_timestamp()-interval '2 minutes'
 where recipient_id=pg_temp.l_user(2) and source_kind='test';
set local role authenticated;
-- The directly inserted stale fixture is also a test notice: it contributes to the unchanged account quota.
do $$ begin perform public.ff_push_test(current_setting('l.new')::uuid);raise exception 'FAIL: hourly quota reset';
exception when sqlstate 'PT429' then raise notice 'PASS: removal/reactivation do not reset hourly test quota'; end $$;
select set_config('request.jwt.claim.sub',pg_temp.l_user(3)::text,true);
do $$ begin perform public.ff_push_remove(current_setting('l.two')::uuid);raise exception 'FAIL: foreign removal';
exception when sqlstate 'PT404' then raise notice 'PASS: foreign and missing devices indistinguishable'; end $$;
do $$ begin perform public.ff_push_reactivate(current_setting('l.two')::uuid,pg_temp.l_subscription('lifecycle-two'),'Foreign');
 raise exception 'FAIL: foreign reactivation'; exception when sqlstate 'PT404' then raise notice 'PASS: foreign reactivation denied'; end $$;
do $$ begin perform public.ff_push_test_status(current_setting('l.test')::uuid);raise exception 'FAIL: foreign status';
exception when sqlstate 'PT404' then raise notice 'PASS: foreign delivery status denied'; end $$;
do $$ begin perform public.ff_push_register(pg_temp.l_subscription('lifecycle-two'),'Foreign');
 raise exception 'FAIL: foreign endpoint takeover'; exception when insufficient_privilege then raise notice 'PASS: endpoint owner enforced'; end $$;
reset role;
select set_config('request.jwt.claim.sub',pg_temp.l_user(2)::text,true);
set local role authenticated;
select set_config('l.rotated',public.ff_push_reactivate(current_setting('l.new')::uuid,pg_temp.l_subscription('lifecycle-rotated'),'Renewed Edge')::text,true);
select pg_temp.l_ok(current_setting('l.rotated')<>current_setting('l.new'),'renewed native endpoint safely replaces only selected own device');
reset role;
select pg_temp.l_ok((select count(*)=2 from public.push_subscriptions where user_id=pg_temp.l_user(2)),'exactly two own devices after replacement');
insert into public.vehicle_notifications(recipient_id,source_kind,target_id,event_type,category,title,message,dedup_key)
select pg_temp.l_user(2),'test',pg_temp.l_user(2),'dev_test','information','Synthetic hourly attempts','No transport','lifecycle-budget-'||i
 from generate_series(1,10)i;
select public.ff_push_claim();
select pg_temp.l_ok((select count(*)=10 from ff_private.notification_delivery_attempts a
 join ff_private.notification_deliveries d on d.id=a.delivery_id join public.vehicle_notifications n on n.id=d.notification_id
 where n.recipient_id=pg_temp.l_user(2)),'hourly attempt budget reached exactly');
set local role authenticated;
select public.ff_push_remove(current_setting('l.rotated')::uuid);
select public.ff_push_register(pg_temp.l_subscription('lifecycle-rotated'),'New again');
reset role;
select pg_temp.l_ok(public.ff_push_claim()='[]'::jsonb,'removed-device attempts still count against hourly transport budget');
select pg_temp.l_ok(not has_function_privilege('authenticated','public.ff_push_ready(uuid,uuid)','execute')
 and not has_function_privilege('anon','public.ff_push_remove(uuid)','execute'),'transport and anonymous lifecycle privilege boundaries');
rollback;
