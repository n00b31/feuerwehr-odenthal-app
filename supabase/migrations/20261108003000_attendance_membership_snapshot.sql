begin;

create function ff_private.freeze_event_roster(target uuid)
returns void language plpgsql security definer set search_path='' as $$
declare members jsonb; frozen_at timestamptz;
begin
  if ff_private.roster_frozen(target) then return; end if;
  select coalesce(jsonb_agg(to_jsonb(m)),'[]') into members from ff_private.event_members(target) m;
  update public.event_roster set included=false where event_id=target;
  insert into public.event_roster(event_id,user_id,name_snapshot,unit_snapshot_id)
    select target,m.user_id,m.name_snapshot,m.unit_snapshot_id
      from jsonb_to_recordset(members) m(user_id uuid,name_snapshot text,unit_snapshot_id uuid)
    on conflict(event_id,user_id) do update set included=true,
      name_snapshot=excluded.name_snapshot,unit_snapshot_id=excluded.unit_snapshot_id;
  frozen_at:=clock_timestamp();
  update public.events set attendance_initialized_at=frozen_at,attendance_initialized_by=auth.uid(),
    attendance_state='IN_PROGRESS' where id=target;
  perform ff_private.write_audit('attendance_roster_frozen',target,null,null,
    jsonb_build_object('membership_at',(select starts_at from public.events where id=target),
      'frozen_at',frozen_at,'members',members));
end;
$$;

create or replace function ff_private.lock_attendance_event(target uuid)
returns public.events language plpgsql security definer set search_path='' as $$
declare item public.events;
begin
  perform pg_advisory_xact_lock(hashtext('ff.membership_eligibility'));
  select * into item from public.events where id=target for update;
  perform ff_private.require_rule(found and ff_private.can_lead_event(target)
    and not exists(select 1 from public.event_calendar where event_id=target),
    'Anwesenheit nur für Dienste mit Teilnahmeverwaltung und zuständiger Leitung.');
  perform ff_private.require_rule(item.status='scheduled' and clock_timestamp()>=item.starts_at,
    'Attendance requires a started, non-cancelled event');
  perform ff_private.freeze_event_roster(target);
  select * into item from public.events where id=target;
  return item;
end;
$$;

create or replace function public.ff_prepare_attendance(target_event uuid)
returns void language plpgsql security definer set search_path='' as $$
declare item public.events; prepared_count integer; prepared_time timestamptz;
begin
  item:=ff_private.lock_attendance_event(target_event);
  perform ff_private.require_rule(item.event_type in ('regular','special'),'Prefill is only available for practices');
  if item.attendance_prepared_at is not null or exists(select 1 from public.attendance_confirmations where event_id=target_event) then return; end if;
  insert into public.actual_attendance(event_id,user_id,status,origin,recorded_by,response_snapshot,response_snapshot_known)
    select r.event_id,r.user_id,(case p.response when 'yes' then 'present' else 'absent' end)::public.ff_attendance,
      'prefill',auth.uid(),p.response,true from public.event_roster r
    left join public.participation_responses p on p.event_id=r.event_id and p.user_id=r.user_id and p.invalidated_at is null
    where r.event_id=target_event and r.included on conflict(event_id,user_id) do nothing;
  get diagnostics prepared_count=row_count;
  prepared_time:=clock_timestamp();
  update public.events set attendance_prepared_at=prepared_time,attendance_state='IN_PROGRESS' where id=target_event;
  perform ff_private.write_audit('attendance_prepared',target_event,null,null,
    jsonb_build_object('provisional',true,'inserted',prepared_count,'prepared_at',prepared_time,'prepared_by',auth.uid()));
end;
$$;

create or replace function public.ff_record_attendance(target_event uuid,target_user uuid,attendance_status public.ff_attendance,reason text default null)
returns void language plpgsql security definer set search_path='' as $$
declare item public.events; previous jsonb; after_value jsonb; confirmed boolean;
begin
  item:=ff_private.lock_attendance_event(target_event);
  perform ff_private.require_rule(attendance_status is not null and exists(select 1 from public.event_roster
    where event_id=target_event and user_id=target_user and included),'Roster member and attendance value required');
  confirmed:=exists(select 1 from public.attendance_confirmations where event_id=target_event);
  perform ff_private.require_rule(not confirmed or (length(btrim(reason)) between 5 and 2000 and attendance_status<>'unknown'),
    'Confirmed lists require a reason and a determined attendance value');
  select to_jsonb(a) into previous from public.actual_attendance a where event_id=target_event and user_id=target_user;
  if previous->>'status'=attendance_status::text and previous->>'origin'='manual' then return; end if;
  insert into public.actual_attendance(event_id,user_id,status,origin,recorded_by,response_snapshot,response_snapshot_known)
    values(target_event,target_user,attendance_status,'manual',auth.uid(),(select response from public.participation_responses
      where event_id=target_event and user_id=target_user and invalidated_at is null),true)
    on conflict(event_id,user_id) do update set status=excluded.status,origin='manual',recorded_by=auth.uid(),recorded_at=clock_timestamp();
  update public.events set attendance_state=case when confirmed then 'CORRECTED'::public.ff_attendance_list_state
    else 'IN_PROGRESS'::public.ff_attendance_list_state end,
    attendance_corrected_at=case when confirmed then clock_timestamp() else attendance_corrected_at end where id=target_event;
  select to_jsonb(a) into after_value from public.actual_attendance a where event_id=target_event and user_id=target_user;
  perform ff_private.write_audit(case when confirmed then 'attendance_corrected' else 'attendance_recorded' end,
    target_event,target_user,previous,after_value,btrim(reason));
