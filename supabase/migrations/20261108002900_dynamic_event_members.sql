begin;

alter table public.events add column participant_mode text not null default 'scope'
  check(participant_mode in ('scope','explicit'));
alter table public.event_roster
  add column included boolean not null default true,
  add column invited boolean not null default false;
alter table public.participation_responses add column invalidated_at timestamptz;

-- Preserve registered legacy fixture hashes without accepting changes to the new metadata.
create or replace function ff_private.history_data_hash()
returns text language sql stable security definer set search_path='' as $$
  select md5(jsonb_build_object(
    'profiles',(select jsonb_agg(to_jsonb(p) order by p.id) from public.profiles p where dev_seed_key='DEV041-HISTORY-V1'),
    'memberships',(select jsonb_agg(to_jsonb(m) order by m.id) from public.unit_memberships m join public.profiles p on p.id=m.user_id where p.dev_seed_key='DEV041-HISTORY-V1'),
    'functions',(select jsonb_agg(to_jsonb(m) order by m.id) from public.function_memberships m join public.profiles p on p.id=m.user_id where p.dev_seed_key='DEV041-HISTORY-V1'),
    'events',(select jsonb_agg(case when e.participant_mode='scope' then to_jsonb(e)-'participant_mode' else to_jsonb(e) end order by e.id)
      from public.events e where dev_seed_key='DEV041-HISTORY-V1'),
    'rosters',(select jsonb_agg(case when r.included and not r.invited then to_jsonb(r)-'included'-'invited' else to_jsonb(r) end order by r.event_id,r.user_id)
      from public.event_roster r join public.events e on e.id=r.event_id where e.dev_seed_key='DEV041-HISTORY-V1'),
    'attendance',(select jsonb_agg(to_jsonb(a) order by a.event_id,a.user_id) from public.actual_attendance a join public.events e on e.id=a.event_id where e.dev_seed_key='DEV041-HISTORY-V1'),
    'responses',(select jsonb_agg(case when a.invalidated_at is null then to_jsonb(a)-'invalidated_at' else to_jsonb(a) end order by a.event_id,a.user_id)
      from public.participation_responses a join public.events e on e.id=a.event_id where e.dev_seed_key='DEV041-HISTORY-V1'),
    'confirmations',(select jsonb_agg(to_jsonb(a) order by a.event_id) from public.attendance_confirmations a join public.events e on e.id=a.event_id where e.dev_seed_key='DEV041-HISTORY-V1')
  )::text);
$$;

create function ff_private.roster_frozen(target uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.events e where e.id=target and (
    e.attendance_initialized_at is not null or e.attendance_prepared_at is not null
    or exists(select 1 from public.actual_attendance where event_id=e.id)
    or exists(select 1 from public.attendance_confirmations where event_id=e.id)));
$$;

