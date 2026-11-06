begin;

do $$
begin
  if current_database() <> 'ff_dev_ci' then raise exception 'Disposable CI database required'; end if;
end;
$$;
create function pg_temp.assert_true(value boolean, label text)
returns void language plpgsql as $$
begin
  if value is distinct from true then raise exception 'FAIL: %', label; end if;
  raise notice 'PASS: %', label;
end;
$$;
create function pg_temp.expect_denied(statement text)
returns void language plpgsql as $$
begin
  execute statement;
  raise exception 'FAIL: expected 42501 for %', statement;
exception when insufficient_privilege then
  raise notice 'PASS: denied %', statement;
end;
$$;

select pg_temp.assert_true((select count(*) = 5 from public.units), 'five configurable units');
select pg_temp.assert_true((select count(*) = 1 from public.units where pilot and code = 'scheuren'), 'Scheuren pilot only');
select pg_temp.assert_true(not has_schema_privilege('authenticated', 'public', 'CREATE'), 'authenticated cannot create exposed API objects');
select pg_temp.assert_true(not has_schema_privilege('anon', 'public', 'CREATE'), 'anonymous cannot create exposed API objects');
select set_config('ff.test.unit', (select id::text from public.units where code = 'scheuren'), true);
select set_config('ff.test.other_unit', (select id::text from public.units where code = 'blecher'), true);
select set_config('ff.test.function', (select id::text from public.special_functions where code = 'breathing'), true);

do $$
declare item record; operation text;
begin
  for item in select c.oid, c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
  loop
    perform pg_temp.assert_true(item.relrowsecurity, item.relname || ' RLS enabled');
    foreach operation in array array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'TRIGGER', 'REFERENCES'] loop
      perform pg_temp.assert_true(not has_table_privilege('authenticated', item.oid, operation), item.relname || ' no authenticated ' || operation);
      perform pg_temp.assert_true(not has_table_privilege('anon', item.oid, operation), item.relname || ' no anon ' || operation);
    end loop;
  end loop;
end;
$$;
select pg_temp.assert_true(not has_function_privilege('authenticated', 'ff_private.bootstrap_global_admin(uuid,uuid)', 'EXECUTE'), 'bootstrap is not client callable');
select pg_temp.assert_true(not has_function_privilege('authenticated', 'ff_private.write_audit(text,uuid,uuid,jsonb,jsonb,text)', 'EXECUTE'), 'clients cannot forge audit');
select pg_temp.assert_true(not has_function_privilege('anon', 'public.ff_prepare_attendance(uuid)', 'EXECUTE'), 'RPC is not anonymous');
select pg_temp.assert_true(not has_function_privilege('authenticated', 'ff_private.before_user_created(jsonb)', 'EXECUTE'), 'Auth hook is not client callable');
select pg_temp.assert_true((select reloptions @> array['security_invoker=true'] from pg_class where oid = 'public.confirmed_attendance'::regclass), 'statistics view preserves RLS');

set local role supabase_auth_admin;
select pg_temp.assert_true(ff_private.before_user_created('{"user":{"email":"ci@feuerwehr-odenthal.de","app_metadata":{"provider":"email"}}}') = '{}', 'Auth hook allows exact domain');
select pg_temp.assert_true(ff_private.before_user_created('{"user":{"email":"ci@FEUERWEHR-ODENTHAL.DE","app_metadata":{"provider":"email"}}}') = '{}', 'domain comparison is case insensitive');
select pg_temp.assert_true(ff_private.before_user_created('{"user":{"email":"ci@feuerwehr-odenthal.de.evil.test","app_metadata":{"provider":"email"}}}') -> 'error' is not null, 'lookalike domain rejected');
select pg_temp.assert_true(ff_private.before_user_created('{"user":{"email":"ci@sub.feuerwehr-odenthal.de","app_metadata":{"provider":"email"}}}') -> 'error' is not null, 'subdomain rejected');
select pg_temp.assert_true(ff_private.before_user_created('{"user":{"email":"ci@feuerwehr-odenthal.de","is_anonymous":true,"app_metadata":{"provider":"email"}}}') -> 'error' is not null, 'anonymous identity rejected');
select pg_temp.assert_true(ff_private.before_user_created('{"user":{"email":"ci@feuerwehr-odenthal.de","app_metadata":{"provider":"google"}}}') -> 'error' is not null, 'other provider rejected');
select pg_temp.assert_true(ff_private.before_user_created('{}') -> 'error' is not null, 'missing identity fails closed');
reset role;

