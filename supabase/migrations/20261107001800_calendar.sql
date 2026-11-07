begin;

create table public.calendar_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check(length(btrim(name)) between 2 and 80),
  active boolean not null default true
);
create table public.calendar_resources (
  id uuid primary key default gen_random_uuid(),
  name text not null check(length(btrim(name)) between 2 and 120),
  resource_type text not null check(resource_type in ('building','room','vehicle','material')),
  unit_id uuid references public.units(id),
  active boolean not null default true,
  revision integer not null default 0 check(revision>=0),
  unique(name,unit_id)
);
-- Only supplementary fields: title, times, scope and identity remain in events.
create table public.event_calendar (
  event_id uuid primary key references public.events(id),
  entry_kind text not null check(entry_kind in ('information','booking')),
  all_day boolean not null default false,
  audience text not null check(audience in ('scope','units','leadership')),
  category_id uuid not null references public.calendar_categories(id),
  resource_id uuid references public.calendar_resources(id),
  archived_at timestamptz,
  check((entry_kind='booking')=(resource_id is not null))
);
create table public.calendar_event_units (
  event_id uuid not null references public.event_calendar(event_id),
  unit_id uuid not null references public.units(id),
  primary key(event_id,unit_id)
);
create index calendar_resource_events on public.event_calendar(resource_id,event_id) where archived_at is null;
create index events_calendar_overlap on public.events(ends_at,starts_at,id);
create index calendar_target_units on public.calendar_event_units(unit_id,event_id);
insert into public.calendar_categories(name) values ('Organisatorischer Termin'),('Veranstaltung'),('Gerätehausbelegung');

create function ff_private.calendar_scope_manager(kind public.ff_scope,target_unit uuid,target_function uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select ff_private.manages_scope(kind,target_unit,target_function)
    or (kind='organization' and ff_private.has_role('FIRE_CHIEF'));
$$;
create function ff_private.can_manage_calendar(target uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select ff_private.is_active() and exists(select 1 from public.events e
    join public.event_calendar c on c.event_id=e.id
    where e.id=target and ff_private.calendar_scope_manager(e.scope_kind,e.unit_id,e.function_id));
$$;
create function ff_private.can_view_resource(target uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select ff_private.is_active() and exists(select 1 from public.calendar_resources r where r.id=target
    and (r.unit_id is null or ff_private.is_overseer()
      or ff_private.belongs_to_scope('unit',r.unit_id,null) or ff_private.manages_scope('unit',r.unit_id,null)));
$$;
create or replace function ff_private.can_view_event(target uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select ff_private.is_active() and exists(
    select 1 from public.events e left join public.event_calendar c on c.event_id=e.id where e.id=target and (
      (c.event_id is null and (
        ff_private.belongs_to_scope(e.scope_kind,e.unit_id,e.function_id)
        or ff_private.is_overseer() or ff_private.can_lead_event(e.id)
        or exists(select 1 from public.event_roster r where r.event_id=e.id and r.user_id=auth.uid())))
      or (c.event_id is not null and (
        ff_private.can_manage_calendar(e.id) or (c.archived_at is null and (
          ff_private.is_overseer()
          or (c.audience='scope' and ff_private.belongs_to_scope(e.scope_kind,e.unit_id,e.function_id))
          or (c.audience='units' and exists(select 1 from public.calendar_event_units t
            where t.event_id=e.id and ff_private.belongs_to_scope('unit',t.unit_id,null)))
          or (c.audience='leadership' and (ff_private.manages_scope(e.scope_kind,e.unit_id,e.function_id)
            or (e.scope_kind='organization' and exists(select 1 from public.role_assignments r
              where r.user_id=auth.uid() and r.role='UNIT_ADMIN' and r.revoked_at is null))))))))
    ));
$$;
create or replace function ff_private.lock_attendance_event(target uuid)
returns public.events language plpgsql security definer set search_path='' as $$
declare item public.events;
begin
  select * into item from public.events where id=target for update;
  perform ff_private.require_rule(found and ff_private.can_lead_event(target)
    and not exists(select 1 from public.event_calendar where event_id=target),
    'Anwesenheit nur für Dienste mit Teilnahmeverwaltung und zuständiger Leitung.');
  perform ff_private.require_rule(item.status='scheduled' and clock_timestamp()>=item.starts_at,
    'Attendance requires a started, non-cancelled event');
  return item;
end;
$$;

do $$ declare t text; begin
  foreach t in array array['calendar_categories','calendar_resources','event_calendar','calendar_event_units'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
  end loop;
end $$;
create policy calendar_categories_read on public.calendar_categories for select to authenticated using(ff_private.is_active());
create policy calendar_resources_read on public.calendar_resources for select to authenticated using(ff_private.can_view_resource(id));
create policy event_calendar_read on public.event_calendar for select to authenticated using(ff_private.can_view_event(event_id));
create policy calendar_units_read on public.calendar_event_units for select to authenticated using(ff_private.can_view_event(event_id));

create function public.ff_calendar_context()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  perform ff_private.require_rule(ff_private.is_active(),'Freigabe erforderlich.');
  return jsonb_build_object(
    'organization',ff_private.calendar_scope_manager('organization',null,null),
    'configure',ff_private.has_role('GLOBAL_ADMIN'),
    'units',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name) order by name) from public.units),'[]'::jsonb),
    'manageable_units',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name) order by name)
      from public.units where ff_private.manages_scope('unit',id,null)),'[]'::jsonb),
    'functions',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,
      'manage',ff_private.manages_scope('function',null,id)) order by name) from public.special_functions
      where ff_private.is_overseer() or ff_private.belongs_to_scope('function',null,id)
        or ff_private.manages_scope('function',null,id)),'[]'::jsonb),
    'resources',coalesce((select jsonb_agg(to_jsonb(r) order by r.name) from public.calendar_resources r
      where ff_private.can_view_resource(r.id)),'[]'::jsonb),
    'categories',coalesce((select jsonb_agg(to_jsonb(c) order by c.name) from public.calendar_categories c),'[]'::jsonb),
    'organizers',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',display_name) order by display_name)
      from public.profiles where ff_private.is_approved_user(id) and ff_private.can_view_profile(id)),'[]'::jsonb));
