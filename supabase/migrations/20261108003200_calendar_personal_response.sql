begin;

create or replace function ff_private.calendar_summary(target uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('id',e.id,'title',e.title,'description',e.description,'starts_at',e.starts_at,'ends_at',e.ends_at,
    'location',e.location,'event_type',e.event_type,'status',e.status,'revision',e.revision,
    'scope_kind',e.scope_kind,'unit_id',e.unit_id,'function_id',e.function_id,'organizer_id',e.organizer_id,
    'organizer_name',p.display_name,'scope_name',coalesce(u.name,f.name,'Gesamte Feuerwehr'),
    'own_response',case when c.event_id is null then (select pr.response from public.participation_responses pr
      where pr.event_id=e.id and pr.user_id=auth.uid() and pr.invalidated_at is null
        and exists(select 1 from ff_private.event_members(e.id) m where m.user_id=auth.uid())) else null end,
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
notify pgrst,'reload schema';
commit;
