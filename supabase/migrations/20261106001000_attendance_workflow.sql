begin;

-- Refuse to silently convert historical incomplete confirmations into final lists.
do $$ begin
  if exists(select 1 from public.attendance_confirmations c where
    not exists(select 1 from public.event_roster where event_id=c.event_id) or exists(
      select 1 from public.event_roster r left join public.actual_attendance a using(event_id,user_id)
      where r.event_id=c.event_id and (a.status is null or a.status='unknown'))) then
    raise exception 'Review incomplete historical attendance confirmations before migration 010';
  end if;
end $$;

create type public.ff_attendance_list_state as enum ('NOT_STARTED','IN_PROGRESS','COMPLETED','CORRECTED');
alter table public.actual_attendance
  add column response_snapshot public.ff_response,
  add column response_snapshot_known boolean not null default false;
alter table public.events
  add column attendance_state public.ff_attendance_list_state not null default 'NOT_STARTED',
  add column attendance_initialized_at timestamptz,
  add column attendance_initialized_by uuid references public.profiles(id),
  add column attendance_corrected_at timestamptz;
update public.events e set
  attendance_state=case when exists(select 1 from public.attendance_confirmations c where c.event_id=e.id) and exists(
      select 1 from public.audit_entries where event_id=e.id and action='attendance_corrected') then 'CORRECTED'::public.ff_attendance_list_state
    when exists(select 1 from public.attendance_confirmations c where c.event_id=e.id) then 'COMPLETED'::public.ff_attendance_list_state
    else 'IN_PROGRESS'::public.ff_attendance_list_state end,
  attendance_initialized_at=coalesce(e.attendance_prepared_at,(select min(recorded_at) from public.actual_attendance where event_id=e.id),
    (select confirmed_at from public.attendance_confirmations where event_id=e.id)),
  attendance_initialized_by=coalesce((select actor_id from public.audit_entries where event_id=e.id and action='attendance_prepared' order by happened_at limit 1),
    (select recorded_by from public.actual_attendance where event_id=e.id order by recorded_at,user_id limit 1)),
  attendance_corrected_at=(select max(happened_at) from public.audit_entries where event_id=e.id and action='attendance_corrected')
where e.attendance_prepared_at is not null or exists(select 1 from public.actual_attendance where event_id=e.id)
  or exists(select 1 from public.attendance_confirmations where event_id=e.id);

alter table public.event_delegations
  add column is_primary boolean not null default true,
  add column note text not null default '' check(length(note)<=2000),
  add column permission_scope text not null default 'event_attendance' check(permission_scope='event_attendance');
-- Replace only the index, not rows: one primary, multiple distinct secondary organizers.
create unique index event_delegations_primary on public.event_delegations(event_id) where revoked_at is null and is_primary;
create unique index event_delegations_member on public.event_delegations(event_id,user_id) where revoked_at is null;
drop index public.event_delegations_current;

