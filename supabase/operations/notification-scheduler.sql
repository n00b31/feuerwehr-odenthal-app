-- Hosted Supabase operation, not a replacement for the disposable PostgreSQL tests.
-- Apply only after independently verifying orxinqhhbtjpkzwlfaxq and migration 036.
begin;
do $$ begin
  if to_regclass('ff_private.notification_config') is null or to_regclass('vault.secrets') is null then
    raise exception 'Verified Supabase DEV with notification migration and Vault required';
  end if;
end $$;
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
revoke all on schema net,cron from public,anon,authenticated;
revoke all on all functions in schema net from public,anon,authenticated;
revoke all on all tables in schema net,cron from public,anon,authenticated;
create function ff_private.notification_cron()
returns bigint language plpgsql security definer set search_path='' as $$
declare secret text; request_id bigint;
begin
  perform public.ff_notification_tick();
  if not (select enabled and ready from ff_private.notification_config) then return null; end if;
  select decrypted_secret into secret from vault.decrypted_secrets where name='ff_push_cron';
  if secret is null then raise exception 'Notification scheduler secret missing'; end if;
  select net.http_post(
    url:='https://orxinqhhbtjpkzwlfaxq.supabase.co/functions/v1/push-dispatch',
    headers:=jsonb_build_object('Content-Type','application/json','x-ff-cron',secret),
    body:='{"action":"drain"}'::jsonb,timeout_milliseconds:=10000
  ) into request_id;
  return request_id;
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
