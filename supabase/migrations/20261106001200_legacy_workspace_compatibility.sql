begin;

-- The already published 0.3.3 client has no history picker. Preserve its RPC
-- until the user publishes 0.3.4, which exclusively reads ff_events_page.
create or replace function public.ff_events_workspace()
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform ff_private.require_rule(ff_private.is_active(),'Freigabe erforderlich.');
  return jsonb_build_object(
    'server_now',clock_timestamp(),
    'manageable_units',coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'name',u.name) order by u.name)
      from public.units u where ff_private.manages_scope('unit',u.id,null)),'[]'::jsonb),
    'events',coalesce((select jsonb_agg(to_jsonb(e)||jsonb_build_object(
      'scope_name',coalesce(u.name,f.name,'Alle Einheiten'),
      'can_manage',ff_private.manages_scope(e.scope_kind,e.unit_id,e.function_id) and e.series_id is null,
      'can_lead',ff_private.can_lead_event(e.id),'can_delegate',ff_private.manages_scope(e.scope_kind,e.unit_id,e.function_id),
      'can_read_attendance',ff_private.can_read_attendance(e.id),
      'own_attendance',case when ff_private.attendance_is_final(e.id) then (select a.status from public.actual_attendance a where a.event_id=e.id and a.user_id=auth.uid()) else null end,
      'in_roster',exists(select 1 from public.event_roster where event_id=e.id and user_id=auth.uid()),
      'own_response',(select response from public.participation_responses where event_id=e.id and user_id=auth.uid()),
      'participants',case when ff_private.can_lead_event(e.id) or ff_private.is_overseer() then coalesce(
        (select jsonb_agg(jsonb_build_object('user_id',r.user_id,'name',r.name_snapshot,'response',p.response,'updated_at',p.updated_at)
          order by r.name_snapshot,r.user_id) from public.event_roster r left join public.participation_responses p using(event_id,user_id)
          where r.event_id=e.id),'[]'::jsonb) else null end) order by e.starts_at,e.id)
      from public.events e left join public.units u on u.id=e.unit_id left join public.special_functions f on f.id=e.function_id
      where ff_private.can_view_event(e.id)),'[]'::jsonb));
end;
$$;
notify pgrst,'reload schema';
commit;
