begin;

create function ff_private.require_rule(allowed boolean, message text)
returns void language plpgsql set search_path = '' as $$
begin
  if allowed is distinct from true then
    raise exception '%', message using errcode = '42501';
  end if;
end;
$$;
create function ff_private.write_audit(
  action_name text, target_event uuid, target_user uuid,
  before_value jsonb, after_value jsonb, correction_reason text default null
)
returns void language sql security definer set search_path = '' as $$
  insert into public.audit_entries(actor_id, event_id, subject_id, action, before_data, after_data, reason, display_snapshot)
  values (auth.uid(), target_event, target_user, action_name, before_value, after_value, correction_reason,
    jsonb_build_object(
      'actor_name', coalesce((select display_name from public.profiles where id = auth.uid()), 'Vertrauenswürdige DEV-Einrichtung'),
      'subject_name', (select display_name from public.profiles where id = target_user),
      'event', (select jsonb_build_object('title', e.title, 'starts_at', e.starts_at, 'time_zone', 'Europe/Berlin',
        'scope_name', coalesce(u.name, f.name, 'Alle Einheiten'))
        from public.events e left join public.units u on u.id = e.unit_id
        left join public.special_functions f on f.id = e.function_id where e.id = target_event)
    ));
$$;
create function ff_private.prevent_history_change()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'History in % is append-only', tg_table_name using errcode = '42501';
end;
$$;
create trigger ff_immutable_audit before update or delete on public.audit_entries
for each row execute function ff_private.prevent_history_change();
create trigger ff_immutable_confirmation before update or delete on public.attendance_confirmations
for each row execute function ff_private.prevent_history_change();

