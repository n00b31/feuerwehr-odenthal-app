begin;

alter function public.ff_save_calendar_resource(jsonb,uuid,int) set schema ff_private;
alter function ff_private.ff_save_calendar_resource(jsonb,uuid,int) rename to building_resource_save;
revoke all on function ff_private.building_resource_save(jsonb,uuid,int) from public,anon,authenticated;
create function public.ff_save_calendar_resource(input jsonb,target_resource uuid default null,expected_revision int default 0)
returns uuid language plpgsql security definer set search_path='' as $$
begin
  perform ff_private.require_rule(target_resource is null or exists(select 1 from public.calendar_resources
    where id=target_resource and resource_type='building'),'Fahrzeuge ausschließlich über die Fahrzeugverwaltung bearbeiten.');
  return ff_private.building_resource_save(input,target_resource,expected_revision);
end;
$$;
revoke all on function public.ff_save_calendar_resource(jsonb,uuid,int) from public,anon,authenticated;
grant execute on function public.ff_save_calendar_resource(jsonb,uuid,int) to authenticated;

create or replace function ff_private.calendar_conflicts(target_resource uuid,lower_bound timestamptz,upper_bound timestamptz,excluded_event uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',case when ff_private.can_view_event(e.id) then e.id else null end,
    'title',case when ff_private.can_view_event(e.id) then e.title else 'Bereits belegt (Details geschützt)' end,
    'starts_at',e.starts_at,'ends_at',e.ends_at) order by e.starts_at,e.id),'[]')
  from public.events e join public.event_calendar c on c.event_id=e.id
    left join public.vehicle_reservations q on q.event_id=e.id
  where c.resource_id=target_resource and c.archived_at is null and e.status='scheduled'
    and (q.event_id is null or q.state in ('APPROVED','COMPLETED'))
    and e.id is distinct from excluded_event and e.starts_at<upper_bound and e.ends_at>lower_bound;
$$;

