begin;

create or replace function ff_private.report_rows_for_user(wanted_year int,report_scope text,target_scope uuid,
  wanted_type public.ff_event_type,report_user uuid)
returns table(event_id uuid,user_id uuid,unit_id uuid,unit_name text,display_name text,
  title text,event_type public.ff_event_type,scope_name text,starts_at timestamptz,ends_at timestamptz,
  hours numeric,training boolean,final boolean,valid boolean,status public.ff_attendance,
  missing_roster boolean,confirmed_at timestamptz,corrected_at timestamptz)
language sql stable security definer set search_path='' as $$
  with selected_events as materialized (
    select e.*,t.is_training_relevant,c.confirmed_at,ff_private.roster_frozen(e.id) frozen,
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
    select e.id event_id,m.user_id,min(m.unit_id::text)::uuid unit_id,count(distinct m.unit_id) memberships,count(*) intervals
    from selected_events e join public.unit_memberships m on m.valid_from<=e.starts_at
      and (m.valid_until is null or m.valid_until>e.starts_at)
    join public.profiles p on p.id=m.user_id and p.dev_seed_key is not distinct from e.dev_seed_key
    where (report_scope<>'personal' or m.user_id=report_user)
      and (e.participant_mode='scope' or exists(select 1 from public.event_roster r
          where r.event_id=e.id and r.user_id=m.user_id and r.invited))
      and (e.scope_kind='organization' or (e.scope_kind='unit' and e.unit_id=m.unit_id)
          or (e.scope_kind='function' and exists(select 1 from public.function_memberships f
            where f.user_id=m.user_id and f.function_id=e.function_id and f.valid_from<=e.starts_at
              and (f.valid_until is null or f.valid_until>e.starts_at))))
    group by e.id,m.user_id
  ), people as (
    -- Missing frozen rows remain a diagnostic, never fabricated actual attendance.
    select x.event_id,x.user_id from eligible x join selected_events e on e.id=x.event_id
      where not e.frozen or not exists(select 1 from public.event_roster r where r.event_id=x.event_id and r.user_id=x.user_id)
    union select r.event_id,r.user_id from selected_events e join public.event_roster r on r.event_id=e.id and r.included
      where report_scope<>'personal' or r.user_id=report_user
  )
  select e.id,p.user_id,coalesce(r.unit_snapshot_id,x.unit_id),u.name,pr.display_name,
    e.title,e.event_type,coalesce(eu.name,ef.name,'Alle Einheiten'),e.starts_at,e.ends_at,
    case when e.ends_at>e.starts_at then extract(epoch from e.ends_at-e.starts_at)/3600.0 else null end,
    e.is_training_relevant,e.final,coalesce(x.memberships>=1 and x.intervals=x.memberships and (r.unit_snapshot_id is null or exists(
      select 1 from public.unit_memberships m where m.user_id=p.user_id and m.unit_id=r.unit_snapshot_id
        and m.valid_from<=e.starts_at and (m.valid_until is null or m.valid_until>e.starts_at)
        and (e.scope_kind<>'unit' or e.unit_id=m.unit_id)))
      and e.ends_at>e.starts_at,false),a.status,r.user_id is null,e.confirmed_at,e.attendance_corrected_at
  from people p join selected_events e on e.id=p.event_id
  left join eligible x on x.event_id=p.event_id and x.user_id=p.user_id
  left join public.event_roster r on r.event_id=p.event_id and r.user_id=p.user_id and r.included
  left join public.actual_attendance a on a.event_id=p.event_id and a.user_id=p.user_id
  join public.profiles pr on pr.id=p.user_id join public.units u on u.id=coalesce(r.unit_snapshot_id,x.unit_id)
  left join public.units eu on eu.id=e.unit_id left join public.special_functions ef on ef.id=e.function_id
  where report_scope='function' or target_scope is null or u.id=target_scope;
$$;
notify pgrst,'reload schema';
commit;
