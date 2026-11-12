begin;
do $$ begin
  if current_database() <> 'ff_dev_ci' then raise exception 'Disposable CI database required'; end if;
end; $$;
create function pg_temp.assert_true(value boolean, label text) returns void language plpgsql as $$
begin if value is distinct from true then raise exception 'FAIL: %', label; end if; raise notice 'PASS: %', label; end; $$;
create function pg_temp.expect_denied(statement text) returns void language plpgsql as $$
begin execute statement; raise exception 'Expected denied'; exception when insufficient_privilege then raise notice 'PASS: denied %', statement; end; $$;

insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
select ('61000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
  'synthetic.recovery.'||i||'@feuerwehr-odenthal.de',
  case when i <> 7 then clock_timestamp() end, jsonb_build_object('display_name','Synthetic recovery '||i)
from generate_series(1,7) i;
select set_config('ff.test.unit',(select id::text from public.units where code='scheuren'),true);
select ff_private.bootstrap_global_admin('61000000-0000-4000-8000-000000000001',current_setting('ff.test.unit')::uuid);
select set_config('request.jwt.claim.sub','61000000-0000-4000-8000-000000000001',true);
select public.ff_approve_member('61000000-0000-4000-8000-000000000002',current_setting('ff.test.unit')::uuid);
select public.ff_approve_member('61000000-0000-4000-8000-000000000003',current_setting('ff.test.unit')::uuid);
select public.ff_approve_member('61000000-0000-4000-8000-000000000004',current_setting('ff.test.unit')::uuid);
select public.ff_approve_member('61000000-0000-4000-8000-000000000005',current_setting('ff.test.unit')::uuid);
select public.ff_set_role('61000000-0000-4000-8000-000000000003','UNIT_ADMIN',current_setting('ff.test.unit')::uuid);
select public.ff_set_role('61000000-0000-4000-8000-000000000004','FUNCTION_ADMIN',null,(select id from public.special_functions limit 1));
select public.ff_set_role('61000000-0000-4000-8000-000000000005','FIRE_CHIEF');

set local role anon;
select pg_temp.expect_denied('select public.ff_begin_self_password_recovery(''synthetic.recovery.6@feuerwehr-odenthal.de'')');
select pg_temp.expect_denied('select public.ff_begin_admin_password_recovery(''61000000-0000-4000-8000-000000000006'')');
reset role;
do $$ declare actor uuid; begin
  foreach actor in array array[
    '61000000-0000-4000-8000-000000000002'::uuid,'61000000-0000-4000-8000-000000000003'::uuid,
    '61000000-0000-4000-8000-000000000004'::uuid,'61000000-0000-4000-8000-000000000005'::uuid
  ] loop
    perform set_config('request.jwt.claim.sub',actor::text,true);
    set local role authenticated;
    perform pg_temp.expect_denied('select public.ff_begin_admin_password_recovery(''61000000-0000-4000-8000-000000000006'')');
    perform pg_temp.expect_denied('select public.ff_finish_password_recovery(gen_random_uuid(),''auth_accepted'')');
    perform pg_temp.expect_denied('select public.ff_claim_recovery_verifier(gen_random_uuid())');
    reset role;
  end loop;
end; $$;
select set_config('request.jwt.claim.sub','61000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select set_config('ff.test.request',(public.ff_begin_admin_password_recovery('61000000-0000-4000-8000-000000000006')->>'request_id'),true);
select pg_temp.assert_true(current_setting('ff.test.request') is not null,'GLOBAL_ADMIN reserves verified pending account without approval');
select pg_temp.assert_true((public.ff_begin_admin_password_recovery('61000000-0000-4000-8000-000000000007')->>'accepted')::boolean=false,'unverified target receives no administrative recovery');
select pg_temp.expect_denied('update public.password_recovery_requests set outcome=''auth_accepted''');
reset role;
set local role service_role;
select public.ff_store_recovery_verifier(current_setting('ff.test.request')::uuid,repeat('x',43));
select pg_temp.assert_true(public.ff_claim_recovery_verifier(current_setting('ff.test.request')::uuid)->>'user_id'
  ='61000000-0000-4000-8000-000000000006','server PKCE proof belongs to exactly the selected verified target');
select pg_temp.assert_true(public.ff_claim_recovery_verifier(current_setting('ff.test.request')::uuid) is null,'private verifier is claimed once and removed');
select pg_temp.assert_true((public.ff_begin_self_password_recovery(' SYNTHETIC.RECOVERY.6@FEUERWEHR-ODENTHAL.DE ')->>'accepted')::boolean=false,'normalized self and admin requests share one in-flight reservation');
select public.ff_finish_password_recovery(current_setting('ff.test.request')::uuid,'auth_accepted');
select pg_temp.assert_true((public.ff_begin_self_password_recovery('unknown@feuerwehr-odenthal.de')->>'accepted')::boolean=false,'unknown account does not reserve or send');
reset role;
select pg_temp.assert_true((select status='pending' from public.profiles where id='61000000-0000-4000-8000-000000000006'),'recovery preserves pending status');
select pg_temp.assert_true((select count(*)=0 from public.role_assignments where user_id='61000000-0000-4000-8000-000000000006'),'recovery assigns no roles');
select pg_temp.assert_true((select count(*)=2 from public.audit_entries where subject_id='61000000-0000-4000-8000-000000000006' and actor_id='61000000-0000-4000-8000-000000000001' and action like 'password_recovery_%'),'immutable audit retains initiating administrator and outcome');

set local role service_role;
select set_config('ff.test.second',(public.ff_begin_self_password_recovery(' SYNTHETIC.RECOVERY.6@FEUERWEHR-ODENTHAL.DE ')->>'request_id'),true);
select pg_temp.assert_true(current_setting('ff.test.second') is not null,'second hourly reservation is admitted for the normalized address');
select public.ff_finish_password_recovery(current_setting('ff.test.second')::uuid,'unknown');
reset role;
set local role authenticated;
select set_config('ff.test.third',(public.ff_begin_admin_password_recovery('61000000-0000-4000-8000-000000000006')->>'request_id'),true);
select pg_temp.assert_true(current_setting('ff.test.third') is not null,'third shared hourly reservation is admitted for GLOBAL_ADMIN');
reset role;
set local role service_role;
select public.ff_finish_password_recovery(current_setting('ff.test.third')::uuid,'auth_rejected');
select pg_temp.assert_true((public.ff_begin_self_password_recovery('synthetic.recovery.6@feuerwehr-odenthal.de')->>'accepted')::boolean=false,'fourth hourly reservation denied including rejected and unknown outcomes');
reset role;
set local role authenticated;
select pg_temp.assert_true((public.ff_begin_admin_password_recovery('61000000-0000-4000-8000-000000000006')->>'accepted')::boolean=false,'administration cannot bypass the shared hourly maximum');
reset role;
select pg_temp.assert_true((select count(*)=3 from public.password_recovery_requests),'denied requests do not reserve additional hourly slots');
update public.password_recovery_requests set requested_at=clock_timestamp()-interval '2 hours';
set local role service_role;
select pg_temp.assert_true((public.ff_begin_self_password_recovery('synthetic.recovery.6@feuerwehr-odenthal.de')->>'accepted')::boolean=false,'three finished attempts remain in the hourly window even if dispatch began earlier');
reset role;
update public.password_recovery_requests set finished_at=clock_timestamp()-interval '2 hours';
set local role service_role;
select set_config('ff.test.fourth',(public.ff_begin_self_password_recovery('synthetic.recovery.6@feuerwehr-odenthal.de')->>'request_id'),true);
select pg_temp.assert_true(current_setting('ff.test.fourth') is not null,'expired hourly attempts allow a fourth daily reservation');
select public.ff_finish_password_recovery(current_setting('ff.test.fourth')::uuid,'unknown');
reset role;
set local role authenticated;
select set_config('ff.test.fifth',(public.ff_begin_admin_password_recovery('61000000-0000-4000-8000-000000000006')->>'request_id'),true);
select pg_temp.assert_true(current_setting('ff.test.fifth') is not null,'fifth rolling 24-hour reservation is admitted');
reset role;
set local role service_role;
select public.ff_finish_password_recovery(current_setting('ff.test.fifth')::uuid,'auth_rejected');
select pg_temp.assert_true((public.ff_begin_self_password_recovery('synthetic.recovery.6@feuerwehr-odenthal.de')->>'accepted')::boolean=false,'sixth rolling 24-hour reservation denied although only two attempts are within the hour');
select pg_temp.assert_true((public.ff_begin_self_password_recovery('synthetic.recovery.2@feuerwehr-odenthal.de')->>'accepted')::boolean,'per-address quota does not block a different eligible account');
reset role;
select pg_temp.assert_true((select count(*)=5 from public.password_recovery_requests where email='synthetic.recovery.6@feuerwehr-odenthal.de'),'denied sixth attempt preserves the five-attempt history');
update public.password_recovery_requests set requested_at=clock_timestamp()-interval '25 hours',finished_at=clock_timestamp()-interval '25 hours'
  where email='synthetic.recovery.6@feuerwehr-odenthal.de';
set local role service_role;
select pg_temp.assert_true((public.ff_begin_self_password_recovery('synthetic.recovery.6@feuerwehr-odenthal.de')->>'accepted')::boolean,'expired 24-hour reservations no longer block');
reset role;
update public.password_recovery_requests set requested_at=clock_timestamp()-interval '25 hours' where outcome='reserved';
set local role service_role;
select pg_temp.assert_true((public.ff_begin_self_password_recovery('synthetic.recovery.6@feuerwehr-odenthal.de')->>'accepted')::boolean=false,'an unresolved in-flight reservation still blocks even outside both rolling windows');
reset role;
do $$ declare i int; begin
  set local role service_role;
  for i in 1..30 loop perform pg_temp.assert_true(public.ff_allow_self_recovery_request(),'global anonymous intake admitted'); end loop;
  perform pg_temp.assert_true(not public.ff_allow_self_recovery_request(),'31st global anonymous request denied atomically');
  reset role;
end; $$;
rollback;
