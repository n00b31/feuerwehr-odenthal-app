begin;

create function ff_private.is_approved_user(target uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p join auth.users u on u.id = p.id
    where p.id = target and p.status = 'approved'
      and u.email_confirmed_at is not null
      and u.email ~* '^[^@[:space:]]+@feuerwehr-odenthal\.de$'
      and p.approved_email = lower(u.email)
      and not coalesce(u.is_anonymous, false) and u.deleted_at is null
      and (u.banned_until is null or u.banned_until <= statement_timestamp())
  );
$$;
create function ff_private.is_active()
returns boolean language sql stable security definer set search_path = '' as $$
  select ff_private.is_approved_user(auth.uid());
$$;
create function ff_private.has_role(wanted public.ff_role, wanted_unit uuid default null, wanted_function uuid default null)
returns boolean language sql stable security definer set search_path = '' as $$
  select ff_private.is_active() and exists (
    select 1 from public.role_assignments r where r.user_id = auth.uid()
      and r.role = wanted and r.unit_id is not distinct from wanted_unit
      and r.function_id is not distinct from wanted_function and r.revoked_at is null
  );
$$;
create function ff_private.is_overseer()
returns boolean language sql stable security definer set search_path = '' as $$
  select ff_private.has_role('GLOBAL_ADMIN') or ff_private.has_role('FIRE_CHIEF');
