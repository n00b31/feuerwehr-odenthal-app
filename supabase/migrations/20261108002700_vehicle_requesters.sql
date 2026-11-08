begin;

create or replace function ff_private.vehicle_visible(target uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select ff_private.is_active() and exists(select 1 from public.vehicles v where v.resource_id=target
    and (ff_private.is_overseer() or ff_private.vehicle_manager(target)
      or exists(select 1 from public.vehicle_usage_units u where u.vehicle_id=target
        and (ff_private.belongs_to_scope('unit',u.unit_id,null) or ff_private.has_role('UNIT_ADMIN',u.unit_id,null)))));
$$;

create function ff_private.vehicle_requester_allowed(target_user uuid,target_unit uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select ff_private.is_active() and ff_private.is_approved_user(target_user)
    and exists(select 1 from public.unit_memberships m where m.user_id=target_user and m.unit_id=target_unit
      and m.valid_from<=statement_timestamp() and (m.valid_until is null or m.valid_until>statement_timestamp()))
    and (target_user=auth.uid() or ff_private.has_role('GLOBAL_ADMIN') or ff_private.has_role('FIRE_CHIEF')
      or ff_private.has_role('UNIT_ADMIN',target_unit,null));
$$;

create function public.ff_vehicle_requesters(target_vehicle uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  perform ff_private.require_rule(ff_private.is_active(),'Freigabe erforderlich.');
  perform ff_private.require_rule(target_vehicle is null or ff_private.vehicle_visible(target_vehicle)
    or exists(select 1 from public.vehicle_reservations q where q.vehicle_id=target_vehicle
      and (q.requester_id=auth.uid() or q.actor_id=auth.uid())),'Kein Zugriff auf Fahrzeug.');
  return jsonb_build_object(
    'actor_name',(select display_name from public.profiles where id=auth.uid()),
    'request_units',coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'name',u.name) order by u.name)
      from public.units u where exists(select 1 from public.profiles p
        where ff_private.vehicle_requester_allowed(p.id,u.id))
      and (target_vehicle is null or exists(select 1 from public.vehicle_usage_units v
        where v.vehicle_id=target_vehicle and v.unit_id=u.id))),'[]'),
    'requesters',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.display_name,
      'units',(select jsonb_agg(distinct m.unit_id order by m.unit_id) from public.unit_memberships m
        where m.user_id=p.id and m.valid_from<=statement_timestamp()
          and (m.valid_until is null or m.valid_until>statement_timestamp())
          and ff_private.vehicle_requester_allowed(p.id,m.unit_id)
          and (target_vehicle is null or exists(select 1 from public.vehicle_usage_units v
            where v.vehicle_id=target_vehicle and v.unit_id=m.unit_id)))) order by p.display_name,p.id)
      from public.profiles p where exists(select 1 from public.unit_memberships m
        where m.user_id=p.id and ff_private.vehicle_requester_allowed(p.id,m.unit_id)
          and (target_vehicle is null or exists(select 1 from public.vehicle_usage_units v
            where v.vehicle_id=target_vehicle and v.unit_id=m.unit_id)))),'[]'));
end;
$$;

