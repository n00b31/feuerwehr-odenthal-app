begin;

create or replace function ff_private.reserve_password_recovery(request_email text, actor uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare target uuid; normalized text := lower(btrim(request_email)); now_at timestamptz; request_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('ff.password_recovery'));
  now_at := clock_timestamp();
  select u.id into target from auth.users u join public.profiles p on p.id = u.id
    where lower(u.email) = normalized and u.email_confirmed_at is not null
      and u.email ~* '^[^@[:space:]]+@feuerwehr-odenthal\.de$'
      and not coalesce(u.is_anonymous, false) and u.deleted_at is null
      and (u.banned_until is null or u.banned_until <= now_at);
  if target is null then return jsonb_build_object('accepted', false, 'reason', 'ineligible'); end if;
  if exists (select 1 from public.password_recovery_requests where email = normalized and outcome = 'reserved')
    or (select count(*) from public.password_recovery_requests where email = normalized
      and coalesce(finished_at, requested_at) > now_at - interval '60 minutes') >= 3
    or (select count(*) from public.password_recovery_requests where email = normalized
      and coalesce(finished_at, requested_at) > now_at - interval '24 hours') >= 5
    or (actor is not null and (select count(*) from public.password_recovery_requests
      where requested_by = actor and coalesce(finished_at, requested_at) > now_at - interval '5 minutes') >= 5) then
    return jsonb_build_object('accepted', false, 'reason', 'limited');
  end if;
  insert into public.password_recovery_requests(user_id, email, requested_by, requested_at)
    values (target, normalized, actor, now_at) returning id into request_id;
  if actor is not null then
    perform ff_private.write_audit('password_recovery_requested', null, target, null,
      jsonb_build_object('request_id', request_id, 'outcome', 'reserved'));
  end if;
  return jsonb_build_object('accepted', true, 'request_id', request_id, 'email', normalized);
end;
$$;

commit;
