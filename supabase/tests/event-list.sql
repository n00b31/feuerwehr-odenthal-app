begin;
do $$ begin
  if current_database()<>'ff_dev_ci' then raise exception 'Disposable CI database required'; end if;
end $$;
create function pg_temp.list_ok(value boolean,label text) returns void language plpgsql as $$
begin
  if value is distinct from true then raise exception 'FAIL: %',label; end if;
  raise notice 'PASS: %',label;
end $$;
create function pg_temp.list_denied(statement text) returns void language plpgsql as $$
begin execute statement; raise exception 'FAIL: expected denial';
exception when insufficient_privilege then raise notice 'PASS: denied %',statement;
end $$;
select set_config('list.unit',(select id::text from public.units where code='scheuren'),true);
select set_config('list.other',(select id::text from public.units where code='blecher'),true);
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
select ('83000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'synthetic.eventlist.'||i||'@feuerwehr-odenthal.de',
  clock_timestamp(),jsonb_build_object('display_name','Synthetic List '||i) from generate_series(1,3) i;
select ff_private.bootstrap_global_admin('83000000-0000-4000-8000-000000000001',current_setting('list.unit')::uuid);
select set_config('request.jwt.claim.sub','83000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select public.ff_approve_member('83000000-0000-4000-8000-000000000002',current_setting('list.unit')::uuid);
select public.ff_approve_member('83000000-0000-4000-8000-000000000003',current_setting('list.other')::uuid);
reset role;
update public.profiles set approved_at=clock_timestamp()-interval '2 days' where status='approved';
update public.unit_memberships set valid_from=clock_timestamp()-interval '2 days';
insert into public.events(id,title,event_type,starts_at,ends_at,location,scope_kind,unit_id,organizer_id,status)
select ('85000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'Synthetic upcoming '||i,'regular',
  clock_timestamp()+i*interval '1 hour',clock_timestamp()+(i+1)*interval '1 hour','Synthetic','unit',
  current_setting('list.unit')::uuid,'83000000-0000-4000-8000-000000000001',
  case when i<=2 then 'cancelled' else 'scheduled' end from generate_series(1,7) i;
insert into public.events(id,title,event_type,starts_at,ends_at,location,scope_kind,unit_id,organizer_id)
select ('86000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'Synthetic past '||i,'regular',
  clock_timestamp()-(i+2)*interval '1 hour',clock_timestamp()-i*interval '1 hour','Synthetic','unit',
  current_setting('list.unit')::uuid,'83000000-0000-4000-8000-000000000001' from generate_series(1,7) i;
insert into public.events(id,title,event_type,starts_at,ends_at,location,scope_kind,unit_id,organizer_id)
select ('87000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'Synthetic March '||i,'regular',
  '2032-03-15 12:00Z','2032-03-15 14:00Z','Synthetic','unit',
  current_setting('list.unit')::uuid,'83000000-0000-4000-8000-000000000001' from generate_series(1,65) i;
insert into public.events(id,title,event_type,starts_at,ends_at,location,scope_kind,unit_id,organizer_id)
select ('88000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'Synthetic month boundary '||i,'regular',
  stamp,stamp+interval '1 hour','Synthetic','unit',current_setting('list.unit')::uuid,
  '83000000-0000-4000-8000-000000000001' from (values
    (1,'2032-02-29 22:59:59Z'::timestamptz),(2,'2032-02-29 23:00Z'::timestamptz),
    (3,'2032-03-31 21:59:59Z'::timestamptz),(4,'2032-03-31 22:00Z'::timestamptz)) boundary(i,stamp);
insert into public.events(id,title,event_type,starts_at,ends_at,location,scope_kind,unit_id,organizer_id)
values('89000000-0000-4000-8000-000000000001','Synthetic foreign','regular','2032-03-15 12:00Z','2032-03-15 14:00Z',
  'Synthetic','unit',current_setting('list.other')::uuid,'83000000-0000-4000-8000-000000000001');

select set_config('request.jwt.claim.sub','83000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select pg_temp.list_ok(jsonb_array_length(public.ff_events_page()->'events')=5,'default returns only five');
select pg_temp.list_ok(jsonb_array_length(public.ff_events_workspace()->'events')=83,
  'published legacy client retains all authorized history until manual frontend merge');
select pg_temp.list_ok(public.ff_events_page()#>>'{events,0,title}'='Synthetic upcoming 1'
  and public.ff_events_page()#>>'{events,4,title}'='Synthetic upcoming 5','upcoming ascending');
select pg_temp.list_ok(public.ff_events_page('past')#>>'{events,0,title}'='Synthetic past 1'
  and public.ff_events_page('past')#>>'{events,4,title}'='Synthetic past 5','past descending and limited');
select pg_temp.list_ok(public.ff_events_page('upcoming',null,null,null,'scheduled')#>>'{events,0,title}'='Synthetic upcoming 3'
  and jsonb_array_length(public.ff_events_page('upcoming',null,null,null,'scheduled')->'events')=5,'status applied before limit');
select pg_temp.list_ok(public.ff_events_page('month','2032-03')->>'has_more'='true'
  and jsonb_array_length(public.ff_events_page('month','2032-03')->'events')=50,'month first keyset page');
select set_config('list.cursor', (public.ff_events_page('month','2032-03')->'next_cursor')::text,true);
select pg_temp.list_ok(jsonb_array_length(public.ff_events_page('month','2032-03',
  (current_setting('list.cursor')::jsonb->>'starts_at')::timestamptz,
  (current_setting('list.cursor')::jsonb->>'id')::uuid)->'events')=17,'month next page returns all remaining, excludes foreign unit');
select pg_temp.list_ok(public.ff_events_page('month','2032-03',
  (current_setting('list.cursor')::jsonb->>'starts_at')::timestamptz,
  (current_setting('list.cursor')::jsonb->>'id')::uuid)#>>'{events,0,id}'='87000000-0000-4000-8000-000000000050',
  'same-start cursor has no skipped or duplicate IDs');
select pg_temp.list_ok(public.ff_events_page('month','2032-03')#>>'{events,0,id}'='88000000-0000-4000-8000-000000000002',
  'Berlin month includes local midnight, not preceding UTC hour');
select pg_temp.list_ok(public.ff_events_page('month','2032-03',
  (current_setting('list.cursor')::jsonb->>'starts_at')::timestamptz,
  (current_setting('list.cursor')::jsonb->>'id')::uuid)#>>'{events,16,id}'='88000000-0000-4000-8000-000000000003',
  'Berlin DST month excludes April midnight, includes March last second');
select pg_temp.list_ok(jsonb_array_length(public.ff_events_page('upcoming',null,null,null,'all',
  array['86000000-0000-4000-8000-000000000001','89000000-0000-4000-8000-000000000001']::uuid[])->'retained_events')=1,
  'retained open past event is reauthorized, foreign event never leaks');
select pg_temp.list_ok(public.ff_events_page()#>'{events,0,participants}'='null'::jsonb,'member never receives other identities');
select pg_temp.list_denied($q$select public.ff_events_page('month','2032-13')$q$);
select pg_temp.list_denied($q$select public.ff_events_page('invalid')$q$);
select pg_temp.list_denied($q$select public.ff_events_page('month','2032-03',null,'87000000-0000-4000-8000-000000000001')$q$);
reset role;
select set_config('request.jwt.claim.sub','83000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select pg_temp.list_ok(jsonb_array_length(public.ff_events_page('month','2032-03',
  '2032-03-15 12:00Z','87000000-0000-4000-8000-000000000049')->'events')=18,'global sees foreign scope as before');
reset role;
set local role anon;
select pg_temp.list_denied($q$select public.ff_events_page()$q$);
reset role;
select pg_temp.list_ok(not has_function_privilege('authenticated','ff_private.event_summary(uuid)','EXECUTE'),'private serializer cannot be invoked from browser');
\echo 'Bounded event lists, keyset pagination, Berlin boundaries and unchanged scopes passed.'
rollback;
