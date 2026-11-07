begin;

create table public.event_type_reporting (
  event_type public.ff_event_type primary key,
  is_training_relevant boolean not null
);
insert into public.event_type_reporting values
  ('regular',true),('special',true),('breathing',true),('training',true),
  ('community',false),('other',false);
alter table public.event_type_reporting enable row level security;
revoke all on public.event_type_reporting from public,anon,authenticated;
grant select on public.event_type_reporting to authenticated;
create policy active_reporting_types on public.event_type_reporting for select to authenticated
  using (ff_private.is_active());

create or replace view public.confirmed_attendance with (security_invoker=true) as
select a.event_id,a.user_id,a.status,e.title,e.event_type,e.starts_at,e.ends_at,
  e.scope_kind,e.unit_id,e.function_id,r.unit_snapshot_id,r.name_snapshot,
  c.confirmed_at,c.confirmed_by,
  extract(year from e.starts_at at time zone 'Europe/Berlin')::integer as report_year,
  case when a.status='present' and t.is_training_relevant
    then extract(epoch from (e.ends_at-e.starts_at))/3600.0 else 0 end as training_hours
from public.actual_attendance a join public.events e on e.id=a.event_id
join public.event_roster r on r.event_id=a.event_id and r.user_id=a.user_id
join public.attendance_confirmations c on c.event_id=a.event_id
join public.event_type_reporting t on t.event_type=e.event_type
where e.status='scheduled' and e.starts_at<=statement_timestamp()
  and e.attendance_state in ('COMPLETED','CORRECTED');

create index events_reporting_time on public.events(starts_at,id) where status='scheduled';
create index roster_reporting_unit on public.event_roster(unit_snapshot_id,event_id,user_id);
create index membership_reporting_period on public.unit_memberships(user_id,unit_id,valid_from,valid_until);
create index function_reporting_period on public.function_memberships(user_id,function_id,valid_from,valid_until);

create function ff_private.require_report_scope(report_scope text,target_scope uuid)
returns void language plpgsql stable security definer set search_path='' as $$
begin
  perform ff_private.require_rule(ff_private.is_active(),'Freigabe erforderlich.');
  perform ff_private.require_rule(
    (report_scope='personal' and (target_scope is null or exists(
      select 1 from public.unit_memberships where user_id=auth.uid() and unit_id=target_scope)
      or exists(select 1 from public.event_roster where user_id=auth.uid() and unit_snapshot_id=target_scope)))
    or (report_scope='unit' and target_scope is not null and exists(select 1 from public.units where id=target_scope)
      and (ff_private.is_overseer() or ff_private.has_role('UNIT_ADMIN',target_scope,null)))
    or (report_scope='function' and target_scope is not null
      and exists(select 1 from public.special_functions where id=target_scope)
      and (ff_private.is_overseer() or ff_private.has_role('FUNCTION_ADMIN',null,target_scope)))
    or (report_scope='organization' and ff_private.is_overseer()
      and (target_scope is null or exists(select 1 from public.units where id=target_scope))),
    'Keine Berechtigung für diesen Berichtsbereich.');
end;
$$;

create function public.ff_reports_context()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  perform ff_private.require_rule(ff_private.is_active(),'Freigabe erforderlich.');
  return jsonb_build_object(
    'current_year',extract(year from statement_timestamp() at time zone 'Europe/Berlin')::int,
    'organization',ff_private.is_overseer(),'configure',ff_private.has_role('GLOBAL_ADMIN'),
    'years',(select jsonb_agg(y order by y desc) from (
      select extract(year from statement_timestamp() at time zone 'Europe/Berlin')::int y
      union select extract(year from e.starts_at at time zone 'Europe/Berlin')::int
      from public.events e where ff_private.is_overseer()
        or ff_private.manages_scope(e.scope_kind,e.unit_id,e.function_id)
        or exists(select 1 from public.event_roster r where r.event_id=e.id and r.user_id=auth.uid())
        or exists(select 1 from public.unit_memberships m
          where m.user_id=auth.uid() and m.valid_from<=e.starts_at
          and (m.valid_until is null or m.valid_until>e.starts_at)
          and (e.scope_kind='organization' or (e.scope_kind='unit' and m.unit_id=e.unit_id)
            or (e.scope_kind='function' and exists(select 1 from public.function_memberships f
              where f.user_id=m.user_id and f.function_id=e.function_id and f.valid_from<=e.starts_at
                and (f.valid_until is null or f.valid_until>e.starts_at)))))
    ) years),
    'personal_units',coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'name',u.name) order by u.name)
      from public.units u where exists(select 1 from public.unit_memberships m where m.user_id=auth.uid() and m.unit_id=u.id)
        or exists(select 1 from public.event_roster r where r.user_id=auth.uid() and r.unit_snapshot_id=u.id)),'[]'::jsonb),
    'units',coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'name',u.name) order by u.name)
      from public.units u where ff_private.is_overseer() or ff_private.has_role('UNIT_ADMIN',u.id,null)),'[]'::jsonb),
    'functions',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'name',f.name) order by f.name)
      from public.special_functions f where ff_private.is_overseer() or ff_private.has_role('FUNCTION_ADMIN',null,f.id)),'[]'::jsonb),
    'event_types',(select jsonb_agg(jsonb_build_object('event_type',event_type,
      'is_training_relevant',is_training_relevant) order by event_type) from public.event_type_reporting)
  );
