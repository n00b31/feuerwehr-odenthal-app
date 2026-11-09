begin;

create function ff_private.dashboard_event(target uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('id',e.id,'title',e.title,'starts_at',e.starts_at,'ends_at',e.ends_at,
    'location',e.location,'scope_name',coalesce(u.name,f.name,'Alle Einheiten'),
    'own_response',(select response from public.participation_responses
      where event_id=e.id and user_id=auth.uid() and invalidated_at is null),
    'response_deadline',e.response_deadline,
    'can_reply',e.status='scheduled' and e.starts_at>statement_timestamp()
      and (e.response_deadline is null or e.response_deadline>statement_timestamp())
      and not ff_private.roster_frozen(e.id)
      and exists(select 1 from ff_private.event_members(e.id) m where m.user_id=auth.uid()))
  from public.events e left join public.units u on u.id=e.unit_id
  left join public.special_functions f on f.id=e.function_id
  where e.id=target and ff_private.can_view_event(e.id);
$$;
revoke all on function ff_private.dashboard_event(uuid) from public,anon,authenticated;

create function public.ff_dashboard()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare year_value int:=extract(year from statement_timestamp() at time zone 'Europe/Berlin')::int;
  personal jsonb; registrations bigint:=0; attendance_count bigint; organizer_count bigint; vehicle_count bigint;
  attendance_id uuid; organizer_id uuid; vehicle_id uuid; result jsonb;
begin
  perform ff_private.require_rule(ff_private.is_active(),'Freigabe erforderlich.');
  -- Reuse the canonical confirmed-attendance calculation, never RSVP arithmetic.
  personal:=public.ff_year_report(year_value,'personal',null,null,0,false)->'summary';
  if ff_private.has_role('GLOBAL_ADMIN') then
    select count(*) into registrations from public.ff_pending_registrations();
  end if;
  select count(*),(array_agg(e.id order by e.starts_at,e.id))[1] into attendance_count,attendance_id
    from public.events e where e.status='scheduled' and e.starts_at<=statement_timestamp()
      and e.attendance_state in ('NOT_STARTED','IN_PROGRESS')
      and not exists(select 1 from public.event_calendar c where c.event_id=e.id)
      and ff_private.can_lead_event(e.id);
  select count(*),(array_agg(e.id order by e.starts_at,e.id))[1] into organizer_count,organizer_id
    from public.events e where e.status='scheduled' and e.starts_at>statement_timestamp()
      and not exists(select 1 from public.event_calendar c where c.event_id=e.id)
      and ff_private.manages_scope(e.scope_kind,e.unit_id,e.function_id)
      and not exists(select 1 from public.event_delegations d where d.event_id=e.id and d.is_primary
        and d.revoked_at is null and exists(select 1 from ff_private.event_members(e.id) m where m.user_id=d.user_id));
  select count(*),(array_agg(e.id order by e.starts_at,e.id))[1] into vehicle_count,vehicle_id
    from public.vehicle_reservations q join public.events e on e.id=q.event_id
    where q.state='REQUESTED' and q.kind='reservation' and e.status='scheduled'
      and e.starts_at>statement_timestamp() and ff_private.vehicle_manager(q.vehicle_id);
  with personal_events as materialized (
    select e.id,e.starts_at,e.event_type,
      (select response from public.participation_responses p
        where p.event_id=e.id and p.user_id=auth.uid() and p.invalidated_at is null) response,
      e.response_deadline,ff_private.roster_frozen(e.id) frozen
    from public.events e where e.status='scheduled' and e.starts_at>statement_timestamp()
      and not exists(select 1 from public.event_calendar c where c.event_id=e.id)
      and exists(select 1 from ff_private.event_members(e.id) m where m.user_id=auth.uid())
      and ff_private.can_view_event(e.id)
  ), unanswered as materialized (
    select * from personal_events where response is null and not frozen
      and (response_deadline is null or response_deadline>statement_timestamp())
  )
  select jsonb_build_object(
    'actor_id',auth.uid(),'server_now',statement_timestamp(),'year',year_value,
    'units',coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'name',u.name) order by u.name,u.id)
      from public.units u where ff_private.belongs_to_scope('unit',u.id,null)),'[]'::jsonb),
    'functions',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'name',f.name) order by f.name,f.id)
      from public.special_functions f where ff_private.belongs_to_scope('function',null,f.id)),'[]'::jsonb),
    'next_service',(select ff_private.dashboard_event(id) from personal_events
      where event_type in ('regular','special') order by starts_at,id limit 1),
    'open_count',(select count(*) from unanswered),
    'open_events',coalesce((select jsonb_agg(ff_private.dashboard_event(id) order by starts_at,id)
      from (select id,starts_at from unanswered order by starts_at,id limit 3) page),'[]'::jsonb),
    'statistics',personal,
    'information',coalesce((select jsonb_agg(jsonb_build_object('id',id,'title',title,
      'starts_at',starts_at,'scope_name',scope_name) order by starts_at,id) from (
      select e.id,e.title,e.starts_at,coalesce(u.name,f.name,'Alle Einheiten') scope_name
      from public.events e join public.event_calendar c on c.event_id=e.id
      left join public.units u on u.id=e.unit_id left join public.special_functions f on f.id=e.function_id
      where c.entry_kind='information' and c.archived_at is null and e.status='scheduled'
        and e.ends_at>statement_timestamp() and ff_private.can_view_event(e.id)
      order by e.starts_at,e.id limit 3) page),'[]'::jsonb),
    'reservations',coalesce((select jsonb_agg(jsonb_build_object('id',id,'vehicle_name',vehicle_name,
      'starts_at',starts_at,'state',state) order by priority,starts_at,id) from (
      select * from (
        select e.id,r.name vehicle_name,e.starts_at,q.state,
          case when q.state='APPROVED' then 0 else 1 end priority,
          row_number() over(partition by q.state order by e.starts_at,e.id) ordinal
        from public.vehicle_reservations q join public.events e on e.id=q.event_id
        join public.calendar_resources r on r.id=q.vehicle_id
        where q.requester_id=auth.uid() and q.kind='reservation' and q.state in ('REQUESTED','APPROVED')
          and e.status='scheduled' and e.ends_at>statement_timestamp()
          and ff_private.vehicle_request_visible(q.event_id)
      ) ranked where state='REQUESTED' or ordinal=1
      order by priority,starts_at,id limit 2) page),'[]'::jsonb),
    'tasks',(select coalesce(jsonb_agg(jsonb_build_object('kind',kind,'count',amount,'target',target)
      order by ordinal),'[]'::jsonb) from (values
      (1,'registrations',registrations,null::uuid),
      (2,'attendance',attendance_count,attendance_id),
      (3,'organizer',organizer_count,organizer_id),
      (4,'vehicles',vehicle_count,vehicle_id)) t(ordinal,kind,amount,target) where amount>0),
    'vehicles_visible',exists(select 1 from public.vehicles v where ff_private.vehicle_visible(v.resource_id))
      or exists(select 1 from public.vehicle_reservations q where q.requester_id=auth.uid())
  ) into result;
  return result;
end;
$$;
revoke all on function public.ff_dashboard() from public,anon;
grant execute on function public.ff_dashboard() to authenticated;
notify pgrst,'reload schema';
commit;