create function ff_private.attendance_is_final(target uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select ff_private.is_active() and exists(select 1 from public.events e
    join public.attendance_confirmations c on c.event_id=e.id
    where e.id=target and e.attendance_state in ('COMPLETED','CORRECTED'));
$$;
create function ff_private.can_read_attendance(target uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select ff_private.can_lead_event(target) or (ff_private.is_overseer() and ff_private.attendance_is_final(target));
$$;
revoke all on function ff_private.attendance_is_final(uuid),ff_private.can_read_attendance(uuid) from public,anon,authenticated;
grant execute on function ff_private.attendance_is_final(uuid),ff_private.can_read_attendance(uuid) to authenticated;
alter policy scoped_attendance on public.actual_attendance using (
  ff_private.is_active() and (ff_private.can_lead_event(event_id)
    or (ff_private.attendance_is_final(event_id) and (user_id=auth.uid() or ff_private.is_overseer())))
);
alter policy scoped_delegations on public.event_delegations using (ff_private.can_lead_event(event_id));
alter policy scoped_audit on public.audit_entries using (
  ff_private.has_role('GLOBAL_ADMIN') or (event_id is not null and (ff_private.can_lead_event(event_id)
    or (ff_private.is_overseer() and action<>'event_delegation_changed'
      and (action not like 'attendance_%' or ff_private.attendance_is_final(event_id)))))
);

create or replace function public.ff_prepare_attendance(target_event uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare item public.events; prepared_count integer; prepared_time timestamptz;
begin
  item:=ff_private.lock_attendance_event(target_event);
  perform ff_private.require_rule(item.event_type in ('regular','special'),'Prefill is only available for practices');
  if item.attendance_prepared_at is not null or exists(select 1 from public.attendance_confirmations where event_id=target_event) then return; end if;
  insert into public.actual_attendance(event_id,user_id,status,origin,recorded_by,response_snapshot,response_snapshot_known)
    select r.event_id,r.user_id,(case p.response when 'yes' then 'present' when 'no' then 'absent' else 'unknown' end)::public.ff_attendance,
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
create or replace function public.ff_record_attendance(target_event uuid,target_user uuid,attendance_status public.ff_attendance,reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare item public.events; previous jsonb; after_value jsonb; confirmed boolean;
begin
  item:=ff_private.lock_attendance_event(target_event);
  perform ff_private.require_rule(attendance_status is not null and exists(
    select 1 from public.event_roster where event_id=target_event and user_id=target_user),'Roster member and attendance value required');
  confirmed:=exists(select 1 from public.attendance_confirmations where event_id=target_event);
  perform ff_private.require_rule(not confirmed or (length(btrim(reason)) between 5 and 2000 and attendance_status<>'unknown'),
    'Confirmed lists require a reason and a determined attendance value');
  select to_jsonb(a) into previous from public.actual_attendance a where event_id=target_event and user_id=target_user;
  if previous->>'status'=attendance_status::text and previous->>'origin'='manual' then return; end if;
  insert into public.actual_attendance(event_id,user_id,status,origin,recorded_by,response_snapshot,response_snapshot_known)
    values(target_event,target_user,attendance_status,'manual',auth.uid(),
      (select response from public.participation_responses where event_id=target_event and user_id=target_user),true)
    on conflict(event_id,user_id) do update set status=excluded.status,origin='manual',recorded_by=auth.uid(),recorded_at=clock_timestamp();
  update public.events set attendance_state=case when confirmed then 'CORRECTED'::public.ff_attendance_list_state else 'IN_PROGRESS'::public.ff_attendance_list_state end,
    attendance_initialized_at=coalesce(attendance_initialized_at,clock_timestamp()),
    attendance_initialized_by=coalesce(attendance_initialized_by,auth.uid()),
    attendance_corrected_at=case when confirmed then clock_timestamp() else attendance_corrected_at end where id=target_event;
  select to_jsonb(a) into after_value from public.actual_attendance a where event_id=target_event and user_id=target_user;
  perform ff_private.write_audit(case when confirmed then 'attendance_corrected' else 'attendance_recorded' end,
    target_event,target_user,previous,after_value,btrim(reason));
end;
$$;
create or replace function public.ff_confirm_attendance(target_event uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare item public.events; snapshot jsonb;
begin
  item:=ff_private.lock_attendance_event(target_event);
  if exists(select 1 from public.attendance_confirmations where event_id=target_event) then return; end if;
  perform ff_private.require_rule(item.event_type not in ('regular','special') or item.attendance_prepared_at is not null,
    'Review provisional preparation before confirmation');
  perform ff_private.require_rule(exists(select 1 from public.event_roster where event_id=target_event) and not exists(
    select 1 from public.event_roster r left join public.actual_attendance a using(event_id,user_id)
    where r.event_id=target_event and (a.status is null or a.status='unknown')),
    'All roster members must have determined attendance before completion');
  select jsonb_agg(jsonb_build_object('user_id',a.user_id,'name',r.name_snapshot,'status',a.status,'origin',a.origin,
    'response',a.response_snapshot,'response_known',a.response_snapshot_known,
    'recorded_by',a.recorded_by,'recorded_at',a.recorded_at) order by a.user_id) into snapshot
    from public.actual_attendance a join public.event_roster r using(event_id,user_id) where a.event_id=target_event;
  insert into public.attendance_confirmations(event_id,confirmed_by,original_snapshot) values(target_event,auth.uid(),snapshot);
  update public.events set attendance_state='COMPLETED' where id=target_event;
  perform ff_private.write_audit('attendance_confirmed',target_event,null,null,snapshot);
end;
$$;

create function public.ff_set_primary_organizer(target_event uuid,target_user uuid,internal_note text default '')
returns void language plpgsql security definer set search_path = '' as $$
declare item public.events; previous jsonb;
begin
  select * into item from public.events where id=target_event for update;
  perform ff_private.require_rule(found and ff_private.manages_scope(item.scope_kind,item.unit_id,item.function_id),
    'Responsible scope administration required');
  perform ff_private.require_rule(internal_note is not null and length(btrim(internal_note))<=2000,'Organizer note too long');
  if target_user is not null then
    perform ff_private.require_rule(item.status='scheduled' and ff_private.is_approved_user(target_user) and exists(
      select 1 from public.event_roster where event_id=target_event and user_id=target_user),'Approved roster member required');
  end if;
  select to_jsonb(d) into previous from public.event_delegations d where event_id=target_event and revoked_at is null and is_primary;
  if previous->>'user_id' is not distinct from target_user::text and coalesce(previous->>'note','')=btrim(internal_note) then return; end if;
  update public.event_delegations set revoked_at=clock_timestamp() where event_id=target_event and revoked_at is null
    and (is_primary or user_id=target_user);
  if target_user is not null then
    insert into public.event_delegations(event_id,user_id,assigned_by,note) values(target_event,target_user,auth.uid(),btrim(internal_note));
  end if;
  perform ff_private.write_audit('event_delegation_changed',target_event,target_user,previous,
    jsonb_build_object('user_id',target_user,'is_primary',true,'permission_scope','event_attendance','note',btrim(internal_note)));
end;
$$;
create or replace function public.ff_set_event_delegate(target_event uuid,target_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.ff_set_primary_organizer(target_event,target_user);
end;
$$;

create function public.ff_attendance_workspace(target_event uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare item public.events; may_delegate boolean; result jsonb;
begin
  perform ff_private.require_rule(ff_private.can_read_attendance(target_event),'Attendance reading not permitted');
  select * into item from public.events where id=target_event;
  may_delegate:=ff_private.manages_scope(item.scope_kind,item.unit_id,item.function_id);
  select jsonb_build_object(
    'server_now',clock_timestamp(),'event_id',item.id,'title',item.title,'starts_at',item.starts_at,'ends_at',item.ends_at,
    'event_status',item.status,'scope_name',coalesce(u.name,f.name,'Alle Einheiten'),'event_type',item.event_type,
    'state',item.attendance_state,'initialized_at',item.attendance_initialized_at,
    'initialized_by',(select display_name from public.profiles where id=item.attendance_initialized_by),
    'prepared_at',item.attendance_prepared_at,'corrected_at',item.attendance_corrected_at,
    'confirmed_at',c.confirmed_at,'confirmed_by',p.display_name,
    'can_manage',ff_private.can_lead_event(item.id),'can_delegate',may_delegate,
    'organizer_name',coalesce((select pr.display_name from public.event_delegations d join public.profiles pr on pr.id=d.user_id
      where d.event_id=item.id and d.revoked_at is null and d.is_primary),(select display_name from public.profiles where id=item.organizer_id)),
    'primary_organizer',(select jsonb_build_object('user_id',d.user_id,'name',pr.display_name,
      'note',case when ff_private.can_lead_event(item.id) then d.note else null end,'access_granted',ff_private.is_approved_user(d.user_id))
      from public.event_delegations d join public.profiles pr on pr.id=d.user_id where d.event_id=item.id and d.revoked_at is null and d.is_primary),
    'candidates',case when may_delegate then coalesce((select jsonb_agg(jsonb_build_object('id',r.user_id,'name',r.name_snapshot) order by r.name_snapshot,r.user_id)
      from public.event_roster r where r.event_id=item.id and ff_private.is_approved_user(r.user_id)),'[]'::jsonb) else '[]'::jsonb end,
    'members',coalesce((select jsonb_agg(jsonb_build_object('user_id',r.user_id,'name',r.name_snapshot,
      'response',case when a.user_id is not null then a.response_snapshot else resp.response end,
      'response_known',case when a.user_id is not null then a.response_snapshot_known else true end,
      'status',a.status,'origin',a.origin,'recorded_at',a.recorded_at)
      order by r.name_snapshot,r.user_id) from public.event_roster r left join public.actual_attendance a using(event_id,user_id)
      left join public.participation_responses resp using(event_id,user_id) where r.event_id=item.id),'[]'::jsonb)
  ) into result from public.events e left join public.units u on u.id=e.unit_id left join public.special_functions f on f.id=e.function_id
    left join public.attendance_confirmations c on c.event_id=e.id left join public.profiles p on p.id=c.confirmed_by where e.id=target_event;
  return result;
end;
$$;

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

revoke all on function public.ff_set_primary_organizer(uuid,uuid,text),public.ff_attendance_workspace(uuid) from public,anon,authenticated;
grant execute on function public.ff_set_primary_organizer(uuid,uuid,text),public.ff_attendance_workspace(uuid) to authenticated;

notify pgrst,'reload schema';
commit;
