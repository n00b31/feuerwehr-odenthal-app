begin;

-- This foundation requires the existing DEV project to have no Auth users yet.
do $$
begin
  if exists (select 1 from auth.users) then
    raise exception 'DEV migration requires review/backfill of existing Auth users before application.';
  end if;
end;
$$;

create schema ff_private;
revoke all on schema ff_private from public, anon, authenticated;

create type public.ff_account_status as enum ('pending', 'approved', 'rejected', 'suspended');
create type public.ff_role as enum ('MEMBER', 'UNIT_ADMIN', 'FUNCTION_ADMIN', 'FIRE_CHIEF', 'GLOBAL_ADMIN');
create type public.ff_scope as enum ('organization', 'unit', 'function');
create type public.ff_event_type as enum ('regular', 'special', 'breathing', 'training', 'community', 'other');
create type public.ff_response as enum ('yes', 'no', 'maybe');
create type public.ff_attendance as enum ('present', 'absent', 'unknown');

create table public.units (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z][a-z0-9-]+$'),
  name text not null unique check (length(btrim(name)) between 2 and 120),
  pilot boolean not null default false
);
create table public.special_functions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z][a-z0-9-]+$'),
  name text not null unique check (length(btrim(name)) between 2 and 120)
);
create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  display_name text not null check (length(btrim(display_name)) between 1 and 120),
  status public.ff_account_status not null default 'pending',
  created_at timestamptz not null default clock_timestamp(),
  approved_at timestamptz,
  approved_by uuid references public.profiles(id),
  approved_email text,
  check (status <> 'approved' or (approved_at is not null and approved_by is not null and approved_email is not null))
);
create table public.unit_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  unit_id uuid not null references public.units(id),
  valid_from timestamptz not null default clock_timestamp(),
  valid_until timestamptz,
  check (valid_until is null or valid_until > valid_from)
);
create unique index unit_memberships_current on public.unit_memberships(user_id) where valid_until is null;
create index unit_memberships_scope on public.unit_memberships(unit_id, user_id);

create table public.function_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  function_id uuid not null references public.special_functions(id),
  valid_from timestamptz not null default clock_timestamp(),
  valid_until timestamptz,
  check (valid_until is null or valid_until > valid_from)
);
create unique index function_memberships_current on public.function_memberships(user_id, function_id) where valid_until is null;
create index function_memberships_scope on public.function_memberships(function_id, user_id);

create table public.role_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  role public.ff_role not null,
  unit_id uuid references public.units(id),
  function_id uuid references public.special_functions(id),
  granted_by uuid not null references public.profiles(id),
  granted_at timestamptz not null default clock_timestamp(),
  revoked_at timestamptz,
  check (
    (role in ('MEMBER', 'FIRE_CHIEF', 'GLOBAL_ADMIN') and unit_id is null and function_id is null) or
    (role = 'UNIT_ADMIN' and unit_id is not null and function_id is null) or
    (role = 'FUNCTION_ADMIN' and function_id is not null and unit_id is null)
  ),
  check (revoked_at is null or revoked_at >= granted_at)
);
create unique index role_assignments_current on public.role_assignments
  (user_id, role, coalesce(unit_id, '00000000-0000-0000-0000-000000000000'::uuid),
   coalesce(function_id, '00000000-0000-0000-0000-000000000000'::uuid)) where revoked_at is null;