select pg_temp.expect_denied($q$insert into auth.users(email) values ('ci@example.test')$q$);
select pg_temp.expect_denied($q$insert into auth.users(email, is_anonymous) values ('ci@feuerwehr-odenthal.de', true)$q$);
insert into auth.users(id, email, email_confirmed_at, raw_user_meta_data)
select ('10000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid,
  'synthetic.ci.' || i || '@feuerwehr-odenthal.de', case when i = 8 then null else clock_timestamp() end,
  jsonb_build_object('display_name', 'Synthetic CI ' || i, 'status', 'approved', 'role', 'GLOBAL_ADMIN')
from generate_series(1, 250) i;
select pg_temp.assert_true((select count(*) = 250 from public.profiles where status = 'pending'), '250 profiles fit and user metadata grants no approval');
select pg_temp.assert_true((select count(*) = 0 from public.role_assignments), 'forged metadata grants no roles');

set local role anon;
select pg_temp.expect_denied('select * from public.events');
select pg_temp.expect_denied('select * from public.profiles');
select pg_temp.expect_denied('select * from public.confirmed_attendance');
select pg_temp.expect_denied('select public.ff_pending_registrations()');
select pg_temp.expect_denied('select public.ff_my_access()');
reset role;

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000007', true);
set local role authenticated;
select pg_temp.assert_true((select count(*) = 1 from public.profiles), 'pending user sees own minimal status only');
select pg_temp.assert_true((select not access_granted and account_status = 'pending'
  and unit_id is null and unit_name is null and cardinality(roles) = 0
  and user_id = auth.uid() from public.ff_my_access()), 'client access status exposes no protected pending data');
select pg_temp.assert_true((select count(*) = 0 from public.units), 'pending cannot read protected lookup data');
select pg_temp.assert_true((select count(*) = 0 from public.events), 'pending cannot read protected events');
select pg_temp.assert_true((select count(*) = 0 from public.role_assignments), 'pending cannot read roles');
select pg_temp.assert_true((select count(*) = 0 from public.audit_entries), 'pending cannot read audit');
select pg_temp.expect_denied('select approved_email from public.profiles');
select pg_temp.expect_denied($q$update public.profiles set status = 'approved' where id = auth.uid()$q$);
select pg_temp.expect_denied($q$select public.ff_set_role(auth.uid(), 'GLOBAL_ADMIN')$q$);
select pg_temp.expect_denied('select public.ff_pending_registrations()');
select pg_temp.expect_denied('select ff_private.bootstrap_global_admin(auth.uid(), current_setting(''ff.test.unit'')::uuid)');
reset role;
select set_config('request.jwt.claim.sub', '', true);
select ff_private.bootstrap_global_admin('10000000-0000-0000-0000-000000000001', current_setting('ff.test.unit')::uuid);
select pg_temp.expect_denied($q$select ff_private.bootstrap_global_admin('10000000-0000-0000-0000-000000000007', current_setting('ff.test.unit')::uuid)$q$);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
set local role authenticated;
select pg_temp.assert_true((select count(*) = 249 from public.ff_pending_registrations()), 'global administration can review registrations');
select pg_temp.assert_true((select access_granted and unit_name = 'Scheuren'
  and 'GLOBAL_ADMIN' = any(roles) from public.ff_my_access()), 'bootstrap admin gets live access and unit');
select pg_temp.expect_denied($q$select public.ff_approve_member('10000000-0000-0000-0000-000000000008', current_setting('ff.test.unit')::uuid)$q$);
select public.ff_approve_member('10000000-0000-0000-0000-000000000002', current_setting('ff.test.unit')::uuid);
select public.ff_approve_member('10000000-0000-0000-0000-000000000003', current_setting('ff.test.unit')::uuid);
select public.ff_approve_member('10000000-0000-0000-0000-000000000004', current_setting('ff.test.other_unit')::uuid);
select public.ff_approve_member('10000000-0000-0000-0000-000000000005', current_setting('ff.test.other_unit')::uuid);
select public.ff_approve_member('10000000-0000-0000-0000-000000000006', current_setting('ff.test.other_unit')::uuid);
select public.ff_approve_member('10000000-0000-0000-0000-000000000009', current_setting('ff.test.unit')::uuid);
select public.ff_set_role('10000000-0000-0000-0000-000000000002', 'UNIT_ADMIN', current_setting('ff.test.unit')::uuid);
select public.ff_set_role('10000000-0000-0000-0000-000000000004', 'FUNCTION_ADMIN', null, current_setting('ff.test.function')::uuid);
select public.ff_set_role('10000000-0000-0000-0000-000000000006', 'FIRE_CHIEF');
select pg_temp.expect_denied($q$select public.ff_set_role('10000000-0000-0000-0000-000000000003', 'MEMBER', null, null, false)$q$);
select pg_temp.expect_denied($q$select public.ff_set_role(auth.uid(), 'GLOBAL_ADMIN', null, null, false)$q$);
select pg_temp.expect_denied($q$select public.ff_set_account_status(auth.uid(), 'suspended', 'Test suspension')$q$);
reset role;

insert into public.function_memberships(user_id, function_id) values
  ('10000000-0000-0000-0000-000000000004', current_setting('ff.test.function')::uuid),
  ('10000000-0000-0000-0000-000000000003', current_setting('ff.test.function')::uuid),
  ('10000000-0000-0000-0000-000000000003', (select id from public.special_functions where code = 'equipment'));
insert into public.event_series(id, title, scope_kind, unit_id, frequency, occurrence_count, local_start, duration_minutes, created_by)
values ('20000000-0000-0000-0000-000000000001', 'Synthetic CI series', 'unit', current_setting('ff.test.unit')::uuid,
  'weekly', 2, timestamp '2026-01-01 19:00', 120, '10000000-0000-0000-0000-000000000002');
insert into public.events(id, title, event_type, starts_at, ends_at, location, scope_kind, unit_id, function_id, organizer_id, series_id, instance_number, status)
select ('30000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid, 'Synthetic CI event ' || i,
  case when i = 8 then 'other'::public.ff_event_type else 'regular'::public.ff_event_type end,
  case when i = 1 then now() + interval '2 hours' when i = 7 then now()
       when i = 8 then timestamptz '2024-12-31 23:30:00+00' else now() - interval '30 minutes' end,
  case when i = 1 then now() + interval '4 hours' when i = 7 then now() + interval '2 hours'
       when i = 8 then timestamptz '2025-01-01 01:30:00+00' else now() + interval '90 minutes' end,
  'Synthetic CI location', case when i = 5 then 'function'::public.ff_scope else 'unit'::public.ff_scope end,
  case when i = 5 then null when i = 4 then current_setting('ff.test.other_unit')::uuid else current_setting('ff.test.unit')::uuid end,
  case when i = 5 then current_setting('ff.test.function')::uuid else null end,
  '10000000-0000-0000-0000-000000000002',
  case when i in (2,3) then '20000000-0000-0000-0000-000000000001'::uuid else null end,
  case when i in (2,3) then i - 1 else null end, case when i = 6 then 'cancelled' else 'scheduled' end
from generate_series(1, 8) i;
insert into public.event_roster(event_id, user_id, unit_snapshot_id, name_snapshot)
select e.id, p.id, m.unit_id, p.display_name from public.events e
cross join public.profiles p join public.unit_memberships m on m.user_id = p.id and m.valid_until is null
where p.id in ('10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003',
  '10000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000009');
insert into public.participation_responses(event_id, user_id, response) values
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003', 'yes'),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000009', 'no'),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000004', 'maybe'),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'yes');
insert into public.document_areas(name, sharepoint_url, scope_kind, unit_id, visibility, created_by)
values ('Synthetic CI members', 'https://synthetic.sharepoint.com/ci', 'unit', current_setting('ff.test.unit')::uuid, 'members', '10000000-0000-0000-0000-000000000002'),
  ('Synthetic CI admins', 'https://synthetic.sharepoint.com/ci', 'unit', current_setting('ff.test.unit')::uuid, 'admins', '10000000-0000-0000-0000-000000000002');

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
set local role authenticated;
set local request.jwt.claims = '{"role":"GLOBAL_ADMIN","user_metadata":{"status":"approved","role":"GLOBAL_ADMIN"}}';
select pg_temp.assert_true(not ff_private.has_role('GLOBAL_ADMIN'), 'JWT metadata is not a role source');
select pg_temp.assert_true((select count(*) = 2 from public.function_memberships where user_id = auth.uid()), 'multiple special functions');
select public.ff_set_response('30000000-0000-0000-0000-000000000001', 'yes');
select pg_temp.expect_denied($q$select public.ff_set_response('30000000-0000-0000-0000-000000000007', 'yes')$q$);
select pg_temp.expect_denied($q$select public.ff_prepare_attendance('30000000-0000-0000-0000-000000000002')$q$);
select pg_temp.expect_denied($q$select public.ff_set_event_delegate('30000000-0000-0000-0000-000000000002', auth.uid())$q$);
select pg_temp.assert_true((select count(*) = 1 from public.document_areas), 'member cannot read admin documents');
select pg_temp.assert_true((select count(*) = 1 from public.event_roster where event_id = '30000000-0000-0000-0000-000000000002'), 'ordinary member sees own roster row only');
select pg_temp.expect_denied('select original_snapshot from public.attendance_confirmations');
reset role;

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', true);
set local role authenticated;
select pg_temp.assert_true(ff_private.can_lead_event('30000000-0000-0000-0000-000000000005'), 'function administrator manages own function');
select pg_temp.assert_true(not ff_private.can_lead_event('30000000-0000-0000-0000-000000000002'), 'function administration is not unit administration');
reset role;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
set local role authenticated;
select pg_temp.assert_true(not ff_private.can_lead_event('30000000-0000-0000-0000-000000000004'), 'unit administrator cannot manage foreign unit');
select pg_temp.expect_denied($q$select public.ff_set_role(auth.uid(), 'GLOBAL_ADMIN')$q$);
select pg_temp.expect_denied($q$select public.ff_set_event_delegate('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000006')$q$);
select pg_temp.expect_denied($q$select public.ff_prepare_attendance('30000000-0000-0000-0000-000000000001')$q$);
select pg_temp.expect_denied($q$select public.ff_prepare_attendance('30000000-0000-0000-0000-000000000006')$q$);
select public.ff_record_attendance('30000000-0000-0000-0000-000000000002', auth.uid(), 'unknown');
select public.ff_set_event_delegate('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003');
reset role;

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
set local role authenticated;
select pg_temp.assert_true(ff_private.can_lead_event('30000000-0000-0000-0000-000000000002'), 'delegate may lead exactly assigned event');
select pg_temp.assert_true(not ff_private.can_lead_event('30000000-0000-0000-0000-000000000003'), 'series sibling is not delegated');
select pg_temp.expect_denied($q$select public.ff_prepare_attendance('30000000-0000-0000-0000-000000000003')$q$);
select pg_temp.assert_true((select count(*) = 5 from public.event_roster where event_id = '30000000-0000-0000-0000-000000000002'), 'delegate sees full roster');
select public.ff_prepare_attendance('30000000-0000-0000-0000-000000000002');
select public.ff_prepare_attendance('30000000-0000-0000-0000-000000000002');
select pg_temp.assert_true((select count(*) = 1 from public.audit_entries where action = 'attendance_prepared'), 'prefill is idempotent and audited once');
select pg_temp.assert_true((select status = 'present' and origin = 'prefill' from public.actual_attendance where event_id = '30000000-0000-0000-0000-000000000002' and user_id = auth.uid()), 'yes maps to provisional present');
select pg_temp.assert_true((select status = 'absent' from public.actual_attendance where event_id = '30000000-0000-0000-0000-000000000002' and user_id = '10000000-0000-0000-0000-000000000009'), 'no maps to absent');
select pg_temp.assert_true((select count(*) = 3 from public.actual_attendance where event_id = '30000000-0000-0000-0000-000000000002' and status = 'unknown'), 'manual unknown, maybe and unanswered stay unknown');
select pg_temp.assert_true((select origin = 'manual' from public.actual_attendance where event_id = '30000000-0000-0000-0000-000000000002' and user_id = '10000000-0000-0000-0000-000000000002'), 'manual value never overwritten');
select pg_temp.assert_true((select count(*) = 0 from public.confirmed_attendance), 'provisional attendance is never final statistics');
select pg_temp.expect_denied($q$select public.ff_confirm_attendance('30000000-0000-0000-0000-000000000002')$q$);
select public.ff_record_attendance('30000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','absent');
select public.ff_record_attendance('30000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000004','absent');
select public.ff_record_attendance('30000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000005','absent');
select public.ff_confirm_attendance('30000000-0000-0000-0000-000000000002');
select public.ff_confirm_attendance('30000000-0000-0000-0000-000000000002');
select pg_temp.assert_true((select count(*) = 1 from public.audit_entries where action = 'attendance_confirmed'), 'confirmation is idempotent');
select pg_temp.assert_true((select count(*) = 1 from public.confirmed_attendance where status = 'present'), 'confirmed attendance counts exactly once');
select pg_temp.assert_true((select training_hours = 2 from public.confirmed_attendance where user_id = auth.uid()), 'confirmed hours use actual presence');
select pg_temp.expect_denied($q$select public.ff_record_attendance('30000000-0000-0000-0000-000000000002', auth.uid(), 'absent')$q$);
select pg_temp.expect_denied($q$select public.ff_record_attendance('30000000-0000-0000-0000-000000000002', auth.uid(), 'absent', '')$q$);
select public.ff_record_attendance('30000000-0000-0000-0000-000000000002', auth.uid(), 'absent', 'Synthetic CI correction');
select pg_temp.assert_true((select count(*) = 1 from public.audit_entries where action = 'attendance_corrected'
  and reason = 'Synthetic CI correction' and before_data ->> 'status' = 'present' and after_data ->> 'status' = 'absent'
  and display_snapshot ->> 'subject_name' = 'Synthetic CI 3'
  and display_snapshot #>> '{event,title}' = 'Synthetic CI event 2'), 'correction preserves actor, person, reason, before/after and readable event');
select pg_temp.assert_true((select count(*) = 0 from public.confirmed_attendance where status = 'present'), 'corrections update confirmed results');
select pg_temp.expect_denied($q$update public.audit_entries set reason = 'forged'$q$);
reset role;

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
set local role authenticated;
select public.ff_set_event_delegate('30000000-0000-0000-0000-000000000002', null);
select public.ff_record_attendance('30000000-0000-0000-0000-000000000008', '10000000-0000-0000-0000-000000000003', 'present');
select pg_temp.expect_denied($q$select public.ff_confirm_attendance('30000000-0000-0000-0000-000000000008')$q$);
select public.ff_record_attendance('30000000-0000-0000-0000-000000000008',user_id,'absent')
from public.event_roster where event_id='30000000-0000-0000-0000-000000000008' and user_id<>'10000000-0000-0000-0000-000000000003';
select public.ff_confirm_attendance('30000000-0000-0000-0000-000000000008');
select pg_temp.assert_true((select report_year = 2025 from public.confirmed_attendance where event_id = '30000000-0000-0000-0000-000000000008' and user_id = '10000000-0000-0000-0000-000000000003'), 'year follows Berlin, not UTC');
reset role;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
set local role authenticated;
select pg_temp.assert_true(not ff_private.can_lead_event('30000000-0000-0000-0000-000000000002'), 'revocation effective with existing identity');
select pg_temp.expect_denied($q$select public.ff_record_attendance('30000000-0000-0000-0000-000000000002', auth.uid(), 'present', 'Synthetic reason')$q$);
select pg_temp.assert_true((select count(*) = 1 from public.event_roster where event_id = '30000000-0000-0000-0000-000000000002'), 'revocation also removes broad roster access');
select pg_temp.assert_true((select count(*) = 0 from public.confirmed_attendance where user_id <> auth.uid()), 'member statistics do not leak other attendance');
reset role;

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000006', true);
set local role authenticated;
select pg_temp.assert_true((select count(*) = 8 from public.events), 'FIRE_CHIEF has organizational read oversight');
select pg_temp.assert_true(not ff_private.can_lead_event('30000000-0000-0000-0000-000000000002'), 'FIRE_CHIEF is not a write administrator');
select pg_temp.expect_denied('select public.ff_pending_registrations()');
select pg_temp.expect_denied($q$select public.ff_set_role(auth.uid(), 'GLOBAL_ADMIN')$q$);
reset role;

update public.unit_memberships set valid_until = clock_timestamp() where user_id = '10000000-0000-0000-0000-000000000009' and valid_until is null;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000009', true);
set local role authenticated;
select pg_temp.assert_true(not ff_private.is_active(), 'approval without a current unit does not grant access');
select pg_temp.assert_true((select not access_granted and account_status = 'approved'
  and unit_id is null and cardinality(roles) = 0 from public.ff_my_access()), 'client gate detects missing current unit despite approved profile');
select pg_temp.assert_true((select count(*) = 0 from public.events), 'unit assignment is a live access requirement');
reset role;
update public.unit_memberships set valid_until = null where user_id = '10000000-0000-0000-0000-000000000009';

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
set local role authenticated;
select public.ff_set_role('10000000-0000-0000-0000-000000000004', 'FUNCTION_ADMIN', null, current_setting('ff.test.function')::uuid, false);
reset role;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', true);
set local role authenticated;
select pg_temp.assert_true(not ff_private.can_lead_event('30000000-0000-0000-0000-000000000005'), 'role revocation uses live assignments, not existing JWT metadata');
reset role;
update auth.users set banned_until = clock_timestamp() + interval '1 hour' where id = '10000000-0000-0000-0000-000000000006';
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000006', true);
set local role authenticated;
select pg_temp.assert_true((select count(*) = 0 from public.events), 'Auth ban removes organizational access with the same identity');
select pg_temp.assert_true((select not access_granted from public.ff_my_access()), 'client gate respects live Auth ban');
reset role;

update auth.users set email = 'changed@feuerwehr-odenthal.de' where id = '10000000-0000-0000-0000-000000000005';
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000005', true);
set local role authenticated;
select pg_temp.assert_true(not ff_private.is_active(), 'verified email change still requires explicit reapproval');
select pg_temp.assert_true((select not access_granted and cardinality(roles) = 0 from public.ff_my_access()), 'client gate detects email change with old JWT');
select pg_temp.assert_true((select count(*) = 0 from public.events), 'email change removes protected access with same JWT');
reset role;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
set local role authenticated;
select public.ff_set_account_status('10000000-0000-0000-0000-000000000003', 'suspended', 'Synthetic CI suspension');
reset role;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
set local role authenticated;
select pg_temp.assert_true((select count(*) = 0 from public.confirmed_attendance), 'suspension immediately removes protected reads');
select pg_temp.assert_true((select not access_granted and account_status = 'suspended'
  from public.ff_my_access()), 'client gate reports live suspension');
select pg_temp.expect_denied($q$select public.ff_set_response('30000000-0000-0000-0000-000000000001', 'yes')$q$);
reset role;
select pg_temp.expect_denied('update public.audit_entries set reason = ''overwrite''');
select pg_temp.expect_denied('delete from public.attendance_confirmations');

\echo 'Supabase DEV authorization suite passed; rolling back synthetic fixtures.'
rollback;
