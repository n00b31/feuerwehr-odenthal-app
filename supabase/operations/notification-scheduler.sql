-- Hosted Supabase operation, not a replacement for the disposable PostgreSQL tests.
-- Apply only after independently verifying orxinqhhbtjpkzwlfaxq and migration 036.
begin;
do $$ begin
  if to_regclass('ff_private.notification_config') is null or to_regclass('vault.secrets') is null then
    raise exception 'Verified Supabase DEV with notification migration and Vault required';
  end if;
  if not exists(select 1 from supabase_migrations.schema_migrations where name='ff_037_notification_safe_updates')
    or not exists(select 1 from ff_private.notification_config where singleton and ready and public_key is not null)
    or not exists(select 1 from vault.secrets where name='ff_push_cron') then
    raise exception 'Verified safeupdate migration and successful server crypto/bootstrap required';
  end if;
end $$;
create extension if not exists pg_cron with schema pg_catalog;
-- Do not put the Vault credential into pg_net's platform-owned request queue.
create schema ff_push_transport;
revoke all on schema ff_push_transport from public,anon,authenticated,service_role;
create extension http with schema ff_push_transport;
revoke all on schema cron from public,anon,authenticated;
revoke all on all tables in schema cron from public,anon,authenticated;
create function ff_private.notification_cron()
returns integer language plpgsql security definer set search_path='' as $$
declare secret text; response_status integer;
begin
  perform public.ff_notification_tick();
  if not (select enabled and ready from ff_private.notification_config) then return null; end if;
  select decrypted_secret into secret from vault.decrypted_secrets where name='ff_push_cron';
  if secret is null then raise exception 'Notification scheduler secret missing'; end if;
  select status into response_status from ff_push_transport.http((
    'POST','https://orxinqhhbtjpkzwlfaxq.supabase.co/functions/v1/push-dispatch',
    array[('x-ff-cron',secret)::ff_push_transport.http_header],
    'application/json','{"action":"drain"}'
  )::ff_push_transport.http_request);
  if response_status is distinct from 202 then
    raise exception 'Notification dispatcher rejected scheduled work (HTTP %)',response_status;
  end if;
  return response_status;
end;
$$;
revoke all on function ff_private.notification_cron() from public,anon,authenticated,service_role;
do $$ begin
  if exists(select 1 from cron.job where jobname='ff-notifications-dev') then
    raise exception 'Existing notification schedule must be inspected, never duplicated or overwritten';
  end if;
  perform cron.schedule('ff-notifications-dev','* * * * *','select ff_private.notification_cron();');
end $$;
commit;
