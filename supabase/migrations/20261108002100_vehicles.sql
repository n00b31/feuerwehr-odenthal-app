begin;

create table public.vehicle_types (
  key text primary key check(key ~ '^[a-z0-9_-]{2,40}$'),
  name text not null check(length(btrim(name)) between 2 and 80),
  active boolean not null default true
);
create table public.vehicle_purposes (
  key text primary key check(key ~ '^[a-z0-9_-]{2,40}$'),
  name text not null check(length(btrim(name)) between 2 and 80),
  active boolean not null default true
);
insert into public.vehicle_types values ('mtf','MTF',true),('hlf','HLF',true),('kdow','KdoW',true),('other','Sonstige Fahrzeuge',true);
insert into public.vehicle_purposes values ('course','Lehrgang',true),('training','Fortbildung',true),
  ('youth','Jugendfeuerwehr',true),('duty','Dienstfahrt',true),('event','Veranstaltung',true),('other','Sonstige dienstliche Tätigkeit',true);
create table public.vehicles (
  resource_id uuid primary key references public.calendar_resources(id),
  type_key text not null references public.vehicle_types(key),
  call_sign text not null default '' check(length(call_sign)<=80),
  location text not null default '' check(length(location)<=200),
  description text not null default '' check(length(description)<=2000),
  reservable boolean not null default true,
  unit_admin_enabled boolean not null default false,
  dev_seed_key text unique
);
create table public.vehicle_managers (
  vehicle_id uuid not null references public.vehicles(resource_id),
  user_id uuid not null references public.profiles(id),
  primary key(vehicle_id,user_id)
);
create table public.vehicle_usage_units (
  vehicle_id uuid not null references public.vehicles(resource_id),
  unit_id uuid not null references public.units(id),
  primary key(vehicle_id,unit_id)
);
create table public.vehicle_reservations (
  event_id uuid primary key references public.event_calendar(event_id),
  vehicle_id uuid not null references public.vehicles(resource_id),
  requester_id uuid not null references public.profiles(id),
  kind text not null check(kind in ('reservation','block')),
  state text not null default 'REQUESTED' check(state in ('REQUESTED','APPROVED','REJECTED','CANCELLED','COMPLETED')),
  purpose_key text references public.vehicle_purposes(key),
  destination text not null default '' check(length(destination)<=200),
  notes text not null default '' check(length(notes)<=2000),
  requested_at timestamptz not null default clock_timestamp(),
  decided_at timestamptz,
  decided_by uuid references public.profiles(id),
  decision_reason text,
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles(id),
  cancellation_reason text,
  completed_at timestamptz,
  completed_by uuid references public.profiles(id),
  dev_seed_key text unique,
  check((kind='reservation' and purpose_key is not null) or (kind='block' and purpose_key is null)),
  check(kind<>'block' or state in ('APPROVED','CANCELLED','COMPLETED'))
);
create index vehicle_reservation_queue on public.vehicle_reservations(vehicle_id,state,event_id);
create index vehicle_own_requests on public.vehicle_reservations(requester_id,requested_at desc,event_id);
create table public.vehicle_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id),
  event_id uuid not null references public.vehicle_reservations(event_id),
  message text not null,
  created_at timestamptz not null default clock_timestamp(),
  read_at timestamptz
);
create index vehicle_notification_inbox on public.vehicle_notifications(recipient_id,created_at desc,id);