end;
$$;

create or replace function public.ff_confirm_attendance(target_event uuid)
returns void language plpgsql security definer set search_path='' as $$
declare item public.events; snapshot jsonb;
begin
  item:=ff_private.lock_attendance_event(target_event);
  if exists(select 1 from public.attendance_confirmations where event_id=target_event) then return; end if;
  perform ff_private.require_rule(item.event_type not in ('regular','special') or item.attendance_prepared_at is not null,
    'Review provisional preparation before confirmation');
  perform ff_private.require_rule(exists(select 1 from public.event_roster where event_id=target_event and included) and not exists(
    select 1 from public.event_roster r left join public.actual_attendance a using(event_id,user_id)
    where r.event_id=target_event and r.included and (a.status is null or a.status='unknown')),
    'All roster members must have determined attendance before completion');
  select jsonb_agg(jsonb_build_object('user_id',a.user_id,'name',r.name_snapshot,'status',a.status,'origin',a.origin,
    'response',a.response_snapshot,'response_known',a.response_snapshot_known,
    'recorded_by',a.recorded_by,'recorded_at',a.recorded_at) order by a.user_id) into snapshot
    from public.actual_attendance a join public.event_roster r using(event_id,user_id) where a.event_id=target_event and r.included;
  insert into public.attendance_confirmations(event_id,confirmed_by,original_snapshot) values(target_event,auth.uid(),snapshot);
  update public.events set attendance_state='COMPLETED' where id=target_event;
  perform ff_private.write_audit('attendance_confirmed',target_event,null,null,snapshot);
end;
$$;

create or replace function public.ff_set_primary_organizer(target_event uuid,target_user uuid,internal_note text default '')
returns void language plpgsql security definer set search_path='' as $$
declare item public.events; previous jsonb;
begin
  perform pg_advisory_xact_lock(hashtext('ff.membership_eligibility'));
  select * into item from public.events where id=target_event for update;
  perform ff_private.require_rule(found and ff_private.manages_scope(item.scope_kind,item.unit_id,item.function_id)
    and not exists(select 1 from public.event_calendar where event_id=item.id),'Responsible scope administration required');
  perform ff_private.require_rule(internal_note is not null and length(btrim(internal_note))<=2000,'Organizer note too long');
  if target_user is not null then
    perform ff_private.require_rule(item.status='scheduled' and ff_private.is_approved_user(target_user),'Approved roster member required');
    perform ff_private.ensure_event_member(target_event,target_user);
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

create or replace function public.ff_attendance_workspace(target_event uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
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
      'note',case when ff_private.can_lead_event(item.id) then d.note else null end,
      'access_granted',ff_private.is_approved_user(d.user_id)
        and exists(select 1 from ff_private.event_members(item.id) where user_id=d.user_id))
      from public.event_delegations d join public.profiles pr on pr.id=d.user_id where d.event_id=item.id and d.revoked_at is null and d.is_primary),
    'candidates',case when may_delegate then coalesce((select jsonb_agg(jsonb_build_object('id',r.user_id,'name',r.name_snapshot)
      order by r.name_snapshot,r.user_id) from ff_private.event_members(item.id) r
      where ff_private.is_approved_user(r.user_id)),'[]') else '[]'::jsonb end,
    'members',coalesce((select jsonb_agg(jsonb_build_object('user_id',r.user_id,'name',r.name_snapshot,
      'response',case when a.user_id is not null then a.response_snapshot else resp.response end,
      'response_known',case when a.user_id is not null then a.response_snapshot_known else true end,
      'status',a.status,'origin',a.origin,'recorded_at',a.recorded_at) order by r.name_snapshot,r.user_id)
      from ff_private.event_members(item.id) r
      left join public.actual_attendance a on a.event_id=item.id and a.user_id=r.user_id
      left join public.participation_responses resp on resp.event_id=item.id and resp.user_id=r.user_id and resp.invalidated_at is null),'[]')
  ) into result from public.events e left join public.units u on u.id=e.unit_id left join public.special_functions f on f.id=e.function_id
    left join public.attendance_confirmations c on c.event_id=e.id left join public.profiles p on p.id=c.confirmed_by where e.id=target_event;
  return result;
end;
$$;

revoke all on function ff_private.freeze_event_roster(uuid) from public,anon,authenticated,service_role;
-- Existing replies are retained with their original answer/time, but no longer authorize future participation.
do $$ declare person uuid; begin
  for person in select distinct user_id from public.participation_responses loop
    perform ff_private.invalidate_future_responses(person);
  end loop;
end $$;
notify pgrst,'reload schema';
commit;