end;
$$;

-- Memberships determine eligibility at service start; snapshots retain attribution after transfers.
-- Missing roster/attendance rows stay unknown, never silently become an absence.
create function ff_private.report_rows(wanted_year int,report_scope text,target_scope uuid,wanted_type public.ff_event_type)
returns table(event_id uuid,user_id uuid,unit_id uuid,unit_name text,display_name text,
  title text,event_type public.ff_event_type,scope_name text,starts_at timestamptz,ends_at timestamptz,
  hours numeric,training boolean,final boolean,valid boolean,status public.ff_attendance,
  missing_roster boolean,confirmed_at timestamptz,corrected_at timestamptz)
language sql stable security definer set search_path='' as $$
  with selected_events as materialized (
    select e.*,t.is_training_relevant,c.confirmed_at,
      (c.event_id is not null and e.attendance_state in ('COMPLETED','CORRECTED')) as final
    from public.events e join public.event_type_reporting t using(event_type)
    left join public.attendance_confirmations c on c.event_id=e.id
    where e.status='scheduled' and e.starts_at<=statement_timestamp()
      and e.starts_at>=make_timestamptz(wanted_year,1,1,0,0,0,'Europe/Berlin')
      and e.starts_at<make_timestamptz(wanted_year+1,1,1,0,0,0,'Europe/Berlin')
      and (wanted_type is null or e.event_type=wanted_type)
      and (report_scope<>'function' or (e.scope_kind='function' and e.function_id=target_scope))
  ), eligible as (
    select e.id as event_id,m.user_id,min(m.unit_id::text)::uuid as unit_id,count(*) as memberships
    from selected_events e join public.unit_memberships m on m.valid_from<=e.starts_at
      and (m.valid_until is null or m.valid_until>e.starts_at)
    where (report_scope<>'personal' or m.user_id=auth.uid())
      and (e.scope_kind='organization' or (e.scope_kind='unit' and e.unit_id=m.unit_id)
        or (e.scope_kind='function' and exists(select 1 from public.function_memberships f
          where f.user_id=m.user_id and f.function_id=e.function_id and f.valid_from<=e.starts_at
            and (f.valid_until is null or f.valid_until>e.starts_at))))
    group by e.id,m.user_id
  ), people as (
    select event_id,user_id from eligible
    union select r.event_id,r.user_id from selected_events e join public.event_roster r on r.event_id=e.id
      where report_scope<>'personal' or r.user_id=auth.uid()
  )
  select e.id,p.user_id,coalesce(r.unit_snapshot_id,x.unit_id),u.name,pr.display_name,
    e.title,e.event_type,coalesce(eu.name,ef.name,'Alle Einheiten'),e.starts_at,e.ends_at,
    case when e.ends_at>e.starts_at then extract(epoch from e.ends_at-e.starts_at)/3600.0 else null end,
    e.is_training_relevant,e.final,
    coalesce(x.memberships=1 and (r.unit_snapshot_id is null or r.unit_snapshot_id=x.unit_id)
      and e.ends_at>e.starts_at,false),
    a.status,r.user_id is null,e.confirmed_at,e.attendance_corrected_at
  from people p join selected_events e on e.id=p.event_id
  left join eligible x on x.event_id=p.event_id and x.user_id=p.user_id
  left join public.event_roster r on r.event_id=p.event_id and r.user_id=p.user_id
  left join public.actual_attendance a on a.event_id=p.event_id and a.user_id=p.user_id
  join public.profiles pr on pr.id=p.user_id
  join public.units u on u.id=coalesce(r.unit_snapshot_id,x.unit_id)
  left join public.units eu on eu.id=e.unit_id left join public.special_functions ef on ef.id=e.function_id
  where report_scope='function' or target_scope is null or u.id=target_scope;
$$;