create or replace function ff_private.calendar_summary(target uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('id',e.id,'title',e.title,'description',e.description,'starts_at',e.starts_at,'ends_at',e.ends_at,
    'location',e.location,'event_type',e.event_type,'status',e.status,'revision',e.revision,
    'scope_kind',e.scope_kind,'unit_id',e.unit_id,'function_id',e.function_id,'organizer_id',e.organizer_id,
    'organizer_name',p.display_name,'scope_name',coalesce(u.name,f.name,'Gesamte Feuerwehr'),
    'entry_kind',case when q.event_id is not null then 'vehicle' else coalesce(c.entry_kind,'participation') end,
    'vehicle_state',q.state,'vehicle_kind',q.kind,
    'all_day',coalesce(c.all_day,false),'audience',coalesce(c.audience,'scope'),
    'category_id',c.category_id,'category_name',cat.name,'resource_id',c.resource_id,'resource_name',r.name,
    'can_manage',case when c.event_id is null then ff_private.manages_scope(e.scope_kind,e.unit_id,e.function_id)
      and e.series_id is null else ff_private.can_manage_calendar(e.id) end,
    'unit_ids',coalesce((select jsonb_agg(unit_id order by unit_id) from public.calendar_event_units where event_id=e.id),'[]'))
  from public.events e left join public.event_calendar c on c.event_id=e.id
    left join public.vehicle_reservations q on q.event_id=e.id
    left join public.units u on u.id=e.unit_id left join public.special_functions f on f.id=e.function_id
    left join public.profiles p on p.id=e.organizer_id left join public.calendar_categories cat on cat.id=c.category_id
    left join public.calendar_resources r on r.id=c.resource_id
  where e.id=target and c.archived_at is null and ff_private.can_view_event(e.id);
$$;
create function public.ff_calendar_vehicle_page(lower_bound timestamptz,upper_bound timestamptz,scopes text[] default '{}',
  wanted_units uuid[] default '{}',wanted_types public.ff_event_type[] default '{}',wanted_kinds text[] default '{}',wanted_categories uuid[] default '{}',
  wanted_resources uuid[] default '{}',show_cancelled boolean default true,after_start timestamptz default null,
  after_id uuid default null,retained_ids uuid[] default '{}')
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare ids uuid[]; items jsonb; cursor jsonb;
begin
  perform ff_private.require_rule(ff_private.is_active(),'Freigabe erforderlich.');
  perform ff_private.require_rule(isfinite(lower_bound) and isfinite(upper_bound) and upper_bound>lower_bound
    and (upper_bound at time zone 'Europe/Berlin')::date-(lower_bound at time zone 'Europe/Berlin')::date between 1 and 42
    and (lower_bound at time zone 'Europe/Berlin')::time='00:00'
    and (upper_bound at time zone 'Europe/Berlin')::time='00:00','Kalenderzeitraum: höchstens 42 vollständige Berliner Tage.');
  perform ff_private.require_rule(scopes is not null and scopes<@array['mine','organization','units','function']
    and cardinality(wanted_units)<=5 and cardinality(wanted_categories)<=50 and cardinality(wanted_resources)<=50
    and cardinality(wanted_types)<=6 and cardinality(wanted_kinds)<=4 and wanted_kinds<@array['participation','information','booking','vehicle']
    and show_cancelled is not null and cardinality(retained_ids)<=10
    and (after_start is null)=(after_id is null),'Ungültige Kalenderfilter oder Cursor.');
  select coalesce(array_agg(page.id order by page.starts_at,page.id),'{}') into ids from (
    select e.id,e.starts_at from public.events e left join public.event_calendar c on c.event_id=e.id
    left join public.vehicle_reservations q on q.event_id=e.id
    where ff_private.can_view_event(e.id) and c.archived_at is null and (show_cancelled or e.status='scheduled')
      and e.starts_at<upper_bound and e.ends_at>lower_bound
      and (after_id is null or (e.starts_at,e.id)>(after_start,after_id))
      and ((cardinality(wanted_types)=0 and cardinality(wanted_kinds)=0)
        or (c.event_id is null and e.event_type=any(wanted_types))
        or (case when q.event_id is not null then 'vehicle' else coalesce(c.entry_kind,'participation') end)=any(wanted_kinds))
      and (cardinality(wanted_categories)=0 or c.category_id=any(wanted_categories))
      and (cardinality(wanted_resources)=0 or c.resource_id=any(wanted_resources))
      and (cardinality(wanted_units)=0 or e.unit_id=any(wanted_units)
        or exists(select 1 from public.calendar_event_units t where t.event_id=e.id and t.unit_id=any(wanted_units)))
      and (cardinality(scopes)=0 or ('organization'=any(scopes) and e.scope_kind='organization' and coalesce(c.audience,'scope')<>'units')
        or ('units'=any(scopes) and (e.scope_kind='unit' or c.audience='units'))
        or ('function'=any(scopes) and e.scope_kind='function')
        or ('mine'=any(scopes) and exists(select 1 from public.unit_memberships m where m.user_id=auth.uid()
          and m.valid_from<=statement_timestamp() and (m.valid_until is null or m.valid_until>statement_timestamp())
          and (e.unit_id=m.unit_id or exists(select 1 from public.calendar_event_units t where t.event_id=e.id and t.unit_id=m.unit_id)))))
    order by e.starts_at,e.id limit 401
  ) page;
  select coalesce(jsonb_agg(ff_private.calendar_summary(id) order by position),'[]') into items
    from unnest(ids[1:400]) with ordinality p(id,position);
  if cardinality(ids)>400 then cursor:=jsonb_build_object('starts_at',items->399->>'starts_at','id',items->399->>'id'); end if;
  return jsonb_build_object('server_now',statement_timestamp(),'events',items,'next_cursor',cursor,
    'retained_events',coalesce((select jsonb_agg(summary order by summary->>'starts_at',summary->>'id')
      from (select ff_private.calendar_summary(id) summary from (select distinct unnest(retained_ids) id) x
        where not(id=any(ids[1:400]))) y where summary is not null),'[]'));
end;
$$;

alter function public.ff_calendar_page(timestamptz,timestamptz,text[],uuid[],public.ff_event_type[],text[],uuid[],uuid[],boolean,timestamptz,uuid,uuid[])
  set schema ff_private;
alter function ff_private.ff_calendar_page(timestamptz,timestamptz,text[],uuid[],public.ff_event_type[],text[],uuid[],uuid[],boolean,timestamptz,uuid,uuid[])
  rename to legacy_calendar_page;
revoke all on function ff_private.legacy_calendar_page(timestamptz,timestamptz,text[],uuid[],public.ff_event_type[],text[],uuid[],uuid[],boolean,timestamptz,uuid,uuid[])
  from public,anon,authenticated;
create function public.ff_calendar_page(lower_bound timestamptz,upper_bound timestamptz,scopes text[] default '{}',
  wanted_units uuid[] default '{}',wanted_types public.ff_event_type[] default '{}',wanted_kinds text[] default '{}',wanted_categories uuid[] default '{}',
  wanted_resources uuid[] default '{}',show_cancelled boolean default true,after_start timestamptz default null,
  after_id uuid default null,retained_ids uuid[] default '{}')
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  result:=ff_private.legacy_calendar_page(lower_bound,upper_bound,scopes,wanted_units,wanted_types,wanted_kinds,wanted_categories,
    wanted_resources,show_cancelled,after_start,after_id,retained_ids);
  return result||jsonb_build_object(
    'events',coalesce((select jsonb_agg(item order by position) from jsonb_array_elements(result->'events') with ordinality x(item,position)
      where item->>'entry_kind' is distinct from 'vehicle'),'[]'),
    'retained_events',coalesce((select jsonb_agg(item order by position) from jsonb_array_elements(result->'retained_events') with ordinality x(item,position)
      where item->>'entry_kind' is distinct from 'vehicle'),'[]'));
end;
$$;
alter function public.ff_calendar_context() set schema ff_private;
alter function ff_private.ff_calendar_context() rename to base_calendar_context;
revoke all on function ff_private.base_calendar_context() from public,anon,authenticated;
create function public.ff_calendar_context()
returns jsonb language sql stable security definer set search_path='' as $$
  select result||jsonb_build_object('vehicle_calendar',true,'resources',coalesce((
    select jsonb_agg(item order by item->>'name') from jsonb_array_elements(result->'resources') item
      where item->>'resource_type'<>'vehicle'),'[]')) from (select ff_private.base_calendar_context() result) x;
$$;
create function public.ff_calendar_vehicle_context()
returns jsonb language sql stable security definer set search_path='' as $$
  select ff_private.base_calendar_context()||jsonb_build_object('vehicle_calendar',true);
$$;
revoke all on function public.ff_calendar_context(),public.ff_calendar_vehicle_context(),
  public.ff_calendar_vehicle_page(timestamptz,timestamptz,text[],uuid[],public.ff_event_type[],text[],uuid[],uuid[],boolean,timestamptz,uuid,uuid[]),
  public.ff_calendar_page(timestamptz,timestamptz,text[],uuid[],public.ff_event_type[],text[],uuid[],uuid[],boolean,timestamptz,uuid,uuid[])
  from public,anon,authenticated;
grant execute on function public.ff_calendar_context(),public.ff_calendar_vehicle_context(),
  public.ff_calendar_vehicle_page(timestamptz,timestamptz,text[],uuid[],public.ff_event_type[],text[],uuid[],uuid[],boolean,timestamptz,uuid,uuid[]),
  public.ff_calendar_page(timestamptz,timestamptz,text[],uuid[],public.ff_event_type[],text[],uuid[],uuid[],boolean,timestamptz,uuid,uuid[])
  to authenticated;
notify pgrst,'reload schema';
commit;
