begin;

create function ff_private.require_history_operator(expected_project text)
returns void language plpgsql stable security definer set search_path='' as $$
begin
  perform ff_private.require_rule(expected_project='orxinqhhbtjpkzwlfaxq'
    and coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'iss'
      ='https://orxinqhhbtjpkzwlfaxq.supabase.co/auth/v1'
    and ff_private.has_role('GLOBAL_ADMIN'),'Pinned isolated DEV project and active GLOBAL_ADMIN required.');
end;
$$;
create function ff_private.history_id(entity_key text)
returns uuid language sql immutable set search_path='' as $$
  select (substr(h,1,8)||'-'||substr(h,9,4)||'-4'||substr(h,14,3)||'-8'||substr(h,18,3)||'-'||substr(h,21,12))::uuid
  from (select md5('4102025:DEV041-HISTORY-V1:'||entity_key) h) x;
$$;
create function ff_private.history_data_hash()
returns text language sql stable security definer set search_path='' as $$
  select md5(jsonb_build_object(
    'profiles',(select jsonb_agg(to_jsonb(p) order by p.id) from public.profiles p where dev_seed_key='DEV041-HISTORY-V1'),
    'memberships',(select jsonb_agg(to_jsonb(m) order by m.id) from public.unit_memberships m join public.profiles p on p.id=m.user_id where p.dev_seed_key='DEV041-HISTORY-V1'),
    'functions',(select jsonb_agg(to_jsonb(m) order by m.id) from public.function_memberships m join public.profiles p on p.id=m.user_id where p.dev_seed_key='DEV041-HISTORY-V1'),
    'events',(select jsonb_agg(to_jsonb(e) order by e.id) from public.events e where dev_seed_key='DEV041-HISTORY-V1'),
    'rosters',(select jsonb_agg(to_jsonb(r) order by r.event_id,r.user_id) from public.event_roster r join public.events e on e.id=r.event_id where e.dev_seed_key='DEV041-HISTORY-V1'),
    'attendance',(select jsonb_agg(to_jsonb(a) order by a.event_id,a.user_id) from public.actual_attendance a join public.events e on e.id=a.event_id where e.dev_seed_key='DEV041-HISTORY-V1'),
    'responses',(select jsonb_agg(to_jsonb(a) order by a.event_id,a.user_id) from public.participation_responses a join public.events e on e.id=a.event_id where e.dev_seed_key='DEV041-HISTORY-V1'),
    'confirmations',(select jsonb_agg(to_jsonb(a) order by a.event_id) from public.attendance_confirmations a join public.events e on e.id=a.event_id where e.dev_seed_key='DEV041-HISTORY-V1')
  )::text);
$$;
create function ff_private.history_protected_hash()
returns text language sql stable security definer set search_path='' as $$
  select md5(jsonb_build_object(
    'auth',(select jsonb_agg(to_jsonb(a) order by a.id) from auth.users a),
    'profiles',(select jsonb_agg(to_jsonb(p)-'auth_user_id'-'dev_seed_key' order by p.id) from public.profiles p where p.dev_seed_key is null),
    'units',(select jsonb_agg(to_jsonb(u) order by u.id) from public.units u),
    'roles',(select jsonb_agg(to_jsonb(r) order by r.id) from public.role_assignments r),
    'memberships',(select jsonb_agg(to_jsonb(m) order by m.id) from public.unit_memberships m join public.profiles p on p.id=m.user_id where p.dev_seed_key is null),
    'functions',(select jsonb_agg(to_jsonb(m) order by m.id) from public.function_memberships m join public.profiles p on p.id=m.user_id where p.dev_seed_key is null),
    'events',(select jsonb_agg(to_jsonb(e)-'dev_seed_key' order by e.id) from public.events e where e.dev_seed_key is null),
    'rosters',(select jsonb_agg(to_jsonb(a) order by a.event_id,a.user_id) from public.event_roster a join public.events e on e.id=a.event_id where e.dev_seed_key is null),
    'attendance',(select jsonb_agg(to_jsonb(a) order by a.event_id,a.user_id) from public.actual_attendance a join public.events e on e.id=a.event_id where e.dev_seed_key is null),
    'responses',(select jsonb_agg(to_jsonb(a) order by a.event_id,a.user_id) from public.participation_responses a join public.events e on e.id=a.event_id where e.dev_seed_key is null),
    'confirmations',(select jsonb_agg(to_jsonb(a) order by a.event_id) from public.attendance_confirmations a join public.events e on e.id=a.event_id where e.dev_seed_key is null),
    'audit',(select jsonb_agg(to_jsonb(a) order by a.id) from public.audit_entries a where
      not (a.action in ('dev_statistics_seeded','dev_statistics_removed') and coalesce(a.after_data->>'fixture_key','')='DEV041-HISTORY-V1'))
  )::text);