create function ff_private.empty_report_metrics()
returns jsonb language sql immutable set search_path='' as $$
  select '{"services":0,"practices":0,"training_services":0,"eligible":0,"present":0,"absent":0,
    "training_present":0,"training_absent":0,"unknown":0,"training_hours":0,"service_hours":0,
    "participant_hours":0,"rate":null,"average_attendance":null,"pending":0,"excluded":0,"missing_roster":0}'::jsonb;
$$;

create function public.ff_year_report(wanted_year int,report_scope text default 'personal',
  target_scope uuid default null,wanted_type public.ff_event_type default null,
  page_number int default 0,export_all boolean default false)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  perform ff_private.require_report_scope(report_scope,target_scope);
  perform ff_private.require_rule(wanted_year between 1900 and 2199 and page_number between 0 and 1000
    and export_all is not null,'Gültiges Berichtsjahr und gültige Seite erforderlich.');
  perform ff_private.require_rule((select count(*) from public.event_type_reporting)=6,
    'Unvollständige Berichtskonfiguration; keine verlässliche Auswertung möglich.');
  with facts as materialized (
    select * from ff_private.report_rows(wanted_year,report_scope,target_scope,wanted_type)
  ), expanded as (
    select f.*,g.kind,g.id from facts f cross join lateral (values
      ('total'::text,null::uuid),('member',f.user_id),('unit',f.unit_id),('event',f.event_id)) g(kind,id)
  ), per_event as (
    select kind,id,event_id,bool_or(final) as final,bool_or(training) as training,
      min(event_type::text) as event_type,max(hours) as hours,
      count(*) filter(where valid) as eligible,
      count(*) filter(where valid and status='present') as present,
      count(*) filter(where valid and status='absent') as absent,
      count(*) filter(where valid and (status is null or status='unknown')) as unknown,
      count(*) filter(where not valid) as excluded,
      count(*) filter(where missing_roster) as missing_roster
    from expanded group by kind,id,event_id
  ), metrics as (
    select kind,id,jsonb_build_object(
      'services',count(*) filter(where final and eligible>0),
      'practices',count(*) filter(where final and eligible>0 and event_type in ('regular','special')),
      'training_services',count(*) filter(where final and eligible>0 and training),
      'eligible',coalesce(sum(eligible) filter(where final and training),0),
      'present',coalesce(sum(present) filter(where final),0),
      'absent',coalesce(sum(absent) filter(where final),0),
      'training_present',coalesce(sum(present) filter(where final and training),0),
      'training_absent',coalesce(sum(absent) filter(where final and training),0),
      'unknown',coalesce(sum(unknown) filter(where final),0),
      'training_hours',coalesce(sum(present*hours) filter(where final and training),0),
      'service_hours',coalesce(sum(hours) filter(where final and training and eligible>0),0),
      'participant_hours',coalesce(sum(present*hours) filter(where final),0),
      'average_attendance',case when count(*) filter(where final and eligible>0)=0
        or coalesce(sum(unknown+excluded) filter(where final),0)>0 then null
        else 1.0*sum(present) filter(where final)/count(*) filter(where final and eligible>0) end,
      'rate',case when coalesce(sum(eligible) filter(where final and training),0)=0
        or coalesce(sum(unknown) filter(where final and training),0)>0
        or coalesce(sum(excluded) filter(where final),0)>0 then null
        else 100.0*sum(present) filter(where final and training)/sum(eligible) filter(where final and training) end,
      'pending',count(*) filter(where not final),
      'excluded',coalesce(sum(excluded) filter(where final),0),
      'missing_roster',coalesce(sum(missing_roster) filter(where final),0)) as data
    from per_event group by kind,id
  ), cohort as (
    select distinct m.user_id,m.unit_id from public.unit_memberships m
    where m.valid_from<make_timestamptz(wanted_year+1,1,1,0,0,0,'Europe/Berlin')
      and (m.valid_until is null or m.valid_until>make_timestamptz(wanted_year,1,1,0,0,0,'Europe/Berlin'))
      and (report_scope<>'personal' or m.user_id=auth.uid())
      and (report_scope='function' or target_scope is null or m.unit_id=target_scope)
      and (report_scope<>'function' or exists(select 1 from public.function_memberships f
        where f.user_id=m.user_id and f.function_id=target_scope
          and greatest(f.valid_from,m.valid_from,make_timestamptz(wanted_year,1,1,0,0,0,'Europe/Berlin'))
            <least(coalesce(f.valid_until,'infinity'),coalesce(m.valid_until,'infinity'),
              make_timestamptz(wanted_year+1,1,1,0,0,0,'Europe/Berlin'))))
    union select user_id,unit_id from facts
  ), event_rows as (
    select distinct f.event_id,f.title,f.event_type,f.scope_name,f.starts_at,f.ends_at,f.hours,
      f.training,f.confirmed_at,f.corrected_at,
      case when report_scope='personal' then f.unit_name else f.scope_name end as unit_name,
      case when report_scope='personal' then f.status else null end as own_status,
      coalesce(m.data,ff_private.empty_report_metrics()) as metrics
    from facts f left join metrics m on m.kind='event' and m.id=f.event_id where f.final
  )
  select jsonb_build_object(
    'year',wanted_year,'scope',report_scope,'target',target_scope,
    'scope_name',case when report_scope='personal' then 'Mein Dienstbuch'
      when report_scope='function' then (select name from public.special_functions where id=target_scope)
      when target_scope is not null then (select name from public.units where id=target_scope)
      else 'Feuerwehr Odenthal' end,
    'summary',coalesce((select data from metrics where kind='total'),ff_private.empty_report_metrics())
      ||jsonb_build_object('members',(select count(distinct user_id) from cohort)),
    'members',case when report_scope in ('unit','function') then coalesce((
      select jsonb_agg(jsonb_build_object('user_id',p.id,'name',p.display_name,
        'metrics',coalesce(m.data,ff_private.empty_report_metrics())) order by p.display_name,p.id)
      from (select distinct user_id from cohort) c join public.profiles p on p.id=c.user_id
      left join metrics m on m.kind='member' and m.id=p.id),'[]'::jsonb) else '[]'::jsonb end,
    'units',case when report_scope='organization' then coalesce((
      select jsonb_agg(jsonb_build_object('id',u.id,'name',u.name,
        'members',(select count(distinct user_id) from cohort where unit_id=u.id),
        'metrics',coalesce(m.data,ff_private.empty_report_metrics())) order by u.name)
      from public.units u left join metrics m on m.kind='unit' and m.id=u.id
      where target_scope is null or u.id=target_scope),'[]'::jsonb) else '[]'::jsonb end,
    'events',coalesce((select jsonb_agg(to_jsonb(page) order by page.starts_at desc,page.event_id desc)
      from (select * from event_rows order by starts_at desc,event_id desc
        limit case when export_all then 5000 else 50 end
        offset case when export_all then 0 else page_number*50 end) page),'[]'::jsonb),
    'page',case when export_all then 0 else page_number end,
    'event_count',(select count(*) from event_rows),
    'has_more',(select count(*) from event_rows)>case when export_all then 5000 else (page_number+1)*50 end
  ) into result;
  perform ff_private.require_rule(not export_all or not (result->>'has_more')::boolean,
    'Export überschreitet 5000 Dienste. Bitte Bereich oder Terminart eingrenzen.');
  return result;
