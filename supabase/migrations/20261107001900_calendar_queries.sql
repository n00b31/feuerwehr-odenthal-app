begin;

create function ff_private.calendar_summary(target uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('id',e.id,'title',e.title,'description',e.description,'starts_at',e.starts_at,'ends_at',e.ends_at,
    'location',e.location,'event_type',e.event_type,'status',e.status,'revision',e.revision,
    'scope_kind',e.scope_kind,'unit_id',e.unit_id,'function_id',e.function_id,'organizer_id',e.organizer_id,
    'organizer_name',p.display_name,'scope_name',coalesce(u.name,f.name,'Gesamte Feuerwehr'),
    'entry_kind',coalesce(c.entry_kind,'participation'),'all_day',coalesce(c.all_day,false),
    'audience',coalesce(c.audience,'scope'),'category_id',c.category_id,'category_name',cat.name,
    'resource_id',c.resource_id,'resource_name',r.name,'can_manage',case when c.event_id is null then
      ff_private.manages_scope(e.scope_kind,e.unit_id,e.function_id) and e.series_id is null else ff_private.can_manage_calendar(e.id) end,
    'unit_ids',coalesce((select jsonb_agg(unit_id order by unit_id) from public.calendar_event_units where event_id=e.id),'[]'::jsonb))
  from public.events e left join public.event_calendar c on c.event_id=e.id
    left join public.units u on u.id=e.unit_id left join public.special_functions f on f.id=e.function_id
    left join public.profiles p on p.id=e.organizer_id
    left join public.calendar_categories cat on cat.id=c.category_id left join public.calendar_resources r on r.id=c.resource_id
  where e.id=target and c.archived_at is null and ff_private.can_view_event(e.id);
$$;
create function public.ff_calendar_page(lower_bound timestamptz,upper_bound timestamptz,scopes text[] default '{}',
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
    and cardinality(wanted_types)<=6 and cardinality(wanted_kinds)<=3 and wanted_kinds<@array['participation','information','booking']
    and show_cancelled is not null and cardinality(retained_ids)<=10
    and (after_start is null)=(after_id is null),'Ungültige Kalenderfilter oder Cursor.');
  select coalesce(array_agg(page.id order by page.starts_at,page.id),'{}') into ids from (
    select e.id,e.starts_at from public.events e left join public.event_calendar c on c.event_id=e.id
    where ff_private.can_view_event(e.id) and c.archived_at is null and (show_cancelled or e.status='scheduled')
      and e.starts_at<upper_bound and e.ends_at>lower_bound
      and (after_id is null or (e.starts_at,e.id)>(after_start,after_id))
      and ((cardinality(wanted_types)=0 and cardinality(wanted_kinds)=0)
        or (c.event_id is null and e.event_type=any(wanted_types))
        or coalesce(c.entry_kind,'participation')=any(wanted_kinds))
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

-- Preserve legacy editing behavior, but never let that API bypass calendar metadata.
create or replace function public.ff_update_single_event(target_event uuid,expected_revision integer,input jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare previous public.events;
begin
  select * into previous from public.events where id=target_event for update;
  perform ff_private.require_rule(found and ff_private.manages_scope(previous.scope_kind,previous.unit_id,previous.function_id),
    'Keine Terminverwaltung für diesen Bereich.');
  perform ff_private.require_rule(not exists(select 1 from public.event_calendar where event_id=target_event),
    'Organisatorische Einträge ausschließlich über die Kalenderverwaltung bearbeiten.');
  perform ff_private.require_rule(previous.series_id is null and previous.status='scheduled'
    and previous.starts_at>clock_timestamp(),'Nur zukünftige, geplante Einzeltermine sind bearbeitbar.');
  if expected_revision is distinct from previous.revision then
    raise exception 'Termin wurde zwischenzeitlich geändert. Bitte aktualisieren.' using errcode='40001';
  end if;
  perform ff_private.validate_single_event(input);
  perform ff_private.require_rule((input->>'starts_at')::timestamptz>clock_timestamp(),'Der geänderte Beginn muss in der Zukunft liegen.');
  perform ff_private.require_rule((input->>'unit_id')::uuid is not distinct from previous.unit_id,
    'Einheit und Teilnehmerkreis bleiben bei bestehenden Terminen unverändert.');
  update public.events set title=btrim(input->>'title'),description=coalesce(input->>'description',''),
    event_type=(input->>'event_type')::public.ff_event_type,starts_at=(input->>'starts_at')::timestamptz,
    ends_at=(input->>'ends_at')::timestamptz,location=btrim(input->>'location'),
    response_deadline=nullif(input->>'response_deadline','')::timestamptz,revision=revision+1 where id=target_event;
  perform ff_private.write_audit('event_updated',target_event,null,to_jsonb(previous),
    (select to_jsonb(e) from public.events e where e.id=target_event));
end;
$$;
create or replace function public.ff_cancel_single_event(target_event uuid,expected_revision integer,reason text)
returns void language plpgsql security definer set search_path='' as $$
declare previous public.events;
begin
  select * into previous from public.events where id=target_event for update;
  perform ff_private.require_rule(found and ff_private.manages_scope(previous.scope_kind,previous.unit_id,previous.function_id),
    'Keine Terminverwaltung für diesen Bereich.');
  perform ff_private.require_rule(not exists(select 1 from public.event_calendar where event_id=target_event),
    'Organisatorische Einträge ausschließlich über die Kalenderverwaltung absagen.');
  perform ff_private.require_rule(previous.series_id is null and previous.status='scheduled','Nur geplante Einzeltermine können abgesagt werden.');
  if expected_revision is distinct from previous.revision then
    raise exception 'Termin wurde zwischenzeitlich geändert. Bitte aktualisieren.' using errcode='40001';
  end if;
  perform ff_private.require_rule(length(btrim(reason)) between 5 and 2000,'Absagegrund mit mindestens fünf Zeichen erforderlich.');
  perform ff_private.require_rule(not exists(select 1 from public.actual_attendance where event_id=target_event)
    and not exists(select 1 from public.attendance_confirmations where event_id=target_event),
    'Termine mit erfasster Anwesenheit können nicht abgesagt werden.');
  update public.events set status='cancelled',revision=revision+1 where id=target_event;
  perform ff_private.write_audit('event_cancelled',target_event,null,to_jsonb(previous),
    (select to_jsonb(e) from public.events e where e.id=target_event),btrim(reason));
end;
$$;

-- Same bounded legacy API and ordering; organizational metadata never enters duty management.
create or replace function public.ff_events_workspace()
returns jsonb language plpgsql security definer set search_path='' as $$
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
      where ff_private.can_view_event(e.id) and not exists(select 1 from public.event_calendar where event_id=e.id)),'[]'::jsonb));