$$;

create function public.ff_dev_history_inventory(expected_project text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  perform ff_private.require_history_operator(expected_project);
  return jsonb_build_object('project_ref','orxinqhhbtjpkzwlfaxq','environment','isolated-dev',
    'fixture_key','DEV041-HISTORY-V1','random_seed',4102025,
    'state',(select state from ff_private.dev_fixture_sets where fixture_key='DEV041-HISTORY-V1'),
    'fingerprint',ff_private.history_data_hash(),'protected_fingerprint',ff_private.history_protected_hash(),
    'members',(select count(*) from public.profiles where dev_seed_key='DEV041-HISTORY-V1'),
    'events',(select count(*) from public.events where dev_seed_key='DEV041-HISTORY-V1'),
    'years',(select jsonb_agg(to_jsonb(y) order by report_year) from (
      select extract(year from e.starts_at at time zone 'Europe/Berlin')::int report_year,count(*) events,
        count(*) filter(where e.attendance_state in ('COMPLETED','CORRECTED')) completed
      from public.events e where e.dev_seed_key='DEV041-HISTORY-V1' group by 1) y),
    'attendance',(select count(*) from public.actual_attendance a join public.events e on e.id=a.event_id where e.dev_seed_key='DEV041-HISTORY-V1'),
    'confirmed_attendance',(select count(*) from public.actual_attendance a join public.events e on e.id=a.event_id
      join public.attendance_confirmations c on c.event_id=e.id where e.dev_seed_key='DEV041-HISTORY-V1'),
    'statistics',(select jsonb_agg(to_jsonb(s) order by s.report_year,s.name) from (
      select extract(year from e.starts_at at time zone 'Europe/Berlin')::int report_year,u.name,
        count(distinct e.id) services,count(distinct e.id) filter(where t.is_training_relevant) training_services,
        count(*) filter(where a.status='present') present,count(*) filter(where a.status='absent') absent,
        round(100.0*count(*) filter(where a.status='present' and t.is_training_relevant)
          /nullif(count(*) filter(where t.is_training_relevant),0),2) rate,
        sum(case when a.status='present' and t.is_training_relevant then extract(epoch from e.ends_at-e.starts_at)/3600 else 0 end) training_participant_hours,
        sum(case when a.status='present' then extract(epoch from e.ends_at-e.starts_at)/3600 else 0 end) participant_hours
      from public.events e join public.event_roster r on r.event_id=e.id join public.units u on u.id=r.unit_snapshot_id
      join public.actual_attendance a on a.event_id=r.event_id and a.user_id=r.user_id
      join public.attendance_confirmations c on c.event_id=e.id join public.event_type_reporting t using(event_type)
      where e.dev_seed_key='DEV041-HISTORY-V1' and e.status='scheduled' and e.attendance_state in ('COMPLETED','CORRECTED')
      group by 1,u.name) s));
end;
$$;

create function public.ff_dev_seed_history(expected_project text,confirmation text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare codes text[]:=array['scheuren','scherf','blecher','eikamp','voiswinkel'];
  fixture text:='DEV041-HISTORY-V1'; before_hash text; existing ff_private.dev_fixture_sets;
  n int; j int; yr int; k int; person uuid; uid uuid; fid uuid; start_time timestamptz; finish_time timestamptz;
  kind public.ff_event_type; unit_name text;
begin
  perform ff_private.require_history_operator(expected_project);
  perform ff_private.require_rule(confirmation='SEED DEV041-HISTORY-V1','Explicit isolated DEV seed confirmation required.');
  perform pg_advisory_xact_lock(hashtext(fixture));
  perform ff_private.require_rule(statement_timestamp()>='2026-11-04 00:00 Europe/Berlin'::timestamptz,
    'Historical fixture end date must already have passed.');
  perform ff_private.require_rule((select count(*) from public.units)=5
    and (select count(*) from public.units where code=any(codes))=5,'Exactly the five corrected unit codes required.');
  select * into existing from ff_private.dev_fixture_sets where fixture_key=fixture for update;
  if found then
    perform ff_private.require_rule(existing.state='ready' and existing.project_ref=expected_project
      and existing.data_fingerprint=ff_private.history_data_hash(),'Fixture drift or prior cleanup detected; no overwrite or automatic repair.');
    return public.ff_dev_history_inventory(expected_project);
  end if;
  perform ff_private.require_rule(not exists(select 1 from public.profiles where dev_seed_key=fixture)
    and not exists(select 1 from public.events where dev_seed_key=fixture),'Unregistered fixture rows require review.');
  before_hash:=ff_private.history_protected_hash();
  insert into ff_private.dev_fixture_sets(fixture_key,project_ref,random_seed,state,created_by)
    values(fixture,expected_project,4102025,'building',auth.uid());
  for n in 1..5 loop
    select id,name into strict uid,unit_name from public.units where code=codes[n];
    for j in 1..10 loop
      person:=ff_private.history_id('member:'||codes[n]||':'||j);
      insert into public.profiles(id,display_name,status,approved_at,approved_by,approved_email,created_at,dev_seed_key)
        values(person,'DEV TEST | Testmitglied '||unit_name||' '||lpad(j::text,2,'0'),'approved',
          '2025-01-01 00:00 Europe/Berlin',auth.uid(),'nonlogin-'||person||'@example.invalid',
          '2025-01-01 00:00 Europe/Berlin',fixture);
      start_time:=case when n=1 and j=9 then '2025-07-01 00:00 Europe/Berlin'::timestamptz
        when n=5 and j=10 then '2026-11-01 00:00 Europe/Berlin'::timestamptz
        else '2025-01-01 00:00 Europe/Berlin'::timestamptz end;
      insert into public.unit_memberships(id,user_id,unit_id,valid_from,valid_until)
        values(ff_private.history_id('membership:'||person),person,uid,start_time,
          case when n=2 and j=8 then '2026-07-01 00:00 Europe/Berlin'::timestamptz else null end);
      if n=2 and j=8 then
        insert into public.unit_memberships(id,user_id,unit_id,valid_from)
          select ff_private.history_id('transfer:'||person),person,id,'2026-07-01 00:00 Europe/Berlin' from public.units where code='blecher';
      end if;
      for fid in select id from public.special_functions where
        (j%3=0 and code in ('equipment','breathing')) or (j%4=0 and code='clothing')
        or (n=1 and j=9 and code='clothing') loop
        insert into public.function_memberships(id,user_id,function_id,valid_from)
          values(ff_private.history_id('function:'||person||':'||fid),person,fid,start_time);
      end loop;
    end loop;
  end loop;
  for yr in 2025..2026 loop
    for n in 1..5 loop
      select id,name into strict uid,unit_name from public.units where code=codes[n];
      for k in 1..25 loop
        start_time:=make_timestamptz(yr,1+(k-1)*(case when yr=2025 then 12 else 10 end)/25,
          3+(k*7+n*3)%22,17+k%3,(k%2)*30,0,'Europe/Berlin');
        finish_time:=start_time+make_interval(mins=>90+((k+yr+n)%4)*30+case when yr=2026 then 30 else 0 end);
        kind:=case when k<=18 then 'regular'::public.ff_event_type when k<=21 then 'special'
          when k<=23 then 'training' else 'community' end;
        insert into public.events(id,title,description,event_type,starts_at,ends_at,location,scope_kind,unit_id,
          organizer_id,attendance_state,attendance_initialized_at,attendance_initialized_by,attendance_prepared_at,created_at,dev_seed_key)
          values(ff_private.history_id('event:'||yr||':'||codes[n]||':'||k),
            'DEV TEST 041 | '||unit_name||' | '||yr||' | '||kind||' '||lpad(k::text,2,'0'),
            'Synthetische historische DEV-Daten, Festseed 4102025. Keine reale Veranstaltung oder Anwesenheit.',
            kind,start_time,finish_time,'Synthetischer Testort '||unit_name,'unit',uid,auth.uid(),'COMPLETED',
            start_time,auth.uid(),case when kind in ('regular','special') then start_time else null end,start_time-interval '7 days',fixture);
      end loop;
    end loop;
    insert into public.events(id,title,description,event_type,starts_at,ends_at,location,scope_kind,organizer_id,
      attendance_state,attendance_initialized_at,attendance_initialized_by,created_at,dev_seed_key)
      values(ff_private.history_id('organization:'||yr),'DEV TEST 041 | Gemeinschaft | '||yr,
        'Synthetische DEV-Gemeinschaftsveranstaltung.','community',make_timestamptz(yr,5,20,10,0,0,'Europe/Berlin'),
        make_timestamptz(yr,5,20,13+case when yr=2026 then 1 else 0 end,0,0,'Europe/Berlin'),
        'Synthetischer Testort','organization',auth.uid(),'COMPLETED',make_timestamptz(yr,5,20,10,0,0,'Europe/Berlin'),
        auth.uid(),make_timestamptz(yr,5,1,12,0,0,'Europe/Berlin'),fixture);
    for fid in select id from public.special_functions where code in ('equipment','breathing','clothing') loop
      insert into public.events(id,title,description,event_type,starts_at,ends_at,location,scope_kind,function_id,organizer_id,
        attendance_state,attendance_initialized_at,attendance_initialized_by,created_at,dev_seed_key)
        select ff_private.history_id('function-event:'||yr||':'||fid),'DEV TEST 041 | '||f.name||' | '||yr,
          'Synthetische DEV-Funktionsausbildung.',case f.code when 'equipment' then 'other'::public.ff_event_type
            when 'breathing' then 'breathing' else 'training' end,
          make_timestamptz(yr,7,12,18,0,0,'Europe/Berlin'),
          make_timestamptz(yr,7,12,18,0,0,'Europe/Berlin')+make_interval(mins=>case f.code when 'equipment' then 120 when 'breathing' then 150 else 90 end+case when yr=2026 then 30 else 0 end),
          'Synthetischer Testort','function',f.id,auth.uid(),'COMPLETED',make_timestamptz(yr,7,12,18,0,0,'Europe/Berlin'),
          auth.uid(),make_timestamptz(yr,7,1,12,0,0,'Europe/Berlin'),fixture from public.special_functions f where f.id=fid;
    end loop;
    for k in 1..2 loop
      insert into public.events(id,title,description,event_type,starts_at,ends_at,location,scope_kind,unit_id,organizer_id,status,
        attendance_state,attendance_initialized_at,attendance_initialized_by,attendance_prepared_at,created_at,dev_seed_key)
        select ff_private.history_id('excluded:'||yr||':'||k),
          'DEV TEST 041 | '||case when k=1 then 'Offene Vorbelegung' else 'Abgesagt' end||' | '||yr,
          'Synthetisch, ausdrücklich nicht statistikrelevant.','regular',make_timestamptz(yr,11,2,18,0,0,'Europe/Berlin'),
          make_timestamptz(yr,11,2,20,0,0,'Europe/Berlin'),'Synthetischer Testort','unit',u.id,auth.uid(),
          case when k=1 then 'scheduled' else 'cancelled' end,'IN_PROGRESS',make_timestamptz(yr,11,2,18,0,0,'Europe/Berlin'),
          auth.uid(),make_timestamptz(yr,11,2,18,0,0,'Europe/Berlin'),make_timestamptz(yr,10,25,12,0,0,'Europe/Berlin'),fixture
        from public.units u where u.code=case when k=1 then 'voiswinkel' else 'scheuren' end;
    end loop;
  end loop;
  insert into public.event_roster(event_id,user_id,unit_snapshot_id,name_snapshot)
    select e.id,p.id,m.unit_id,p.display_name from public.events e join public.unit_memberships m
      on m.valid_from<=e.starts_at and (m.valid_until is null or m.valid_until>e.starts_at)
    join public.profiles p on p.id=m.user_id and p.dev_seed_key=e.dev_seed_key
    where e.dev_seed_key=fixture and (e.scope_kind='organization' or (e.scope_kind='unit' and e.unit_id=m.unit_id)
      or (e.scope_kind='function' and exists(select 1 from public.function_memberships f
        where f.user_id=p.id and f.function_id=e.function_id and f.valid_from<=e.starts_at
          and (f.valid_until is null or f.valid_until>e.starts_at))));
  insert into public.actual_attendance(event_id,user_id,status,origin,recorded_by,recorded_at)
    select e.id,r.user_id,case when e.attendance_state='IN_PROGRESS' then 'present'::public.ff_attendance
      when right(p.display_name,2)='01' then 'present'
      when (('x'||substr(md5('4102025:'||e.id||':'||r.user_id),1,8))::bit(32)::bigint/4294967296.0)
        <case when right(p.display_name,2)='02' then 0.12 else
          (array[0.90,0.77,0.65,0.53,0.40])[array_position(codes,u.code)]
          +case when extract(year from e.starts_at at time zone 'Europe/Berlin')=2026 then 0.07 else 0 end end
        then 'present' else 'absent' end,
      case when e.attendance_state='IN_PROGRESS' then 'prefill' else 'manual' end,auth.uid(),e.ends_at+interval '1 minute'
    from public.events e join public.event_roster r on r.event_id=e.id join public.profiles p on p.id=r.user_id
    join public.units u on u.id=r.unit_snapshot_id where e.dev_seed_key=fixture;
  insert into public.participation_responses(event_id,user_id,response,updated_at)
    select a.event_id,a.user_id,case a.status when 'absent' then 'yes'::public.ff_response else 'no' end,e.starts_at-interval '1 day'
    from public.actual_attendance a join public.events e on e.id=a.event_id where e.dev_seed_key=fixture;
  insert into public.attendance_confirmations(event_id,confirmed_by,confirmed_at,original_snapshot)
    select e.id,auth.uid(),e.ends_at+interval '5 minutes',
      (select jsonb_agg(jsonb_build_object('user_id',r.user_id,'name',r.name_snapshot,'unit_id',r.unit_snapshot_id,
        'status',a.status,'origin',a.origin) order by r.user_id)
       from public.event_roster r join public.actual_attendance a using(event_id,user_id) where r.event_id=e.id)
    from public.events e where e.dev_seed_key=fixture and e.attendance_state='COMPLETED';
  update ff_private.dev_fixture_sets set state='ready',data_fingerprint=ff_private.history_data_hash() where fixture_key=fixture;
  perform ff_private.write_audit('dev_statistics_seeded',null,null,null,
    jsonb_build_object('fixture_key',fixture,'project_ref',expected_project,'random_seed',4102025,
      'members',50,'events',262,'fingerprint',ff_private.history_data_hash()),
    'Explicit isolated DEV history seed; non-login identities only; no Auth, roles or existing attendance changes');
  perform ff_private.require_rule(before_hash=ff_private.history_protected_hash(),'Protected existing data changed; complete seed transaction aborted.');
  return public.ff_dev_history_inventory(expected_project);
end;
$$;

-- Audit remains append-only. Only pristine, registered synthetic confirmations
-- may be removed by the separately authorized, explicit fixture cleanup routine.
create function ff_private.protect_fixture_confirmation()
returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='DELETE' and current_setting('ff.fixture_cleanup',true)='DEV041-HISTORY-V1'
      and ff_private.has_role('GLOBAL_ADMIN') and exists(
        select 1 from public.events e where e.id=old.event_id and e.dev_seed_key='DEV041-HISTORY-V1') then return old; end if;
  raise exception 'Confirmation history is append-only outside explicit pristine DEV fixture cleanup' using errcode='42501';
end;
$$;
drop trigger ff_immutable_confirmation on public.attendance_confirmations;
create trigger ff_immutable_confirmation before update or delete on public.attendance_confirmations
for each row execute function ff_private.protect_fixture_confirmation();

create function public.ff_dev_remove_history(expected_project text,expected_fingerprint text,
  confirmation text default null,dry_run boolean default true)
returns jsonb language plpgsql security definer set search_path='' as $$
declare inventory jsonb; before_hash text;
begin
  perform ff_private.require_history_operator(expected_project);
  perform pg_advisory_xact_lock(hashtext('DEV041-HISTORY-V1'));
  perform ff_private.require_rule(dry_run is not null and exists(select 1 from ff_private.dev_fixture_sets
    where fixture_key='DEV041-HISTORY-V1' and state='ready' and data_fingerprint=expected_fingerprint)
    and expected_fingerprint=ff_private.history_data_hash(),'Pristine registered fixture fingerprint required; changed data needs review.');
  inventory:=public.ff_dev_history_inventory(expected_project);
  if dry_run then return inventory||jsonb_build_object('dry_run',true); end if;
  perform ff_private.require_rule(confirmation='REMOVE DEV041-HISTORY-V1','Explicit destructive DEV fixture confirmation required.');
  before_hash:=ff_private.history_protected_hash();
  perform set_config('ff.fixture_cleanup','DEV041-HISTORY-V1',true);
  delete from public.attendance_confirmations where event_id in(select id from public.events where dev_seed_key='DEV041-HISTORY-V1');
  delete from public.participation_responses where event_id in(select id from public.events where dev_seed_key='DEV041-HISTORY-V1');
  delete from public.actual_attendance where event_id in(select id from public.events where dev_seed_key='DEV041-HISTORY-V1');
  delete from public.event_roster where event_id in(select id from public.events where dev_seed_key='DEV041-HISTORY-V1');
  delete from public.events where dev_seed_key='DEV041-HISTORY-V1';
  delete from public.function_memberships where user_id in(select id from public.profiles where dev_seed_key='DEV041-HISTORY-V1');
  delete from public.unit_memberships where user_id in(select id from public.profiles where dev_seed_key='DEV041-HISTORY-V1');
  delete from public.profiles where dev_seed_key='DEV041-HISTORY-V1';
  update ff_private.dev_fixture_sets set state='cleaned',cleaned_at=clock_timestamp() where fixture_key='DEV041-HISTORY-V1';
  perform ff_private.write_audit('dev_statistics_removed',null,null,inventory,
    jsonb_build_object('fixture_key','DEV041-HISTORY-V1','fingerprint',expected_fingerprint),
    'Explicit pristine synthetic DEV cleanup; existing Auth and attendance retained');
  perform ff_private.require_rule(before_hash=ff_private.history_protected_hash(),'Protected existing data changed; cleanup rolled back.');
  return jsonb_build_object('removed',true,'fixture_key','DEV041-HISTORY-V1');
end;
$$;

revoke all on function ff_private.require_history_operator(text),ff_private.history_id(text),
  ff_private.history_data_hash(),ff_private.history_protected_hash(),ff_private.protect_fixture_confirmation()
  from public,anon,authenticated,service_role;
revoke all on function public.ff_dev_history_inventory(text),public.ff_dev_seed_history(text,text),
  public.ff_dev_remove_history(text,text,text,boolean) from public,anon,authenticated,service_role;
grant execute on function public.ff_dev_history_inventory(text),public.ff_dev_seed_history(text,text),
  public.ff_dev_remove_history(text,text,text,boolean) to authenticated;
notify pgrst,'reload schema';
commit;
