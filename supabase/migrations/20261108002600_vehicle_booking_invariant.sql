begin;

create extension if not exists btree_gist with schema extensions;
set local search_path = public, extensions, pg_catalog;

do $$ begin
  if exists(select 1 from public.vehicle_reservations q left join public.event_calendar c on c.event_id=q.event_id
    where c.event_id is null or c.resource_id is distinct from q.vehicle_id or c.entry_kind<>'booking') then
    raise exception 'Existing canonical vehicle links require explicit review; nothing was changed.' using errcode='23514';
  end if;
  if exists (
    select 1 from public.vehicle_reservations a join public.events ea on ea.id=a.event_id
    join public.vehicle_reservations b on b.vehicle_id=a.vehicle_id and b.event_id>a.event_id
    join public.events eb on eb.id=b.event_id
    where a.state in ('APPROVED','COMPLETED') and b.state in ('APPROVED','COMPLETED')
      and ea.starts_at<eb.ends_at and ea.ends_at>eb.starts_at
  ) then
    raise exception 'Existing binding vehicle overlaps require explicit review; nothing was changed.'
      using errcode='23P01';
  end if;
end $$;

alter table public.vehicle_reservations
  add column actor_id uuid references public.profiles(id),
  add column starts_at timestamptz,
  add column ends_at timestamptz;
update public.vehicle_reservations q set
  actor_id=coalesce((select a.actor_id from public.audit_entries a
    where a.event_id=q.event_id and a.action in ('vehicle_requested','vehicle_blocked')
      and a.actor_id is not null order by a.happened_at,a.id limit 1),q.requester_id),
  starts_at=e.starts_at,ends_at=e.ends_at from public.events e where e.id=q.event_id;
alter table public.vehicle_reservations
  alter column actor_id set not null,
  alter column starts_at set not null,
  alter column ends_at set not null,
  add constraint vehicle_reservation_finite_interval
    check(isfinite(starts_at) and isfinite(ends_at) and ends_at>starts_at),
  add constraint vehicle_binding_no_overlap exclude using gist
    (vehicle_id with =,tstzrange(starts_at,ends_at,'[)') with &&)
    where (state in ('APPROVED','COMPLETED'));

create function ff_private.vehicle_reservation_interval()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  select e.starts_at,e.ends_at into new.starts_at,new.ends_at
    from public.events e where e.id=new.event_id for share;
  perform ff_private.require_rule(found,'Existing canonical vehicle event required.');
  perform ff_private.require_rule(exists(select 1 from public.event_calendar c
    where c.event_id=new.event_id and c.resource_id=new.vehicle_id and c.entry_kind='booking'),
    'Vehicle reservation must match its canonical calendar resource.');
  if tg_op='INSERT' then
    new.actor_id:=coalesce(auth.uid(),new.actor_id,new.requester_id);
  else
    perform ff_private.require_rule(new.actor_id=old.actor_id and new.event_id=old.event_id
      and new.vehicle_id=old.vehicle_id and new.requester_id=old.requester_id and new.kind=old.kind,
      'Reservation actor, requester and resource identity are immutable.');
  end if;
  return new;
end;
$$;
create trigger vehicle_reservation_canonical_interval
  before insert or update on public.vehicle_reservations
  for each row execute function ff_private.vehicle_reservation_interval();

create function ff_private.vehicle_event_interval()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  update public.vehicle_reservations set starts_at=new.starts_at,ends_at=new.ends_at
    where event_id=new.id;
  return new;
end;
$$;
create trigger vehicle_event_canonical_interval
  after update of starts_at,ends_at on public.events for each row
  when (old.starts_at is distinct from new.starts_at or old.ends_at is distinct from new.ends_at)
  execute function ff_private.vehicle_event_interval();

create function ff_private.vehicle_calendar_identity()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='DELETE' then
    perform ff_private.require_rule(not exists(select 1 from public.vehicle_reservations q where q.event_id=old.event_id),
      'Canonical calendar entry of an existing vehicle reservation cannot be removed.');
    return old;
  end if;
  perform ff_private.require_rule(not exists(select 1 from public.vehicle_reservations q where q.event_id=old.event_id)
    or (new.event_id=old.event_id and new.resource_id is not distinct from old.resource_id and new.entry_kind=old.entry_kind),
    'Canonical resource identity of a vehicle reservation is immutable.');
  return new;
end;
$$;
create trigger vehicle_calendar_canonical_identity before update of resource_id,event_id,entry_kind or delete on public.event_calendar
  for each row execute function ff_private.vehicle_calendar_identity();

revoke all on function ff_private.vehicle_reservation_interval(),ff_private.vehicle_event_interval(),ff_private.vehicle_calendar_identity()
  from public,anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
