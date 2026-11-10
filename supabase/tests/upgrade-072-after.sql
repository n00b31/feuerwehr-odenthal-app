do $$ begin
 if exists((select * from public.push_subscriptions except select * from ff_private.synthetic_upgrade_072_devices)
   union all(select * from ff_private.synthetic_upgrade_072_devices except select * from public.push_subscriptions)) then
   raise exception 'Existing device altered during additive lifecycle migration'; end if;
 if exists((select * from public.profiles except select * from ff_private.synthetic_upgrade_072_profiles)
   union all(select * from ff_private.synthetic_upgrade_072_profiles except select * from public.profiles)) then
   raise exception 'Existing profile altered during lifecycle migration'; end if;
 if not exists(select 1 from public.push_subscriptions where endpoint='https://web.push.apple.com/synthetic-upgrade-072') then
   raise exception 'Existing device preservation not actually exercised'; end if;
 raise notice 'PASS: DEV071 devices/keys, accounts and profiles preserved by DEV072 migration';
end $$;
drop table ff_private.synthetic_upgrade_072_devices,ff_private.synthetic_upgrade_072_profiles;
