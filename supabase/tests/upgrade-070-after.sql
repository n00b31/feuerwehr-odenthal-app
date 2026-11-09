do $$ declare t record; value text; begin
 if current_database()<>'ff_dev_ci' then raise exception 'Disposable CI required'; end if;
 for t in select * from ff_private.upgrade_070_snapshot loop
  execute format('select md5(coalesce(jsonb_agg(row_data order by row_data::text)::text,''[]'')) from
   (select (select jsonb_object_agg(p.key,p.value) from jsonb_each(to_jsonb(t)) p where p.key=any($1)) row_data from %s t) data',t.name::regclass)
   into value using t.columns;
  if value<>t.fingerprint then raise exception 'DEV 0.7 changed original values in %',t.name; end if;
 end loop;
 raise notice 'PASS: DEV 0.7 preserves every original column value, Auth account and historical fixture';
end $$;
drop table ff_private.upgrade_070_snapshot;
