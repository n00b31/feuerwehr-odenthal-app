-- The preceding 062 upgrade supplies real historical and registered synthetic data.
do $$ begin if current_database()<>'ff_dev_ci' then raise exception 'Disposable CI required'; end if; end $$;
insert into public.event_series(id,title,scope_kind,unit_id,frequency,occurrence_count,local_start,duration_minutes,created_by)
values('c0632000-0000-4000-8000-000000000001','Synthetic legacy series','unit',
  (select id from public.units where code='scheuren'),'weekly',2,'2025-06-01 19:30',120,'a0622000-0000-4000-8000-000000000001');
update public.events set series_id='c0632000-0000-4000-8000-000000000001',instance_number=1
  where id='e0622000-0000-4000-8000-000000000001';
insert into public.events(id,series_id,instance_number,title,event_type,starts_at,ends_at,location,scope_kind,unit_id,organizer_id)
values('e0632000-0000-4000-8000-000000000001','c0632000-0000-4000-8000-000000000001',2,'Synthetic legacy future instance','regular',
  '2029-06-01 19:30 Europe/Berlin','2029-06-01 21:30 Europe/Berlin','CI','unit',
  (select id from public.units where code='scheuren'),'a0622000-0000-4000-8000-000000000001');
create function upgrade_test.data_063() returns jsonb language sql stable as $$
  select jsonb_build_object('legacy',upgrade_test.original_data(),
    'events',(select jsonb_agg(to_jsonb(e) order by id) from public.events e),
    'rosters',(select jsonb_agg(to_jsonb(e) order by event_id,user_id) from public.event_roster e),
    'responses',(select jsonb_agg(to_jsonb(e) order by event_id,user_id) from public.participation_responses e),
    'reservations',(select jsonb_agg(to_jsonb(e) order by event_id) from public.vehicle_reservations e),
    'series',(select jsonb_agg(to_jsonb(e)-'rule'-'revision'-'ended_on' order by id) from public.event_series e));
$$;
insert into upgrade_test.snapshot values
  ('063_data',upgrade_test.data_063()),
  ('063_report',public.ff_year_report(2025,'organization')),
  ('063_hash',to_jsonb(ff_private.history_data_hash()));