create function ff_private.event_members(target uuid)
returns table(user_id uuid,name_snapshot text,unit_snapshot_id uuid)
language sql stable security definer set search_path='' as $$
  with item as materialized (
    select e.*,ff_private.roster_frozen(e.id) frozen,
      least(e.starts_at,statement_timestamp()) relevant_time from public.events e where e.id=target
        and not exists(select 1 from public.event_calendar where event_id=e.id)
  ), eligible as (
    select distinct on (p.id) p.id,p.display_name,m.unit_id
    from item e join public.unit_memberships m on m.valid_from<=e.relevant_time
      and (m.valid_until is null or m.valid_until>e.relevant_time)
    join public.profiles p on p.id=m.user_id and p.dev_seed_key is not distinct from e.dev_seed_key
    where not e.frozen and (case when e.starts_at>statement_timestamp() then ff_private.is_approved_user(p.id)
      else (p.approved_at<=e.starts_at or exists(select 1 from public.audit_entries a
          where a.subject_id=p.id and a.happened_at<=e.starts_at and a.action in ('member_approved','dev_bootstrap')))
        and coalesce((select case when a.action='dev_bootstrap' then 'approved' else a.after_data->>'status' end from public.audit_entries a
          where a.subject_id=p.id and a.happened_at<=e.starts_at
            and a.action in ('account_status_changed','account_reactivated','member_approved','dev_bootstrap')
          order by a.happened_at desc,a.id desc limit 1),'approved')='approved' end)
      and (e.participant_mode='scope' or exists(select 1 from public.event_roster r
          where r.event_id=e.id and r.user_id=p.id and r.invited))
      and (e.scope_kind='organization' or (e.scope_kind='unit' and m.unit_id=e.unit_id)
          or (e.scope_kind='function' and exists(select 1 from public.function_memberships f
            where f.user_id=p.id and f.function_id=e.function_id and f.valid_from<=e.relevant_time
              and (f.valid_until is null or f.valid_until>e.relevant_time))))
    order by p.id,m.valid_from,m.id
  )
  select r.user_id,r.name_snapshot,r.unit_snapshot_id from item e
    join public.event_roster r on r.event_id=e.id and r.included where e.frozen
  union all select id,display_name,unit_id from eligible;
$$;

