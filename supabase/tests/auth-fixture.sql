-- Isolated CI only. Never run this fixture against the existing hosted project.
do $$
begin
  if current_database() <> 'ff_dev_ci' then
    raise exception 'Auth fixture is restricted to the disposable ff_dev_ci database';
  end if;
end;
$$;
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create role supabase_auth_admin nologin;
create schema auth;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  email_confirmed_at timestamptz,
  raw_user_meta_data jsonb not null default '{}',
  raw_app_meta_data jsonb not null default '{"provider":"email"}',
  is_anonymous boolean default false,
  banned_until timestamptz,
  deleted_at timestamptz
);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
-- Reproduce permissive legacy Supabase defaults to prove migrations remove them.
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant execute on functions to anon, authenticated;
