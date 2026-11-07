begin;
create or replace function public.ff_dev_personal_report(target_user uuid,wanted_year int,target_scope uuid default null,
  wanted_type public.ff_event_type default null,page_number int default 0,export_all boolean default false)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare label text;
begin
  perform ff_private.require_rule(ff_private.is_overseer(),'Nur berechtigte organisationsweite Berichtseinsicht.');
  select p.display_name into label from public.profiles p join ff_private.dev_fixture_sets d on d.fixture_key=p.dev_seed_key
    where p.id=target_user and p.auth_user_id is null and d.state='ready';
  perform ff_private.require_rule(found and (target_scope is null or exists(
    select 1 from public.unit_memberships where user_id=target_user and unit_id=target_scope)),
    'Nur ausdrücklich markierte nicht anmeldbare DEV-Testmitglieder und deren historische Einheiten.');
  return ff_private.aggregate_year_report(wanted_year,'personal',target_scope,wanted_type,page_number,export_all,target_user)
    ||jsonb_build_object('scope_name',case when label like 'DEV TEST | %' then label else 'DEV TEST | '||label end,
      'seed_member',target_user);
end;
$$;
notify pgrst,'reload schema';
commit;