create or replace function ff_private.can_lead_event(target uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select ff_private.is_active() and exists(select 1 from public.events e where e.id=target and (
    ff_private.manages_scope(e.scope_kind,e.unit_id,e.function_id)
    or (exists(select 1 from public.event_delegations d where d.event_id=e.id
      and d.user_id=auth.uid() and d.revoked_at is null)
      and exists(select 1 from ff_private.event_members(e.id) m where m.user_id=auth.uid()))));
$$;

create or replace function ff_private.can_view_event(target uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select ff_private.is_active() and exists(select 1 from public.events e
    left join public.event_calendar c on c.event_id=e.id where e.id=target and
    case when exists(select 1 from public.vehicle_reservations q where q.event_id=target) then
      exists(select 1 from public.vehicle_reservations q where q.event_id=target and q.state in ('APPROVED','COMPLETED')
        and ff_private.vehicle_visible(q.vehicle_id))
    else (
      (c.event_id is null and (ff_private.is_overseer() or ff_private.can_lead_event(e.id)
        or exists(select 1 from ff_private.event_members(e.id) m where m.user_id=auth.uid())))
      or (c.event_id is not null and (ff_private.can_manage_calendar(e.id) or (c.archived_at is null and (
        ff_private.is_overseer()
        or (c.audience='scope' and ff_private.belongs_to_scope(e.scope_kind,e.unit_id,e.function_id))
        or (c.audience='units' and exists(select 1 from public.calendar_event_units t where t.event_id=e.id
          and ff_private.belongs_to_scope('unit',t.unit_id,null)))
        or (c.audience='leadership' and (ff_private.manages_scope(e.scope_kind,e.unit_id,e.function_id)
          or (e.scope_kind='organization' and exists(select 1 from public.role_assignments r
            where r.user_id=auth.uid() and r.role='UNIT_ADMIN' and r.revoked_at is null)))))))))
    end);
$$;

create or replace function ff_private.can_view_profile(target uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select target=auth.uid() or (ff_private.is_active()
    and exists(select 1 from public.profiles p where p.id=target and p.status='approved')
    and (ff_private.is_overseer()
      or exists(select 1 from public.unit_memberships m where m.user_id=target
        and m.valid_from<=statement_timestamp() and (m.valid_until is null or m.valid_until>statement_timestamp())
        and ff_private.has_role('UNIT_ADMIN',m.unit_id,null))
      or exists(select 1 from public.function_memberships m where m.user_id=target
        and m.valid_from<=statement_timestamp() and (m.valid_until is null or m.valid_until>statement_timestamp())
        and ff_private.has_role('FUNCTION_ADMIN',null,m.function_id))
      or exists(select 1 from public.event_roster r where r.user_id=target and ff_private.can_lead_event(r.event_id)
        and exists(select 1 from ff_private.event_members(r.event_id) m where m.user_id=target))));
$$;

create function ff_private.ensure_event_member(target uuid,person uuid)
returns void language plpgsql security definer set search_path='' as $$
declare member record;
begin
  select * into member from ff_private.event_members(target) where user_id=person;
  perform ff_private.require_rule(found,'Aktuell berechtigtes Mitglied aus dem Teilnehmerkreis erforderlich.');
  insert into public.event_roster(event_id,user_id,name_snapshot,unit_snapshot_id)
    values(target,member.user_id,member.name_snapshot,member.unit_snapshot_id)
    on conflict(event_id,user_id) do update set included=true;
end;
$$;

create or replace function public.ff_set_response(target_event uuid,answer public.ff_response)
returns void language plpgsql security definer set search_path='' as $$
declare item public.events; previous jsonb;
begin
  perform pg_advisory_xact_lock(hashtext('ff.membership_eligibility'));
  select * into item from public.events where id=target_event for update;
  perform ff_private.require_rule(found and ff_private.is_active() and not ff_private.roster_frozen(target_event),
    'Freigabe und noch nicht initialisierter Teilnehmerkreis erforderlich.');
  perform ff_private.require_rule(answer is not null and item.status='scheduled' and clock_timestamp()<item.starts_at
    and (item.response_deadline is null or clock_timestamp()<item.response_deadline),'Response deadline reached or event unavailable');
  perform ff_private.ensure_event_member(target_event,auth.uid());
  select to_jsonb(p) into previous from public.participation_responses p where event_id=target_event and user_id=auth.uid();
  insert into public.participation_responses(event_id,user_id,response) values(target_event,auth.uid(),answer)
    on conflict(event_id,user_id) do update set response=excluded.response,updated_at=clock_timestamp(),invalidated_at=null;
  perform ff_private.write_audit('response_changed',target_event,auth.uid(),previous,to_jsonb(answer));
end;
$$;

create or replace function public.ff_set_member_response(target_event uuid,target_user uuid,answer public.ff_response,reason text)
returns void language plpgsql security definer set search_path='' as $$
declare item public.events; previous jsonb;
begin
  perform pg_advisory_xact_lock(hashtext('ff.membership_eligibility'));
  select * into item from public.events where id=target_event for update;
  perform ff_private.require_rule(found and ff_private.can_lead_event(target_event),
    'Nur zuständige Administration oder aktuelle Terminleitung darf Rückmeldungen korrigieren.');
  perform ff_private.require_rule(item.status='scheduled' and answer is not null and ff_private.is_approved_user(target_user)
    and length(btrim(reason)) between 5 and 2000,'Freigegebenes Mitglied und Korrekturgrund erforderlich.');
  perform ff_private.ensure_event_member(target_event,target_user);
  select to_jsonb(p) into previous from public.participation_responses p where event_id=target_event and user_id=target_user;
  insert into public.participation_responses(event_id,user_id,response) values(target_event,target_user,answer)
    on conflict(event_id,user_id) do update set response=excluded.response,updated_at=clock_timestamp(),invalidated_at=null;
  perform ff_private.write_audit('response_corrected',target_event,target_user,previous,to_jsonb(answer),btrim(reason));
end;
$$;

create function ff_private.response_eligibility_continuous(target uuid,person uuid,answered_at timestamptz,checked_at timestamptz)
returns boolean language sql stable security definer set search_path='' as $$
  select case when answered_at>checked_at then false else
    coalesce((select range_agg(tstzrange(m.valid_from,m.valid_until,'[)')) from public.unit_memberships m
      where m.user_id=person and (e.scope_kind<>'unit' or m.unit_id=e.unit_id))
      @>tstzrange(answered_at,checked_at,'[]'),false)
    and (e.scope_kind<>'function' or coalesce((select range_agg(tstzrange(m.valid_from,m.valid_until,'[)'))
      from public.function_memberships m where m.user_id=person and m.function_id=e.function_id)
      @>tstzrange(answered_at,checked_at,'[]'),false))
    and not exists(select 1 from public.audit_entries a where a.subject_id=person
      and a.action='account_status_changed' and a.after_data->>'status'<>'approved'
      and a.happened_at>=answered_at and a.happened_at<=checked_at)
    end from public.events e where e.id=target;
$$;

create function ff_private.invalidate_future_responses(person uuid)
returns void language plpgsql security definer set search_path='' as $$
declare changed record; checked_at timestamptz:=clock_timestamp();
begin
  -- RPC statement time precedes its membership writes. Check coverage through the final server clock.
  for changed in
    update public.participation_responses p set invalidated_at=checked_at
      from public.events e where e.id=p.event_id and p.user_id=person and p.invalidated_at is null
        and e.starts_at>checked_at and not ff_private.roster_frozen(e.id)
        and (not exists(select 1 from ff_private.event_members(e.id) m where m.user_id=person)
          or not ff_private.response_eligibility_continuous(e.id,person,p.updated_at,checked_at))
      returning p.*
  loop
    perform ff_private.write_audit('future_response_invalidated',changed.event_id,person,
      jsonb_build_object('response',changed.response,'updated_at',changed.updated_at,'invalidated_at',null),
      to_jsonb(changed),'Teilnahmeberechtigung nach Mitgliedschafts- oder Freigabeänderung entfallen.');
  end loop;
end;
$$;

create or replace function ff_private.bootstrap_global_admin(target_user uuid,target_unit uuid)
returns void language plpgsql security definer set search_path='' as $$
declare verified_email text;
begin
  perform pg_advisory_xact_lock(hashtext('ff.role_changes'));
  perform pg_advisory_xact_lock(hashtext('ff.membership_eligibility'));
  perform ff_private.require_rule(not exists(select 1 from public.role_assignments where role='GLOBAL_ADMIN'),'Bootstrap already used');
  perform 1 from public.profiles where id=target_user and status='pending' for no key update;
  perform ff_private.require_rule(found,'Pending profile required');
  select lower(email) into verified_email from auth.users where id=target_user and email_confirmed_at is not null
    and email ~* '^[^@[:space:]]+@feuerwehr-odenthal\.de$' and not coalesce(is_anonymous,false)
    and deleted_at is null and (banned_until is null or banned_until<=statement_timestamp());
  perform ff_private.require_rule(verified_email is not null and exists(select 1 from public.units where id=target_unit),
    'Verified email and existing unit required');
  update public.profiles set status='approved',approved_at=clock_timestamp(),approved_by=target_user,approved_email=verified_email where id=target_user;
  insert into public.unit_memberships(user_id,unit_id) values(target_user,target_unit);
  insert into public.role_assignments(user_id,role,granted_by) values(target_user,'MEMBER',target_user),(target_user,'GLOBAL_ADMIN',target_user);
  perform ff_private.write_audit('dev_bootstrap',null,target_user,null,jsonb_build_object('unit_id',target_unit,'role','GLOBAL_ADMIN'));
end;
$$;

create or replace function public.ff_approve_member(target_user uuid,target_unit uuid)
returns void language plpgsql security definer set search_path='' as $$
declare previous public.profiles; verified_email text;
begin
  perform pg_advisory_xact_lock(hashtext('ff.role_changes'));
  perform pg_advisory_xact_lock(hashtext('ff.membership_eligibility'));
  perform ff_private.require_rule(ff_private.has_role('GLOBAL_ADMIN'),'Global administration required');
  select * into previous from public.profiles where id=target_user for no key update;
  select lower(email) into verified_email from auth.users where id=target_user and email_confirmed_at is not null
    and email ~* '^[^@[:space:]]+@feuerwehr-odenthal\.de$' and not coalesce(is_anonymous,false)
    and deleted_at is null and (banned_until is null or banned_until<=statement_timestamp());
  perform ff_private.require_rule(verified_email is not null and (
    previous.status='pending' or (previous.status='approved' and previous.approved_email is distinct from verified_email)),
    'Verified pending registration required');
  perform ff_private.require_rule(exists(select 1 from public.units where id=target_unit),'Existing unit required');
  update public.profiles set status='approved',approved_at=clock_timestamp(),approved_by=auth.uid(),approved_email=verified_email where id=target_user;
  update public.unit_memberships set valid_until=clock_timestamp()
    where user_id=target_user and valid_until is null and unit_id<>target_unit;
  insert into public.unit_memberships(user_id,unit_id)
    select target_user,target_unit where not exists(select 1 from public.unit_memberships where user_id=target_user and valid_until is null);
  insert into public.role_assignments(user_id,role,granted_by)
    select target_user,'MEMBER',auth.uid() where not exists(
      select 1 from public.role_assignments where user_id=target_user and role='MEMBER' and revoked_at is null);
  perform ff_private.write_audit('member_approved',null,target_user,
    jsonb_build_object('status',previous.status),jsonb_build_object('status','approved','unit_id',target_unit));
end;
$$;

create or replace function public.ff_set_account_status(target_user uuid,next_status public.ff_account_status,reason text)
returns void language plpgsql security definer set search_path='' as $$
declare previous public.ff_account_status;
begin
  perform pg_advisory_xact_lock(hashtext('ff.role_changes'));
  perform pg_advisory_xact_lock(hashtext('ff.membership_eligibility'));
  perform ff_private.require_rule(ff_private.has_role('GLOBAL_ADMIN'),'Global administration required');
  perform ff_private.require_rule(next_status in ('pending','rejected','suspended')
    and length(btrim(reason)) between 5 and 2000,'Non-approved status and reason required');
  select status into previous from public.profiles where id=target_user for no key update;
  perform ff_private.require_rule(found,'Profile not found');
  if ff_private.is_approved_user(target_user) and exists(
    select 1 from public.role_assignments where user_id=target_user and role='GLOBAL_ADMIN' and revoked_at is null) then
    perform ff_private.require_rule((select count(*) from public.role_assignments
      where role='GLOBAL_ADMIN' and revoked_at is null and ff_private.is_approved_user(user_id))>1,
      'Last global administrator must remain active');
  end if;
  update public.profiles set status=next_status where id=target_user;
  perform ff_private.write_audit('account_status_changed',null,target_user,
    jsonb_build_object('status',previous),jsonb_build_object('status',next_status),reason);
end;
$$;

create or replace function public.ff_reactivate_member(target_user uuid,reason text)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform pg_advisory_xact_lock(hashtext('ff.role_changes'));
  perform pg_advisory_xact_lock(hashtext('ff.membership_eligibility'));
  perform ff_private.require_rule(ff_private.has_role('GLOBAL_ADMIN'),'Global administration required');
  perform 1 from public.profiles where id=target_user and status='suspended' for no key update;
  perform ff_private.require_rule(found and length(btrim(reason)) between 5 and 2000,'Gesperrtes Mitglied und Änderungsgrund erforderlich.');
  perform ff_private.require_rule(exists(select 1 from public.profiles p join auth.users a on a.id=p.id
    where p.id=target_user and p.approved_email=lower(a.email) and a.email_confirmed_at is not null
      and a.email ~* '^[^@[:space:]]+@feuerwehr-odenthal\.de$' and not coalesce(a.is_anonymous,false)
      and a.deleted_at is null and (a.banned_until is null or a.banned_until<=statement_timestamp()))
    and exists(select 1 from public.unit_memberships where user_id=target_user
      and valid_from<=statement_timestamp() and (valid_until is null or valid_until>statement_timestamp())),
    'Unverändert verifizierte Feuerwehr-E-Mail und aktuelle Einheit erforderlich.');
  update public.profiles set status='approved' where id=target_user;
  perform ff_private.write_audit('account_reactivated',null,target_user,
    jsonb_build_object('status','suspended'),jsonb_build_object('status','approved'),btrim(reason));
end;
$$;

create function ff_private.lock_membership_eligibility()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform pg_advisory_xact_lock(hashtext('ff.membership_eligibility'));
  return null;
end;
$$;
create function ff_private.membership_responses_changed()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_table_name='profiles' then
    perform ff_private.invalidate_future_responses(new.id);
  else
    if tg_op<>'INSERT' then perform ff_private.invalidate_future_responses(old.user_id); end if;
    if tg_op<>'DELETE' then perform ff_private.invalidate_future_responses(new.user_id); end if;
  end if;
  return null;
end;
$$;
create trigger unit_membership_eligibility_lock before insert or update or delete on public.unit_memberships
  for each statement execute function ff_private.lock_membership_eligibility();
create trigger function_membership_eligibility_lock before insert or update or delete on public.function_memberships
  for each statement execute function ff_private.lock_membership_eligibility();
create trigger profile_eligibility_lock before update of status,approved_email,approved_at on public.profiles
  for each statement execute function ff_private.lock_membership_eligibility();
-- Transfers close the old interval before opening the new one: evaluate the committed final membership set.
create constraint trigger unit_membership_responses_changed after insert or update or delete on public.unit_memberships
  deferrable initially deferred for each row execute function ff_private.membership_responses_changed();
create constraint trigger function_membership_responses_changed after insert or update or delete on public.function_memberships
  deferrable initially deferred for each row execute function ff_private.membership_responses_changed();
create constraint trigger profile_membership_responses_changed after update on public.profiles
  deferrable initially deferred for each row execute function ff_private.membership_responses_changed();

create or replace function ff_private.event_summary(target uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select to_jsonb(e)||jsonb_build_object(
    'scope_name',coalesce(u.name,f.name,'Alle Einheiten'),
    'can_manage',ff_private.manages_scope(e.scope_kind,e.unit_id,e.function_id) and e.series_id is null,
    'can_lead',ff_private.can_lead_event(e.id),'can_delegate',ff_private.manages_scope(e.scope_kind,e.unit_id,e.function_id),
    'can_read_attendance',ff_private.can_read_attendance(e.id),
    'own_attendance',case when ff_private.attendance_is_final(e.id) then (select a.status from public.actual_attendance a
      join public.event_roster r using(event_id,user_id) where a.event_id=e.id and a.user_id=auth.uid() and r.included) else null end,
    'in_roster',exists(select 1 from ff_private.event_members(e.id) where user_id=auth.uid()),
    'own_response',(select p.response from public.participation_responses p where p.event_id=e.id and p.user_id=auth.uid()
      and p.invalidated_at is null and exists(select 1 from ff_private.event_members(e.id) where user_id=auth.uid())),
    'participants',case when ff_private.can_lead_event(e.id) or ff_private.is_overseer() then coalesce(
      (select jsonb_agg(jsonb_build_object('user_id',r.user_id,'name',r.name_snapshot,'response',p.response,'updated_at',p.updated_at)
        order by r.name_snapshot,r.user_id) from ff_private.event_members(e.id) r
        left join public.participation_responses p on p.event_id=e.id and p.user_id=r.user_id and p.invalidated_at is null),'[]') else null end)
    from public.events e left join public.units u on u.id=e.unit_id left join public.special_functions f on f.id=e.function_id
    where e.id=target and ff_private.can_view_event(e.id);
$$;

create function public.ff_set_event_participants(target_event uuid,expected_revision integer,participant_ids uuid[])
returns void language plpgsql security definer set search_path='' as $$
declare item public.events; previous jsonb; person uuid;
begin
  perform pg_advisory_xact_lock(hashtext('ff.membership_eligibility'));
  select * into item from public.events where id=target_event for update;
  perform ff_private.require_rule(found and ff_private.manages_scope(item.scope_kind,item.unit_id,item.function_id)
    and item.status='scheduled' and item.starts_at>clock_timestamp() and not ff_private.roster_frozen(item.id)
    and not exists(select 1 from public.event_calendar where event_id=item.id),'Berechtigter zukünftiger Dienst erforderlich.');
  if item.revision is distinct from expected_revision then raise exception 'Termin zwischenzeitlich geändert.' using errcode='40001'; end if;
  perform ff_private.require_rule(participant_ids is not null and cardinality(participant_ids) between 1 and 250
    and array_position(participant_ids,null) is null,'Ein bis 250 ausdrücklich eingeladene Mitglieder erforderlich.');
  foreach person in array participant_ids loop
    perform ff_private.require_rule(ff_private.is_approved_user(person) and exists(select 1 from public.unit_memberships m
      where m.user_id=person and m.valid_from<=statement_timestamp() and (m.valid_until is null or m.valid_until>statement_timestamp())
        and (item.scope_kind='organization' or item.scope_kind='unit' and m.unit_id=item.unit_id
          or item.scope_kind='function' and exists(select 1 from public.function_memberships fm where fm.user_id=person
            and fm.function_id=item.function_id and fm.valid_from<=statement_timestamp()
            and (fm.valid_until is null or fm.valid_until>statement_timestamp())))),
      'Nur berechtigte Mitglieder des verwalteten Bereichs einladen.');
  end loop;
  select jsonb_agg(user_id order by user_id) into previous from public.event_roster where event_id=item.id and invited;
  update public.event_roster set invited=false where event_id=item.id;
  foreach person in array participant_ids loop
    insert into public.event_roster(event_id,user_id,name_snapshot,unit_snapshot_id,invited)
      select item.id,p.id,p.display_name,m.unit_id,true from public.profiles p join public.unit_memberships m on m.user_id=p.id
        where p.id=person and m.valid_from<=statement_timestamp() and (m.valid_until is null or m.valid_until>statement_timestamp())
        order by m.valid_from,m.id limit 1
      on conflict(event_id,user_id) do update set invited=true;
  end loop;
  update public.events set participant_mode='explicit',revision=revision+1 where id=item.id;
  for person in select user_id from public.participation_responses where event_id=item.id loop
    perform ff_private.invalidate_future_responses(person);
  end loop;
  perform ff_private.write_audit('event_participants_selected',item.id,null,previous,to_jsonb(participant_ids));
end;
$$;

alter policy scoped_roster on public.event_roster using (
  ff_private.is_active() and (user_id=auth.uid() or ff_private.can_lead_event(event_id)
    or (ff_private.is_overseer() and ff_private.can_view_event(event_id))));

create or replace function public.ff_events_workspace()
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  return public.ff_events_page();
end;
$$;
alter policy scoped_responses on public.participation_responses using (
  ff_private.is_active() and (user_id=auth.uid() or ff_private.can_lead_event(event_id)
    or (ff_private.is_overseer() and ff_private.can_view_event(event_id))));

revoke all on function ff_private.roster_frozen(uuid),ff_private.event_members(uuid),ff_private.ensure_event_member(uuid,uuid),
  ff_private.invalidate_future_responses(uuid),ff_private.response_eligibility_continuous(uuid,uuid,timestamptz,timestamptz),
  ff_private.lock_membership_eligibility(),
  ff_private.membership_responses_changed(),public.ff_set_event_participants(uuid,integer,uuid[])
  from public,anon,authenticated,service_role;
grant execute on function public.ff_set_event_participants(uuid,integer,uuid[]) to authenticated;
notify pgrst,'reload schema';
commit;
