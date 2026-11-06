begin;

-- Only future first preparations use the new proposal; no existing rows are rewritten.
create or replace function public.ff_prepare_attendance(target_event uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare item public.events; prepared_count integer; prepared_time timestamptz;
begin
  item:=ff_private.lock_attendance_event(target_event);
  perform ff_private.require_rule(item.event_type in ('regular','special'),'Prefill is only available for practices');
  if item.attendance_prepared_at is not null or exists(select 1 from public.attendance_confirmations where event_id=target_event) then return; end if;
  insert into public.actual_attendance(event_id,user_id,status,origin,recorded_by,response_snapshot,response_snapshot_known)
    select r.event_id,r.user_id,(case p.response when 'yes' then 'present' else 'absent' end)::public.ff_attendance,
      'prefill',auth.uid(),p.response,true from public.event_roster r left join public.participation_responses p using(event_id,user_id)
    where r.event_id=target_event on conflict(event_id,user_id) do nothing;
  get diagnostics prepared_count=row_count;
  prepared_time:=clock_timestamp();
  update public.events set attendance_prepared_at=prepared_time,attendance_state='IN_PROGRESS',
    attendance_initialized_at=coalesce(attendance_initialized_at,prepared_time),
    attendance_initialized_by=coalesce(attendance_initialized_by,auth.uid()) where id=target_event;
  perform ff_private.write_audit('attendance_prepared',target_event,null,null,
    jsonb_build_object('provisional',true,'inserted',prepared_count,'prepared_at',prepared_time,'prepared_by',auth.uid()));
end;
$$;

create index events_list_start on public.events(starts_at,id);
create index events_list_end on public.events(ends_at);

create function ff_private.event_summary(target uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select to_jsonb(e)||jsonb_build_object(
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
        where r.event_id=e.id),'[]'::jsonb) else null end)
    from public.events e left join public.units u on u.id=e.unit_id left join public.special_functions f on f.id=e.function_id
    where e.id=target and ff_private.can_view_event(e.id);
$$;
revoke all on function ff_private.event_summary(uuid) from public,anon,authenticated;

create function public.ff_events_page(list_view text default 'upcoming',month_key text default null,
  after_start timestamptz default null,after_id uuid default null,status_filter text default 'all',retained_ids uuid[] default '{}')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare now_time timestamptz:=clock_timestamp(); lower_bound timestamptz; upper_bound timestamptz;
  month_date date; page_size integer; ids uuid[]; items jsonb; retained jsonb; cursor jsonb;
begin
  perform ff_private.require_rule(ff_private.is_active(),'Freigabe erforderlich.');
  perform ff_private.require_rule(list_view in ('upcoming','past','month') and status_filter in ('all','scheduled','cancelled'),
    'Invalid event list filter');
  perform ff_private.require_rule((after_start is null)=(after_id is null) and (after_id is null or list_view='month'),
    'Invalid event cursor');
  perform ff_private.require_rule(retained_ids is not null and cardinality(retained_ids)<=100,'Too many retained events');
  if list_view='month' then
    perform ff_private.require_rule(month_key ~ '^[0-9]{4}-(0[1-9]|1[0-2])$','Invalid event month');
    perform ff_private.require_rule(substring(month_key,1,4)::integer between 2000 and 9998,'Invalid event year');
    month_date:=make_date(substring(month_key,1,4)::integer,substring(month_key,6,2)::integer,1);
    lower_bound:=month_date::timestamp at time zone 'Europe/Berlin';
    upper_bound:=(month_date+interval '1 month') at time zone 'Europe/Berlin';
  end if;
  page_size:=case when list_view='month' then 50 else 5 end;
  select coalesce(array_agg(page.id order by page.position),'{}'::uuid[]) into ids from (
    select e.id,row_number() over(order by
      case when list_view='past' then e.starts_at end desc,
      case when list_view<>'past' then e.starts_at end asc,
      case when list_view='past' then e.id end desc,
      case when list_view<>'past' then e.id end asc) as position
    from public.events e where ff_private.can_view_event(e.id)
      and (status_filter='all' or e.status::text=status_filter)
      and (case list_view when 'upcoming' then e.ends_at>now_time when 'past' then e.ends_at<=now_time
        else e.starts_at>=lower_bound and e.starts_at<upper_bound end)
      and (after_id is null or (e.starts_at,e.id)>(after_start,after_id))
    order by position limit page_size+1
  ) page;
  select coalesce(jsonb_agg(ff_private.event_summary(id) order by position),'[]'::jsonb) into items
    from unnest(ids[1:page_size]) with ordinality as page(id,position);
  if list_view='month' and cardinality(ids)>page_size then
    cursor:=jsonb_build_object('id',items->(page_size-1)->>'id','starts_at',items->(page_size-1)->>'starts_at');
  end if;
  select coalesce(jsonb_agg(summary order by summary->>'starts_at',summary->>'id'),'[]'::jsonb) into retained
    from (select ff_private.event_summary(id) as summary from (select distinct unnest(retained_ids) as id) chosen
      where not(id=any(ids[1:page_size]))) snapshots where summary is not null;
  return jsonb_build_object('server_now',now_time,
    'manageable_units',coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'name',u.name) order by u.name)
      from public.units u where ff_private.manages_scope('unit',u.id,null)),'[]'::jsonb),
    'events',items,'has_more',cardinality(ids)>page_size,'next_cursor',cursor,'retained_events',retained);
end;
$$;
revoke all on function public.ff_events_page(text,text,timestamptz,uuid,text,uuid[]) from public,anon,authenticated;
grant execute on function public.ff_events_page(text,text,timestamptz,uuid,text,uuid[]) to authenticated;

-- Keep the legacy signature, but never return the full unfiltered event collection.
create or replace function public.ff_events_workspace()
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  return public.ff_events_page();
end;
$$;
notify pgrst,'reload schema';
commit;
