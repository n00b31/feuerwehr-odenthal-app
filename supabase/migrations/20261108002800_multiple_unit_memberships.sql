begin;

create or replace function public.ff_my_access()
returns table(user_id uuid,display_name text,account_status public.ff_account_status,
  access_granted boolean,unit_id uuid,unit_name text,roles public.ff_role[])
language plpgsql stable security definer set search_path='' as $$
declare allowed boolean;
begin
  perform ff_private.require_rule(auth.uid() is not null,'Authenticated identity required');
  allowed:=ff_private.is_active();
  return query select p.id,p.display_name,p.status,allowed,m.unit_id,u.name,
    case when allowed then array(select distinct r.role from public.role_assignments r
      where r.user_id=auth.uid() and r.revoked_at is null order by r.role) else array[]::public.ff_role[] end
    from public.profiles p left join lateral (
      select um.unit_id from public.unit_memberships um where allowed and um.user_id=p.id
        and um.valid_from<=statement_timestamp() and (um.valid_until is null or um.valid_until>statement_timestamp())
      order by um.valid_from,um.id limit 1
    ) m on true left join public.units u on u.id=m.unit_id where p.id=auth.uid();
end;
$$;

drop index public.unit_memberships_current;
create unique index unit_memberships_current on public.unit_memberships(user_id,unit_id) where valid_until is null;

create or replace function public.ff_set_unit_membership(target_user uuid,target_unit uuid,assign boolean,reason text)
returns void language plpgsql security definer set search_path='' as $$
declare current_units uuid[]; global_access boolean; changed_at timestamptz;
begin
  perform pg_advisory_xact_lock(hashtext('ff.role_changes'));
  perform pg_advisory_xact_lock(hashtext('ff.membership_eligibility'));
  perform ff_private.require_rule(ff_private.can_manage_members(),'Mitgliederverwaltung nicht erlaubt.');
  perform 1 from public.profiles where id=target_user for no key update;
  perform ff_private.require_rule(found and assign is not null and length(btrim(reason)) between 5 and 2000,
    'Vorhandenes Mitglied, Aktion und Änderungsgrund erforderlich.');
  global_access:=ff_private.has_role('GLOBAL_ADMIN');
  perform ff_private.require_rule(exists(select 1 from public.units where id=target_unit)
    and ff_private.can_manage_unit_member(target_user,target_unit),'Keine Mitgliedschaftsverwaltung für diesen Bereich.');
  select coalesce(array_agg(unit_id order by unit_id),'{}') into current_units
    from public.unit_memberships where user_id=target_user and valid_until is null;
  if assign then
    perform ff_private.require_rule(exists(select 1 from public.profiles p join auth.users a on a.id=p.id
      where p.id=target_user and p.status in ('approved','suspended') and p.approved_email=lower(a.email)
        and a.email_confirmed_at is not null and a.email ~* '^[^@[:space:]]+@feuerwehr-odenthal\.de$'
        and not coalesce(a.is_anonymous,false) and a.deleted_at is null
        and (a.banned_until is null or a.banned_until<=statement_timestamp())),
      'Bereits freigegebenes Mitglied mit unverändert verifizierter Feuerwehr-E-Mail erforderlich.');
    perform ff_private.require_rule(global_access or cardinality(current_units)=0 or current_units=array[target_unit],
      'Einheitswechsel ausschließlich durch globale Administration.');
    if current_units=array[target_unit] then return; end if;
  else
    perform ff_private.require_rule(target_unit=any(current_units),'Aktuelle Mitgliedschaft in dieser Einheit erforderlich.');
    if cardinality(current_units)=1 and exists(select 1 from public.role_assignments
      where user_id=target_user and role='GLOBAL_ADMIN' and revoked_at is null)
      and ff_private.is_approved_user(target_user) then
      perform ff_private.require_rule((select count(*) from public.role_assignments where role='GLOBAL_ADMIN'
        and revoked_at is null and ff_private.is_approved_user(user_id))>1,'Last global administrator must remain active');
    end if;
  end if;
  changed_at:=clock_timestamp();
  update public.unit_memberships set valid_until=changed_at where user_id=target_user and valid_until is null
    and (assign or unit_id=target_unit);
  if assign then insert into public.unit_memberships(user_id,unit_id,valid_from) values(target_user,target_unit,changed_at); end if;
  perform ff_private.write_audit('unit_membership_changed',null,target_user,
    jsonb_build_object('unit_ids',current_units),jsonb_build_object('unit_ids',case when assign then array[target_unit]
      else array_remove(current_units,target_unit) end),btrim(reason));
end;
$$;

create function public.ff_add_unit_membership(target_user uuid,target_unit uuid,reason text)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform pg_advisory_xact_lock(hashtext('ff.role_changes'));
  perform pg_advisory_xact_lock(hashtext('ff.membership_eligibility'));
  perform ff_private.require_rule(ff_private.has_role('GLOBAL_ADMIN'),'Global administration required');
  perform 1 from public.profiles where id=target_user for no key update;
  perform ff_private.require_rule(found and ff_private.is_approved_user(target_user)
    and exists(select 1 from public.units where id=target_unit) and length(btrim(reason)) between 5 and 2000,
    'Aktives freigegebenes Mitglied, vorhandene Einheit und Änderungsgrund erforderlich.');
  if exists(select 1 from public.unit_memberships where user_id=target_user and unit_id=target_unit and valid_until is null) then return; end if;
  insert into public.unit_memberships(user_id,unit_id) values(target_user,target_unit);
  perform ff_private.write_audit('unit_membership_added',null,target_user,null,
    jsonb_build_object('unit_id',target_unit),btrim(reason));
