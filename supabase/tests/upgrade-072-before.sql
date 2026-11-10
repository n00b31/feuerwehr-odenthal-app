do $$ begin if current_database()<>'ff_dev_ci' then raise exception 'Disposable CI required'; end if; end $$;
insert into public.push_subscriptions(user_id,endpoint,p256dh,auth_key,device_name)
select id,'https://web.push.apple.com/synthetic-upgrade-072',repeat('B',87),repeat('A',22),'Synthetic existing DEV071 device'
 from public.profiles where status='approved' order by id limit 1;
create table ff_private.synthetic_upgrade_072_devices as select * from public.push_subscriptions;
create table ff_private.synthetic_upgrade_072_profiles as select * from public.profiles;