create function ff_private.vehicle_manager(target uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select ff_private.is_active() and exists(select 1 from public.vehicles v
    join public.calendar_resources r on r.id=v.resource_id where v.resource_id=target
    and (ff_private.has_role('GLOBAL_ADMIN')
      or (v.unit_admin_enabled and ff_private.has_role('UNIT_ADMIN',r.unit_id,null))
      or exists(select 1 from public.vehicle_managers m where m.vehicle_id=target and m.user_id=auth.uid())));
$$;
create function ff_private.vehicle_visible(target uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select ff_private.is_active() and exists(select 1 from public.vehicles v where v.resource_id=target
    and (ff_private.is_overseer() or ff_private.vehicle_manager(target)
      or exists(select 1 from public.vehicle_usage_units u where u.vehicle_id=target
        and ff_private.belongs_to_scope('unit',u.unit_id,null))
      or exists(select 1 from public.vehicle_reservations q where q.vehicle_id=target and q.requester_id=auth.uid())));
$$;
create function ff_private.vehicle_request_visible(target uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select ff_private.is_active() and exists(select 1 from public.vehicle_reservations q where q.event_id=target
    and (q.requester_id=auth.uid() or ff_private.vehicle_manager(q.vehicle_id)
      or ff_private.has_role('FIRE_CHIEF')
      or (q.state in ('APPROVED','COMPLETED') and ff_private.vehicle_visible(q.vehicle_id))));
$$;
create or replace function ff_private.can_view_resource(target uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select ff_private.is_active() and exists(select 1 from public.calendar_resources r where r.id=target
    and (case when r.resource_type='vehicle' then ff_private.vehicle_visible(target) else
      r.unit_id is null or ff_private.is_overseer() or ff_private.belongs_to_scope('unit',r.unit_id,null)
        or ff_private.manages_scope('unit',r.unit_id,null) end));
$$;
create or replace function ff_private.can_manage_calendar(target uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select ff_private.is_active() and exists(select 1 from public.events e join public.event_calendar c on c.event_id=e.id
    where e.id=target and not exists(select 1 from public.vehicle_reservations q where q.event_id=target)
      and ff_private.calendar_scope_manager(e.scope_kind,e.unit_id,e.function_id));
$$;
create or replace function ff_private.can_view_event(target uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select ff_private.is_active() and exists(select 1 from public.events e
    left join public.event_calendar c on c.event_id=e.id where e.id=target and
    case when exists(select 1 from public.vehicle_reservations q where q.event_id=target) then
      exists(select 1 from public.vehicle_reservations q where q.event_id=target and q.state in ('APPROVED','COMPLETED')
        and ff_private.vehicle_visible(q.vehicle_id))
    else (
      (c.event_id is null and (ff_private.belongs_to_scope(e.scope_kind,e.unit_id,e.function_id)
        or ff_private.is_overseer() or ff_private.can_lead_event(e.id)
        or exists(select 1 from public.event_roster r where r.event_id=e.id and r.user_id=auth.uid())))
      or (c.event_id is not null and (ff_private.can_manage_calendar(e.id) or (c.archived_at is null and (
        ff_private.is_overseer()
        or (c.audience='scope' and ff_private.belongs_to_scope(e.scope_kind,e.unit_id,e.function_id))
        or (c.audience='units' and exists(select 1 from public.calendar_event_units t where t.event_id=e.id
          and ff_private.belongs_to_scope('unit',t.unit_id,null)))
        or (c.audience='leadership' and (ff_private.manages_scope(e.scope_kind,e.unit_id,e.function_id)
          or (e.scope_kind='organization' and exists(select 1 from public.role_assignments r
            where r.user_id=auth.uid() and r.role='UNIT_ADMIN' and r.revoked_at is null)))))))))
    end);
$$;

do $$ declare t text; begin
  foreach t in array array['vehicle_types','vehicle_purposes','vehicles','vehicle_managers','vehicle_usage_units',
    'vehicle_reservations','vehicle_notifications'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
  end loop;
end $$;
create policy vehicle_types_read on public.vehicle_types for select to authenticated using(ff_private.is_active());
create policy vehicle_purposes_read on public.vehicle_purposes for select to authenticated using(ff_private.is_active());
create policy vehicles_read on public.vehicles for select to authenticated using(ff_private.vehicle_visible(resource_id));
create policy vehicle_managers_read on public.vehicle_managers for select to authenticated using(ff_private.vehicle_visible(vehicle_id));
create policy vehicle_usage_read on public.vehicle_usage_units for select to authenticated using(ff_private.vehicle_visible(vehicle_id));
create policy vehicle_requests_read on public.vehicle_reservations for select to authenticated using(ff_private.vehicle_request_visible(event_id));
create policy vehicle_notifications_read on public.vehicle_notifications for select to authenticated
  using(recipient_id=auth.uid() and ff_private.vehicle_request_visible(event_id));

create function ff_private.vehicle_conflicts(target uuid,lower_bound timestamptz,upper_bound timestamptz,excluded uuid default null)
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',case when ff_private.vehicle_request_visible(e.id) then e.id else null end,
    'title',case when ff_private.vehicle_request_visible(e.id) then e.title else 'Verbindlich belegt (Details geschützt)' end,
    'starts_at',e.starts_at,'ends_at',e.ends_at) order by e.starts_at,e.id),'[]')
    from public.vehicle_reservations q join public.events e on e.id=q.event_id
    where q.vehicle_id=target and q.state in ('APPROVED','COMPLETED') and q.event_id is distinct from excluded
      and e.starts_at<upper_bound and e.ends_at>lower_bound;
$$;
create function ff_private.vehicle_notify(target uuid,notice text)
returns void language sql security definer set search_path='' as $$
  insert into public.vehicle_notifications(recipient_id,event_id,message)
    select p.id,q.event_id,notice from public.profiles p cross join public.vehicle_reservations q
    join public.vehicles v on v.resource_id=q.vehicle_id join public.calendar_resources r on r.id=v.resource_id
    where q.event_id=target and ff_private.is_approved_user(p.id) and (
      p.id=q.requester_id or exists(select 1 from public.vehicle_managers m where m.vehicle_id=q.vehicle_id and m.user_id=p.id)
      or exists(select 1 from public.role_assignments a where a.user_id=p.id and a.revoked_at is null
        and (a.role='GLOBAL_ADMIN' or (a.role='UNIT_ADMIN' and v.unit_admin_enabled and a.unit_id=r.unit_id)))
      or (q.kind='block' and exists(select 1 from public.vehicle_usage_units u join public.unit_memberships m on m.unit_id=u.unit_id
        where u.vehicle_id=q.vehicle_id and m.user_id=p.id and m.valid_from<=statement_timestamp()
          and (m.valid_until is null or m.valid_until>statement_timestamp()))));
$$;
create function ff_private.vehicle_summary(target uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select to_jsonb(q)||jsonb_build_object('id',e.id,'title',e.title,'description',e.description,
    'starts_at',e.starts_at,'ends_at',e.ends_at,'unit_id',e.unit_id,'unit_name',u.name,
    'responsible_id',e.organizer_id,'responsible_name',p.display_name,'requester_name',rp.display_name,
    'vehicle_name',r.name,'revision',e.revision,'can_manage',ff_private.vehicle_manager(q.vehicle_id),
    'own',q.requester_id=auth.uid())
    from public.vehicle_reservations q join public.events e on e.id=q.event_id
    join public.units u on u.id=e.unit_id join public.profiles p on p.id=e.organizer_id
    join public.profiles rp on rp.id=q.requester_id join public.calendar_resources r on r.id=q.vehicle_id
    where q.event_id=target and ff_private.vehicle_request_visible(target);
$$;

create function public.ff_vehicle_workspace(lower_bound timestamptz,upper_bound timestamptz,target_vehicle uuid default null,retained_event uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare count_items int;
begin
  perform ff_private.require_rule(ff_private.is_active(),'Freigabe erforderlich.');
  perform ff_private.require_rule(isfinite(lower_bound) and isfinite(upper_bound) and upper_bound>lower_bound
    and upper_bound<=lower_bound+interval '43 days','Fahrzeugkalender: gültiger Zeitraum bis 43 Tage.');
  perform ff_private.require_rule(target_vehicle is null or ff_private.vehicle_visible(target_vehicle),'Kein Zugriff auf Fahrzeug.');
  select count(*) into count_items from public.vehicle_reservations q join public.events e on e.id=q.event_id
    where (target_vehicle is null or q.vehicle_id=target_vehicle) and e.starts_at<upper_bound and e.ends_at>lower_bound
      and ff_private.vehicle_request_visible(q.event_id);
  perform ff_private.require_rule(count_items<=2000,'Mehr als 2.000 Fahrzeugvorgänge: Zeitraum eingrenzen.');
  return jsonb_build_object('server_now',statement_timestamp(),'configure',ff_private.has_role('GLOBAL_ADMIN'),
    'vehicles',coalesce((select jsonb_agg(to_jsonb(r)||to_jsonb(v)||jsonb_build_object('id',r.id,
      'can_manage',ff_private.vehicle_manager(r.id),'usage_units',coalesce((select jsonb_agg(unit_id order by unit_id)
        from public.vehicle_usage_units where vehicle_id=r.id),'[]'),
      'manager_ids',coalesce((select jsonb_agg(user_id order by user_id) from public.vehicle_managers where vehicle_id=r.id),'[]')) order by r.name)
      from public.vehicles v join public.calendar_resources r on r.id=v.resource_id where ff_private.vehicle_visible(r.id)),'[]'),
    'units',coalesce((select jsonb_agg(to_jsonb(u) order by u.name) from public.units u),'[]'),
    'own_units',coalesce((select jsonb_agg(to_jsonb(u) order by u.name) from public.units u
      where ff_private.belongs_to_scope('unit',u.id,null)),'[]'),
    'people',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.display_name,
      'units',(select jsonb_agg(m.unit_id order by m.unit_id) from public.unit_memberships m where m.user_id=p.id
        and m.valid_from<=statement_timestamp() and (m.valid_until is null or m.valid_until>statement_timestamp()))) order by p.display_name)
      from public.profiles p where ff_private.is_approved_user(p.id) and (ff_private.can_view_profile(p.id)
        or exists(select 1 from public.unit_memberships m where m.user_id=p.id and m.valid_from<=statement_timestamp()
          and (m.valid_until is null or m.valid_until>statement_timestamp()) and ff_private.belongs_to_scope('unit',m.unit_id,null)))),'[]'),
    'types',coalesce((select jsonb_agg(to_jsonb(t) order by name) from public.vehicle_types t),'[]'),
    'purposes',coalesce((select jsonb_agg(to_jsonb(t) order by name) from public.vehicle_purposes t),'[]'),
    'items',coalesce((select jsonb_agg(ff_private.vehicle_summary(q.event_id) order by e.starts_at,e.id)
      from public.vehicle_reservations q join public.events e on e.id=q.event_id
      where (target_vehicle is null or q.vehicle_id=target_vehicle) and e.starts_at<upper_bound and e.ends_at>lower_bound
        and ff_private.vehicle_request_visible(q.event_id)),'[]'),
    'retained',ff_private.vehicle_summary(retained_event),
    'tasks',coalesce((select jsonb_agg(item order by item->>'requested_at',item->>'id') from (
      select ff_private.vehicle_summary(q.event_id) item from public.vehicle_reservations q
      where q.state='REQUESTED' and ff_private.vehicle_manager(q.vehicle_id) order by q.requested_at,q.event_id limit 500) x),'[]'),
    'tasks_total',(select count(*) from public.vehicle_reservations q where q.state='REQUESTED' and ff_private.vehicle_manager(q.vehicle_id)),
    'notifications',coalesce((select jsonb_agg(to_jsonb(n) order by n.created_at desc,n.id) from (
      select * from public.vehicle_notifications where recipient_id=auth.uid() and ff_private.vehicle_request_visible(event_id)
      order by created_at desc,id limit 100) n),'[]'));
end;
$$;

create function public.ff_save_vehicle(input jsonb,target_vehicle uuid default null,expected_revision int default 0)
returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid; previous jsonb; r public.calendar_resources; managers uuid[]; usage uuid[]; global_admin boolean;
begin
  global_admin:=ff_private.has_role('GLOBAL_ADMIN');
  perform ff_private.require_rule(global_admin or (target_vehicle is not null and ff_private.vehicle_manager(target_vehicle)),
    'Keine Verwaltung für dieses Fahrzeug.');
  perform ff_private.require_rule(jsonb_typeof(input)='object' and length(btrim(input->>'name')) between 2 and 120
    and jsonb_typeof(input->'active')='boolean' and jsonb_typeof(input->'reservable')='boolean'
    and exists(select 1 from public.vehicle_types where key=input->>'type_key' and active)
    and length(coalesce(input->>'call_sign',''))<=80 and length(coalesce(input->>'location',''))<=200
    and length(coalesce(input->>'description',''))<=2000,'Gültige Fahrzeugdaten erforderlich.');
  if target_vehicle is not null then
    select * into r from public.calendar_resources where id=target_vehicle and resource_type='vehicle' for update;
    perform ff_private.require_rule(found and exists(select 1 from public.vehicles where resource_id=r.id),'Fahrzeug nicht gefunden.');
    perform ff_private.require_rule(ff_private.vehicle_manager(target_vehicle),'Fahrzeugverwaltung wurde widerrufen.');
    if r.revision is distinct from expected_revision then raise exception 'Fahrzeug wurde geändert.' using errcode='40001'; end if;
    select to_jsonb(r)||to_jsonb(v) into previous from public.vehicles v where resource_id=r.id;
    result:=r.id;
  end if;
  if global_admin then
    perform ff_private.require_rule(exists(select 1 from public.units where id=(input->>'unit_id')::uuid)
      and jsonb_typeof(input->'manager_ids')='array' and jsonb_typeof(input->'usage_units')='array'
      and jsonb_typeof(input->'unit_admin_enabled')='boolean','Einheit und ausdrückliche Fahrzeugrechte erforderlich.');
    select coalesce(array_agg(distinct value::uuid),'{}') into managers from jsonb_array_elements_text(input->'manager_ids');
    select coalesce(array_agg(distinct value::uuid),'{}') into usage from jsonb_array_elements_text(input->'usage_units');
    perform ff_private.require_rule(cardinality(managers) between 1 and 20 and cardinality(usage) between 1 and 5
      and not exists(select 1 from unnest(managers) m where not ff_private.is_approved_user(m))
      and (select count(*) from public.units where id=any(usage))=cardinality(usage),'Aktive Verwalter und gültige Nutzungseinheiten erforderlich.');
  else
    perform ff_private.require_rule((input->>'unit_id')::uuid=r.unit_id
      and (input->>'unit_admin_enabled')::boolean=(select unit_admin_enabled from public.vehicles where resource_id=r.id),
      'Nur globale Administration ändert Besitz oder Genehmigungsrechte.');
    select coalesce(array_agg(user_id order by user_id),'{}') into managers from public.vehicle_managers where vehicle_id=r.id;
    select coalesce(array_agg(unit_id order by unit_id),'{}') into usage from public.vehicle_usage_units where vehicle_id=r.id;
    perform ff_private.require_rule((select coalesce(array_agg(distinct value::uuid order by value::uuid),'{}')
      from jsonb_array_elements_text(input->'manager_ids'))=managers
      and (select coalesce(array_agg(distinct value::uuid order by value::uuid),'{}')
        from jsonb_array_elements_text(input->'usage_units'))=usage,'Nur globale Administration vergibt Fahrzeugrechte.');
  end if;
  if result is null then
    insert into public.calendar_resources(name,resource_type,unit_id,active)
      values(btrim(input->>'name'),'vehicle',(input->>'unit_id')::uuid,(input->>'active')::boolean) returning id into result;
    insert into public.vehicles(resource_id,type_key) values(result,input->>'type_key');
  else
    update public.calendar_resources set name=btrim(input->>'name'),active=(input->>'active')::boolean,
      unit_id=case when global_admin then (input->>'unit_id')::uuid else unit_id end,revision=revision+1 where id=result;
  end if;
  update public.vehicles set type_key=input->>'type_key',call_sign=coalesce(input->>'call_sign',''),
    location=coalesce(input->>'location',''),description=coalesce(input->>'description',''),
    reservable=(input->>'reservable')::boolean,
    unit_admin_enabled=case when global_admin then (input->>'unit_admin_enabled')::boolean else unit_admin_enabled end where resource_id=result;
  if global_admin then
    delete from public.vehicle_managers where vehicle_id=result;
    insert into public.vehicle_managers select result,m from unnest(managers) m;
    delete from public.vehicle_usage_units where vehicle_id=result;
    insert into public.vehicle_usage_units select result,u from unnest(usage) u;
  end if;
  perform ff_private.write_audit('vehicle_saved',null,null,previous,
    (select to_jsonb(r)||to_jsonb(v)||jsonb_build_object('manager_ids',to_jsonb(managers),'usage_units',to_jsonb(usage))
      from public.calendar_resources r join public.vehicles v on v.resource_id=r.id where r.id=result));
  return result;
end;
$$;

create function public.ff_request_vehicle(input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare target uuid; result uuid; r public.calendar_resources; v public.vehicles; start_time timestamptz; end_time timestamptz;
  unit uuid; responsible uuid; blocked boolean; conflicts jsonb; category uuid;
begin
  perform ff_private.require_rule(ff_private.is_active(),'Freigabe erforderlich.');
  target:=(input->>'vehicle_id')::uuid; unit:=(input->>'unit_id')::uuid; responsible:=(input->>'responsible_id')::uuid;
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
    and length(coalesce(input->>'notes',''))<=2000 and input->>'kind' in ('reservation','block'),'Gültiger zukünftiger Zeitraum und Zweck erforderlich.');
  if blocked then
    perform ff_private.require_rule(ff_private.vehicle_manager(target) and unit=r.unit_id
      and ff_private.is_approved_user(responsible),'Nur Fahrzeugverwaltung sperrt das eigene Fahrzeug.');
  else
    perform ff_private.require_rule(ff_private.belongs_to_scope('unit',unit,null)
      and exists(select 1 from public.vehicle_usage_units where vehicle_id=target and unit_id=unit)
      and ff_private.is_approved_user(responsible)
      and exists(select 1 from public.unit_memberships where user_id=responsible and unit_id=unit
        and valid_from<=statement_timestamp() and (valid_until is null or valid_until>statement_timestamp()))
      and exists(select 1 from public.vehicle_purposes where key=input->>'purpose_key' and active),
      'Eigene freigegebene Nutzungseinheit, verantwortliches Mitglied und gültiger Zweck erforderlich.');
  end if;
  conflicts:=ff_private.vehicle_conflicts(target,start_time,end_time);
  perform ff_private.require_rule(not blocked or jsonb_array_length(conflicts)=0,
    'Sperrung kollidiert mit verbindlicher Reservierung/Sperrung. Bestehenden Vorgang zuerst ausdrücklich klären.');
  select id into category from public.calendar_categories where name='Fahrzeugreservierung';
  insert into public.events(title,description,event_type,starts_at,ends_at,location,scope_kind,unit_id,organizer_id)
    values(btrim(input->>'title'),coalesce(input->>'description',''),'other',start_time,end_time,
      coalesce(nullif(v.location,''),r.name),'unit',unit,responsible) returning id into result;
  insert into public.event_calendar(event_id,entry_kind,audience,category_id,resource_id)
    values(result,'booking','scope',category,target);
  insert into public.vehicle_reservations(event_id,vehicle_id,requester_id,kind,state,purpose_key,destination,notes,decided_at,decided_by)
    values(result,target,auth.uid(),input->>'kind',case when blocked then 'APPROVED' else 'REQUESTED' end,
      case when blocked then null else input->>'purpose_key' end,coalesce(input->>'destination',''),coalesce(input->>'notes',''),
      case when blocked then clock_timestamp() end,case when blocked then auth.uid() end);
  perform ff_private.write_audit(case when blocked then 'vehicle_blocked' else 'vehicle_requested' end,result,auth.uid(),null,
    ff_private.vehicle_summary(result));
  perform ff_private.vehicle_notify(result,case when blocked then 'Fahrzeug vorübergehend gesperrt' else 'Neue Reservierungsanfrage' end);
  return jsonb_build_object('id',result,'conflicts',conflicts);
end;
$$;
create function public.ff_decide_vehicle(target_event uuid,expected_revision int,next_state text,reason text default '')
returns void language plpgsql security definer set search_path='' as $$
declare target uuid; q public.vehicle_reservations; e public.events; previous jsonb; manager boolean; r public.calendar_resources; v public.vehicles;
begin
  perform ff_private.require_rule(ff_private.is_active(),'Freigabe erforderlich.');
  select vehicle_id into target from public.vehicle_reservations where event_id=target_event;
  perform ff_private.require_rule(target is not null,'Vorgang nicht gefunden.');
  select * into r from public.calendar_resources where id=target for update;
  select * into v from public.vehicles where resource_id=target;
  select * into q from public.vehicle_reservations where event_id=target_event for update;
  select * into e from public.events where id=target_event for update;
  manager:=ff_private.vehicle_manager(target);
  perform ff_private.require_rule(manager or (q.requester_id=auth.uid() and q.kind='reservation' and next_state='CANCELLED'),
    'Keine fahrzeugbezogene Genehmigungs-/Stornierungsberechtigung.');
  if e.revision is distinct from expected_revision then raise exception 'Vorgang wurde geändert.' using errcode='40001'; end if;
  previous:=ff_private.vehicle_summary(target_event);
  perform ff_private.require_rule(length(coalesce(reason,''))<=2000,'Begründung zu lang.');
  if next_state='APPROVED' then
    perform ff_private.require_rule(manager and q.state='REQUESTED' and q.kind='reservation' and r.active and v.reservable
      and e.starts_at>clock_timestamp() and ff_private.is_approved_user(q.requester_id)
      and ff_private.is_approved_user(e.organizer_id)
      and exists(select 1 from public.vehicle_usage_units where vehicle_id=target and unit_id=e.unit_id)
      and exists(select 1 from public.unit_memberships where user_id=q.requester_id and unit_id=e.unit_id
        and valid_from<=statement_timestamp() and (valid_until is null or valid_until>statement_timestamp()))
      and exists(select 1 from public.unit_memberships where user_id=e.organizer_id and unit_id=e.unit_id
        and valid_from<=statement_timestamp() and (valid_until is null or valid_until>statement_timestamp())),
      'Nur gültige offene Anfrage eines aktiven reservierbaren Fahrzeugs genehmigen.');
    perform ff_private.require_rule(jsonb_array_length(ff_private.vehicle_conflicts(target,e.starts_at,e.ends_at,e.id))=0,
      'Zeitraum verbindlich belegt. Keine überlappende Genehmigung möglich.');
    update public.vehicle_reservations set state='APPROVED',decided_at=clock_timestamp(),decided_by=auth.uid(),decision_reason=btrim(reason) where event_id=e.id;
  elsif next_state='REJECTED' then
    perform ff_private.require_rule(manager and q.state='REQUESTED' and length(btrim(reason))>=5,'Ablehnung benötigt mindestens fünf Zeichen Begründung.');
    update public.vehicle_reservations set state='REJECTED',decided_at=clock_timestamp(),decided_by=auth.uid(),decision_reason=btrim(reason) where event_id=e.id;
  elsif next_state='CANCELLED' then
    perform ff_private.require_rule(q.state in ('REQUESTED','APPROVED')
      and (q.state<>'APPROVED' or length(btrim(reason))>=5),'Genehmigte Reservierung/Sperrung benötigt Stornierungsgrund.');
    update public.vehicle_reservations set state='CANCELLED',cancelled_at=clock_timestamp(),cancelled_by=auth.uid(),cancellation_reason=btrim(reason) where event_id=e.id;
  elsif next_state='COMPLETED' then
    perform ff_private.require_rule(manager and q.state='APPROVED' and e.ends_at<=clock_timestamp(),'Abschluss nur nach Ende einer genehmigten Nutzung.');
    update public.vehicle_reservations set state='COMPLETED',completed_at=clock_timestamp(),completed_by=auth.uid() where event_id=e.id;
  else
    perform ff_private.require_rule(false,'Ungültiger Statuswechsel.');
  end if;
  update public.events set revision=revision+1,status=case when next_state in ('REJECTED','CANCELLED') then 'cancelled' else status end where id=e.id;
  perform ff_private.write_audit('vehicle_'||lower(next_state),e.id,q.requester_id,previous,ff_private.vehicle_summary(e.id),nullif(btrim(reason),''));
  perform ff_private.vehicle_notify(e.id,case next_state when 'APPROVED' then 'Reservierung genehmigt'
    when 'REJECTED' then 'Anfrage abgelehnt' when 'CANCELLED' then 'Reservierung storniert' else 'Fahrzeugnutzung abgeschlossen' end);
end;
$$;
create function public.ff_read_vehicle_notification(target_notification uuid)
returns void language plpgsql security definer set search_path='' as $$
declare previous public.vehicle_notifications;
begin
  select * into previous from public.vehicle_notifications where id=target_notification for update;
  perform ff_private.require_rule(found and previous.recipient_id=auth.uid()
    and ff_private.vehicle_request_visible(previous.event_id),'Keine berechtigte Benachrichtigung.');
  if previous.read_at is null then
    update public.vehicle_notifications set read_at=clock_timestamp() where id=previous.id;
    perform ff_private.write_audit('vehicle_notification_read',previous.event_id,auth.uid(),to_jsonb(previous),
      (select to_jsonb(n) from public.vehicle_notifications n where id=previous.id));
  end if;
end;
$$;
create function public.ff_vehicle_option(kind text,option_key text,option_name text,is_active boolean default true)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform ff_private.require_rule(ff_private.has_role('GLOBAL_ADMIN') and kind in ('type','purpose')
    and option_key ~ '^[a-z0-9_-]{2,40}$' and length(btrim(option_name)) between 2 and 80 and is_active is not null,'Gültige globale Fahrzeugkonfiguration erforderlich.');
  if kind='type' then
    insert into public.vehicle_types values(option_key,btrim(option_name),is_active)
      on conflict(key) do update set name=excluded.name,active=excluded.active;
  else
    insert into public.vehicle_purposes values(option_key,btrim(option_name),is_active)
      on conflict(key) do update set name=excluded.name,active=excluded.active;
  end if;
  perform ff_private.write_audit('vehicle_option_saved',null,null,null,jsonb_build_object('kind',kind,'key',option_key,'name',btrim(option_name),'active',is_active));
end;
$$;
insert into public.calendar_categories(name) values ('Fahrzeugreservierung') on conflict(name) do nothing;

do $$ declare f record; begin
  for f in select p.oid::regprocedure signature,p.proname,n.nspname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where (n.nspname='ff_private' and p.proname like 'vehicle_%')
      or (n.nspname='public' and p.proname in ('ff_vehicle_workspace','ff_save_vehicle','ff_request_vehicle','ff_decide_vehicle',
        'ff_read_vehicle_notification','ff_vehicle_option')) loop
    execute format('revoke all on function %s from public,anon,authenticated',f.signature);
    if f.nspname='public' or f.proname in ('vehicle_visible','vehicle_request_visible') then
      execute format('grant execute on function %s to authenticated',f.signature);
    end if;
  end loop;
end $$;
notify pgrst,'reload schema';
commit;
