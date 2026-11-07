begin;

-- Correct the original reference-data placeholder without changing its identity.
do $$
declare old_unit public.units;
begin
  if (select count(*) from public.units)<>5 then raise exception 'Review unit inventory before Scherf correction'; end if;
  select * into old_unit from public.units where code='odenthal' for update;
  if found then
    if old_unit.name<>'Odenthal' or exists(select 1 from public.units where code='scherf' or name='Scherf') then
      raise exception 'Ambiguous unit identities: review assignments; do not merge or duplicate units automatically';
    end if;
    update public.units set code='scherf',name='Scherf' where id=old_unit.id;
    perform ff_private.write_audit('unit_reference_corrected',null,null,to_jsonb(old_unit),
      jsonb_build_object('id',old_unit.id,'code','scherf','name','Scherf'),
      'DEV 0.4.1: owner-confirmed correction of initial reference-data placeholder; all foreign keys retained');
  elsif not exists(select 1 from public.units where code='scherf' and name='Scherf') then
    raise exception 'Expected Scherf reference identity missing';
  end if;
end;
$$;

create or replace function ff_private.dev_test_members()
returns table(email text,display_name text,role public.ff_role,unit_code text)
language sql immutable set search_path='' as $$
  values
    ('max.test@feuerwehr-odenthal.de','Max Mustermann','UNIT_ADMIN'::public.ff_role,'scheuren'),
    ('anna.test@feuerwehr-odenthal.de','Anna Becker','UNIT_ADMIN'::public.ff_role,'scheuren'),
    ('thomas.test@feuerwehr-odenthal.de','Thomas Weber','MEMBER'::public.ff_role,'scheuren'),
    ('lisa.test@feuerwehr-odenthal.de','Lisa Müller','MEMBER'::public.ff_role,'scheuren'),
    ('peter.test@feuerwehr-odenthal.de','Peter Schneider','UNIT_ADMIN'::public.ff_role,'scherf'),
    ('sarah.test@feuerwehr-odenthal.de','Sarah Fischer','MEMBER'::public.ff_role,'scherf');
$$;
create or replace function ff_private.require_dev_seed_operator(approver_id uuid)
returns void language plpgsql set search_path='' as $$
begin
  perform ff_private.require_rule(auth.role()='service_role' and auth.uid() is null,'Server-only DEV seed credentials required');
  perform ff_private.require_rule(ff_private.is_approved_user(approver_id) and exists(
    select 1 from public.role_assignments where user_id=approver_id and role='GLOBAL_ADMIN' and revoked_at is null),
    'Explicit active GLOBAL_ADMIN approval required');
  perform ff_private.require_rule((select count(*)=2 from public.units where code in ('scheuren','scherf')),'DEV seed units missing');
end;
$$;
commit;
