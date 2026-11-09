begin;

-- Hosted PostgREST enables safeupdate; even singleton updates need an explicit predicate.
create or replace function public.ff_notification_configure(enabled boolean,categories text[])
returns void language plpgsql security definer set search_path='' as $$
declare before_value jsonb;
begin
  perform ff_private.require_rule(ff_private.has_role('GLOBAL_ADMIN'),'Globale Versandkonfiguration erforderlich.');
  perform ff_private.require_rule(enabled is not null and categories is not null and cardinality(categories)<=6
    and categories <@ array['services','changes','reminders','vehicles','administration','information']::text[],'Ungültige Kategorien.');
  select to_jsonb(c)-'public_key' into before_value from ff_private.notification_config c for update;
  update ff_private.notification_config c set enabled=ff_notification_configure.enabled,categories=ff_notification_configure.categories
    where c.singleton;
  perform ff_private.write_audit('notification_config_changed',null,auth.uid(),before_value,
    jsonb_build_object('enabled',enabled,'categories',categories));
end;
$$;
create or replace function public.ff_push_bootstrap(public_key text,cron_secret text)
returns void language plpgsql security definer set search_path='' as $$
declare cfg ff_private.notification_config; secret_id uuid;
begin
  perform ff_private.require_rule(public_key ~ '^[A-Za-z0-9_-]{87}$' and cron_secret ~ '^[A-Za-z0-9_-]{43}$','Invalid server setup');
  select * into cfg from ff_private.notification_config for update;
  perform ff_private.require_rule(cfg.public_key is null or cfg.public_key=ff_push_bootstrap.public_key,'Explicit VAPID key rotation required');
  if cfg.ready and exists(select 1 from vault.decrypted_secrets
    where name='ff_push_cron' and decrypted_secret=cron_secret) then return; end if;
  select id into secret_id from vault.secrets where name='ff_push_cron';
  if secret_id is null then
    perform vault.create_secret(cron_secret,'ff_push_cron','DEV notification scheduler authorization');
  else
    perform vault.update_secret(secret_id,cron_secret,'ff_push_cron','DEV notification scheduler authorization');
  end if;
  update ff_private.notification_config c set public_key=ff_push_bootstrap.public_key,ready=true
    where c.singleton;
end;
$$;

notify pgrst,'reload schema';
commit;
