-- Read-only inventory for the EXISTING DEV project, not a migration or repair.
begin read only;
select current_database() as database_name, current_setting('server_version') as postgres_version;
select count(*) as existing_auth_users from auth.users;
select n.nspname as schema_name, c.relname as object_name, c.relkind, c.relrowsecurity
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname in ('public', 'ff_private', 'supabase_migrations')
  and c.relkind in ('r', 'v', 'm') order by 1, 2;
select table_schema, table_name, column_name, data_type, is_nullable
from information_schema.columns where table_schema in ('public', 'ff_private')
order by table_schema, table_name, ordinal_position;
select conrelid::regclass as relation, conname, pg_get_constraintdef(oid) as definition
from pg_constraint where connamespace = 'public'::regnamespace order by 1, 2;
select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies where schemaname in ('public', 'ff_private') order by 1, 2, 3;
select table_schema, table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema in ('public', 'ff_private') and grantee in ('anon', 'authenticated', 'PUBLIC')
order by 1, 2, 3, 4;
select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as arguments,
  p.prosecdef as security_definer, p.proconfig as configuration, p.proacl as grants
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public', 'ff_private') order by 1, 2, 3;
rollback;