end;
$$;

create function public.ff_save_calendar_resource(input jsonb,target_resource uuid default null,expected_revision int default 0)
returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid; previous public.calendar_resources;
begin
  perform ff_private.require_rule(ff_private.has_role('GLOBAL_ADMIN'),'Ressourcenverwaltung nur durch globale Administration.');
  perform ff_private.require_rule(jsonb_typeof(input)='object' and length(btrim(input->>'name')) between 2 and 120
    and input->>'resource_type'='building' and jsonb_typeof(input->'active')='boolean',
    'DEV 0.5 unterstützt konfigurierbare Gerätehäuser, keine Fahrzeugreservierungen.');
  if target_resource is not null then
    select * into previous from public.calendar_resources where id=target_resource for update;
    perform ff_private.require_rule(found,'Ressource nicht gefunden.');
    if previous.revision is distinct from expected_revision then raise exception 'Ressource wurde geändert.' using errcode='40001'; end if;
    update public.calendar_resources set name=btrim(input->>'name'),unit_id=(input->>'unit_id')::uuid,
      active=(input->>'active')::boolean,revision=revision+1 where id=target_resource returning id into result;
  else
    insert into public.calendar_resources(name,resource_type,unit_id,active)
      values(btrim(input->>'name'),'building',(input->>'unit_id')::uuid,(input->>'active')::boolean) returning id into result;
  end if;
  perform ff_private.write_audit('calendar_resource_saved',null,null,to_jsonb(previous),
    (select to_jsonb(r) from public.calendar_resources r where id=result));
  return result;
end;
$$;
create function public.ff_save_calendar_category(category_name text,target_category uuid default null,is_active boolean default true)
returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid; previous jsonb;
begin
  perform ff_private.require_rule(ff_private.has_role('GLOBAL_ADMIN'),'Kategorienverwaltung nur durch globale Administration.');
  perform ff_private.require_rule(length(btrim(category_name)) between 2 and 80 and is_active is not null,'Gültige Kategorie erforderlich.');
  if target_category is null then
    insert into public.calendar_categories(name,active) values(btrim(category_name),is_active) returning id into result;
  else
    select to_jsonb(c) into previous from public.calendar_categories c where id=target_category for update;
    perform ff_private.require_rule(found,'Kategorie nicht gefunden.');
    update public.calendar_categories set name=btrim(category_name),active=is_active where id=target_category returning id into result;
  end if;
  perform ff_private.write_audit('calendar_category_saved',null,null,previous,
    (select to_jsonb(c) from public.calendar_categories c where id=result));
  return result;
end;
$$;

create function ff_private.calendar_conflicts(target_resource uuid,lower_bound timestamptz,upper_bound timestamptz,excluded_event uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',case when ff_private.can_view_event(e.id) then e.id else null end,
    'title',case when ff_private.can_view_event(e.id) then e.title else 'Bereits belegt (Details geschützt)' end,
    'starts_at',e.starts_at,'ends_at',e.ends_at) order by e.starts_at,e.id),'[]'::jsonb)
    from public.events e join public.event_calendar c on c.event_id=e.id
    where c.resource_id=target_resource and c.archived_at is null and e.status='scheduled'
      and e.id is distinct from excluded_event and e.starts_at<upper_bound and e.ends_at>lower_bound;