$$;
create function ff_private.manages_scope(kind public.ff_scope, target_unit uuid, target_function uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select ff_private.has_role('GLOBAL_ADMIN') or
    (kind = 'unit' and ff_private.has_role('UNIT_ADMIN', target_unit, null)) or
    (kind = 'function' and ff_private.has_role('FUNCTION_ADMIN', null, target_function));
$$;
create function ff_private.belongs_to_scope(kind public.ff_scope, target_unit uuid, target_function uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select ff_private.is_active() and (
    kind = 'organization' or
    (kind = 'unit' and exists (
      select 1 from public.unit_memberships m where m.user_id = auth.uid() and m.unit_id = target_unit
        and m.valid_from <= statement_timestamp() and (m.valid_until is null or m.valid_until > statement_timestamp())
    )) or
    (kind = 'function' and exists (
      select 1 from public.function_memberships m where m.user_id = auth.uid() and m.function_id = target_function
        and m.valid_from <= statement_timestamp() and (m.valid_until is null or m.valid_until > statement_timestamp())
    ))
  );
$$;
create function ff_private.can_lead_event(target uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select ff_private.is_active() and exists (
    select 1 from public.events e where e.id = target and (
      ff_private.manages_scope(e.scope_kind, e.unit_id, e.function_id) or exists (
        select 1 from public.event_delegations d
        join public.event_roster r on r.event_id = d.event_id and r.user_id = d.user_id
        where d.event_id = e.id and d.user_id = auth.uid() and d.revoked_at is null
      )
    )
  );
$$;
create function ff_private.can_view_event(target uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select ff_private.is_active() and exists (
    select 1 from public.events e where e.id = target and (
      ff_private.belongs_to_scope(e.scope_kind, e.unit_id, e.function_id) or
      ff_private.is_overseer() or ff_private.can_lead_event(e.id) or
      exists (select 1 from public.event_roster r where r.event_id = e.id and r.user_id = auth.uid())
    )
  );
$$;
create function ff_private.can_view_profile(target uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select target = auth.uid() or (
    ff_private.is_active() and exists (select 1 from public.profiles p where p.id = target and p.status = 'approved')
    and (
      ff_private.is_overseer() or exists (
        select 1 from public.unit_memberships m where m.user_id = target
          and m.valid_from <= statement_timestamp() and (m.valid_until is null or m.valid_until > statement_timestamp())
          and ff_private.has_role('UNIT_ADMIN', m.unit_id, null)
      ) or exists (
        select 1 from public.function_memberships m where m.user_id = target
          and m.valid_from <= statement_timestamp() and (m.valid_until is null or m.valid_until > statement_timestamp())
          and ff_private.has_role('FUNCTION_ADMIN', null, m.function_id)
      ) or exists (
        select 1 from public.event_roster r where r.user_id = target and ff_private.can_lead_event(r.event_id)
      )
    )
  );
$$;

create function ff_private.before_user_created(event jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  select case when
    coalesce(event #>> '{user,email}', '') ~* '^[^@[:space:]]+@feuerwehr-odenthal\.de$'
    and event #>> '{user,app_metadata,provider}' = 'email'
    and coalesce(event #>> '{user,is_anonymous}', 'false') = 'false'
  then '{}'::jsonb else jsonb_build_object('error', jsonb_build_object(
    'http_code', 403, 'message', 'Registrierung nur mit Feuerwehr-E-Mail und E-Mail-Anmeldung erlaubt.'
  )) end;
$$;
create function ff_private.create_pending_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not coalesce(new.email ~* '^[^@[:space:]]+@feuerwehr-odenthal\.de$', false)
      or coalesce(new.is_anonymous, false) then
    raise exception 'Feuerwehr email required' using errcode = '42501';
  end if;
  insert into public.profiles(id, display_name) values (
    new.id, coalesce(nullif(left(btrim(new.raw_user_meta_data ->> 'display_name'), 120), ''), 'Neues Mitglied')
  );
  return new;
end;
$$;
create trigger ff_create_pending_profile after insert on auth.users
for each row execute function ff_private.create_pending_profile();

grant usage on schema ff_private to authenticated, supabase_auth_admin;
revoke all on all functions in schema ff_private from public, anon, authenticated;
grant execute on function ff_private.before_user_created(jsonb) to supabase_auth_admin;
grant execute on function ff_private.is_active(), ff_private.has_role(public.ff_role, uuid, uuid),
  ff_private.is_overseer(), ff_private.manages_scope(public.ff_scope, uuid, uuid),
  ff_private.belongs_to_scope(public.ff_scope, uuid, uuid), ff_private.can_lead_event(uuid),
  ff_private.can_view_event(uuid), ff_private.can_view_profile(uuid) to authenticated;

grant select on public.units, public.special_functions, public.unit_memberships, public.function_memberships,
  public.role_assignments, public.event_series, public.events, public.event_roster,
  public.participation_responses, public.actual_attendance, public.event_delegations,
  public.document_areas, public.audit_entries to authenticated;
-- Approval emails and original full-list snapshots are not readable through ordinary table queries.
grant select (id, display_name, status, created_at, approved_at, approved_by) on public.profiles to authenticated;
grant select (event_id, confirmed_by, confirmed_at) on public.attendance_confirmations to authenticated;

create policy active_units on public.units for select to authenticated using (ff_private.is_active());
create policy active_functions on public.special_functions for select to authenticated using (ff_private.is_active());
create policy scoped_profiles on public.profiles for select to authenticated using (ff_private.can_view_profile(id));
create policy scoped_unit_memberships on public.unit_memberships for select to authenticated using (
  ff_private.is_active() and (user_id = auth.uid() or ff_private.is_overseer() or ff_private.has_role('UNIT_ADMIN', unit_id, null))
);
create policy scoped_function_memberships on public.function_memberships for select to authenticated using (
  ff_private.is_active() and (user_id = auth.uid() or ff_private.is_overseer() or ff_private.has_role('FUNCTION_ADMIN', null, function_id))
);
create policy own_or_global_roles on public.role_assignments for select to authenticated using (
  ff_private.is_active() and (user_id = auth.uid() or ff_private.has_role('GLOBAL_ADMIN'))
);
create policy scoped_series on public.event_series for select to authenticated using (
  ff_private.belongs_to_scope(scope_kind, unit_id, function_id) or ff_private.manages_scope(scope_kind, unit_id, function_id) or ff_private.is_overseer()
);
create policy visible_events on public.events for select to authenticated using (ff_private.can_view_event(id));
create policy scoped_roster on public.event_roster for select to authenticated using (
  ff_private.is_active() and (user_id = auth.uid() or ff_private.can_lead_event(event_id) or ff_private.is_overseer())
);
create policy scoped_responses on public.participation_responses for select to authenticated using (
  ff_private.is_active() and (user_id = auth.uid() or ff_private.can_lead_event(event_id) or ff_private.is_overseer())
);
create policy scoped_attendance on public.actual_attendance for select to authenticated using (
  ff_private.is_active() and (user_id = auth.uid() or ff_private.can_lead_event(event_id) or ff_private.is_overseer())
);
create policy visible_confirmation on public.attendance_confirmations for select to authenticated using (ff_private.can_view_event(event_id));
create policy scoped_delegations on public.event_delegations for select to authenticated using (
  ff_private.can_lead_event(event_id) or ff_private.is_overseer()
);
create policy scoped_documents on public.document_areas for select to authenticated using (
  ff_private.manages_scope(scope_kind, unit_id, function_id) or
  (visibility = 'members' and (ff_private.belongs_to_scope(scope_kind, unit_id, function_id) or ff_private.is_overseer()))
);
create policy scoped_audit on public.audit_entries for select to authenticated using (
  ff_private.has_role('GLOBAL_ADMIN') or (event_id is not null and (ff_private.can_lead_event(event_id) or ff_private.is_overseer()))
);

create view public.confirmed_attendance with (security_invoker = true) as
select a.event_id, a.user_id, a.status, e.title, e.event_type, e.starts_at, e.ends_at,
  e.scope_kind, e.unit_id, e.function_id, r.unit_snapshot_id, r.name_snapshot,
  c.confirmed_at, c.confirmed_by,
  extract(year from e.starts_at at time zone 'Europe/Berlin')::integer as report_year,
  case when a.status = 'present' then extract(epoch from (e.ends_at - e.starts_at)) / 3600.0 else 0 end as training_hours
from public.actual_attendance a
join public.events e on e.id = a.event_id
join public.event_roster r on r.event_id = a.event_id and r.user_id = a.user_id
join public.attendance_confirmations c on c.event_id = a.event_id
where e.status = 'scheduled' and e.starts_at <= statement_timestamp();
revoke all on public.confirmed_attendance from public, anon, authenticated;
grant select on public.confirmed_attendance to authenticated;

commit;
