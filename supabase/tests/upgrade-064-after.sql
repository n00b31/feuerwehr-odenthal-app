do $$ declare t record; value text; begin
  if current_database()<>'ff_dev_ci' then raise exception 'Disposable CI required'; end if;
  for t in select name,fingerprint from ff_private.upgrade_064_snapshot loop
    execute format('select md5(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,''[]'')) from %s t',
      t.name::regclass) into value;
    if value<>t.fingerprint then raise exception 'DEV 0.6.4 changed original data: %',t.name; end if;
  end loop;
  if not has_function_privilege('authenticated','public.ff_dashboard()','execute')
    or has_function_privilege('anon','public.ff_dashboard()','execute') then
    raise exception 'Dashboard API grants mismatch';
  end if;
  raise notice 'PASS: DEV 0.6.3 to 0.6.4 preserves every public table, Auth account and registered historical fixture';
end $$;
drop table ff_private.upgrade_064_snapshot;