end;
$$;

create function public.ff_set_reporting_type(target_type public.ff_event_type,relevant boolean,reason text)
returns void language plpgsql security definer set search_path='' as $$
declare previous boolean;
begin
  perform ff_private.require_rule(ff_private.has_role('GLOBAL_ADMIN'),'Globale Administration erforderlich.');
  perform ff_private.require_rule(relevant is not null and length(btrim(reason)) between 5 and 2000,
    'Ausbildungsrelevanz und Änderungsgrund erforderlich.');
  select is_training_relevant into previous from public.event_type_reporting where event_type=target_type for update;
  perform ff_private.require_rule(found,'Unbekannte Terminart.');
  if previous=relevant then return; end if;
  update public.event_type_reporting set is_training_relevant=relevant where event_type=target_type;
  perform ff_private.write_audit('reporting_classification_changed',null,null,
    jsonb_build_object('event_type',target_type,'is_training_relevant',previous),
    jsonb_build_object('event_type',target_type,'is_training_relevant',relevant),btrim(reason));
end;
$$;

revoke all on function ff_private.require_report_scope(text,uuid),
  ff_private.report_rows(int,text,uuid,public.ff_event_type),ff_private.empty_report_metrics()
  from public,anon,authenticated;
revoke all on function public.ff_reports_context(),
  public.ff_year_report(int,text,uuid,public.ff_event_type,int,boolean),
  public.ff_set_reporting_type(public.ff_event_type,boolean,text) from public,anon,authenticated;
grant execute on function public.ff_reports_context(),
  public.ff_year_report(int,text,uuid,public.ff_event_type,int,boolean),
  public.ff_set_reporting_type(public.ff_event_type,boolean,text) to authenticated;
notify pgrst,'reload schema';
commit;
