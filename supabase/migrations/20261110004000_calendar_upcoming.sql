begin;

create function public.ff_calendar_upcoming(scopes text[] default '{}',
  wanted_units uuid[] default '{}',wanted_types public.ff_event_type[] default '{}',
  wanted_kinds text[] default '{}',wanted_categories uuid[] default '{}',
  wanted_resources uuid[] default '{}',show_cancelled boolean default true,
  page_size int default 5,retained_ids uuid[] default '{}')
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare ids uuid[]; items jsonb; cursor jsonb;
begin
  perform ff_private.require_rule(ff_private.is_active(),'Freigabe erforderlich.');
  perform ff_private.require_rule(page_size between 1 and 400
    and scopes is not null and scopes<@array['mine','organization','units','function']
    and cardinality(wanted_units)<=5 and cardinality(wanted_categories)<=50
    and cardinality(wanted_resources)<=50 and cardinality(wanted_types)<=6
    and cardinality(wanted_kinds)<=4 and wanted_kinds<@array['participation','information','booking','vehicle']
    and show_cancelled is not null and cardinality(retained_ids)<=10,'Ungültige Kalenderfilter.');
  select coalesce(array_agg(page.id order by page.starts_at,page.id),'{}') into ids from (
    select e.id,e.starts_at from public.events e
    left join public.event_calendar c on c.event_id=e.id
    left join public.vehicle_reservations q on q.event_id=e.id
    where ff_private.can_view_event(e.id) and c.archived_at is null
      and (q.event_id is null or q.state in ('APPROVED','COMPLETED'))
      and (show_cancelled or e.status='scheduled') and e.ends_at>statement_timestamp()
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
    order by e.starts_at,e.id limit page_size+1
  ) page;
  select coalesce(jsonb_agg(ff_private.calendar_summary(id) order by position),'[]') into items
    from unnest(ids[1:page_size]) with ordinality p(id,position);
  if cardinality(ids)>page_size then
    cursor:=jsonb_build_object('starts_at',items->(page_size-1)->>'starts_at','id',items->(page_size-1)->>'id');
  end if;
  return jsonb_build_object('server_now',statement_timestamp(),'events',items,'next_cursor',cursor,
    'retained_events',coalesce((select jsonb_agg(summary order by summary->>'starts_at',summary->>'id')
      from (select ff_private.calendar_summary(id) summary from (select distinct unnest(retained_ids) id) x
        where not(id=any(ids[1:page_size]))) y where summary is not null
          and (summary->>'entry_kind'<>'vehicle' or summary->>'vehicle_state' in ('APPROVED','COMPLETED'))),'[]'));
end;
$$;
revoke all on function public.ff_calendar_upcoming(text[],uuid[],public.ff_event_type[],text[],uuid[],uuid[],boolean,int,uuid[])
  from public,anon,authenticated;
grant execute on function public.ff_calendar_upcoming(text[],uuid[],public.ff_event_type[],text[],uuid[],uuid[],boolean,int,uuid[])
  to authenticated;

commit;
