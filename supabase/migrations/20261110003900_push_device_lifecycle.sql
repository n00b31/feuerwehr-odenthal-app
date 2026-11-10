begin;

-- Retain delivery/attempt evidence when the owner permanently removes a device.
alter table ff_private.notification_deliveries drop constraint notification_deliveries_subscription_id_fkey;
alter table ff_private.notification_deliveries add constraint notification_deliveries_subscription_id_fkey
  foreign key(subscription_id) references public.push_subscriptions(id) on delete set null;
alter table ff_private.notification_deliveries drop constraint notification_deliveries_check;
alter table ff_private.notification_deliveries add constraint notification_deliveries_check
  check(channel='push' or subscription_id is null);

create function ff_private.invalidate_push_device()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  update ff_private.notification_deliveries set status='cancelled',finished_at=clock_timestamp(),
    error_code='device_changed',lease_id=null,lease_until=null
    where subscription_id=old.id and status in ('pending','leased');
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
create trigger push_device_changed before update on public.push_subscriptions
  for each row when(old.active is distinct from new.active or old.endpoint is distinct from new.endpoint
    or old.p256dh is distinct from new.p256dh or old.auth_key is distinct from new.auth_key)
  execute function ff_private.invalidate_push_device();
create trigger push_device_removed before delete on public.push_subscriptions
  for each row execute function ff_private.invalidate_push_device();
revoke all on function ff_private.invalidate_push_device() from public,anon,authenticated;

create or replace function public.ff_push_deactivate(device_id uuid default null,endpoint text default null)
returns void language plpgsql security definer set search_path='' as $$
declare selected_device uuid;
begin
  perform ff_private.require_rule(ff_private.is_active(),'Freigabe erforderlich.');
  perform ff_private.require_rule((device_id is null)<>(endpoint is null),'Ein eigenes Gerät auswählen.');
  perform pg_advisory_xact_lock(hashtextextended('push-owner:'||auth.uid(),0));
  select s.id into selected_device from public.push_subscriptions s where s.user_id=auth.uid()
    and (s.id=device_id or s.endpoint=ff_push_deactivate.endpoint) for update;
  -- Logout can encounter a subscription whose server record was removed from another device.
  if selected_device is null and endpoint is not null then return; end if;
  perform ff_private.require_rule(selected_device is not null,'Eigenes Gerät nicht verfügbar.');
  update public.push_subscriptions set active=false where id=selected_device;
  perform ff_private.write_audit('push_device_deactivated',null,auth.uid(),null,jsonb_build_object('device_id',selected_device));
