begin;

-- Repair the incomplete DEV MCP application of 006; safe after the complete 006 in CI.
create or replace function public.ff_cancel_single_event(target_event uuid, expected_revision integer, reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare previous public.events;
begin
  select * into previous from public.events where id = target_event for update;
  perform ff_private.require_rule(found and ff_private.manages_scope(previous.scope_kind, previous.unit_id, previous.function_id),
    'Keine Terminverwaltung für diesen Bereich.');
  perform ff_private.require_rule(previous.series_id is null and previous.status = 'scheduled',
    'Nur geplante Einzeltermine können abgesagt werden.');
  if expected_revision is distinct from previous.revision then
    raise exception 'Termin wurde zwischenzeitlich geändert. Bitte aktualisieren.' using errcode = '40001';
  end if;
  perform ff_private.require_rule(length(btrim(reason)) between 5 and 2000, 'Absagegrund mit mindestens fünf Zeichen erforderlich.');
  perform ff_private.require_rule(not exists (select 1 from public.actual_attendance where event_id = target_event)
    and not exists (select 1 from public.attendance_confirmations where event_id = target_event),
    'Termine mit erfasster Anwesenheit können nicht abgesagt werden.');
  update public.events set status = 'cancelled', revision = revision + 1 where id = target_event;
  perform ff_private.write_audit('event_cancelled', target_event, null,
    to_jsonb(previous), (select to_jsonb(e) from public.events e where e.id = target_event), btrim(reason));
end;
$$;

create or replace function public.ff_set_member_response(target_event uuid, target_user uuid, answer public.ff_response, reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare item public.events; previous public.ff_response;
begin
  select * into item from public.events where id = target_event for update;
  perform ff_private.require_rule(found and ff_private.can_lead_event(target_event),
    'Nur zuständige Administration oder aktuelle Terminleitung darf Rückmeldungen korrigieren.');
  perform ff_private.require_rule(item.status = 'scheduled' and answer is not null
    and ff_private.is_approved_user(target_user) and exists (
      select 1 from public.event_roster where event_id = target_event and user_id = target_user
    ), 'Geplanter Termin und freigegebenes Mitglied aus dem Teilnehmerkreis erforderlich.');
  perform ff_private.require_rule(length(btrim(reason)) between 5 and 2000,
    'Korrekturgrund mit mindestens fünf Zeichen erforderlich.');
  select response into previous from public.participation_responses where event_id = target_event and user_id = target_user;
  insert into public.participation_responses(event_id, user_id, response) values (target_event, target_user, answer)
  on conflict (event_id, user_id) do update set response = excluded.response, updated_at = clock_timestamp();
  perform ff_private.write_audit('response_corrected', target_event, target_user,
    to_jsonb(previous), to_jsonb(answer), btrim(reason));
end;
$$;

create or replace function public.ff_events_workspace()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  perform ff_private.require_rule(ff_private.is_active(), 'Freigabe erforderlich.');
  select jsonb_build_object(
    'server_now', clock_timestamp(),
    'manageable_units', coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'name',u.name) order by u.name)
      from public.units u where ff_private.manages_scope('unit',u.id,null)), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(to_jsonb(e) || jsonb_build_object(
      'scope_name', coalesce(u.name, f.name, 'Alle Einheiten'),
      'can_manage', ff_private.manages_scope(e.scope_kind,e.unit_id,e.function_id) and e.series_id is null,
      'can_lead', ff_private.can_lead_event(e.id),
      'in_roster', exists(select 1 from public.event_roster r where r.event_id=e.id and r.user_id=auth.uid()),
      'own_response', (select p.response from public.participation_responses p where p.event_id=e.id and p.user_id=auth.uid()),
      'participants', case when ff_private.can_lead_event(e.id) or ff_private.is_overseer() then
        coalesce((select jsonb_agg(jsonb_build_object('user_id',r.user_id,'name',r.name_snapshot,
          'response',p.response,'updated_at',p.updated_at) order by r.name_snapshot,r.user_id)
          from public.event_roster r left join public.participation_responses p
            on p.event_id=r.event_id and p.user_id=r.user_id where r.event_id=e.id),'[]'::jsonb)
        else null end) order by e.starts_at,e.id)
      from public.events e left join public.units u on u.id=e.unit_id
      left join public.special_functions f on f.id=e.function_id where ff_private.can_view_event(e.id)), '[]'::jsonb))
  into result;
  return result;
end;
$$;

revoke all on function ff_private.validate_single_event(jsonb) from public, anon, authenticated;
revoke all on function public.ff_create_single_event(jsonb),
  public.ff_update_single_event(uuid,integer,jsonb), public.ff_cancel_single_event(uuid,integer,text),
  public.ff_set_member_response(uuid,uuid,public.ff_response,text), public.ff_events_workspace()
  from public, anon, authenticated;
grant execute on function public.ff_create_single_event(jsonb),
  public.ff_update_single_event(uuid,integer,jsonb), public.ff_cancel_single_event(uuid,integer,text),
  public.ff_set_member_response(uuid,uuid,public.ff_response,text), public.ff_events_workspace() to authenticated;

commit;
