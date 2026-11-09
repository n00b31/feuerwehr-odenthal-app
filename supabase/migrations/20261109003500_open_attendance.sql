begin;

create function ff_private.open_attendance_events()
returns table(id uuid,starts_at timestamptz)
language sql stable security definer set search_path='' as $$
  select e.id,e.starts_at from public.events e
  where e.status='scheduled' and e.starts_at<=statement_timestamp()
    and e.attendance_state in ('NOT_STARTED','IN_PROGRESS')
    and not exists(select 1 from public.event_calendar c where c.event_id=e.id)
    and ff_private.can_lead_event(e.id) and ff_private.can_view_event(e.id);
$$;
create function ff_private.can_filter_attendance()
returns boolean language sql stable security definer set search_path='' as $$
  select ff_private.is_active() and (
    exists(select 1 from public.units u where ff_private.manages_scope('unit',u.id,null))
    or exists(select 1 from public.special_functions f where ff_private.manages_scope('function',null,f.id))
    or exists(select 1 from public.event_delegations d where d.user_id=auth.uid() and d.revoked_at is null
      and not exists(select 1 from public.event_calendar c where c.event_id=d.event_id)
      and ff_private.can_lead_event(d.event_id)));
$$;
revoke all on function ff_private.open_attendance_events(),ff_private.can_filter_attendance() from public,anon,authenticated;

alter function ff_private.event_summary(uuid) rename to event_summary_064;
create function ff_private.event_summary(target uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select ff_private.event_summary_064(target)||jsonb_build_object('organizer_name',
    coalesce((select p.display_name from public.event_delegations d join public.profiles p on p.id=d.user_id
      where d.event_id=e.id and d.is_primary and d.revoked_at is null),p.display_name,'Nicht zugewiesen'))
  from public.events e left join public.profiles p on p.id=e.organizer_id where e.id=target;
$$;
revoke all on function ff_private.event_summary_064(uuid),ff_private.event_summary(uuid) from public,anon,authenticated;

create or replace function public.ff_events_page(list_view text default 'upcoming',month_key text default null,
  after_start timestamptz default null,after_id uuid default null,status_filter text default 'all',retained_ids uuid[] default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare now_time timestamptz:=statement_timestamp(); lower_bound timestamptz; upper_bound timestamptz;
  month_date date; page_size integer; ids uuid[]; items jsonb; retained jsonb; cursor jsonb;
  filter_access boolean:=ff_private.can_filter_attendance(); open_count bigint;
begin
  perform ff_private.require_rule(ff_private.is_active(),'Freigabe erforderlich.');
  perform ff_private.require_rule(list_view in ('upcoming','past','month','open_attendance')
    and status_filter in ('all','scheduled','cancelled'),'Invalid event list filter');
  perform ff_private.require_rule((after_start is null)=(after_id is null)
    and (after_id is null or list_view in ('month','open_attendance')),'Invalid event cursor');
  perform ff_private.require_rule(retained_ids is not null and cardinality(retained_ids)<=100,'Too many retained events');
  if list_view='open_attendance' then
    perform ff_private.require_rule(filter_access,'Keine Berechtigung für offene Anwesenheitslisten.');
    select count(*) into open_count from ff_private.open_attendance_events();
  elsif list_view='month' then
    perform ff_private.require_rule(month_key ~ '^[0-9]{4}-(0[1-9]|1[0-2])$','Invalid event month');
    perform ff_private.require_rule(substring(month_key,1,4)::integer between 2000 and 9998,'Invalid event year');
    month_date:=make_date(substring(month_key,1,4)::integer,substring(month_key,6,2)::integer,1);
    lower_bound:=month_date::timestamp at time zone 'Europe/Berlin';
    upper_bound:=(month_date+interval '1 month') at time zone 'Europe/Berlin';
  end if;
  page_size:=case when list_view in ('month','open_attendance') then 50 else 5 end;
  if list_view='open_attendance' then
    select coalesce(array_agg(page.id order by page.starts_at,page.id),'{}'::uuid[]) into ids from (
      select e.id,e.starts_at from ff_private.open_attendance_events() e
      where after_id is null or (e.starts_at,e.id)>(after_start,after_id)
      order by e.starts_at,e.id limit page_size+1) page;
  else
    select coalesce(array_agg(page.id order by page.position),'{}'::uuid[]) into ids from (
      select e.id,row_number() over(order by case when list_view='past' then e.starts_at end desc,
        case when list_view<>'past' then e.starts_at end asc,case when list_view='past' then e.id end desc,
        case when list_view<>'past' then e.id end asc) position
      from public.events e where ff_private.can_view_event(e.id)
        and not exists(select 1 from public.event_calendar where event_id=e.id)
        and (status_filter='all' or e.status::text=status_filter)
        and (case list_view when 'upcoming' then e.ends_at>now_time when 'past' then e.ends_at<=now_time
          else e.starts_at>=lower_bound and e.starts_at<upper_bound end)
        and (after_id is null or (e.starts_at,e.id)>(after_start,after_id))
      order by position limit page_size+1) page;
  end if;
  select coalesce(jsonb_agg(ff_private.event_summary(id) order by position),'[]'::jsonb) into items
    from unnest(ids[1:page_size]) with ordinality page(id,position);
  if list_view in ('month','open_attendance') and cardinality(ids)>page_size then
    cursor:=jsonb_build_object('id',items->(page_size-1)->>'id','starts_at',items->(page_size-1)->>'starts_at');
  end if;
  select coalesce(jsonb_agg(summary order by summary->>'starts_at',summary->>'id'),'[]'::jsonb) into retained
    from (select ff_private.event_summary(id) summary from (select distinct unnest(retained_ids) id) chosen
      where not(id=any(ids[1:page_size])) and not exists(select 1 from public.event_calendar where event_id=id)) snapshots where summary is not null;
  return jsonb_build_object('server_now',now_time,'manageable_units',coalesce((
    select jsonb_agg(jsonb_build_object('id',u.id,'name',u.name) order by u.name) from public.units u
      where ff_private.manages_scope('unit',u.id,null)),'[]'::jsonb),
    'events',items,'has_more',cardinality(ids)>page_size,'next_cursor',cursor,'retained_events',retained,
    'can_filter_attendance',filter_access,'open_attendance_count',open_count);
end;
$$;

-- Preserve every other cockpit field; only the attendance task uses the shared selection.
alter function public.ff_dashboard() set schema ff_private;
alter function ff_private.ff_dashboard() rename to dashboard_064;
revoke all on function ff_private.dashboard_064() from public,anon,authenticated;
create function public.ff_dashboard()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; amount bigint; target uuid; tasks jsonb;
begin
  result:=ff_private.dashboard_064();
  select count(*),(array_agg(e.id order by e.starts_at,e.id))[1] into amount,target
    from ff_private.open_attendance_events() e;
  select coalesce(jsonb_agg(t order by case t->>'kind' when 'registrations' then 1
    when 'attendance' then 2 when 'organizer' then 3 else 4 end),'[]'::jsonb) into tasks from (
    select t from jsonb_array_elements(result->'tasks') t where t->>'kind'<>'attendance'
    union all select jsonb_build_object('kind','attendance','count',amount,'target',target) where amount>0
  ) rows;
  return jsonb_set(result,'{tasks}',tasks);
end;
$$;
revoke all on function public.ff_dashboard() from public,anon;
grant execute on function public.ff_dashboard() to authenticated;
notify pgrst,'reload schema';
commit;
