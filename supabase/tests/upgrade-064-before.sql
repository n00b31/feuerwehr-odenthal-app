do $$ begin if current_database()<>'ff_dev_ci' then raise exception 'Disposable CI required'; end if; end $$;
create table ff_private.upgrade_064_snapshot(name text primary key,fingerprint text not null);
do $$ declare t record; value text; begin
  for t in select schemaname,tablename from pg_tables
    where schemaname='public' or (schemaname='auth' and tablename='users')
      or (schemaname='ff_private' and tablename='dev_fixture_sets') loop
    execute format('select md5(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,''[]'')) from %I.%I t',
      t.schemaname,t.tablename) into value;
    insert into ff_private.upgrade_064_snapshot values(t.schemaname||'.'||t.tablename,value);
  end loop;
end $$;
