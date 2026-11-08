begin;

create or replace function public.ff_vehicle_option(kind text,option_key text,option_name text,is_active boolean default true)
returns void language plpgsql security definer set search_path='' as $$
declare previous jsonb;
begin
  perform ff_private.require_rule(ff_private.has_role('GLOBAL_ADMIN') and kind in ('type','purpose')
    and option_key ~ '^[a-z0-9_-]{2,40}$' and length(btrim(option_name)) between 2 and 80 and is_active is not null,
    'Gültige globale Fahrzeugkonfiguration erforderlich.');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('vehicle-option:'||kind||':'||option_key,0));
  if kind='type' then
    select to_jsonb(t)||jsonb_build_object('kind',kind) into previous from public.vehicle_types t where key=option_key;
    insert into public.vehicle_types values(option_key,btrim(option_name),is_active)
      on conflict(key) do update set name=excluded.name,active=excluded.active;
  else
    select to_jsonb(t)||jsonb_build_object('kind',kind) into previous from public.vehicle_purposes t where key=option_key;
    insert into public.vehicle_purposes values(option_key,btrim(option_name),is_active)
      on conflict(key) do update set name=excluded.name,active=excluded.active;
  end if;
  perform ff_private.write_audit('vehicle_option_saved',null,null,previous,
    jsonb_build_object('kind',kind,'key',option_key,'name',btrim(option_name),'active',is_active));
end;
$$;
notify pgrst,'reload schema';
commit;