$$;
create function public.ff_calendar_conflicts(target_resource uuid,lower_bound timestamptz,upper_bound timestamptz,excluded_event uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  perform ff_private.require_rule(ff_private.can_view_resource(target_resource),'Kein Zugriff auf diese Ressource.');
  perform ff_private.require_rule(isfinite(lower_bound) and isfinite(upper_bound) and upper_bound>lower_bound
    and upper_bound<=lower_bound+interval '43 days','Gültiger begrenzter Belegungszeitraum erforderlich.');
  return ff_private.calendar_conflicts(target_resource,lower_bound,upper_bound,excluded_event);
end;
$$;

create function public.ff_save_calendar_event(input jsonb,target_event uuid default null,expected_revision int default 0)
returns jsonb language plpgsql security definer set search_path='' as $$
declare previous public.events; previous_meta jsonb; result uuid; kind public.ff_scope;
  unit uuid; func uuid; organizer uuid; resource uuid; category uuid; targets uuid[];
  start_time timestamptz; end_time timestamptz; wanted_audience text; conflicts jsonb:='[]';
begin
  perform ff_private.require_rule(ff_private.is_active(),'Freigabe erforderlich.');
  perform ff_private.validate_single_event(input||jsonb_build_object('event_type','other','response_deadline',null));
  perform ff_private.require_rule(input->>'entry_kind' in ('information','booking')
    and input->>'audience' in ('scope','units','leadership') and jsonb_typeof(input->'all_day')='boolean'
    and jsonb_typeof(input->'unit_ids')='array',
    'Gültiger Informations- oder Belegungstermin erforderlich.');
  kind:=(input->>'scope_kind')::public.ff_scope; unit:=(input->>'unit_id')::uuid; func:=(input->>'function_id')::uuid;
  organizer:=(input->>'organizer_id')::uuid; resource:=(input->>'resource_id')::uuid; category:=(input->>'category_id')::uuid;
  start_time:=(input->>'starts_at')::timestamptz; end_time:=(input->>'ends_at')::timestamptz; wanted_audience:=input->>'audience';
  perform ff_private.require_rule(ff_private.calendar_scope_manager(kind,unit,func),'Keine fachliche Kalenderverwaltung für diesen Bereich.');
  perform ff_private.require_rule(exists(select 1 from public.calendar_categories where id=category and active),'Aktive Kategorie erforderlich.');
  perform ff_private.require_rule(end_time<=start_time+interval '43 days'
    and (not (input->>'all_day')::boolean or (
      (start_time at time zone 'Europe/Berlin')::time='00:00'
      and (end_time at time zone 'Europe/Berlin')::time='00:00')),'Ganztägige Termine benötigen Berliner Tagesgrenzen.');
  select coalesce(array_agg(value::uuid),'{}') into targets from jsonb_array_elements_text(input->'unit_ids');
  perform ff_private.require_rule(cardinality(targets)<=5 and (
    (wanted_audience='units' and kind='organization' and cardinality(targets)>0
      and (select count(distinct t) from unnest(targets) t join public.units u on u.id=t)=cardinality(targets))
    or (wanted_audience<>'units' and cardinality(targets)=0)),'Gültige Zielgruppen erforderlich.');
  perform ff_private.require_rule(ff_private.is_approved_user(organizer) and (
    kind='organization' or (kind='unit' and exists(select 1 from public.unit_memberships m where m.user_id=organizer
      and m.unit_id=unit and m.valid_from<=statement_timestamp() and (m.valid_until is null or m.valid_until>statement_timestamp())))
    or (kind='function' and exists(select 1 from public.function_memberships m where m.user_id=organizer and m.function_id=func
      and m.valid_from<=statement_timestamp() and (m.valid_until is null or m.valid_until>statement_timestamp())))),
    'Verantwortliche Person muss ein freigeschaltetes Mitglied der Zielgruppe sein.');
  perform ff_private.require_rule((input->>'entry_kind'='booking')=(resource is not null),'Belegung benötigt genau eine Ressource.');
  if resource is not null then
    perform 1 from public.calendar_resources where id=resource and active and resource_type='building' for update;
    perform ff_private.require_rule(found and ff_private.can_view_resource(resource),'Keine aktive berechtigte Gerätehausressource.');
    perform ff_private.require_rule(not(kind='unit') or exists(select 1 from public.calendar_resources
      where id=resource and (unit_id is null or unit_id=unit)),'Einheitsbelegung nur für eigene Ressourcen.');
  end if;
  if target_event is not null then
    select * into previous from public.events where id=target_event for update;
    perform ff_private.require_rule(found and ff_private.can_manage_calendar(target_event)
      and previous.status='scheduled' and exists(select 1 from public.event_calendar where event_id=target_event and archived_at is null),
      'Nur aktive organisatorische Kalendereinträge bearbeiten; Dienste behalten ihre bestehende Verwaltung.');
    if previous.revision is distinct from expected_revision then raise exception 'Termin wurde zwischenzeitlich geändert.' using errcode='40001'; end if;
    select to_jsonb(c) into previous_meta from public.event_calendar c where event_id=target_event;
    update public.events set title=btrim(input->>'title'),description=coalesce(input->>'description',''),starts_at=start_time,
      ends_at=end_time,location=btrim(input->>'location'),scope_kind=kind,unit_id=unit,function_id=func,
      organizer_id=organizer,revision=revision+1 where id=target_event returning id into result;
    update public.event_calendar set entry_kind=input->>'entry_kind',all_day=(input->>'all_day')::boolean,
      audience=wanted_audience,category_id=category,resource_id=resource where event_id=result;
    delete from public.calendar_event_units where event_id=result;
  else
    insert into public.events(title,description,event_type,starts_at,ends_at,location,scope_kind,unit_id,function_id,organizer_id)
      values(btrim(input->>'title'),coalesce(input->>'description',''),'other',start_time,end_time,
        btrim(input->>'location'),kind,unit,func,organizer) returning id into result;
    insert into public.event_calendar(event_id,entry_kind,all_day,audience,category_id,resource_id)
      values(result,input->>'entry_kind',(input->>'all_day')::boolean,wanted_audience,category,resource);
  end if;
  insert into public.calendar_event_units(event_id,unit_id) select result,t from unnest(targets) t;
  if resource is not null then conflicts:=ff_private.calendar_conflicts(resource,start_time,end_time,result); end if;
  perform ff_private.write_audit('calendar_event_saved',result,null,
    to_jsonb(previous)||jsonb_build_object('calendar',previous_meta),
    (select to_jsonb(e)||jsonb_build_object('calendar',to_jsonb(c),'conflicts',conflicts)
      from public.events e join public.event_calendar c on c.event_id=e.id where e.id=result));
  return jsonb_build_object('id',result,'conflicts',conflicts);
end;
$$;
create function public.ff_change_calendar_event(target_event uuid,expected_revision int,next_action text,reason text)
returns void language plpgsql security definer set search_path='' as $$
declare previous public.events;
begin
  select * into previous from public.events where id=target_event for update;
  perform ff_private.require_rule(found and ff_private.can_manage_calendar(target_event)
    and next_action in ('cancel','archive') and length(btrim(reason)) between 5 and 2000,
    'Berechtigter organisatorischer Termin, Aktion und Begründung erforderlich.');
  if previous.revision is distinct from expected_revision then raise exception 'Termin wurde zwischenzeitlich geändert.' using errcode='40001'; end if;
  perform ff_private.require_rule(exists(select 1 from public.event_calendar where event_id=target_event and archived_at is null),
    'Termin bereits archiviert.');
  if next_action='cancel' then
    perform ff_private.require_rule(previous.status='scheduled','Termin bereits abgesagt.');
    update public.events set status='cancelled',revision=revision+1 where id=target_event;
  else
    update public.event_calendar set archived_at=clock_timestamp() where event_id=target_event;
    update public.events set revision=revision+1 where id=target_event;
  end if;
  perform ff_private.write_audit('calendar_event_'||next_action,target_event,null,to_jsonb(previous),
    (select to_jsonb(e)||jsonb_build_object('calendar',to_jsonb(c)) from public.events e
      join public.event_calendar c on c.event_id=e.id where e.id=target_event),btrim(reason));
end;
$$;

revoke all on function ff_private.calendar_scope_manager(public.ff_scope,uuid,uuid),ff_private.can_manage_calendar(uuid),
  ff_private.can_view_resource(uuid),ff_private.calendar_conflicts(uuid,timestamptz,timestamptz,uuid) from public,anon,authenticated;
grant execute on function ff_private.can_manage_calendar(uuid),ff_private.can_view_resource(uuid) to authenticated;
revoke all on function public.ff_calendar_context(),public.ff_save_calendar_resource(jsonb,uuid,int),
  public.ff_save_calendar_category(text,uuid,boolean),public.ff_calendar_conflicts(uuid,timestamptz,timestamptz,uuid),
  public.ff_save_calendar_event(jsonb,uuid,int),public.ff_change_calendar_event(uuid,int,text,text) from public,anon,authenticated;
grant execute on function public.ff_calendar_context(),public.ff_save_calendar_resource(jsonb,uuid,int),
  public.ff_save_calendar_category(text,uuid,boolean),public.ff_calendar_conflicts(uuid,timestamptz,timestamptz,uuid),
  public.ff_save_calendar_event(jsonb,uuid,int),public.ff_change_calendar_event(uuid,int,text,text) to authenticated;
notify pgrst,'reload schema';
commit;
