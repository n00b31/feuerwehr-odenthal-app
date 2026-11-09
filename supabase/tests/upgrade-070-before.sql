do $$ begin if current_database()<>'ff_dev_ci' then raise exception 'Disposable CI required'; end if; end $$;
create table ff_private.upgrade_070_snapshot(name text primary key,columns text[],fingerprint text);
do $$ declare t record; value text; cols text[]; begin
 for t in select schemaname,tablename from pg_tables where schemaname in ('public','ff_private')
   and tablename<>'upgrade_070_snapshot' or schemaname='auth' and tablename='users' loop
  select array_agg(column_name::text order by ordinal_position) into cols from information_schema.columns
   where table_schema=t.schemaname and table_name=t.tablename;
  execute format('select md5(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,''[]'')) from %I.%I t',
   t.schemaname,t.tablename) into value;
  insert into ff_private.upgrade_070_snapshot values(t.schemaname||'.'||t.tablename,cols,value);
 end loop;
end $$;