create or replace function ff_private.vehicle_request_visible(target uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select ff_private.is_active() and exists(select 1 from public.vehicle_reservations q where q.event_id=target
    and (q.requester_id=auth.uid() or q.actor_id=auth.uid() or ff_private.vehicle_manager(q.vehicle_id)
      or ff_private.has_role('FIRE_CHIEF')
      or (q.state in ('APPROVED','COMPLETED') and ff_private.vehicle_visible(q.vehicle_id))));
$$;

create or replace function ff_private.vehicle_summary(target uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select to_jsonb(q)||jsonb_build_object('id',e.id,'title',e.title,'description',e.description,
    'starts_at',e.starts_at,'ends_at',e.ends_at,'unit_id',e.unit_id,'unit_name',u.name,
    'responsible_id',e.organizer_id,'responsible_name',p.display_name,'requester_name',rp.display_name,
    'actor_name',ap.display_name,'vehicle_name',r.name,'revision',e.revision,
    'can_manage',ff_private.vehicle_manager(q.vehicle_id),'own',q.requester_id=auth.uid())
    from public.vehicle_reservations q join public.events e on e.id=q.event_id
    join public.units u on u.id=e.unit_id join public.profiles p on p.id=e.organizer_id
    join public.profiles rp on rp.id=q.requester_id join public.profiles ap on ap.id=q.actor_id
    join public.calendar_resources r on r.id=q.vehicle_id
    where q.event_id=target and ff_private.vehicle_request_visible(target);
$$;

create or replace function ff_private.vehicle_notify(target uuid,notice text)
returns void language sql security definer set search_path='' as $$
  insert into public.vehicle_notifications(recipient_id,event_id,message)
    select p.id,q.event_id,notice from public.profiles p cross join public.vehicle_reservations q
    join public.vehicles v on v.resource_id=q.vehicle_id join public.calendar_resources r on r.id=v.resource_id
    where q.event_id=target and ff_private.is_approved_user(p.id) and (
      p.id=q.requester_id or p.id=q.actor_id
      or exists(select 1 from public.vehicle_managers m where m.vehicle_id=q.vehicle_id and m.user_id=p.id)
      or exists(select 1 from public.role_assignments a where a.user_id=p.id and a.revoked_at is null
        and (a.role='GLOBAL_ADMIN' or (a.role='UNIT_ADMIN' and v.unit_admin_enabled and a.unit_id=r.unit_id)))
      or (q.kind='block' and exists(select 1 from public.vehicle_usage_units u join public.unit_memberships m on m.unit_id=u.unit_id
        where u.vehicle_id=q.vehicle_id and m.user_id=p.id and m.valid_from<=statement_timestamp()
          and (m.valid_until is null or m.valid_until>statement_timestamp()))));
$$;

create or replace function public.ff_request_vehicle(input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare target uuid; result uuid; r public.calendar_resources; v public.vehicles;
  start_time timestamptz; end_time timestamptz; unit uuid; responsible uuid; requester uuid;
  blocked boolean; conflicts jsonb; category uuid;
begin
  perform ff_private.require_rule(ff_private.is_active(),'Freigabe erforderlich.');
  target:=(input->>'vehicle_id')::uuid; unit:=(input->>'unit_id')::uuid;
  responsible:=(input->>'responsible_id')::uuid;
  requester:=coalesce((input->>'requester_id')::uuid,auth.uid());
  perform ff_private.require_rule((not (input ? 'requester_id') or input->>'requester_id' is not null)
    and (not (input ? 'actor_id') or (input->>'actor_id')::uuid=auth.uid()),
    'Antragsteller und handelnder Benutzer müssen eindeutig berechtigt sein.');
  start_time:=(input->>'starts_at')::timestamptz; end_time:=(input->>'ends_at')::timestamptz;
  blocked:=input->>'kind'='block';
  select * into r from public.calendar_resources where id=target and resource_type='vehicle' for update;
  select * into v from public.vehicles where resource_id=target;
  perform ff_private.require_rule(r.id is not null and r.active and v.resource_id is not null
    and (blocked or v.reservable) and ff_private.vehicle_visible(target),'Kein aktives reservierbares Fahrzeug.');
  perform ff_private.require_rule(isfinite(start_time) and isfinite(end_time) and start_time>clock_timestamp()
    and end_time>start_time and end_time<=start_time+interval '43 days'
    and length(btrim(input->>'title')) between 3 and 120
    and length(coalesce(input->>'description',''))<=2000 and length(coalesce(input->>'destination',''))<=200
    and length(coalesce(input->>'notes',''))<=2000 and input->>'kind' in ('reservation','block'),
    'Gültiger zukünftiger Zeitraum und Zweck erforderlich.');
  if blocked then
    perform ff_private.require_rule(ff_private.vehicle_manager(target) and unit=r.unit_id
      and requester=auth.uid() and ff_private.is_approved_user(responsible),
      'Nur Fahrzeugverwaltung sperrt das eigene Fahrzeug im eigenen Namen.');
  else
    perform ff_private.require_rule(ff_private.vehicle_requester_allowed(requester,unit)
      and exists(select 1 from public.vehicle_usage_units where vehicle_id=target and unit_id=unit)
      and ff_private.is_approved_user(responsible)
      and exists(select 1 from public.unit_memberships where user_id=responsible and unit_id=unit
        and valid_from<=statement_timestamp() and (valid_until is null or valid_until>statement_timestamp()))
      and exists(select 1 from public.vehicle_purposes where key=input->>'purpose_key' and active),
      'Keine berechtigte Antragstellung für dieses Mitglied, diese Nutzungseinheit oder verantwortliche Person.');
  end if;
  conflicts:=ff_private.vehicle_conflicts(target,start_time,end_time);
  if blocked and jsonb_array_length(conflicts)>0 then
    raise exception 'Sperrung kollidiert mit verbindlicher Reservierung/Sperrung.'
      using errcode='23P01';
  end if;
  if not blocked then conflicts:=ff_private.vehicle_conflicts(target,start_time,end_time,null,true); end if;
  select id into category from public.calendar_categories where name='Fahrzeugreservierung';
  insert into public.events(title,description,event_type,starts_at,ends_at,location,scope_kind,unit_id,organizer_id)
    values(btrim(input->>'title'),coalesce(input->>'description',''),'other',start_time,end_time,
      coalesce(nullif(v.location,''),r.name),'unit',unit,responsible) returning id into result;
  insert into public.event_calendar(event_id,entry_kind,audience,category_id,resource_id)
    values(result,'booking','scope',category,target);
  insert into public.vehicle_reservations(event_id,vehicle_id,requester_id,actor_id,kind,state,purpose_key,
    destination,notes,decided_at,decided_by)
    values(result,target,requester,auth.uid(),input->>'kind',case when blocked then 'APPROVED' else 'REQUESTED' end,
      case when blocked then null else input->>'purpose_key' end,coalesce(input->>'destination',''),coalesce(input->>'notes',''),
      case when blocked then clock_timestamp() end,case when blocked then auth.uid() end);
  perform ff_private.write_audit(case when blocked then 'vehicle_blocked' else 'vehicle_requested' end,result,requester,null,
    ff_private.vehicle_summary(result));
  perform ff_private.vehicle_notify(result,case when blocked then 'Fahrzeug vorübergehend gesperrt' else 'Neue Reservierungsanfrage' end);
  return jsonb_build_object('id',result,'conflicts',conflicts);
end;
$$;

revoke all on function ff_private.vehicle_requester_allowed(uuid,uuid),public.ff_vehicle_requesters(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.ff_vehicle_requesters(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