end;
$$;

create or replace function public.ff_events_page(list_view text default 'upcoming',month_key text default null,
  after_start timestamptz default null,after_id uuid default null,status_filter text default 'all',retained_ids uuid[] default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare now_time timestamptz:=clock_timestamp(); lower_bound timestamptz; upper_bound timestamptz;
  month_date date; page_size integer; ids uuid[]; items jsonb; retained jsonb; cursor jsonb;
begin
  perform ff_private.require_rule(ff_private.is_active(),'Freigabe erforderlich.');
  perform ff_private.require_rule(list_view in ('upcoming','past','month') and status_filter in ('all','scheduled','cancelled'),'Invalid event list filter');
  perform ff_private.require_rule((after_start is null)=(after_id is null) and (after_id is null or list_view='month'),'Invalid event cursor');
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
  select coalesce(jsonb_agg(ff_private.event_summary(id) order by position),'[]'::jsonb) into items
    from unnest(ids[1:page_size]) with ordinality page(id,position);
  if list_view='month' and cardinality(ids)>page_size then
    cursor:=jsonb_build_object('id',items->(page_size-1)->>'id','starts_at',items->(page_size-1)->>'starts_at');
  end if;
  select coalesce(jsonb_agg(summary order by summary->>'starts_at',summary->>'id'),'[]'::jsonb) into retained
    from (select ff_private.event_summary(id) summary from (select distinct unnest(retained_ids) id) chosen
      where not(id=any(ids[1:page_size])) and not exists(select 1 from public.event_calendar where event_id=id)) snapshots where summary is not null;
  return jsonb_build_object('server_now',now_time,'manageable_units',coalesce((
    select jsonb_agg(jsonb_build_object('id',u.id,'name',u.name) order by u.name) from public.units u
      where ff_private.manages_scope('unit',u.id,null)),'[]'::jsonb),
    'events',items,'has_more',cardinality(ids)>page_size,'next_cursor',cursor,'retained_events',retained);
end;
$$;

create or replace function ff_private.report_rows_for_user(wanted_year int,report_scope text,target_scope uuid,
  wanted_type public.ff_event_type,report_user uuid)
returns table(event_id uuid,user_id uuid,unit_id uuid,unit_name text,display_name text,
  title text,event_type public.ff_event_type,scope_name text,starts_at timestamptz,ends_at timestamptz,
  hours numeric,training boolean,final boolean,valid boolean,status public.ff_attendance,
  missing_roster boolean,confirmed_at timestamptz,corrected_at timestamptz)
language sql stable security definer set search_path='' as $$
  with selected_events as materialized (
    select e.*,t.is_training_relevant,c.confirmed_at,
      (c.event_id is not null and e.attendance_state in ('COMPLETED','CORRECTED')) final
    from public.events e join public.event_type_reporting t using(event_type)
    left join public.attendance_confirmations c on c.event_id=e.id
    where e.status='scheduled' and e.starts_at<=statement_timestamp()
      and not exists(select 1 from public.event_calendar where event_id=e.id)
      and e.starts_at>=make_timestamptz(wanted_year,1,1,0,0,0,'Europe/Berlin')
      and e.starts_at<make_timestamptz(wanted_year+1,1,1,0,0,0,'Europe/Berlin')
      and (e.dev_seed_key is null or exists(select 1 from ff_private.dev_fixture_sets d where d.fixture_key=e.dev_seed_key and d.state='ready'))
      and (wanted_type is null or e.event_type=wanted_type)
      and (report_scope<>'function' or (e.scope_kind='function' and e.function_id=target_scope))
  ), eligible as (
    select e.id event_id,m.user_id,min(m.unit_id::text)::uuid unit_id,count(*) memberships
    from selected_events e join public.unit_memberships m on m.valid_from<=e.starts_at
      and (m.valid_until is null or m.valid_until>e.starts_at)
    join public.profiles p on p.id=m.user_id and p.dev_seed_key is not distinct from e.dev_seed_key
    where (report_scope<>'personal' or m.user_id=report_user)
      and (e.scope_kind='organization' or (e.scope_kind='unit' and e.unit_id=m.unit_id)
        or (e.scope_kind='function' and exists(select 1 from public.function_memberships f
          where f.user_id=m.user_id and f.function_id=e.function_id and f.valid_from<=e.starts_at
            and (f.valid_until is null or f.valid_until>e.starts_at))))
    group by e.id,m.user_id
  ), people as (
    select event_id,user_id from eligible
    union select r.event_id,r.user_id from selected_events e join public.event_roster r on r.event_id=e.id
      where report_scope<>'personal' or r.user_id=report_user
  )
  select e.id,p.user_id,coalesce(r.unit_snapshot_id,x.unit_id),u.name,pr.display_name,
    e.title,e.event_type,coalesce(eu.name,ef.name,'Alle Einheiten'),e.starts_at,e.ends_at,
    case when e.ends_at>e.starts_at then extract(epoch from e.ends_at-e.starts_at)/3600.0 else null end,
    e.is_training_relevant,e.final,coalesce(x.memberships=1 and (r.unit_snapshot_id is null or r.unit_snapshot_id=x.unit_id)
      and e.ends_at>e.starts_at,false),a.status,r.user_id is null,e.confirmed_at,e.attendance_corrected_at
  from people p join selected_events e on e.id=p.event_id
  left join eligible x on x.event_id=p.event_id and x.user_id=p.user_id
  left join public.event_roster r on r.event_id=p.event_id and r.user_id=p.user_id
  left join public.actual_attendance a on a.event_id=p.event_id and a.user_id=p.user_id
  join public.profiles pr on pr.id=p.user_id join public.units u on u.id=coalesce(r.unit_snapshot_id,x.unit_id)
  left join public.units eu on eu.id=e.unit_id left join public.special_functions ef on ef.id=e.function_id
  where report_scope='function' or target_scope is null or u.id=target_scope;
$$;
revoke all on function ff_private.calendar_summary(uuid) from public,anon,authenticated;
revoke all on function public.ff_calendar_page(timestamptz,timestamptz,text[],uuid[],public.ff_event_type[],text[],uuid[],uuid[],boolean,timestamptz,uuid,uuid[])
  from public,anon,authenticated;
grant execute on function public.ff_calendar_page(timestamptz,timestamptz,text[],uuid[],public.ff_event_type[],text[],uuid[],uuid[],boolean,timestamptz,uuid,uuid[])
  to authenticated;
notify pgrst,'reload schema';
commit;
