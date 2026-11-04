begin;

-- Only the isolated DEV operator can provision this fixed, synthetic manifest.
create function ff_private.dev_test_members()
returns table(email text, display_name text, role public.ff_role, unit_code text)
language sql immutable set search_path = '' as $$
  values
    ('max.test@feuerwehr-odenthal.de', 'Max Mustermann', 'UNIT_ADMIN'::public.ff_role, 'scheuren'),
    ('anna.test@feuerwehr-odenthal.de', 'Anna Becker', 'UNIT_ADMIN'::public.ff_role, 'scheuren'),
    ('thomas.test@feuerwehr-odenthal.de', 'Thomas Weber', 'MEMBER'::public.ff_role, 'scheuren'),
    ('lisa.test@feuerwehr-odenthal.de', 'Lisa Müller', 'MEMBER'::public.ff_role, 'scheuren'),
    ('peter.test@feuerwehr-odenthal.de', 'Peter Schneider', 'UNIT_ADMIN'::public.ff_role, 'odenthal'),
    ('sarah.test@feuerwehr-odenthal.de', 'Sarah Fischer', 'MEMBER'::public.ff_role, 'odenthal');
$$;

create function ff_private.require_dev_seed_operator(approver_id uuid)
returns void language plpgsql set search_path = '' as $$
begin
  perform ff_private.require_rule(auth.role() = 'service_role' and auth.uid() is null,
    'Server-only DEV seed credentials required');
  perform ff_private.require_rule(ff_private.is_approved_user(approver_id) and exists (
    select 1 from public.role_assignments where user_id=approver_id and role='GLOBAL_ADMIN' and revoked_at is null
  ), 'Explicit active GLOBAL_ADMIN approval required');
  perform ff_private.require_rule((select count(*)=2 from public.units where code in ('scheuren','odenthal')),
    'DEV seed units missing');
end;
$$;

create function public.ff_dev_seed_report(approver_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform ff_private.require_dev_seed_operator(approver_id);
  return jsonb_build_object(
    'policy_project_ref','orxinqhhbtjpkzwlfaxq',
    'environment','isolated-dev',
    'members',(select jsonb_agg(jsonb_build_object(
      'email',m.email,'display_name',m.display_name,'role',m.role,'unit_code',m.unit_code,'unit_id',u.id,
      'user_id',a.id,
      'state',case when a.id is null then 'missing' when
        a.raw_app_meta_data->'ff_dev_seed'->>'version'='032'
        and a.raw_app_meta_data->'ff_dev_seed'->>'project_ref'='orxinqhhbtjpkzwlfaxq'
        and p.display_name=m.display_name and ff_private.is_approved_user(a.id)
        and (select count(*)=1 from public.unit_memberships where user_id=a.id and valid_until is null and unit_id=u.id)
        and (select count(*)=case when m.role='UNIT_ADMIN' then 2 else 1 end
          from public.role_assignments where user_id=a.id and revoked_at is null)
        and exists(select 1 from public.role_assignments where user_id=a.id and role='MEMBER' and revoked_at is null)
        and (m.role='MEMBER' or exists(select 1 from public.role_assignments where user_id=a.id
          and role='UNIT_ADMIN' and unit_id=u.id and revoked_at is null))
        and not exists(select 1 from public.function_memberships where user_id=a.id and valid_until is null)
        then 'ready' else 'conflict' end
    ) order by m.email) from ff_private.dev_test_members() m join public.units u on u.code=m.unit_code
      left join auth.users a on lower(a.email)=m.email left join public.profiles p on p.id=a.id),
    'protected_fingerprint',md5(jsonb_build_object(
      'events',(select jsonb_agg(to_jsonb(e) order by e.id) from public.events e),
      'responses',(select jsonb_agg(to_jsonb(r) order by r.event_id,r.user_id) from public.participation_responses r),
      'global_admins',(select jsonb_agg(jsonb_build_object('role',to_jsonb(r),'profile',to_jsonb(p),
        'memberships',(select jsonb_agg(to_jsonb(um) order by um.id) from public.unit_memberships um where um.user_id=r.user_id))
        order by r.id) from public.role_assignments r join public.profiles p on p.id=r.user_id
        where r.role='GLOBAL_ADMIN')
    )::text)
  );
end;
$$;

create function public.ff_dev_seed_member(target_user uuid, approver_id uuid, run_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare identity_row auth.users; profile_row public.profiles; member_row record; target_unit uuid;
begin
  perform pg_advisory_xact_lock(hashtext('ff.role_changes'));
  perform ff_private.require_dev_seed_operator(approver_id);
  perform ff_private.require_rule(run_id is not null, 'Seed run identifier required');
  select * into identity_row from auth.users where id=target_user for update;
  select * into member_row from ff_private.dev_test_members() where email=lower(identity_row.email);
  perform ff_private.require_rule(found, 'Fixed synthetic DEV manifest required');
  select * into profile_row from public.profiles where id=target_user for update;
  perform ff_private.require_rule(
    profile_row.status='pending' and profile_row.display_name=member_row.display_name
    and identity_row.email_confirmed_at is not null and not coalesce(identity_row.is_anonymous,false)
    and identity_row.deleted_at is null and identity_row.banned_until is null
    and identity_row.created_at >= clock_timestamp()-interval '10 minutes'
    and profile_row.created_at >= clock_timestamp()-interval '10 minutes'
    and identity_row.raw_app_meta_data->'ff_dev_seed'=jsonb_build_object(
      'version','032','project_ref','orxinqhhbtjpkzwlfaxq','run_id',run_id::text)
    and not exists(select 1 from public.unit_memberships where user_id=target_user)
    and not exists(select 1 from public.role_assignments where user_id=target_user)
    and not exists(select 1 from public.function_memberships where user_id=target_user)
    and not exists(select 1 from public.audit_entries where subject_id=target_user),
    'Only fresh unconfigured Auth Admin seed accounts may be initialized');
  select id into target_unit from public.units where code=member_row.unit_code;
  update public.profiles set status='approved',approved_at=clock_timestamp(),
    approved_by=approver_id,approved_email=lower(identity_row.email) where id=target_user;
  insert into public.unit_memberships(user_id,unit_id) values(target_user,target_unit);
  insert into public.role_assignments(user_id,role,granted_by) values(target_user,'MEMBER',approver_id);
  if member_row.role='UNIT_ADMIN' then
    insert into public.role_assignments(user_id,role,unit_id,granted_by)
      values(target_user,'UNIT_ADMIN',target_unit,approver_id);
  end if;
  perform ff_private.write_audit('dev_test_member_seeded',null,target_user,
    jsonb_build_object('status','pending'),
    jsonb_build_object('status','approved','unit_id',target_unit,'role',member_row.role,
      'approved_by',approver_id,'run_id',run_id,'project_ref','orxinqhhbtjpkzwlfaxq'),
    'Manual isolated DEV seed via Auth Admin API; trusted operator, not a member login');
end;
$$;

revoke all on function ff_private.dev_test_members() from public,anon,authenticated,service_role;
revoke all on function ff_private.require_dev_seed_operator(uuid) from public,anon,authenticated,service_role;
revoke all on function public.ff_dev_seed_report(uuid) from public,anon,authenticated,service_role;
revoke all on function public.ff_dev_seed_member(uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.ff_dev_seed_report(uuid) to service_role;
grant execute on function public.ff_dev_seed_member(uuid,uuid,uuid) to service_role;

commit;
