begin;

-- One inbox: preserve the existing vehicle rows, IDs, read states and policies.
alter table public.vehicle_notifications alter column event_id drop not null;
alter table public.vehicle_notifications
  add column source_kind text not null default 'vehicle'
    check(source_kind in ('vehicle','event','attendance','registration','test')),
  add column target_id uuid,
  add column event_type text not null default 'vehicle_legacy',
  add column category text not null default 'vehicles'
    check(category in ('services','changes','reminders','vehicles','administration','information')),
  add column title text not null default 'Fahrzeugbenachrichtigung',
  add column dedup_key text,
  add column scheduled_at timestamptz;
create unique index notification_once on public.vehicle_notifications(recipient_id,dedup_key) where dedup_key is not null;

create table public.notification_preferences(
  user_id uuid primary key references public.profiles(id),
  push_enabled boolean not null default false,
  categories text[] not null default array['services','changes','reminders','vehicles','administration','information'],
  reminder_two_hours boolean not null default false,
  updated_at timestamptz not null default clock_timestamp(),
  check(categories <@ array['services','changes','reminders','vehicles','administration','information']::text[])
);
create table public.push_subscriptions(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  endpoint text not null unique,
  p256dh text not null,
  auth_key text not null,
  device_name text not null check(length(device_name) between 1 and 80),
  created_at timestamptz not null default clock_timestamp(),
  last_success_at timestamptz,
  active boolean not null default true,
  check(endpoint ~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)/[^[:space:]#]{1,1900}$'),
  check(p256dh ~ '^[A-Za-z0-9_-]{87}$' and auth_key ~ '^[A-Za-z0-9_-]{22}$')
);
create index push_devices_owner on public.push_subscriptions(user_id,active,id);
create table ff_private.notification_config(
  singleton boolean primary key default true check(singleton),
  enabled boolean not null default true,
  public_key text,
  ready boolean not null default false,
  activated_at timestamptz not null default clock_timestamp(),
  categories text[] not null default array['services','changes','reminders','vehicles','administration','information'],
  reminder_hours integer not null default 24 check(reminder_hours between 1 and 168),
  unanswered_hours integer not null default 48 check(unanswered_hours between 1 and 168),
  check(public_key is null or public_key ~ '^[A-Za-z0-9_-]{87}$'),
  check(categories <@ array['services','changes','reminders','vehicles','administration','information']::text[])
);
insert into ff_private.notification_config(singleton) values(true);
create table ff_private.notification_events(
  id uuid primary key default gen_random_uuid(),
  source_kind text not null,
  target_id uuid not null,
  event_type text not null,
  category text not null,
  dedup_key text not null unique,
  revision integer,
  created_at timestamptz not null default clock_timestamp(),
  processed_at timestamptz
);
create index notification_event_queue on ff_private.notification_events(created_at,id) where processed_at is null;
create table ff_private.notification_deliveries(
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.vehicle_notifications(id),
  subscription_id uuid not null references public.push_subscriptions(id),
  channel text not null default 'push' check(channel in ('push','email')),
  status text not null default 'pending' check(status in ('pending','leased','accepted','failed','cancelled')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default clock_timestamp(),
  lease_id uuid,
  lease_until timestamptz,
  attempted_at timestamptz,
  finished_at timestamptz,
  error_code text,
  unique(notification_id,subscription_id,channel)
);
create index notification_delivery_queue on ff_private.notification_deliveries(next_attempt_at,id) where status in ('pending','leased');
create index notification_delivery_limits on ff_private.notification_deliveries(attempted_at);
alter table public.notification_preferences enable row level security;
alter table public.push_subscriptions enable row level security;
alter table ff_private.notification_config enable row level security;
alter table ff_private.notification_events enable row level security;
alter table ff_private.notification_deliveries enable row level security;
revoke all on public.notification_preferences,public.push_subscriptions,
  ff_private.notification_config,ff_private.notification_events,ff_private.notification_deliveries from public,anon,authenticated;
grant select on public.notification_preferences to authenticated;
grant select(id,user_id,device_name,created_at,last_success_at,active) on public.push_subscriptions to authenticated;
create policy notification_preferences_own on public.notification_preferences for select to authenticated
  using(user_id=auth.uid() and ff_private.is_active());
create policy push_devices_own on public.push_subscriptions for select to authenticated
  using(user_id=auth.uid() and ff_private.is_active());

create function ff_private.notification_visible(kind text,target uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select ff_private.is_active() and case kind
    when 'vehicle' then ff_private.vehicle_request_visible(target)
    when 'event' then ff_private.can_view_event(target)
      and exists(select 1 from ff_private.event_members(target) m where m.user_id=auth.uid())
    when 'attendance' then ff_private.can_view_event(target) and ff_private.can_lead_event(target)
    when 'registration' then ff_private.has_role('GLOBAL_ADMIN')
    when 'test' then target=auth.uid()
    else false end;
$$;
create policy central_notifications_own on public.vehicle_notifications for select to authenticated
  using(recipient_id=auth.uid() and ff_private.notification_visible(source_kind,coalesce(target_id,event_id)));

-- Only private workers may evaluate existing, auth.uid()-based rules for another recipient.
create function ff_private.notification_recipient_allowed(person uuid,kind text,target uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare previous_sub text:=current_setting('request.jwt.claim.sub',true);
  previous_claims text:=current_setting('request.jwt.claims',true); allowed boolean;
begin
  perform set_config('request.jwt.claim.sub',person::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',person)::text,true);
  allowed:=ff_private.notification_visible(kind,target);
  perform set_config('request.jwt.claim.sub',coalesce(previous_sub,''),true);
  perform set_config('request.jwt.claims',coalesce(previous_claims,''),true);
  return allowed;
exception when others then
  perform set_config('request.jwt.claim.sub',coalesce(previous_sub,''),true);
  perform set_config('request.jwt.claims',coalesce(previous_claims,''),true);
  raise;
end;
$$;
create function ff_private.queue_notification_delivery()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into ff_private.notification_deliveries(notification_id,subscription_id)
    select new.id,s.id from public.push_subscriptions s
    join public.notification_preferences p on p.user_id=s.user_id
    cross join ff_private.notification_config c
    where s.user_id=new.recipient_id and s.active and p.push_enabled and c.enabled and c.ready
      and (new.event_type='dev_test' or new.category=any(p.categories) and new.category=any(c.categories))
      and new.event_type<>'vehicle_receipt';
  return new;
end;
$$;
create trigger ff_notification_delivery after insert on public.vehicle_notifications
  for each row execute function ff_private.queue_notification_delivery();

create function ff_private.classify_vehicle_notification()
returns trigger language plpgsql security definer set search_path='' as $$
declare q public.vehicle_reservations; revision integer;
begin
  if new.event_id is null then return new; end if;
  select * into q from public.vehicle_reservations where event_id=new.event_id;
  select e.revision into revision from public.events e where e.id=new.event_id;
  new.target_id:=new.event_id; new.source_kind:='vehicle'; new.category:='vehicles';
  if exists(select 1 from public.notification_preferences p where p.user_id=new.recipient_id and not('vehicles'=any(p.categories)))
    or not (select 'vehicles'=any(categories) from ff_private.notification_config) then return null; end if;
  new.title:=new.message;
  new.event_type:=case q.state when 'REQUESTED' then 'vehicle_requested' when 'APPROVED' then 'vehicle_approved'
    when 'REJECTED' then 'vehicle_rejected' when 'CANCELLED' then 'vehicle_cancelled' else 'vehicle_changed' end;
  if q.state='REQUESTED' and not exists(
    select 1 from public.vehicles v join public.calendar_resources r on r.id=v.resource_id
    where v.resource_id=q.vehicle_id and (
      exists(select 1 from public.vehicle_managers m where m.vehicle_id=v.resource_id and m.user_id=new.recipient_id)
      or exists(select 1 from public.role_assignments a where a.user_id=new.recipient_id and a.revoked_at is null
        and (a.role='GLOBAL_ADMIN' or (a.role='UNIT_ADMIN' and v.unit_admin_enabled and a.unit_id=r.unit_id)))))
    then new.event_type:='vehicle_receipt'; end if;
  new.dedup_key:='vehicle:'||new.event_id||':'||q.state||':'||revision;
  if exists(select 1 from public.vehicle_notifications n
    where n.recipient_id=new.recipient_id and n.dedup_key=new.dedup_key) then return null; end if;
  return new;
end;
$$;
create trigger ff_vehicle_notification_classify before insert on public.vehicle_notifications
  for each row execute function ff_private.classify_vehicle_notification();

create function ff_private.capture_notification_event()
returns trigger language plpgsql security definer set search_path='' as $$
declare notice_type text; notice_category text;
begin
  if new.dev_seed_key is not null then return new; end if;
  if tg_op='INSERT' then
    if new.event_type not in ('regular','special') or new.starts_at<=statement_timestamp() then return new; end if;
    notice_type:='event_created'; notice_category:='services';
  else
    if (new.title,new.description,new.starts_at,new.ends_at,new.location,new.status,new.unit_id,new.function_id,new.organizer_id)
      is not distinct from
      (old.title,old.description,old.starts_at,old.ends_at,old.location,old.status,old.unit_id,old.function_id,old.organizer_id)
      then return new; end if;
    notice_type:=case when new.status='cancelled' then 'event_cancelled' else 'event_changed' end;
    notice_category:='changes';
  end if;
  insert into ff_private.notification_events(source_kind,target_id,event_type,category,dedup_key,revision)
    values('event',new.id,notice_type,notice_category,'event:'||new.id||':'||notice_type||':'||new.revision,new.revision)
    on conflict(dedup_key) do nothing;
  return new;
end;
$$;
create trigger ff_event_notification after insert or update on public.events
  for each row execute function ff_private.capture_notification_event();
create function ff_private.capture_registration_notification()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.dev_seed_key is null and new.status='pending' then
    insert into ff_private.notification_events(source_kind,target_id,event_type,category,dedup_key)
      values('registration',new.id,'registration_created','administration','registration:'||new.id)
      on conflict(dedup_key) do nothing;
  end if;
  return new;
end;
$$;
create trigger ff_registration_notification after insert on public.profiles
  for each row execute function ff_private.capture_registration_notification();

create function public.ff_notifications(notice_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform ff_private.require_rule(ff_private.is_active(),'Freigabe erforderlich.');
  return jsonb_build_object('actor_id',auth.uid(),
    'unread',(select count(*) from public.vehicle_notifications n where n.recipient_id=auth.uid() and n.read_at is null
      and ff_private.notification_visible(n.source_kind,coalesce(n.target_id,n.event_id))),
    'notices',coalesce((select jsonb_agg(to_jsonb(n) order by n.created_at desc,n.id) from (
      select n.id,n.source_kind,n.event_type,n.category,n.title,n.message,n.created_at,n.read_at,
        coalesce(n.target_id,n.event_id) target_id,
        (select jsonb_build_object('total',count(*),'accepted',count(*) filter(where d.status='accepted'),
          'pending',count(*) filter(where d.status in ('pending','leased')),
          'failed',count(*) filter(where d.status='failed'),'cancelled',count(*) filter(where d.status='cancelled'))
          from ff_private.notification_deliveries d where d.notification_id=n.id) delivery
      from public.vehicle_notifications n where n.recipient_id=auth.uid()
        and (notice_id is null or n.id=notice_id)
        and ff_private.notification_visible(n.source_kind,coalesce(n.target_id,n.event_id))
      order by n.created_at desc,n.id limit 100) n),'[]'::jsonb),
    'preferences',coalesce((select to_jsonb(p)-'user_id' from public.notification_preferences p where user_id=auth.uid()),
      jsonb_build_object('push_enabled',false,'categories',array['services','changes','reminders','vehicles','administration','information'],
        'reminder_two_hours',false)),
    'devices',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'device_name',s.device_name,
      'created_at',s.created_at,'last_success_at',s.last_success_at,'active',s.active) order by s.created_at,s.id)
      from public.push_subscriptions s where s.user_id=auth.uid()),'[]'::jsonb),
    'public_key',(select case when ready then public_key end from ff_private.notification_config),
    'server_ready',(select ready and enabled from ff_private.notification_config));
end;
$$;
create function public.ff_notification_read(notice_id uuid default null)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform ff_private.require_rule(ff_private.is_active(),'Freigabe erforderlich.');
  if notice_id is not null then
    perform ff_private.require_rule(exists(select 1 from public.vehicle_notifications n where n.id=notice_id
      and n.recipient_id=auth.uid() and ff_private.notification_visible(n.source_kind,coalesce(n.target_id,n.event_id))),
      'Benachrichtigung nicht mehr berechtigt verfügbar.');
  end if;
  update public.vehicle_notifications n set read_at=clock_timestamp()
    where n.recipient_id=auth.uid() and n.read_at is null and (notice_id is null or n.id=notice_id)
      and ff_private.notification_visible(n.source_kind,coalesce(n.target_id,n.event_id));
end;
$$;
create function public.ff_notification_preferences(push_enabled boolean,categories text[],reminder_two_hours boolean default false)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform ff_private.require_rule(ff_private.is_active(),'Freigabe erforderlich.');
  perform ff_private.require_rule(push_enabled is not null and reminder_two_hours is not null
    and categories is not null and cardinality(categories)<=6
    and categories <@ array['services','changes','reminders','vehicles','administration','information']::text[],
    'Ungültige Benachrichtigungseinstellungen.');
  insert into public.notification_preferences as p(user_id,push_enabled,categories,reminder_two_hours)
    values(auth.uid(),push_enabled,categories,reminder_two_hours)
    on conflict(user_id) do update set push_enabled=excluded.push_enabled,categories=excluded.categories,
      reminder_two_hours=excluded.reminder_two_hours,updated_at=clock_timestamp();
end;
$$;
create function public.ff_push_register(subscription jsonb,device_name text)
returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid; previous public.push_subscriptions;
begin
  perform ff_private.require_rule(ff_private.is_active(),'Freigabe erforderlich.');
  perform ff_private.require_rule((select ready and enabled from ff_private.notification_config),'Push-Versand noch nicht eingerichtet.');
  perform ff_private.require_rule(length(btrim(device_name)) between 1 and 80 and pg_column_size(subscription)<4096,
    'Ungültige Geräteregistrierung.');
  perform pg_advisory_xact_lock(hashtextextended('push-owner:'||auth.uid(),0));
  perform pg_advisory_xact_lock(hashtextextended('push-device:'||(subscription->>'endpoint'),0));
  select * into previous from public.push_subscriptions s where s.endpoint=subscription->>'endpoint' for update;
  perform ff_private.require_rule(previous.id is null or previous.user_id=auth.uid(),'Gerät kann nicht registriert werden. Browser-Abonnement bitte neu einrichten.');
  perform ff_private.require_rule(coalesce(previous.active,false) or
    (select count(*) from public.push_subscriptions where user_id=auth.uid() and active)<10,'Höchstens zehn aktive Geräte.');
  insert into public.push_subscriptions(user_id,endpoint,p256dh,auth_key,device_name)
    values(auth.uid(),subscription->>'endpoint',subscription#>>'{keys,p256dh}',subscription#>>'{keys,auth}',btrim(device_name))
    on conflict(endpoint) do update set p256dh=excluded.p256dh,auth_key=excluded.auth_key,device_name=excluded.device_name,active=true
    returning id into result;
  insert into public.notification_preferences(user_id,push_enabled) values(auth.uid(),true)
    on conflict(user_id) do update set push_enabled=true,updated_at=clock_timestamp();
  perform ff_private.write_audit('push_device_registered',null,auth.uid(),null,jsonb_build_object('device_id',result));
  return result;
end;
$$;
create function public.ff_push_deactivate(device_id uuid default null,endpoint text default null)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform ff_private.require_rule(ff_private.is_active(),'Freigabe erforderlich.');
  perform ff_private.require_rule((device_id is null)<>(endpoint is null),'Ein eigenes Gerät auswählen.');
  perform ff_private.require_rule(exists(select 1 from public.push_subscriptions s where s.user_id=auth.uid()
    and (s.id=device_id or s.endpoint=ff_push_deactivate.endpoint)),'Eigenes Gerät nicht verfügbar.');
  update public.push_subscriptions s set active=false where s.user_id=auth.uid()
    and (s.id=device_id or s.endpoint=ff_push_deactivate.endpoint);
  perform ff_private.write_audit('push_device_deactivated',null,auth.uid(),null,jsonb_build_object('device_id',device_id));
end;
$$;
create function public.ff_push_current(endpoint text)
returns uuid language plpgsql stable security definer set search_path='' as $$
begin
  perform ff_private.require_rule(ff_private.is_active(),'Freigabe erforderlich.');
  return (select s.id from public.push_subscriptions s where s.user_id=auth.uid() and s.endpoint=ff_push_current.endpoint);
end;
$$;
create function public.ff_push_test(device_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
  perform ff_private.require_rule(ff_private.is_active(),'Freigabe erforderlich.');
  perform ff_private.require_rule((select ready and enabled from ff_private.notification_config),'Push-Versand noch nicht eingerichtet.');
  perform pg_advisory_xact_lock(hashtextextended('push-test:'||auth.uid(),0));
  perform ff_private.require_rule(exists(select 1 from public.push_subscriptions s join public.notification_preferences p using(user_id)
    where s.id=device_id and s.user_id=auth.uid() and s.active and p.push_enabled),'Eigenes aktives Gerät erforderlich.');
  perform ff_private.require_rule(not exists(select 1 from public.vehicle_notifications n where n.recipient_id=auth.uid()
    and n.source_kind='test' and n.created_at>statement_timestamp()-interval '1 minute')
    and (select count(*) from public.vehicle_notifications n where n.recipient_id=auth.uid()
      and n.source_kind='test' and n.created_at>statement_timestamp()-interval '1 hour')<3,'Testlimit: einmal pro Minute, dreimal pro Stunde.');
  insert into public.vehicle_notifications(recipient_id,source_kind,target_id,event_type,category,title,message,dedup_key)
    values(auth.uid(),'test',auth.uid(),'dev_test','information','DEV-Testbenachrichtigung',
      'Dies ist eine selbst ausgelöste organisatorische Testnachricht. Keine Alarmierung.','test:'||gen_random_uuid())
    returning id into result;
  delete from ff_private.notification_deliveries where notification_id=result and subscription_id<>device_id;
  perform ff_private.write_audit('push_test_requested',null,auth.uid(),null,jsonb_build_object('notification_id',result,'device_id',device_id));
  return result;
end;
$$;

create function public.ff_notification_tick()
returns integer language plpgsql security definer set search_path='' as $$
declare cfg ff_private.notification_config; item record; person uuid; notice_title text; notice_body text;
  processed integer:=0;
begin
  if not pg_try_advisory_xact_lock(hashtextextended('ff-notification-tick',0)) then return 0; end if;
  select * into cfg from ff_private.notification_config;
  if not cfg.enabled then return 0; end if;
  insert into ff_private.notification_events(source_kind,target_id,event_type,category,dedup_key)
    select 'event',e.id,t.kind,'reminders',t.kind||':'||e.id||':'||extract(epoch from e.starts_at)::text
    from public.events e cross join (values
      ('response_missing',cfg.unanswered_hours),('service_reminder',cfg.reminder_hours),('service_reminder_two',2)) t(kind,hours)
    where e.status='scheduled' and e.dev_seed_key is null and e.starts_at>statement_timestamp()
      and not exists(select 1 from public.event_calendar c where c.event_id=e.id)
      and e.starts_at-make_interval(hours=>t.hours) between cfg.activated_at and statement_timestamp()
      and (t.kind='response_missing' or e.event_type in ('regular','special'))
      and not exists(select 1 from ff_private.notification_events n
        where n.dedup_key=t.kind||':'||e.id||':'||extract(epoch from e.starts_at)::text)
    order by e.starts_at,e.id,t.kind limit 100 on conflict(dedup_key) do nothing;
  for item in select e.id,e.ends_at from public.events e where e.status='scheduled' and e.dev_seed_key is null
    and e.ends_at between cfg.activated_at and statement_timestamp() and e.attendance_state in ('NOT_STARTED','IN_PROGRESS')
    and not exists(select 1 from public.event_calendar c where c.event_id=e.id)
    and not exists(select 1 from ff_private.notification_events n
      where n.dedup_key='attendance:'||e.id||':'||extract(epoch from e.ends_at)::text)
    order by e.ends_at,e.id limit 100 loop
    insert into ff_private.notification_events(source_kind,target_id,event_type,category,dedup_key)
      values('attendance',item.id,'attendance_open','administration','attendance:'||item.id||':'||extract(epoch from item.ends_at)::text)
      on conflict(dedup_key) do nothing;
  end loop;
  for item in select n.* from ff_private.notification_events n where n.processed_at is null
    and (n.source_kind<>'registration'
      or exists(select 1 from public.profiles p join auth.users u on u.id=p.id
        where p.id=n.target_id and p.status='pending' and u.email_confirmed_at is not null)
      or not exists(select 1 from public.profiles p where p.id=n.target_id and p.status='pending'))
    order by created_at,id limit 20 for update skip locked loop
    if item.source_kind='registration' and not exists(select 1 from public.profiles p join auth.users u on u.id=p.id
      where p.id=item.target_id and p.status='pending' and u.email_confirmed_at is not null) then
      update ff_private.notification_events set processed_at=clock_timestamp() where id=item.id; continue;
    elsif item.source_kind<>'registration' and (
      exists(select 1 from public.event_calendar where event_id=item.target_id)
      or not exists(select 1 from public.events e where e.id=item.target_id
        and (case when item.event_type='event_cancelled' then e.status='cancelled' else e.status='scheduled' end)
        and (item.source_kind<>'attendance' or e.ends_at<=statement_timestamp() and e.attendance_state in ('NOT_STARTED','IN_PROGRESS'))
        and (item.event_type not in ('response_missing','service_reminder','service_reminder_two') or e.starts_at>statement_timestamp())
        and (item.revision is null or e.revision=item.revision))) then
      update ff_private.notification_events set processed_at=clock_timestamp() where id=item.id; continue;
    end if;
    notice_title:=case item.event_type when 'event_created' then 'Neuer Übungsdienst'
      when 'event_changed' then 'Termin geändert' when 'event_cancelled' then 'Termin abgesagt'
      when 'response_missing' then 'Teilnahmeantwort fehlt' when 'attendance_open' then 'Anwesenheitsliste abschließen'
      when 'registration_created' then 'Neue verifizierte Registrierung' else 'Erinnerung an Übungsdienst' end;
    select case when item.source_kind='registration' then 'Eine verifizierte Registrierung wartet auf Freigabe.'
      else left(e.title,120)||' · '||to_char(e.starts_at at time zone 'Europe/Berlin','DD.MM.YYYY HH24:MI')||' · Europe/Berlin' end
      into notice_body from public.events e where e.id=item.target_id;
    if item.source_kind='registration' then notice_body:='Eine verifizierte Registrierung wartet auf Freigabe.'; end if;
    for person in select p.id from public.profiles p where ff_private.is_approved_user(p.id)
      and ff_private.notification_recipient_allowed(p.id,item.source_kind,item.target_id) loop
      if item.event_type='response_missing' and exists(select 1 from public.participation_responses r
        where r.event_id=item.target_id and r.user_id=person and r.invalidated_at is null) then continue; end if;
      if item.event_type='service_reminder_two' and not exists(select 1 from public.notification_preferences p
        where p.user_id=person and p.reminder_two_hours) then continue; end if;
      if exists(select 1 from public.notification_preferences p where p.user_id=person and not(item.category=any(p.categories)))
        or not(item.category=any(cfg.categories)) then continue; end if;
      insert into public.vehicle_notifications(recipient_id,source_kind,target_id,event_type,category,title,message,dedup_key,scheduled_at)
        values(person,item.source_kind,item.target_id,item.event_type,item.category,notice_title,notice_body,item.dedup_key,item.created_at)
        on conflict(recipient_id,dedup_key) where dedup_key is not null do nothing;
    end loop;
    update ff_private.notification_events set processed_at=clock_timestamp() where id=item.id;
    processed:=processed+1;
  end loop;
  return processed;
end;
$$;

create function public.ff_push_claim(only_notification uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare job record; result jsonb:='[]'; remaining integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('ff-push-send-limit',0));
  select greatest(0,50-count(*)) into remaining from ff_private.notification_deliveries
    where attempted_at>statement_timestamp()-interval '1 minute';
  for job in select d.*,s.endpoint,s.p256dh,s.auth_key,s.user_id,s.active,n.source_kind,n.event_type,n.category,
      coalesce(n.target_id,n.event_id) target,p.push_enabled,p.categories,c.enabled,c.ready,c.categories global_categories
    from ff_private.notification_deliveries d join public.push_subscriptions s on s.id=d.subscription_id
    join public.vehicle_notifications n on n.id=d.notification_id
    left join public.notification_preferences p on p.user_id=s.user_id cross join ff_private.notification_config c
    where d.status in ('pending','leased') and d.next_attempt_at<=statement_timestamp()
      and (d.status='pending' or d.lease_until<=statement_timestamp())
      and (only_notification is null or d.notification_id=only_notification)
    order by d.next_attempt_at,d.id limit 100 for update of d skip locked loop
    if not coalesce(job.active and job.push_enabled and job.enabled and job.ready
      and (job.event_type='dev_test' or job.category=any(job.categories) and job.category=any(job.global_categories)),false)
      or not ff_private.notification_recipient_allowed(job.user_id,job.source_kind,job.target)
      or (job.event_type='response_missing' and exists(select 1 from public.participation_responses r
        where r.event_id=job.target and r.user_id=job.user_id and r.invalidated_at is null))
      or (job.source_kind='attendance' and not exists(select 1 from public.events e
        where e.id=job.target and e.status='scheduled' and e.attendance_state in ('NOT_STARTED','IN_PROGRESS')))
      or (job.event_type in ('service_reminder','service_reminder_two','response_missing') and not exists(select 1 from public.events e
        where e.id=job.target and e.status='scheduled' and e.starts_at>statement_timestamp())) then
      update ff_private.notification_deliveries set status='cancelled',finished_at=clock_timestamp(),error_code='no_longer_eligible'
        where id=job.id; continue;
    end if;
    if job.attempts>=5 then
      update ff_private.notification_deliveries set status='failed',finished_at=clock_timestamp(),error_code='attempt_limit' where id=job.id;
      continue;
    end if;
    if remaining=0 or jsonb_array_length(result)>=10 then exit; end if;
    if (select count(*) from ff_private.notification_deliveries d join public.push_subscriptions s on s.id=d.subscription_id
      where s.user_id=job.user_id and d.attempted_at>statement_timestamp()-interval '1 hour')>=10 then
      update ff_private.notification_deliveries set next_attempt_at=statement_timestamp()+interval '5 minutes' where id=job.id;
      continue;
    end if;
    update ff_private.notification_deliveries set status='leased',attempts=attempts+1,lease_id=gen_random_uuid(),
      lease_until=statement_timestamp()+interval '2 minutes',next_attempt_at=statement_timestamp()+interval '2 minutes',
      attempted_at=clock_timestamp() where id=job.id returning lease_id into job.lease_id;
    result:=result||jsonb_build_array(jsonb_build_object('id',job.id,'lease_id',job.lease_id,'notification_id',job.notification_id,
      'subscription',jsonb_build_object('endpoint',job.endpoint,'keys',jsonb_build_object('p256dh',job.p256dh,'auth',job.auth_key))));
    remaining:=remaining-1;
  end loop;
  return result;
end;
$$;
create function public.ff_push_complete(delivery_id uuid,lease_id uuid,result_code integer)
returns boolean language plpgsql security definer set search_path='' as $$
declare job ff_private.notification_deliveries;
begin
  select * into job from ff_private.notification_deliveries d where d.id=delivery_id and d.lease_id=ff_push_complete.lease_id
    and d.status='leased' for update;
  if job.id is null then return false; end if;
  if result_code between 200 and 299 then
    update ff_private.notification_deliveries set status='accepted',finished_at=clock_timestamp(),error_code=null where id=job.id;
    update public.push_subscriptions set last_success_at=clock_timestamp() where id=job.subscription_id;
  elsif result_code in (404,410) then
    update public.push_subscriptions set active=false where id=job.subscription_id;
    update ff_private.notification_deliveries set status='failed',finished_at=clock_timestamp(),error_code='endpoint_expired' where id=job.id;
  elsif (result_code=0 or result_code=429 or result_code>=500) and job.attempts<5 then
    update ff_private.notification_deliveries set status='pending',next_attempt_at=statement_timestamp()+make_interval(secs=>least(3600,30*power(2,job.attempts)::integer)),
      error_code=case when result_code=0 then 'network_uncertain' else 'http_'||result_code end where id=job.id;
  else
    update ff_private.notification_deliveries set status='failed',finished_at=clock_timestamp(),error_code='http_'||result_code where id=job.id;
  end if;
  return true;
end;
$$;

create function public.ff_notification_admin()
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform ff_private.require_rule(ff_private.has_role('GLOBAL_ADMIN') or exists(select 1 from public.units u
    where ff_private.has_role('UNIT_ADMIN',u.id,null)),'Keine Versandadministration.');
  return jsonb_build_object('global',ff_private.has_role('GLOBAL_ADMIN'),
    'config',case when ff_private.has_role('GLOBAL_ADMIN') then (select to_jsonb(c)-'public_key' from ff_private.notification_config c) end,
    'deliveries',coalesce((select jsonb_agg(to_jsonb(d) order by d.attempted_at desc nulls last,d.id) from (
      select d.id,n.title,n.event_type,d.status,d.attempts,d.attempted_at,d.finished_at,d.error_code
      from ff_private.notification_deliveries d join public.vehicle_notifications n on n.id=d.notification_id
      left join public.events e on e.id=coalesce(n.target_id,n.event_id)
      where ff_private.has_role('GLOBAL_ADMIN') or (e.scope_kind='unit' and ff_private.has_role('UNIT_ADMIN',e.unit_id,null))
      order by d.attempted_at desc nulls last,d.id limit 100) d),'[]'::jsonb));
end;
$$;
create function public.ff_notification_configure(enabled boolean,categories text[])
returns void language plpgsql security definer set search_path='' as $$
declare before_value jsonb;
begin
  perform ff_private.require_rule(ff_private.has_role('GLOBAL_ADMIN'),'Globale Versandkonfiguration erforderlich.');
  perform ff_private.require_rule(enabled is not null and categories is not null and cardinality(categories)<=6
    and categories <@ array['services','changes','reminders','vehicles','administration','information']::text[],'Ungültige Kategorien.');
  select to_jsonb(c)-'public_key' into before_value from ff_private.notification_config c for update;
  update ff_private.notification_config c set enabled=ff_notification_configure.enabled,categories=ff_notification_configure.categories;
  perform ff_private.write_audit('notification_config_changed',null,auth.uid(),before_value,
    jsonb_build_object('enabled',enabled,'categories',categories));
end;
$$;
create function public.ff_push_bootstrap(public_key text,cron_secret text)
returns void language plpgsql security definer set search_path='' as $$
declare cfg ff_private.notification_config; secret_id uuid;
begin
  perform ff_private.require_rule(public_key ~ '^[A-Za-z0-9_-]{87}$' and cron_secret ~ '^[A-Za-z0-9_-]{43}$','Invalid server setup');
  select * into cfg from ff_private.notification_config for update;
  perform ff_private.require_rule(not cfg.ready or cfg.public_key=ff_push_bootstrap.public_key,'Explicit VAPID key rotation required');
  select id into secret_id from vault.secrets where name='ff_push_cron';
  if secret_id is null then
    perform vault.create_secret(cron_secret,'ff_push_cron','DEV notification scheduler authorization');
  else
    perform vault.update_secret(secret_id,cron_secret,'ff_push_cron','DEV notification scheduler authorization');
  end if;
  update ff_private.notification_config c set public_key=ff_push_bootstrap.public_key,ready=true;
end;
$$;

revoke all on function ff_private.notification_recipient_allowed(uuid,text,uuid),ff_private.queue_notification_delivery(),
  ff_private.classify_vehicle_notification(),ff_private.capture_notification_event(),ff_private.capture_registration_notification()
  from public,anon,authenticated;
revoke all on function ff_private.notification_visible(text,uuid) from public,anon,authenticated;
grant execute on function ff_private.notification_visible(text,uuid) to authenticated;
revoke all on function public.ff_notifications(uuid),public.ff_notification_read(uuid),public.ff_notification_preferences(boolean,text[],boolean),
  public.ff_push_register(jsonb,text),public.ff_push_deactivate(uuid,text),public.ff_push_current(text),public.ff_push_test(uuid),
  public.ff_notification_tick(),public.ff_push_claim(uuid),public.ff_push_complete(uuid,uuid,integer),
  public.ff_notification_admin(),public.ff_notification_configure(boolean,text[]),public.ff_push_bootstrap(text,text) from public,anon,authenticated;
grant execute on function public.ff_notifications(uuid),public.ff_notification_read(uuid),public.ff_notification_preferences(boolean,text[],boolean),
  public.ff_push_register(jsonb,text),public.ff_push_deactivate(uuid,text),public.ff_push_current(text),public.ff_push_test(uuid),
  public.ff_notification_admin(),public.ff_notification_configure(boolean,text[]) to authenticated;
grant execute on function public.ff_notification_tick(),public.ff_push_claim(uuid),public.ff_push_complete(uuid,uuid,integer),
  public.ff_push_bootstrap(text,text) to service_role;
notify pgrst,'reload schema';
commit;