end;
$$;

create or replace function public.ff_set_function_membership(target_user uuid,target_function uuid,assign boolean,reason text)
returns void language plpgsql security definer set search_path='' as $$
declare previous boolean;
begin
  perform pg_advisory_xact_lock(hashtext('ff.role_changes'));
  perform pg_advisory_xact_lock(hashtext('ff.membership_eligibility'));
  perform ff_private.require_rule(ff_private.has_role('GLOBAL_ADMIN'),'Global administration required');
  perform 1 from public.profiles where id=target_user for no key update;
  perform ff_private.require_rule(found and assign is not null and length(btrim(reason)) between 5 and 2000
    and exists(select 1 from public.special_functions where id=target_function),'Mitglied, Funktion und Änderungsgrund erforderlich.');
  perform ff_private.require_rule(not assign or ff_private.is_approved_user(target_user),'Approved member required');
  select exists(select 1 from public.function_memberships where user_id=target_user
    and function_id=target_function and valid_until is null) into previous;
  if previous=assign then return; end if;
  if assign then insert into public.function_memberships(user_id,function_id) values(target_user,target_function);
  else update public.function_memberships set valid_until=clock_timestamp()
    where user_id=target_user and function_id=target_function and valid_until is null; end if;
  perform ff_private.write_audit('function_membership_changed',null,target_user,
    jsonb_build_object('function_id',target_function,'assigned',previous),
    jsonb_build_object('function_id',target_function,'assigned',assign),btrim(reason));
end;
$$;

create or replace function public.ff_members_workspace()
returns jsonb language plpgsql security definer set search_path='' as $$
declare global_access boolean;
begin
  perform ff_private.require_rule(ff_private.can_manage_members(),'Mitgliederverwaltung nicht erlaubt.');
  global_access:=ff_private.has_role('GLOBAL_ADMIN');
  return jsonb_build_object(
    'server_now',statement_timestamp(),'global_admin',global_access,
    'units',coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'name',u.name) order by u.name)
      from public.units u where global_access or ff_private.has_role('UNIT_ADMIN',u.id,null)),'[]'),
    'functions',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'name',f.name) order by f.name)
      from public.special_functions f where global_access),'[]'),
    'members',coalesce((select jsonb_agg(jsonb_build_object(
      'user_id',p.id,'display_name',p.display_name,'status',p.status,'access_granted',ff_private.is_approved_user(p.id),
      'unit_id',m.unit_id,'unit_name',u.name,
      'can_change_membership',global_access or exists(select 1 from public.units t where ff_private.can_manage_unit_member(p.id,t.id)),
      'roles',case when global_access then coalesce((select jsonb_agg(jsonb_build_object(
        'role',r.role,'unit_id',r.unit_id,'function_id',r.function_id) order by r.role,r.unit_id,r.function_id)
        from public.role_assignments r where r.user_id=p.id and r.revoked_at is null),'[]') else '[]'::jsonb end,
      'functions',case when global_access then coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'name',f.name) order by f.name)
        from public.function_memberships fm join public.special_functions f on f.id=fm.function_id where fm.user_id=p.id
          and fm.valid_from<=statement_timestamp() and (fm.valid_until is null or fm.valid_until>statement_timestamp())),'[]') else '[]'::jsonb end,
      'unit_history',coalesce((select jsonb_agg(jsonb_build_object('unit_id',h.unit_id,'unit_name',hu.name,
        'valid_from',h.valid_from,'valid_until',h.valid_until) order by h.valid_from desc,h.id)
        from public.unit_memberships h join public.units hu on hu.id=h.unit_id where h.user_id=p.id
          and (global_access or ff_private.has_role('UNIT_ADMIN',h.unit_id,null))),'[]')
    ) order by p.display_name,p.id)
      from public.profiles p left join lateral (
        select h.unit_id from public.unit_memberships h where h.user_id=p.id
          and h.valid_from<=statement_timestamp() and (h.valid_until is null or h.valid_until>statement_timestamp())
          and (global_access or ff_private.has_role('UNIT_ADMIN',h.unit_id,null))
        order by h.valid_from,h.id limit 1
      ) m on true left join public.units u on u.id=m.unit_id
      where global_access or exists(select 1 from public.unit_memberships h where h.user_id=p.id
        and h.valid_from<=statement_timestamp() and ff_private.has_role('UNIT_ADMIN',h.unit_id,null)
        and (m.unit_id=h.unit_id or m.unit_id is null))),'[]'));
end;
$$;

revoke all on function public.ff_add_unit_membership(uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.ff_add_unit_membership(uuid,uuid,text) to authenticated;
notify pgrst,'reload schema';
commit;