create function ff_private.bootstrap_global_admin(target_user uuid, target_unit uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare verified_email text;
begin
  perform pg_advisory_xact_lock(hashtext('ff.role_changes'));
  perform ff_private.require_rule(not exists (select 1 from public.role_assignments where role = 'GLOBAL_ADMIN'), 'Bootstrap already used');
  perform 1 from public.profiles where id = target_user and status = 'pending' for update;
  perform ff_private.require_rule(found, 'Pending profile required');
  select lower(email) into verified_email from auth.users where id = target_user and email_confirmed_at is not null
    and email ~* '^[^@[:space:]]+@feuerwehr-odenthal\.de$' and not coalesce(is_anonymous, false)
    and deleted_at is null and (banned_until is null or banned_until <= now());
  perform ff_private.require_rule(verified_email is not null and exists (select 1 from public.units where id = target_unit), 'Verified email and existing unit required');
  update public.profiles set status = 'approved', approved_at = clock_timestamp(), approved_by = target_user, approved_email = verified_email where id = target_user;
  insert into public.unit_memberships(user_id, unit_id) values (target_user, target_unit);
  insert into public.role_assignments(user_id, role, granted_by) values (target_user, 'MEMBER', target_user), (target_user, 'GLOBAL_ADMIN', target_user);
  perform ff_private.write_audit('dev_bootstrap', null, target_user, null, jsonb_build_object('unit_id', target_unit, 'role', 'GLOBAL_ADMIN'));
end;
$$;
create function public.ff_pending_registrations()
returns table(user_id uuid, display_name text, email text, email_verified boolean, registered_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  perform ff_private.require_rule(ff_private.has_role('GLOBAL_ADMIN'), 'Global administration required');
  return query select p.id, p.display_name, u.email::text, u.email_confirmed_at is not null, p.created_at
    from public.profiles p join auth.users u on u.id = p.id
    where p.status = 'pending' or (p.status = 'approved' and p.approved_email is distinct from lower(u.email));
end;
$$;
create function public.ff_approve_member(target_user uuid, target_unit uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare previous public.profiles; verified_email text;
begin
  perform ff_private.require_rule(ff_private.has_role('GLOBAL_ADMIN'), 'Global administration required');
  select * into previous from public.profiles where id = target_user for update;
  select lower(email) into verified_email from auth.users where id = target_user and email_confirmed_at is not null
    and email ~* '^[^@[:space:]]+@feuerwehr-odenthal\.de$' and not coalesce(is_anonymous, false)
    and deleted_at is null and (banned_until is null or banned_until <= now());
  perform ff_private.require_rule(verified_email is not null and (
    previous.status = 'pending' or (previous.status = 'approved' and previous.approved_email is distinct from verified_email)
  ), 'Verified pending registration required');
  perform ff_private.require_rule(exists (select 1 from public.units where id = target_unit), 'Existing unit required');
  update public.profiles set status = 'approved', approved_at = clock_timestamp(), approved_by = auth.uid(), approved_email = verified_email where id = target_user;
  update public.unit_memberships set valid_until = clock_timestamp() where user_id = target_user and valid_until is null and unit_id <> target_unit;
  insert into public.unit_memberships(user_id, unit_id)
    select target_user, target_unit where not exists (select 1 from public.unit_memberships where user_id = target_user and valid_until is null);
  insert into public.role_assignments(user_id, role, granted_by)
    select target_user, 'MEMBER', auth.uid() where not exists (
      select 1 from public.role_assignments where user_id = target_user and role = 'MEMBER' and revoked_at is null
    );
  perform ff_private.write_audit('member_approved', null, target_user,
    jsonb_build_object('status', previous.status), jsonb_build_object('status', 'approved', 'unit_id', target_unit));
end;
$$;
create function public.ff_set_account_status(target_user uuid, next_status public.ff_account_status, reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare previous public.ff_account_status;
begin
  perform pg_advisory_xact_lock(hashtext('ff.role_changes'));
  perform ff_private.require_rule(ff_private.has_role('GLOBAL_ADMIN'), 'Global administration required');
  perform ff_private.require_rule(next_status in ('pending', 'rejected', 'suspended') and length(btrim(reason)) between 5 and 2000, 'Non-approved status and reason required');
  select status into previous from public.profiles where id = target_user for update;
  perform ff_private.require_rule(found, 'Profile not found');
  if ff_private.is_approved_user(target_user) and exists (
    select 1 from public.role_assignments where user_id = target_user and role = 'GLOBAL_ADMIN' and revoked_at is null
  ) then
    perform ff_private.require_rule((select count(*) from public.role_assignments
      where role = 'GLOBAL_ADMIN' and revoked_at is null and ff_private.is_approved_user(user_id)) > 1, 'Last global administrator must remain active');
  end if;
  update public.profiles set status = next_status where id = target_user;
  perform ff_private.write_audit('account_status_changed', null, target_user,
    jsonb_build_object('status', previous), jsonb_build_object('status', next_status), reason);
end;
$$;
create function public.ff_set_role(
  target_user uuid, wanted_role public.ff_role, target_unit uuid default null,
  target_function uuid default null, assign boolean default true
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtext('ff.role_changes'));
  perform ff_private.require_rule(ff_private.has_role('GLOBAL_ADMIN'), 'Global administration required');
  perform 1 from public.profiles where id = target_user for update;
  perform ff_private.require_rule(found and assign is not null, 'Existing profile and assignment flag required');
  perform ff_private.require_rule(wanted_role <> 'MEMBER' or assign, 'Base membership is controlled by account approval');
  perform ff_private.require_rule(
    (wanted_role in ('MEMBER', 'FIRE_CHIEF', 'GLOBAL_ADMIN') and target_unit is null and target_function is null) or
    (wanted_role = 'UNIT_ADMIN' and target_unit is not null and target_function is null) or
    (wanted_role = 'FUNCTION_ADMIN' and target_function is not null and target_unit is null), 'Invalid role scope'
  );
  if assign then
    perform ff_private.require_rule(ff_private.is_approved_user(target_user), 'Approved member required');
    insert into public.role_assignments(user_id, role, unit_id, function_id, granted_by)
      select target_user, wanted_role, target_unit, target_function, auth.uid()
      where not exists (select 1 from public.role_assignments where user_id = target_user and role = wanted_role
        and unit_id is not distinct from target_unit and function_id is not distinct from target_function and revoked_at is null);
  else
    if wanted_role = 'GLOBAL_ADMIN' and ff_private.is_approved_user(target_user) and exists (
      select 1 from public.role_assignments where user_id = target_user and role = 'GLOBAL_ADMIN' and revoked_at is null
    ) then
      perform ff_private.require_rule((select count(*) from public.role_assignments
        where role = 'GLOBAL_ADMIN' and revoked_at is null and ff_private.is_approved_user(user_id)) > 1, 'Last global administrator must remain active');
    end if;
    update public.role_assignments set revoked_at = clock_timestamp() where user_id = target_user and role = wanted_role
      and unit_id is not distinct from target_unit and function_id is not distinct from target_function and revoked_at is null;
  end if;
  perform ff_private.write_audit('role_assignment_changed', null, target_user, null,
    jsonb_build_object('role', wanted_role, 'unit_id', target_unit, 'function_id', target_function, 'assigned', assign));
end;
$$;

create function public.ff_set_event_delegate(target_event uuid, target_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare item public.events; previous_user uuid;
begin
  select * into item from public.events where id = target_event for update;
  perform ff_private.require_rule(found and ff_private.manages_scope(item.scope_kind, item.unit_id, item.function_id), 'Responsible scope administration required');
  if target_user is not null then
    perform ff_private.require_rule(item.status <> 'cancelled' and ff_private.is_approved_user(target_user) and exists (
      select 1 from public.event_roster where event_id = target_event and user_id = target_user
    ), 'Approved roster member required');
  end if;
  select user_id into previous_user from public.event_delegations where event_id = target_event and revoked_at is null;
  if previous_user is not distinct from target_user then return; end if;
  update public.event_delegations set revoked_at = clock_timestamp() where event_id = target_event and revoked_at is null;
  if target_user is not null then
    insert into public.event_delegations(event_id, user_id, assigned_by) values (target_event, target_user, auth.uid());
  end if;
  perform ff_private.write_audit('event_delegation_changed', target_event, target_user,
    jsonb_build_object('user_id', previous_user, 'name', (select display_name from public.profiles where id = previous_user)),
    jsonb_build_object('user_id', target_user, 'name', (select display_name from public.profiles where id = target_user)));
end;
$$;
create function public.ff_set_response(target_event uuid, answer public.ff_response)
returns void language plpgsql security definer set search_path = '' as $$
declare item public.events; previous public.ff_response;
begin
  select * into item from public.events where id = target_event for update;
  perform ff_private.require_rule(found and ff_private.is_active() and exists (
    select 1 from public.event_roster where event_id = target_event and user_id = auth.uid()
  ), 'Approved roster member required');
  perform ff_private.require_rule(answer is not null and item.status = 'scheduled' and clock_timestamp() < item.starts_at
    and (item.response_deadline is null or clock_timestamp() < item.response_deadline), 'Response deadline reached or event unavailable');
  select response into previous from public.participation_responses where event_id = target_event and user_id = auth.uid();
  insert into public.participation_responses(event_id, user_id, response) values (target_event, auth.uid(), answer)
    on conflict (event_id, user_id) do update set response = excluded.response, updated_at = clock_timestamp();
  perform ff_private.write_audit('response_changed', target_event, auth.uid(), to_jsonb(previous), to_jsonb(answer));
end;
$$;
create function ff_private.lock_attendance_event(target uuid)
returns public.events language plpgsql security definer set search_path = '' as $$
declare item public.events;
begin
  select * into item from public.events where id = target for update;
  perform ff_private.require_rule(found and ff_private.can_lead_event(target), 'Event administration or current delegation required');
  perform ff_private.require_rule(item.status = 'scheduled' and clock_timestamp() >= item.starts_at, 'Attendance requires a started, non-cancelled event');
  return item;
end;
$$;
create function public.ff_prepare_attendance(target_event uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare item public.events; prepared_count integer;
begin
  item := ff_private.lock_attendance_event(target_event);
  perform ff_private.require_rule(item.event_type in ('regular', 'special'), 'Prefill is only available for practices');
  if item.attendance_prepared_at is not null or exists (select 1 from public.attendance_confirmations where event_id = target_event) then return; end if;
  insert into public.actual_attendance(event_id, user_id, status, origin, recorded_by)
    select r.event_id, r.user_id,
      (case p.response when 'yes' then 'present' when 'no' then 'absent' else 'unknown' end)::public.ff_attendance,
      'prefill', auth.uid()
    from public.event_roster r left join public.participation_responses p on p.event_id = r.event_id and p.user_id = r.user_id
    where r.event_id = target_event on conflict (event_id, user_id) do nothing;
  get diagnostics prepared_count = row_count;
  update public.events set attendance_prepared_at = clock_timestamp() where id = target_event;
  perform ff_private.write_audit('attendance_prepared', target_event, null, null, jsonb_build_object('provisional', true, 'inserted', prepared_count));
end;
$$;
create function public.ff_record_attendance(target_event uuid, target_user uuid, attendance_status public.ff_attendance, reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare item public.events; previous jsonb; confirmed boolean;
begin
  item := ff_private.lock_attendance_event(target_event);
  perform ff_private.require_rule(attendance_status is not null and exists (
    select 1 from public.event_roster where event_id = target_event and user_id = target_user
  ), 'Roster member and attendance value required');
  select exists (select 1 from public.attendance_confirmations where event_id = target_event) into confirmed;
  perform ff_private.require_rule(not confirmed or length(btrim(reason)) between 5 and 2000, 'Confirmed lists require a correction reason');
  select to_jsonb(a) into previous from public.actual_attendance a where event_id = target_event and user_id = target_user;
  insert into public.actual_attendance(event_id, user_id, status, origin, recorded_by)
    values (target_event, target_user, attendance_status, 'manual', auth.uid())
    on conflict (event_id, user_id) do update set status = excluded.status, origin = 'manual',
      recorded_by = auth.uid(), recorded_at = clock_timestamp();
  perform ff_private.write_audit(case when confirmed then 'attendance_corrected' else 'attendance_recorded' end,
    target_event, target_user, previous, jsonb_build_object('status', attendance_status, 'origin', 'manual'), reason);
end;
$$;
create function public.ff_confirm_attendance(target_event uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare item public.events; snapshot jsonb;
begin
  item := ff_private.lock_attendance_event(target_event);
  if exists (select 1 from public.attendance_confirmations where event_id = target_event) then return; end if;
  perform ff_private.require_rule(item.event_type not in ('regular', 'special') or item.attendance_prepared_at is not null, 'Review provisional preparation before confirmation');
  insert into public.actual_attendance(event_id, user_id, status, origin, recorded_by)
    select event_id, user_id, 'unknown', 'manual', auth.uid() from public.event_roster
    where event_id = target_event on conflict (event_id, user_id) do nothing;
  select coalesce(jsonb_agg(jsonb_build_object('user_id', a.user_id, 'name', r.name_snapshot,
    'status', a.status, 'origin', a.origin) order by a.user_id), '[]'::jsonb) into snapshot
    from public.actual_attendance a join public.event_roster r using (event_id, user_id) where a.event_id = target_event;
  insert into public.attendance_confirmations(event_id, confirmed_by, original_snapshot) values (target_event, auth.uid(), snapshot);
  perform ff_private.write_audit('attendance_confirmed', target_event, null, null, snapshot);
end;
$$;

revoke all on function ff_private.require_rule(boolean, text),
  ff_private.write_audit(text, uuid, uuid, jsonb, jsonb, text), ff_private.prevent_history_change(),
  ff_private.bootstrap_global_admin(uuid, uuid), ff_private.lock_attendance_event(uuid)
  from public, anon, authenticated;

revoke all on function public.ff_pending_registrations(), public.ff_approve_member(uuid, uuid),
  public.ff_set_account_status(uuid, public.ff_account_status, text),
  public.ff_set_role(uuid, public.ff_role, uuid, uuid, boolean), public.ff_set_event_delegate(uuid, uuid),
  public.ff_set_response(uuid, public.ff_response), public.ff_prepare_attendance(uuid),
  public.ff_record_attendance(uuid, uuid, public.ff_attendance, text), public.ff_confirm_attendance(uuid)
  from public, anon, authenticated;
grant execute on function public.ff_pending_registrations(), public.ff_approve_member(uuid, uuid),
  public.ff_set_account_status(uuid, public.ff_account_status, text),
  public.ff_set_role(uuid, public.ff_role, uuid, uuid, boolean), public.ff_set_event_delegate(uuid, uuid),
  public.ff_set_response(uuid, public.ff_response), public.ff_prepare_attendance(uuid),
  public.ff_record_attendance(uuid, uuid, public.ff_attendance, text), public.ff_confirm_attendance(uuid)
  to authenticated;

commit;
