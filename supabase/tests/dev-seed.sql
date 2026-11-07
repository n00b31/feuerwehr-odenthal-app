-- Auth inserts in this file are disposable fixtures, never the hosted seed mechanism.
begin;
do $$ begin if current_database()<>'ff_dev_ci' then raise exception 'Disposable CI database required'; end if; end $$;
create function pg_temp.assert_seed(value boolean,label text) returns void language plpgsql as $$
begin if value is distinct from true then raise exception 'FAIL: %',label; end if; raise notice 'PASS: %',label; end $$;
create function pg_temp.denied_seed(statement text) returns void language plpgsql as $$
begin execute statement; raise exception 'FAIL: permission denial required'; exception when insufficient_privilege then raise notice 'PASS: seed permission denied'; end $$;
select set_config('seed.approver','90000000-0000-4000-8000-000000000001',true);
select set_config('seed.run','90000000-0000-4000-8000-000000000002',true);
select set_config('seed.unit',(select id::text from public.units where code='scheuren'),true);
select set_config('seed.other',(select id::text from public.units where code='scherf'),true);
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
values(current_setting('seed.approver')::uuid,'synthetic.seed.approver@feuerwehr-odenthal.de',
  clock_timestamp(),'{"display_name":"Synthetic seed approver"}');
select ff_private.bootstrap_global_admin(current_setting('seed.approver')::uuid,current_setting('seed.unit')::uuid);
select pg_temp.assert_seed(not has_function_privilege('authenticated','public.ff_dev_seed_member(uuid,uuid,uuid)','execute')
  and not has_function_privilege('anon','public.ff_dev_seed_report(uuid)','execute'),'seed RPCs are not browser-callable');
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claim.sub','',true);
set local role service_role;
select pg_temp.denied_seed($q$select public.ff_dev_seed_report('90000000-0000-4000-8000-000000000099')$q$);
select set_config('seed.baseline',public.ff_dev_seed_report(current_setting('seed.approver')::uuid)->>'protected_fingerprint',true);
select pg_temp.assert_seed((select bool_and(item->>'state'='missing') from
  jsonb_array_elements(public.ff_dev_seed_report(current_setting('seed.approver')::uuid)->'members') item),'initial manifest is empty');
reset role;
insert into auth.users(email,email_confirmed_at,raw_user_meta_data,raw_app_meta_data)
select email,clock_timestamp(),jsonb_build_object('display_name',display_name),
  jsonb_build_object('provider','email','ff_dev_seed',jsonb_build_object('version','032',
    'project_ref','orxinqhhbtjpkzwlfaxq','run_id',current_setting('seed.run')))
from ff_private.dev_test_members();
select set_config('seed.max',(select id::text from auth.users where email='max.test@feuerwehr-odenthal.de'),true);
select set_config('seed.thomas',(select id::text from auth.users where email='thomas.test@feuerwehr-odenthal.de'),true);
select set_config('seed.sarah',(select id::text from auth.users where email='sarah.test@feuerwehr-odenthal.de'),true);
set local role service_role;
select pg_temp.denied_seed($q$select public.ff_dev_seed_member(current_setting('seed.max')::uuid,
  current_setting('seed.approver')::uuid,'90000000-0000-4000-8000-000000000099')$q$);
reset role;
-- An ordinary pending registration must never be adopted, even with a matching email.
update auth.users set raw_app_meta_data='{"provider":"email"}' where id=current_setting('seed.max')::uuid;
set local role service_role;
select pg_temp.denied_seed($q$select public.ff_dev_seed_member(current_setting('seed.max')::uuid,
  current_setting('seed.approver')::uuid,current_setting('seed.run')::uuid)$q$);
reset role;
update auth.users set raw_app_meta_data=jsonb_build_object('provider','email','ff_dev_seed',jsonb_build_object(
  'version','032','project_ref','orxinqhhbtjpkzwlfaxq','run_id',current_setting('seed.run')))