end;
$$;
create function public.ff_push_remove(device_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform ff_private.require_rule(ff_private.is_active(),'Freigabe erforderlich.');
  perform pg_advisory_xact_lock(hashtextextended('push-owner:'||auth.uid(),0));
  if not exists(select 1 from public.push_subscriptions s where s.id=device_id and s.user_id=auth.uid()) then
    raise sqlstate 'PT404' using message='device_unavailable';
  end if;
  delete from public.push_subscriptions where id=device_id and user_id=auth.uid();
  perform ff_private.write_audit('push_device_removed',null,auth.uid(),null,jsonb_build_object('device_id',device_id));
end;
$$;
create function public.ff_push_reactivate(device_id uuid,subscription jsonb,device_name text)
returns uuid language plpgsql security definer set search_path='' as $$
declare previous public.push_subscriptions; result uuid;
begin
  perform ff_private.require_rule(ff_private.is_active(),'Freigabe erforderlich.');
  perform pg_advisory_xact_lock(hashtextextended('push-owner:'||auth.uid(),0));
  select * into previous from public.push_subscriptions s where s.id=device_id and s.user_id=auth.uid() for update;
  if previous.id is null then raise sqlstate 'PT404' using message='device_unavailable'; end if;
  if previous.endpoint is distinct from subscription->>'endpoint' then
    -- Never overwrite another browser's registration when renewing an expired local endpoint.
    if exists(select 1 from public.push_subscriptions s where s.endpoint=subscription->>'endpoint' and s.id<>device_id) then
      raise sqlstate 'PT409' using message='subscription_conflict';
    end if;
    perform public.ff_push_remove(device_id);
  end if;
  result:=public.ff_push_register(subscription,device_name);
  return result;
end;
$$;
create or replace function public.ff_push_test(device_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid; selected public.push_subscriptions;
begin
  perform ff_private.require_rule(ff_private.is_active(),'Freigabe erforderlich.');
  perform ff_private.require_rule((select ready and enabled from ff_private.notification_config),'Push-Versand noch nicht eingerichtet.');
  perform pg_advisory_xact_lock(hashtextextended('push-owner:'||auth.uid(),0));
  perform pg_advisory_xact_lock(hashtextextended('push-test:'||auth.uid(),0));
  select * into selected from public.push_subscriptions s where s.id=device_id and s.user_id=auth.uid();
  if selected.id is null then raise sqlstate 'PT404' using message='device_unavailable'; end if;
  if not selected.active or not coalesce((select push_enabled from public.notification_preferences where user_id=auth.uid()),false) then
    raise sqlstate 'PT409' using message='device_inactive';
  end if;
  if exists(select 1 from public.vehicle_notifications n where n.recipient_id=auth.uid()
      and n.source_kind='test' and n.created_at>statement_timestamp()-interval '1 minute')
    or (select count(*) from public.vehicle_notifications n where n.recipient_id=auth.uid()
      and n.source_kind='test' and n.created_at>statement_timestamp()-interval '1 hour')>=3 then
    raise sqlstate 'PT429' using message='test_rate_limited';
  end if;
  insert into public.vehicle_notifications(recipient_id,source_kind,target_id,event_type,category,title,message,dedup_key)
    values(auth.uid(),'test',auth.uid(),'dev_test','information','DEV-Testbenachrichtigung',
      'Dies ist eine selbst ausgelöste organisatorische Testnachricht. Keine Alarmierung.','test:'||gen_random_uuid())
    returning id into result;
  delete from ff_private.notification_deliveries where notification_id=result and subscription_id<>device_id;
  perform ff_private.write_audit('push_test_requested',null,auth.uid(),null,jsonb_build_object('notification_id',result,'device_id',device_id));
  return result;
end;
$$;
create function public.ff_push_test_status(notice_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  perform ff_private.require_rule(ff_private.is_active(),'Freigabe erforderlich.');
  select jsonb_build_object('status',d.status,'reason',case
    when d.error_code='endpoint_expired' then 'subscription_invalid'
    when d.status='cancelled' then 'device_inactive'
    when d.status='failed' then 'provider_rejected'
    else null end) into result
    from public.vehicle_notifications n join ff_private.notification_deliveries d on d.notification_id=n.id
    where n.id=notice_id and n.recipient_id=auth.uid() and n.source_kind='test' and n.target_id=auth.uid();
  if result is null then raise sqlstate 'PT404' using message='device_unavailable'; end if;
  return result;
end;
$$;
create function public.ff_push_ready(delivery_id uuid,lease_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from ff_private.notification_deliveries d join public.push_subscriptions s on s.id=d.subscription_id
    join public.notification_preferences p on p.user_id=s.user_id
    where d.id=delivery_id and d.lease_id=ff_push_ready.lease_id and d.status='leased'
      and d.lease_until>statement_timestamp() and s.active and p.push_enabled);
$$;

create or replace function public.ff_push_claim(only_notification uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare job record; result jsonb:='[]'; remaining integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('ff-push-send-limit',0));
  select greatest(0,50-count(*)) into remaining from ff_private.notification_delivery_attempts
    where attempted_at>statement_timestamp()-interval '1 minute';
  for job in select d.*,s.endpoint,s.p256dh,s.auth_key,s.user_id,s.active,n.source_kind,n.event_type,n.category,
      coalesce(n.target_id,n.event_id) target,n.dedup_key business_key,
      p.push_enabled,p.categories,c.enabled,c.ready,c.categories global_categories
    from ff_private.notification_deliveries d join public.push_subscriptions s on s.id=d.subscription_id
    join public.vehicle_notifications n on n.id=d.notification_id
    left join public.notification_preferences p on p.user_id=s.user_id cross join ff_private.notification_config c
    where d.channel='push' and d.status in ('pending','leased') and d.next_attempt_at<=statement_timestamp()
      and (d.status='pending' or d.lease_until<=statement_timestamp())
      and (only_notification is null or d.notification_id=only_notification)
    order by d.next_attempt_at,d.id limit 100 for update of d skip locked loop
    if not coalesce(job.active and job.push_enabled and job.enabled and job.ready
      and (job.event_type='dev_test' or job.category=any(job.categories) and job.category=any(job.global_categories)),false)
      or not ff_private.notification_recipient_allowed(job.user_id,job.source_kind,job.target)
      or (job.event_type='response_missing' and exists(select 1 from public.participation_responses r
        where r.event_id=job.target and r.user_id=job.user_id and r.invalidated_at is null))
      or (job.source_kind='attendance' and not exists(select 1 from public.events e
        where e.id=job.target and e.status='scheduled' and e.ends_at<=statement_timestamp()
          and e.attendance_state in ('NOT_STARTED','IN_PROGRESS')))
      or (job.source_kind='registration' and not exists(select 1 from public.profiles p join auth.users u on u.id=p.id
        where p.id=job.target and p.status='pending' and u.email_confirmed_at is not null))
      or (job.source_kind='event' and exists(select 1 from ff_private.notification_events n join public.events e on e.id=n.target_id
        where n.dedup_key=job.business_key and (n.revision is not null and n.revision<>e.revision
          or n.event_type<>'event_cancelled' and e.status<>'scheduled'
          or n.event_type='event_cancelled' and e.status<>'cancelled')))
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
    -- Recipient history survives device deletion; removing/re-registering cannot reset the hourly budget.
    if (select count(*) from ff_private.notification_delivery_attempts a
      join ff_private.notification_deliveries d on d.id=a.delivery_id join public.vehicle_notifications n on n.id=d.notification_id
      where n.recipient_id=job.user_id and a.attempted_at>statement_timestamp()-interval '1 hour')>=10 then
      update ff_private.notification_deliveries set next_attempt_at=statement_timestamp()+interval '5 minutes' where id=job.id;
      continue;
    end if;
    update ff_private.notification_deliveries set status='leased',attempts=attempts+1,lease_id=gen_random_uuid(),
      lease_until=statement_timestamp()+interval '2 minutes',next_attempt_at=statement_timestamp()+interval '2 minutes',
      attempted_at=clock_timestamp() where id=job.id returning lease_id into job.lease_id;
    insert into ff_private.notification_delivery_attempts(delivery_id,attempt) values(job.id,job.attempts+1);
    result:=result||jsonb_build_array(jsonb_build_object('id',job.id,'lease_id',job.lease_id,'notification_id',job.notification_id,
      'subscription',jsonb_build_object('endpoint',job.endpoint,'keys',jsonb_build_object('p256dh',job.p256dh,'auth',job.auth_key))));
    remaining:=remaining-1;
  end loop;
  return result;
end;
$$;

create or replace function public.ff_push_complete(delivery_id uuid,lease_id uuid,result_code integer)
returns boolean language plpgsql security definer set search_path='' as $$
declare job ff_private.notification_deliveries; owner_id uuid;
begin
  select s.user_id into owner_id from ff_private.notification_deliveries d
    join public.push_subscriptions s on s.id=d.subscription_id where d.id=delivery_id;
  if owner_id is null then return false; end if;
  -- Same ordering as register/reactivate/remove: owner lock before delivery row locks.
  perform pg_advisory_xact_lock(hashtextextended('push-owner:'||owner_id,0));
  select * into job from ff_private.notification_deliveries d where d.id=delivery_id and d.lease_id=ff_push_complete.lease_id
    and d.status='leased' for update;
  if job.id is null then return false; end if;
  update ff_private.notification_delivery_attempts set finished_at=clock_timestamp(),result_code=ff_push_complete.result_code
    where notification_delivery_attempts.delivery_id=job.id and attempt=job.attempts;
  if result_code between 200 and 299 then
    update ff_private.notification_deliveries set status='accepted',finished_at=clock_timestamp(),error_code=null where id=job.id;
    update public.push_subscriptions set last_success_at=clock_timestamp() where id=job.subscription_id;
  elsif result_code in (404,410) then
    update public.push_subscriptions set active=false where id=job.subscription_id;
    update ff_private.notification_deliveries set status='failed',finished_at=clock_timestamp(),error_code='endpoint_expired' where id=job.id;
  elsif (result_code=0 or result_code=429 or result_code>=500) and job.attempts<5 then
    update ff_private.notification_deliveries set status='pending',
      next_attempt_at=statement_timestamp()+make_interval(secs=>least(3600,30*power(2,job.attempts)::integer)),
      error_code=case when result_code=0 then 'network_uncertain' else 'http_'||result_code end where id=job.id;
  else
    update ff_private.notification_deliveries set status='failed',finished_at=clock_timestamp(),error_code='http_'||result_code where id=job.id;
  end if;
  return true;
end;
$$;
revoke all on function public.ff_push_remove(uuid),public.ff_push_reactivate(uuid,jsonb,text),
  public.ff_push_test_status(uuid),public.ff_push_ready(uuid,uuid) from public,anon,authenticated;
grant execute on function public.ff_push_remove(uuid),public.ff_push_reactivate(uuid,jsonb,text),
  public.ff_push_test_status(uuid) to authenticated;
grant execute on function public.ff_push_ready(uuid,uuid) to service_role;
notify pgrst,'reload schema';
commit;
