begin;

create table public.password_recovery_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  email text not null,
  requested_by uuid references public.profiles(id),
  requested_at timestamptz not null default clock_timestamp(),
  outcome text not null default 'reserved' check (outcome in ('reserved', 'auth_accepted', 'auth_rejected', 'unknown')),
  finished_at timestamptz,
  check ((outcome = 'reserved') = (finished_at is null))
);
create index ff_recovery_email_time on public.password_recovery_requests(email, requested_at desc);
create index ff_recovery_actor_time on public.password_recovery_requests(requested_by, requested_at desc);
alter table public.password_recovery_requests enable row level security;
revoke all on public.password_recovery_requests from public, anon, authenticated, service_role;
grant select on public.password_recovery_requests to authenticated;
create policy ff_recovery_admin_read on public.password_recovery_requests for select to authenticated
  using (ff_private.has_role('GLOBAL_ADMIN'));

create table ff_private.recovery_intake (
  id boolean primary key default true check (id),
  recent timestamptz[] not null default '{}'
);
insert into ff_private.recovery_intake(id) values (true);
alter table ff_private.recovery_intake enable row level security;
revoke all on ff_private.recovery_intake from public, anon, authenticated, service_role;

create table ff_private.recovery_verifiers (
  request_id uuid primary key references public.password_recovery_requests(id),
  verifier text not null check (verifier ~ '^[A-Za-z0-9_-]{43}$'),
  expires_at timestamptz not null default clock_timestamp() + interval '60 minutes'
);
alter table ff_private.recovery_verifiers enable row level security;
revoke all on ff_private.recovery_verifiers from public, anon, authenticated, service_role;

create function public.ff_store_recovery_verifier(request_id uuid, verifier text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform ff_private.require_rule(exists (select 1 from public.password_recovery_requests r
    where r.id = request_id and r.outcome = 'reserved'), 'Reserved recovery request required');
  delete from ff_private.recovery_verifiers where expires_at <= clock_timestamp();
  insert into ff_private.recovery_verifiers(request_id, verifier) values (request_id, verifier);
end;
$$;
create function public.ff_claim_recovery_verifier(request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare claimed ff_private.recovery_verifiers; target uuid;
begin
  delete from ff_private.recovery_verifiers v where v.request_id = ff_claim_recovery_verifier.request_id
    returning * into claimed;
  if claimed.request_id is null or claimed.expires_at <= clock_timestamp() then return null; end if;
  select user_id into target from public.password_recovery_requests r where r.id = claimed.request_id
    and r.outcome in ('reserved', 'auth_accepted', 'unknown');
  if target is null then return null; end if;
  return jsonb_build_object('verifier', claimed.verifier, 'user_id', target);
end;
$$;

create function public.ff_allow_self_recovery_request()
returns boolean language plpgsql security definer set search_path = '' as $$
declare recent_requests timestamptz[]; now_at timestamptz;
begin
  select recent into recent_requests from ff_private.recovery_intake where id for update;
  now_at := clock_timestamp();
  select coalesce(array_agg(t), '{}') into recent_requests
    from unnest(recent_requests) t where t > now_at - interval '5 minutes';
  if cardinality(recent_requests) >= 30 then return false; end if;
  update ff_private.recovery_intake set recent = array_append(recent_requests, now_at) where id;
  return true;
end;
$$;

create function ff_private.reserve_password_recovery(request_email text, actor uuid)
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
  if exists (select 1 from public.password_recovery_requests where email = normalized
      and (outcome = 'reserved' or coalesce(finished_at, requested_at) > now_at - interval '60 minutes'))
    or (select count(*) from public.password_recovery_requests where email = normalized
      and coalesce(finished_at, requested_at) > now_at - interval '24 hours') >= 3
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

create function public.ff_begin_self_password_recovery(request_email text)
returns jsonb language sql security definer set search_path = '' as $$
  select ff_private.reserve_password_recovery(request_email, null);
$$;

create function public.ff_begin_admin_password_recovery(target_user uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare target_email text; reply jsonb;
begin
  perform pg_advisory_xact_lock(hashtext('ff.role_changes'));
  perform ff_private.require_rule(ff_private.has_role('GLOBAL_ADMIN'), 'Global administration required');
  select email into target_email from auth.users where id = target_user;
  reply := ff_private.reserve_password_recovery(target_email, auth.uid());
  if (reply->>'accepted')::boolean is distinct from true then
    perform ff_private.write_audit('password_recovery_denied', null,
      (select p.id from public.profiles p where p.id = target_user), null,
      jsonb_build_object('requested_user', target_user, 'outcome', reply->>'reason'));
  end if;
  return reply;
end;
$$;

create function public.ff_finish_password_recovery(request_id uuid, result text)
returns void language plpgsql security definer set search_path = '' as $$
declare previous public.password_recovery_requests;
begin
  perform ff_private.require_rule(result in ('auth_accepted', 'auth_rejected', 'unknown'), 'Known recovery result required');
  select * into previous from public.password_recovery_requests where id = request_id for update;
  perform ff_private.require_rule(found and previous.outcome = 'reserved', 'Unfinished recovery request required');
  update public.password_recovery_requests set outcome = result, finished_at = clock_timestamp() where id = request_id;
  if result = 'auth_rejected' then delete from ff_private.recovery_verifiers v where v.request_id = ff_finish_password_recovery.request_id; end if;
  if previous.requested_by is not null then
    insert into public.audit_entries(actor_id, subject_id, action, before_data, after_data, display_snapshot)
    values (previous.requested_by, previous.user_id, 'password_recovery_result',
      jsonb_build_object('request_id', request_id, 'outcome', 'reserved'),
      jsonb_build_object('request_id', request_id, 'outcome', result),
      jsonb_build_object(
        'actor_name', (select display_name from public.profiles where id = previous.requested_by),
        'subject_name', (select display_name from public.profiles where id = previous.user_id)));
  end if;
end;
$$;

revoke all on function ff_private.reserve_password_recovery(text, uuid) from public, anon, authenticated, service_role;
revoke all on function public.ff_allow_self_recovery_request(), public.ff_begin_self_password_recovery(text),
  public.ff_finish_password_recovery(uuid, text), public.ff_begin_admin_password_recovery(uuid),
  public.ff_store_recovery_verifier(uuid, text), public.ff_claim_recovery_verifier(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.ff_allow_self_recovery_request(), public.ff_begin_self_password_recovery(text),
  public.ff_finish_password_recovery(uuid, text), public.ff_store_recovery_verifier(uuid, text),
  public.ff_claim_recovery_verifier(uuid) to service_role;
grant execute on function public.ff_begin_admin_password_recovery(uuid) to authenticated;

commit;