create table public.event_series (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 3 and 120),
  scope_kind public.ff_scope not null,
  unit_id uuid references public.units(id),
  function_id uuid references public.special_functions(id),
  frequency text not null check (frequency in ('weekly', 'biweekly', 'monthly')),
  occurrence_count integer not null check (occurrence_count between 1 and 52),
  local_start timestamp without time zone not null,
  time_zone text not null default 'Europe/Berlin' check (time_zone = 'Europe/Berlin'),
  duration_minutes integer not null check (duration_minutes between 1 and 1440),
  created_by uuid not null references public.profiles(id),
  check (
    (scope_kind = 'organization' and unit_id is null and function_id is null) or
    (scope_kind = 'unit' and unit_id is not null and function_id is null) or
    (scope_kind = 'function' and function_id is not null and unit_id is null)
  )
);
create table public.events (
  id uuid primary key default gen_random_uuid(),
  series_id uuid references public.event_series(id),
  instance_number integer check (instance_number between 1 and 52),
  title text not null check (length(btrim(title)) between 3 and 120),
  description text not null default '' check (length(description) <= 2000),
  event_type public.ff_event_type not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  location text not null check (length(btrim(location)) between 1 and 200),
  scope_kind public.ff_scope not null,
  unit_id uuid references public.units(id),
  function_id uuid references public.special_functions(id),
  organizer_id uuid not null references public.profiles(id),
  status text not null default 'scheduled' check (status in ('scheduled', 'cancelled')),
  response_deadline timestamptz,
  attendance_prepared_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  unique (series_id, instance_number),
  check ((series_id is null) = (instance_number is null)),
  check (ends_at > starts_at),
  check (response_deadline is null or response_deadline <= starts_at),
  check (
    (scope_kind = 'organization' and unit_id is null and function_id is null) or
    (scope_kind = 'unit' and unit_id is not null and function_id is null) or
    (scope_kind = 'function' and function_id is not null and unit_id is null)
  )
);
create index events_scope_time on public.events(scope_kind, unit_id, function_id, starts_at);
create table public.event_roster (
  event_id uuid not null references public.events(id),
  user_id uuid not null references public.profiles(id),
  unit_snapshot_id uuid not null references public.units(id),
  name_snapshot text not null check (length(btrim(name_snapshot)) between 1 and 120),
  primary key (event_id, user_id)
);
create index event_roster_user on public.event_roster(user_id, event_id);

create table public.participation_responses (
  event_id uuid not null,
  user_id uuid not null,
  response public.ff_response not null,
  updated_at timestamptz not null default clock_timestamp(),
  primary key (event_id, user_id),
  foreign key (event_id, user_id) references public.event_roster(event_id, user_id)
);
create table public.actual_attendance (
  event_id uuid not null,
  user_id uuid not null,
  status public.ff_attendance not null default 'unknown',
  origin text not null check (origin in ('manual', 'prefill')),
  recorded_by uuid not null references public.profiles(id),
  recorded_at timestamptz not null default clock_timestamp(),
  primary key (event_id, user_id),
  foreign key (event_id, user_id) references public.event_roster(event_id, user_id)
);
create table public.attendance_confirmations (
  event_id uuid primary key references public.events(id),
  confirmed_by uuid not null references public.profiles(id),
  confirmed_at timestamptz not null default clock_timestamp(),
  original_snapshot jsonb not null
);
create table public.event_delegations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null,
  user_id uuid not null,
  assigned_by uuid not null references public.profiles(id),
  assigned_at timestamptz not null default clock_timestamp(),
  revoked_at timestamptz,
  foreign key (event_id, user_id) references public.event_roster(event_id, user_id),
  check (revoked_at is null or revoked_at >= assigned_at)
);
create unique index event_delegations_current on public.event_delegations(event_id) where revoked_at is null;
create index event_delegations_user on public.event_delegations(user_id, event_id) where revoked_at is null;

create table public.document_areas (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 3 and 120),
  description text not null default '' check (length(description) <= 1000),
  sharepoint_url text not null check (sharepoint_url ~ '^https://[^/@?#[:space:]]+\.sharepoint\.com/'),
  scope_kind public.ff_scope not null,
  unit_id uuid references public.units(id),
  function_id uuid references public.special_functions(id),
  visibility text not null check (visibility in ('members', 'admins')),
  created_by uuid not null references public.profiles(id),
  check (
    (scope_kind = 'organization' and unit_id is null and function_id is null) or
    (scope_kind = 'unit' and unit_id is not null and function_id is null) or
    (scope_kind = 'function' and function_id is not null and unit_id is null)
  )
);
create table public.audit_entries (
  id uuid primary key default gen_random_uuid(),
  happened_at timestamptz not null default clock_timestamp(),
  actor_id uuid references public.profiles(id),
  event_id uuid references public.events(id),
  subject_id uuid references public.profiles(id),
  action text not null,
  before_data jsonb,
  after_data jsonb,
  reason text,
  display_snapshot jsonb not null
);
create index audit_entries_event_time on public.audit_entries(event_id, happened_at desc);
create index audit_entries_subject_time on public.audit_entries(subject_id, happened_at desc);

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'units', 'special_functions', 'profiles', 'unit_memberships', 'function_memberships', 'role_assignments',
    'event_series', 'events', 'event_roster', 'participation_responses', 'actual_attendance',
    'attendance_confirmations', 'event_delegations', 'document_areas', 'audit_entries'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from public, anon, authenticated', table_name);
  end loop;
end;
$$;

commit;