where id=current_setting('seed.max')::uuid;
update auth.users set created_at=clock_timestamp()-interval '1 day' where id=current_setting('seed.max')::uuid;
set local role service_role;
select pg_temp.denied_seed($q$select public.ff_dev_seed_member(current_setting('seed.max')::uuid,
  current_setting('seed.approver')::uuid,current_setting('seed.run')::uuid)$q$);
reset role;
update auth.users set created_at=clock_timestamp() where id=current_setting('seed.max')::uuid;
select set_config('seed.targets',(select jsonb_agg(a.id)::text
  from auth.users a join ff_private.dev_test_members() m on m.email=a.email),true);
set local role service_role;
select public.ff_dev_seed_member(value::uuid,current_setting('seed.approver')::uuid,current_setting('seed.run')::uuid)
from jsonb_array_elements_text(current_setting('seed.targets')::jsonb);
select pg_temp.assert_seed((select count(*)=6 and bool_and(item->>'state'='ready') from
  jsonb_array_elements(public.ff_dev_seed_report(current_setting('seed.approver')::uuid)->'members') item),'six verified approved users with exact roles and units');
select pg_temp.denied_seed($q$select public.ff_dev_seed_member(current_setting('seed.max')::uuid,
  current_setting('seed.approver')::uuid,current_setting('seed.run')::uuid)$q$);
select pg_temp.assert_seed(public.ff_dev_seed_report(current_setting('seed.approver')::uuid)->>'protected_fingerprint'
  =current_setting('seed.baseline'),'existing global administrator and event data unchanged');
reset role;
select pg_temp.assert_seed((select count(*)=6 and bool_and(actor_id is null and reason is not null)
  from public.audit_entries where action='dev_test_member_seeded'),'six explicit trusted-operator audit records');
select set_config('request.jwt.claim.sub',current_setting('seed.max'),true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
select pg_temp.assert_seed((select count(*)=5 from public.profiles),'UNIT_ADMIN RLS sees Scheuren only');
select pg_temp.assert_seed(jsonb_array_length(public.ff_members_workspace()->'members')=5,'UNIT_ADMIN member RPC scope');
select pg_temp.denied_seed($q$select public.ff_set_role(auth.uid(),'GLOBAL_ADMIN')$q$);
select pg_temp.denied_seed($q$select public.ff_set_unit_membership(current_setting('seed.sarah')::uuid,
  current_setting('seed.unit')::uuid,true,'Synthetic foreign seed transfer')$q$);
select public.ff_set_unit_membership(current_setting('seed.thomas')::uuid,current_setting('seed.unit')::uuid,false,'Synthetic seed membership end');
select public.ff_set_unit_membership(current_setting('seed.thomas')::uuid,current_setting('seed.unit')::uuid,true,'Synthetic seed membership restoration');
reset role;
select set_config('request.jwt.claim.sub',current_setting('seed.thomas'),true);
set local role authenticated;
select pg_temp.assert_seed((select count(*)=1 from public.profiles),'MEMBER actual profile RLS is own-only');
select pg_temp.denied_seed('select public.ff_members_workspace()');
select pg_temp.denied_seed($q$select public.ff_dev_seed_report(current_setting('seed.approver')::uuid)$q$);
reset role;
select set_config('request.jwt.claim.sub',current_setting('seed.approver'),true);
set local role authenticated;
select pg_temp.assert_seed(jsonb_array_length(public.ff_members_workspace()->'members')=7,'GLOBAL_ADMIN sees all seeded and existing users');
select pg_temp.denied_seed($q$select public.ff_set_role(auth.uid(),'GLOBAL_ADMIN',null,null,false)$q$);
select pg_temp.denied_seed($q$select public.ff_set_account_status(auth.uid(),'suspended','Synthetic last admin suspension')$q$);
select pg_temp.denied_seed($q$select public.ff_set_unit_membership(auth.uid(),current_setting('seed.unit')::uuid,false,'Synthetic last admin unit end')$q$);
reset role;
rollback;
