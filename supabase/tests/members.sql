begin;
do $$ begin if current_database()<>'ff_dev_ci' then raise exception 'Disposable CI database required'; end if; end $$;
create function pg_temp.assert_member(value boolean,label text) returns void language plpgsql as $$
begin if value is distinct from true then raise exception 'FAIL: %',label; end if; raise notice 'PASS: %',label; end $$;
create function pg_temp.denied_member(statement text) returns void language plpgsql as $$
begin execute statement; raise exception 'FAIL: permission denial required'; exception when insufficient_privilege then raise notice 'PASS: denied %',statement; end $$;
select set_config('members.unit',(select id::text from public.units where code='scheuren'),true);
select set_config('members.other',(select id::text from public.units where code='blecher'),true);
select set_config('members.function',(select id::text from public.special_functions order by code limit 1),true);
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
select ('80000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
  'synthetic.members.'||i||'@feuerwehr-odenthal.de',clock_timestamp(),
  jsonb_build_object('display_name','Synthetic Managed Member '||i) from generate_series(1,6) i;
select ff_private.bootstrap_global_admin('80000000-0000-4000-8000-000000000001',current_setting('members.unit')::uuid);
select set_config('request.jwt.claim.sub','80000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select public.ff_approve_member('80000000-0000-4000-8000-000000000002',current_setting('members.unit')::uuid);
select public.ff_approve_member('80000000-0000-4000-8000-000000000003',current_setting('members.unit')::uuid);
select public.ff_approve_member('80000000-0000-4000-8000-000000000004',current_setting('members.other')::uuid);
select public.ff_approve_member('80000000-0000-4000-8000-000000000005',current_setting('members.unit')::uuid);
select public.ff_set_role('80000000-0000-4000-8000-000000000003','UNIT_ADMIN',current_setting('members.unit')::uuid);
select pg_temp.assert_member(jsonb_array_length(public.ff_members_workspace()->'members')=6,'global list includes pending and existing profiles');
select set_config('members.event',public.ff_create_single_event(jsonb_build_object(
  'title','Synthetic historical roster','location','Synthetic location','description','','event_type','regular',
  'unit_id',current_setting('members.unit')::uuid,'starts_at',clock_timestamp()+interval '1 day',
  'ends_at',clock_timestamp()+interval '1 day 1 hour'))::text,true);
select public.ff_set_unit_membership('80000000-0000-4000-8000-000000000002',current_setting('members.other')::uuid,true,'Synthetic global transfer');
select pg_temp.assert_member((select unit_id=current_setting('members.other')::uuid from public.unit_memberships
  where user_id='80000000-0000-4000-8000-000000000002' and valid_until is null),'global transfer sets one current unit');
select pg_temp.assert_member((select count(*)=2 from public.unit_memberships where user_id='80000000-0000-4000-8000-000000000002'),'membership history retained');
select pg_temp.assert_member((select unit_snapshot_id=current_setting('members.unit')::uuid from public.event_roster
  where event_id=current_setting('members.event')::uuid and user_id='80000000-0000-4000-8000-000000000002'),'old roster snapshot unchanged');
select public.ff_set_function_membership('80000000-0000-4000-8000-000000000002',current_setting('members.function')::uuid,true,'Synthetic function assignment');
select public.ff_set_role('80000000-0000-4000-8000-000000000002','UNIT_ADMIN',current_setting('members.other')::uuid);
reset role;
select set_config('request.jwt.claim.sub','80000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select pg_temp.assert_member(jsonb_array_length(public.ff_members_workspace()->'units')=1,'new unit role enforced live');
select pg_temp.assert_member((select count(*)=1 from public.function_memberships where user_id=auth.uid() and valid_until is null),'function assignment visible through RLS');
select pg_temp.denied_member($q$select public.ff_set_role(auth.uid(),'GLOBAL_ADMIN')$q$);
select pg_temp.denied_member($q$select public.ff_set_account_status('80000000-0000-4000-8000-000000000004','suspended','Synthetic forbidden status')$q$);
select pg_temp.denied_member($q$select public.ff_set_function_membership(auth.uid(),current_setting('members.function')::uuid,false,'Synthetic forbidden change')$q$);
select pg_temp.denied_member($q$select public.ff_set_unit_membership('80000000-0000-4000-8000-000000000001',current_setting('members.other')::uuid,true,'Synthetic foreign transfer')$q$);
reset role;
select set_config('request.jwt.claim.sub','80000000-0000-4000-8000-000000000003',true);
set local role authenticated;
select pg_temp.assert_member(jsonb_array_length(public.ff_members_workspace()->'members')=3,'unit manager sees own members, not transferred or pending outsiders');
select pg_temp.denied_member($q$select public.ff_set_unit_membership('80000000-0000-4000-8000-000000000002',current_setting('members.unit')::uuid,true,'Synthetic foreign reclaim')$q$);
select pg_temp.denied_member($q$select public.ff_set_unit_membership('80000000-0000-4000-8000-000000000001',current_setting('members.unit')::uuid,false,'Synthetic privileged change')$q$);
select public.ff_set_unit_membership('80000000-0000-4000-8000-000000000005',current_setting('members.unit')::uuid,false,'Synthetic local membership end');
select pg_temp.assert_member(jsonb_array_length(public.ff_members_workspace()->'members')=3,'former local member remains available for restoration');
select public.ff_set_unit_membership('80000000-0000-4000-8000-000000000005',current_setting('members.unit')::uuid,true,'Synthetic local restoration');
reset role;
select set_config('request.jwt.claim.sub','80000000-0000-4000-8000-000000000005',true);
set local role authenticated;
select pg_temp.denied_member('select public.ff_members_workspace()');
select pg_temp.denied_member($q$select public.ff_set_unit_membership(auth.uid(),current_setting('members.other')::uuid,true,'Synthetic self transfer')$q$);
select pg_temp.denied_member($q$update public.unit_memberships set valid_until=clock_timestamp() where user_id=auth.uid()$q$);
reset role;
select set_config('request.jwt.claim.sub','80000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select public.ff_set_role('80000000-0000-4000-8000-000000000002','UNIT_ADMIN',current_setting('members.other')::uuid,null,false);
select public.ff_set_account_status('80000000-0000-4000-8000-000000000002','suspended','Synthetic suspension');
reset role;
select set_config('request.jwt.claim.sub','80000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select pg_temp.denied_member('select public.ff_members_workspace()');
select pg_temp.denied_member('select public.ff_events_workspace()');
reset role;
select set_config('request.jwt.claim.sub','80000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select public.ff_reactivate_member('80000000-0000-4000-8000-000000000002','Synthetic reactivation');
select public.ff_set_function_membership('80000000-0000-4000-8000-000000000002',current_setting('members.function')::uuid,false,'Synthetic function removal');
select pg_temp.assert_member((select count(*)=2 from public.audit_entries where subject_id='80000000-0000-4000-8000-000000000002'
  and action in ('account_status_changed','account_reactivated')),'deactivation and reactivation audited');
select pg_temp.denied_member($q$select public.ff_set_role(auth.uid(),'GLOBAL_ADMIN',null,null,false)$q$);
select pg_temp.denied_member($q$select public.ff_set_account_status(auth.uid(),'suspended','Synthetic last admin suspension')$q$);
select pg_temp.denied_member($q$select public.ff_set_unit_membership(auth.uid(),current_setting('members.unit')::uuid,false,'Synthetic last admin membership')$q$);
select pg_temp.denied_member($q$select public.ff_set_unit_membership('80000000-0000-4000-8000-000000000006',current_setting('members.unit')::uuid,true,'Synthetic pending bypass')$q$);
select pg_temp.denied_member($q$select public.ff_set_unit_membership('80000000-0000-4000-8000-000000000005',current_setting('members.unit')::uuid,null,'Synthetic null action')$q$);
reset role;
update auth.users set email='synthetic.changed@feuerwehr-odenthal.de' where id='80000000-0000-4000-8000-000000000002';
select set_config('request.jwt.claim.sub','80000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select public.ff_set_account_status('80000000-0000-4000-8000-000000000002','suspended','Synthetic changed email');
select pg_temp.denied_member($q$select public.ff_reactivate_member('80000000-0000-4000-8000-000000000002','Synthetic invalid reactivation')$q$);
reset role;
set local role anon;
select pg_temp.denied_member('select public.ff_members_workspace()');
reset role;
rollback;
