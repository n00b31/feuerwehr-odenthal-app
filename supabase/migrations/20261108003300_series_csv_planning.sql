begin;

alter table public.event_series drop constraint event_series_frequency_check;
alter table public.event_series add constraint event_series_frequency_check
  check(frequency in ('daily','weekly','biweekly','threeweekly','monthly','custom_weeks'));
alter table public.event_series
  add column rule jsonb,
  add column revision integer not null default 0 check(revision>=0),
  add column ended_on date;

create table public.event_series_exceptions (
  event_id uuid primary key references public.events(id),
  changed_by uuid not null references public.profiles(id),
  changed_at timestamptz not null default clock_timestamp()
);
alter table public.event_series_exceptions enable row level security;
revoke all on public.event_series_exceptions from public,anon,authenticated;
grant select on public.event_series_exceptions to authenticated;
create policy visible_series_exceptions on public.event_series_exceptions for select to authenticated
  using(ff_private.can_view_event(event_id));
create table ff_private.event_plan_commits (
  request_id uuid primary key,actor_id uuid not null references public.profiles(id),
  input_hash text not null,result jsonb not null,created_at timestamptz not null default clock_timestamp()
);
revoke all on ff_private.event_plan_commits from public,anon,authenticated,service_role;
create index events_import_lookup on public.events
  (scope_kind,unit_id,function_id,starts_at,ends_at,lower(regexp_replace(btrim(title),'\s+',' ','g')));

create function ff_private.plan_hash(value jsonb) returns text
language sql immutable set search_path='' as $$
  select encode(sha256(convert_to(value::text,'UTF8')),'hex');
$$;
create function ff_private.berlin_instant(day date,wall text) returns timestamptz
language plpgsql immutable set search_path='' as $$
declare local_value timestamp; instant timestamptz;
begin
  perform ff_private.require_rule(wall ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$','Uhrzeit muss HH:mm sein.');
  local_value:=day+wall::time;instant:=local_value at time zone 'Europe/Berlin';
  perform ff_private.require_rule(instant at time zone 'Europe/Berlin'=local_value,'Diese Berlin-Uhrzeit existiert nicht (Zeitumstellung).');
  if (instant-interval '1 hour') at time zone 'Europe/Berlin'=local_value then instant:=instant-interval '1 hour'; end if;
  return instant;
end;
$$;
create function ff_private.plan_date(value text) returns date
language plpgsql immutable set search_path='' as $$
declare result date;
begin
  perform ff_private.require_rule(value ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$','Datum muss JJJJ-MM-TT sein.');
  result:=value::date;
  perform ff_private.require_rule(to_char(result,'YYYY-MM-DD')=value and extract(year from result) between 2000 and 9998,'Datum außerhalb des unterstützten Bereichs.');
  return result;
end;
$$;
create function ff_private.series_dates(rule jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare first_day date;last_day date;day date;maximum int;weeks int;step int;offset_day int;
  frequency text;matches boolean;rows jsonb:='[]';start_time text;end_time text;
begin
  first_day:=ff_private.plan_date(rule->>'start_date');
  last_day:=case when nullif(rule->>'end_date','') is null then (first_day+interval '5 years')::date else ff_private.plan_date(rule->>'end_date') end;
  maximum:=nullif(rule->>'count','')::int;frequency:=rule->>'frequency';weeks:=coalesce((rule->>'weeks')::int,1);
  start_time:=rule->>'start_time';end_time:=rule->>'end_time';
  perform ff_private.require_rule(jsonb_typeof(rule)='object'
    and frequency in ('daily','weekly','biweekly','threeweekly','monthly','custom_weeks')
    and weeks between 1 and 52 and (maximum between 1 and 52 or maximum is null)
    and (maximum is not null or nullif(rule->>'end_date','') is not null)
    and last_day>=first_day and last_day<=first_day+interval '5 years'
    and extract(year from last_day)<=9998 and start_time<>end_time,'Ungültige oder unbegrenzte Serie; maximal 52 Instanzen/fünf Jahre.');
  if frequency='monthly' then
    perform ff_private.require_rule(rule->>'monthly_mode' in ('day','ordinal')
      and (rule->>'ordinal')::int between 1 and 5 and (rule->>'weekday')::int between 1 and 7,'Monatliche Regel ungültig.');
  end if;
  step:=case frequency when 'weekly' then 7 when 'biweekly' then 14 when 'threeweekly' then 21 when 'custom_weeks' then weeks*7 else 1 end;
  for offset_day in 0..1830 loop
    day:=first_day+offset_day;exit when day>last_day;
    matches:=case when frequency='monthly' then case when rule->>'monthly_mode'='ordinal'
      then extract(isodow from day)=(rule->>'weekday')::int and ceil(extract(day from day)/7)=(rule->>'ordinal')::int
      else extract(day from day)=least(extract(day from first_day),extract(day from date_trunc('month',day)+interval '1 month - 1 day')) end
      else offset_day%step=0 end;
    if not matches then continue; end if;
    perform ff_private.require_rule(jsonb_array_length(rows)<52,'Mehr als 52 Instanzen; Anzahl begrenzen oder Serienende verkürzen.');
    rows:=rows||jsonb_build_array(jsonb_build_object('starts_at',ff_private.berlin_instant(day,start_time),
      'ends_at',ff_private.berlin_instant(day+case when end_time<start_time then 1 else 0 end,end_time)));
    exit when maximum is not null and jsonb_array_length(rows)=maximum;
  end loop;
  perform ff_private.require_rule(jsonb_array_length(rows)>0 and (maximum is null or nullif(rule->>'end_date','') is not null
    or jsonb_array_length(rows)=maximum),'Keine ausreichenden Termine im Planungshorizont.');
  return rows;
end;
$$;
create function ff_private.normalize_planned_event(input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare kind public.ff_scope;unit uuid;fn uuid;organizer uuid;
begin
  perform ff_private.require_rule(jsonb_typeof(input)='object' and
    input-array['title','description','event_type','location','scope_kind','unit_id','function_id','organizer_id','starts_at','ends_at','response_deadline']::text[]='{}',
    'Ungültige Terminfelder; keine Akteur- oder Berechtigungsangaben erlaubt.');
  kind:=(input->>'scope_kind')::public.ff_scope;unit:=(input->>'unit_id')::uuid;fn:=(input->>'function_id')::uuid;
  organizer:=coalesce((input->>'organizer_id')::uuid,auth.uid());
  perform ff_private.require_rule((kind='unit' and unit is not null and fn is null and exists(select 1 from public.units where id=unit))
    or (kind='function' and unit is null and fn is not null and exists(select 1 from public.special_functions where id=fn))
    or (kind='organization' and unit is null and fn is null),'Genau einen bekannten Terminbereich wählen.');
  perform ff_private.require_rule(ff_private.manages_scope(kind,unit,fn),'Keine Terminverwaltung für diesen Bereich.');
  perform ff_private.validate_single_event(input);
  perform ff_private.require_rule((input->>'starts_at')::timestamptz>clock_timestamp()
    and (input->>'starts_at')::timestamptz<=clock_timestamp()+interval '5 years','Nur zukünftige Termine innerhalb von fünf Jahren planen.');
  perform ff_private.require_rule(organizer=auth.uid() or (ff_private.is_approved_user(organizer) and exists(
    select 1 from public.unit_memberships m where m.user_id=organizer and m.valid_from<=statement_timestamp()
      and (m.valid_until is null or m.valid_until>statement_timestamp()) and
      (kind='organization' or kind='unit' and m.unit_id=unit or kind='function' and exists(
        select 1 from public.function_memberships f where f.user_id=organizer and f.function_id=fn and f.valid_from<=statement_timestamp()
          and (f.valid_until is null or f.valid_until>statement_timestamp()))))), 'Organisator nicht für diesen Bereich berechtigt.');
  return jsonb_build_object('title',btrim(input->>'title'),'description',coalesce(input->>'description',''),'event_type',input->>'event_type',
    'location',btrim(input->>'location'),'scope_kind',kind,'unit_id',unit,'function_id',fn,'organizer_id',organizer,
    'starts_at',(input->>'starts_at')::timestamptz,'ends_at',(input->>'ends_at')::timestamptz,
    'response_deadline',nullif(input->>'response_deadline','')::timestamptz);
end;
$$;
create function ff_private.planned_key(input jsonb) returns text
language sql immutable set search_path='' as $$
  select ff_private.plan_hash(jsonb_build_array(input->>'scope_kind',input->>'unit_id',input->>'function_id',
    (input->>'starts_at')::timestamptz,(input->>'ends_at')::timestamptz,lower(regexp_replace(btrim(input->>'title'),'\s+',' ','g'))));
$$;
create function public.ff_event_planning_context() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  perform ff_private.require_rule(ff_private.is_active(),'Freigeschalteter Zugang erforderlich.');
  return jsonb_build_object('actor_id',auth.uid(),'actor_name',(select display_name from public.profiles where id=auth.uid()),
    'server_now',clock_timestamp(),'organization',ff_private.manages_scope('organization',null,null),
    'units',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'manageable',ff_private.manages_scope('unit',id,null)) order by name,id),'[]') from public.units),
    'functions',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'manageable',ff_private.manages_scope('function',null,id)) order by name,id),'[]') from public.special_functions),
    'organizers',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.display_name,
      'unit_ids',coalesce((select jsonb_agg(distinct m.unit_id) from public.unit_memberships m where m.user_id=p.id and m.valid_from<=statement_timestamp()
        and (m.valid_until is null or m.valid_until>statement_timestamp())),'[]'),
      'function_ids',coalesce((select jsonb_agg(distinct m.function_id) from public.function_memberships m where m.user_id=p.id and m.valid_from<=statement_timestamp()
        and (m.valid_until is null or m.valid_until>statement_timestamp())),'[]')) order by p.display_name,p.id),'[]')
      from public.profiles p where ff_private.is_approved_user(p.id) and ff_private.can_view_profile(p.id) and p.dev_seed_key is null));
end;
$$;
create function ff_private.planning_organizer(target uuid) returns uuid
language sql stable security definer set search_path='' as $$
  select coalesce((select d.user_id from public.event_delegations d
    where d.event_id=e.id and d.is_primary and d.revoked_at is null),e.organizer_id)
  from public.events e where e.id=target;
$$;
create function public.ff_series_workspace(target_event uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare item public.events;series public.event_series;
begin
  select * into item from public.events where id=target_event;
  perform ff_private.require_rule(found and item.series_id is not null and ff_private.manages_scope(item.scope_kind,item.unit_id,item.function_id),
    'Keine Serienverwaltung für diesen Bereich.');
  select * into series from public.event_series where id=item.series_id;
  return jsonb_build_object('series',to_jsonb(series),'anchor',to_jsonb(item)||jsonb_build_object('organizer_id',ff_private.planning_organizer(item.id)),'instances',
    (select jsonb_agg(to_jsonb(e)||jsonb_build_object('organizer_id',ff_private.planning_organizer(e.id),'protected',e.starts_at<=clock_timestamp() or e.status<>'scheduled' or ff_private.roster_frozen(e.id),
      'exception',exists(select 1 from public.event_series_exceptions where event_id=e.id)) order by e.instance_number)
      from public.events e where e.series_id=item.series_id));
end;
$$;
create function ff_private.build_event_plan(input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare op text:=input->>'operation';rows jsonb:='[]';dates jsonb;row jsonb;proposal jsonb;updated jsonb:='[]';
  series public.event_series;anchor public.events;item public.events;ids uuid[]:='{}';protected int:=0;responses int:=0;
  duplicates int:=0;index_value int:=0;rule jsonb;meaning_changed boolean;duplicate boolean;
begin
  perform ff_private.require_rule(ff_private.is_active() and jsonb_typeof(input)='object' and pg_column_size(input)<=524288
    and op in ('series_create','csv_import','series_update','series_cancel','series_end'),'Ungültiger oder zu großer Planungsvorgang.');
  perform ff_private.require_rule(input-array['operation','request_id','series_id','anchor_id','selection','data','rule','rows','end_date','reason']::text[]='{}',
    'Unbekannte Planungsfelder.');
  if op in ('series_create','csv_import') then
    perform ff_private.require_rule(input->'series_id' is null and input->'anchor_id' is null and input->'selection' is null,
      'Neue Termine dürfen keiner bestehenden Serie untergeschoben werden.');
  end if;
  if op='series_create' then
    perform ff_private.require_rule(length(btrim(input->'data'->>'description')) between 1 and 2000,'Beschreibung für die Terminserie erforderlich.');
    dates:=ff_private.series_dates(input->'rule');
    for row in select value from jsonb_array_elements(dates) loop
      proposal:=ff_private.normalize_planned_event((input->'data')||row);
      rows:=rows||jsonb_build_array(proposal||jsonb_build_object('event_id',null,'old',null));
    end loop;
  elsif op='csv_import' then
    perform ff_private.require_rule(jsonb_typeof(input->'rows')='array' and jsonb_array_length(input->'rows') between 1 and 200,'Ein bis 200 CSV-Termine erforderlich.');
    for row in select value from jsonb_array_elements(input->'rows') loop
      proposal:=ff_private.normalize_planned_event(row);
      rows:=rows||jsonb_build_array(proposal||jsonb_build_object('event_id',null,'old',null));
    end loop;
  else
    select * into series from public.event_series where id=(input->>'series_id')::uuid;
    perform ff_private.require_rule(found and ff_private.manages_scope(series.scope_kind,series.unit_id,series.function_id),'Keine berechtigte Serie.');
    select * into anchor from public.events where id=(input->>'anchor_id')::uuid and series_id=series.id;
    perform ff_private.require_rule(found and input->>'selection' in ('single','following','all'),'Serieninstanz und Änderungsbereich erforderlich.');
    if op<>'series_update' then perform ff_private.require_rule(length(btrim(input->>'reason')) between 5 and 2000,'Absagegrund: fünf bis 2000 Zeichen.'); end if;
    for item in select * from public.events where series_id=series.id and
      (op='series_end' or input->>'selection'='all' or input->>'selection'='single' and id=anchor.id
        or input->>'selection'='following' and instance_number>=anchor.instance_number) order by instance_number loop
      if op='series_end' and (item.starts_at at time zone 'Europe/Berlin')::date<=ff_private.plan_date(input->>'end_date') then continue; end if;
      if item.starts_at<=clock_timestamp() or item.status<>'scheduled' or ff_private.roster_frozen(item.id)
        or exists(select 1 from public.event_calendar where event_id=item.id)
        or op='series_update' and input->>'selection'<>'single' and exists(select 1 from public.event_series_exceptions where event_id=item.id) then
        protected:=protected+1;continue;
      end if;
      ids:=array_append(ids,item.id);
    end loop;
    if op='series_update' and cardinality(ids)>0 then
      rule:=(input->'rule')||jsonb_build_object('count',cardinality(ids),'end_date',null);
      if input->>'selection'='single' then rule:=rule||jsonb_build_object('frequency','daily'); end if;
      dates:=ff_private.series_dates(rule);
    end if;
    for item in select * from public.events where id=any(ids) order by instance_number loop
      row:=to_jsonb(item);
      if op='series_update' then
        proposal:=ff_private.normalize_planned_event((input->'data')||(dates->index_value)||jsonb_build_object(
          'response_deadline',case when item.response_deadline is null then null else
            item.response_deadline+((dates->index_value->>'starts_at')::timestamptz-item.starts_at) end));
        perform ff_private.require_rule((proposal->>'scope_kind')::public.ff_scope=item.scope_kind
          and (proposal->>'unit_id')::uuid is not distinct from item.unit_id
          and (proposal->>'function_id')::uuid is not distinct from item.function_id,'Bestehender Teilnehmerbereich bleibt unverändert.');
        perform ff_private.require_rule(series.ended_on is null or ((proposal->>'starts_at')::timestamptz at time zone 'Europe/Berlin')::date<=series.ended_on,
          'Vorgeschlagener Termin liegt nach dem Ende dieser Serie.');
        meaning_changed:=exists(select 1 from jsonb_each(proposal) p where p.value is distinct from
          (row||jsonb_build_object('organizer_id',ff_private.planning_organizer(item.id)))->p.key);
      else proposal:=row;meaning_changed:=false; end if;
      rows:=rows||jsonb_build_array(proposal||jsonb_build_object('event_id',item.id,'old',row,'meaning_changed',meaning_changed,
        'responses',(select jsonb_agg(to_jsonb(p) order by p.user_id) from public.participation_responses p where p.event_id=item.id),
        'delegations',(select jsonb_agg(to_jsonb(d) order by d.id) from public.event_delegations d where d.event_id=item.id)));
      if meaning_changed then responses:=responses+(select count(*) from public.participation_responses where event_id=item.id and invalidated_at is null); end if;
      index_value:=index_value+1;
    end loop;
  end if;
  for row in select value from jsonb_array_elements(rows) loop
    duplicate:=false;
    if op in ('series_create','csv_import','series_update') then
      duplicate:=(select count(*) from jsonb_array_elements(rows) r where ff_private.planned_key(r)=ff_private.planned_key(row))>1 or exists(
        select 1 from public.events e where not(e.id=any(ids)) and not exists(select 1 from public.event_calendar where event_id=e.id)
          and e.scope_kind=(row->>'scope_kind')::public.ff_scope
          and e.unit_id is not distinct from (row->>'unit_id')::uuid and e.function_id is not distinct from (row->>'function_id')::uuid
          and e.starts_at=(row->>'starts_at')::timestamptz and e.ends_at=(row->>'ends_at')::timestamptz
          and lower(regexp_replace(btrim(e.title),'\s+',' ','g'))=lower(regexp_replace(btrim(row->>'title'),'\s+',' ','g')));
    end if;
    if duplicate then duplicates:=duplicates+1; end if;
    updated:=updated||jsonb_build_array(row||jsonb_build_object('duplicate',duplicate,'scope_name',
      coalesce((select name from public.units where id=(row->>'unit_id')::uuid),
        (select name from public.special_functions where id=(row->>'function_id')::uuid),'Alle Einheiten')));
  end loop;
  return jsonb_build_object('rows',updated,'protected_count',protected,'response_count',responses,'duplicate_count',duplicates,
    'series_before',to_jsonb(series),'can_commit',jsonb_array_length(updated)>0 and duplicates=0);
end;
$$;
create function public.ff_preview_event_plan(input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare plan jsonb;
begin
  plan:=ff_private.build_event_plan(input);
  return (plan-'series_before')||jsonb_build_object('token',ff_private.plan_hash(jsonb_build_object('actor',auth.uid(),'input',input,'plan',plan)),
    'rows',(select coalesce(jsonb_agg(r.value-array['old','responses','delegations','meaning_changed']::text[]),'[]') from jsonb_array_elements(plan->'rows') r));
end;
$$;
create function public.ff_commit_event_plan(input jsonb,expected_token text,confirmed boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare plan jsonb;row jsonb;previous jsonb;cached ff_private.event_plan_commits;request uuid;
  series_id uuid;created_event uuid;former_organizer uuid;ids uuid[]:='{}';index_value int:=0;result jsonb;input_hash text;
begin
  perform ff_private.require_rule(confirmed is true and ff_private.is_active(),'Ausdrückliche Bestätigung und freigeschalteter Zugang erforderlich.');
  request:=(input->>'request_id')::uuid;
  perform ff_private.require_rule(request is not null,'Vorgangs-ID erforderlich.');
  perform pg_advisory_xact_lock(hashtext('ff.membership_eligibility'));
  perform pg_advisory_xact_lock(hashtext('ff.event_planning'));
  input_hash:=ff_private.plan_hash(input);
  select * into cached from ff_private.event_plan_commits where request_id=request;
  if found then
    perform ff_private.require_rule(cached.actor_id=auth.uid() and cached.input_hash=input_hash,'Vorgangs-ID gehört zu einer anderen Anfrage.');
    for row in select value from jsonb_array_elements(cached.result->'event_ids') loop
      perform ff_private.require_rule(ff_private.can_view_event((row#>>'{}')::uuid),'Keine aktuelle Berechtigung für diesen Vorgang.');
    end loop;
    return cached.result||jsonb_build_object('replayed',true);
  end if;
  if input->>'series_id' is not null then
    perform 1 from public.event_series where id=(input->>'series_id')::uuid for update;
    perform 1 from public.events e where e.series_id=(input->>'series_id')::uuid order by e.id for update;
  end if;
  plan:=ff_private.build_event_plan(input);
  if expected_token is distinct from ff_private.plan_hash(jsonb_build_object('actor',auth.uid(),'input',input,'plan',plan)) then
    raise exception 'Vorschau zwischenzeitlich geändert. Erneut prüfen und bestätigen.' using errcode='40001';
  end if;
  perform ff_private.require_rule((plan->>'can_commit')::boolean,'Keine speicherbaren Termine oder Duplikate; Vorgang nicht ausgeführt.');
  if input->>'operation'='series_create' then
    row:=plan->'rows'->0;
    insert into public.event_series(title,scope_kind,unit_id,function_id,frequency,occurrence_count,local_start,duration_minutes,created_by,rule)
    values(row->>'title',(row->>'scope_kind')::public.ff_scope,(row->>'unit_id')::uuid,(row->>'function_id')::uuid,
      input->'rule'->>'frequency',jsonb_array_length(plan->'rows'),
      (row->>'starts_at')::timestamptz at time zone 'Europe/Berlin',
      (extract(epoch from (((row->>'ends_at')::timestamptz at time zone 'Europe/Berlin')-
        ((row->>'starts_at')::timestamptz at time zone 'Europe/Berlin')))/60)::int,auth.uid(),input->'rule')
    returning id into series_id;
  else series_id:=(input->>'series_id')::uuid; end if;
  for row in select value from jsonb_array_elements(plan->'rows') loop
    index_value:=index_value+1;previous:=row->'old';created_event:=(row->>'event_id')::uuid;
    if created_event is null then
      perform ff_private.require_rule((row->>'starts_at')::timestamptz>clock_timestamp(),'Vorgeschlagener Termin inzwischen begonnen. Erneut planen.');
      insert into public.events(series_id,instance_number,title,description,event_type,starts_at,ends_at,location,scope_kind,unit_id,function_id,organizer_id,response_deadline)
      values(series_id,case when series_id is not null then index_value end,row->>'title',row->>'description',(row->>'event_type')::public.ff_event_type,
        (row->>'starts_at')::timestamptz,(row->>'ends_at')::timestamptz,row->>'location',(row->>'scope_kind')::public.ff_scope,
        (row->>'unit_id')::uuid,(row->>'function_id')::uuid,(row->>'organizer_id')::uuid,(row->>'response_deadline')::timestamptz)
      returning id into created_event;
      if (row->>'organizer_id')::uuid<>auth.uid() then perform public.ff_set_primary_organizer(created_event,(row->>'organizer_id')::uuid,'Serien-/CSV-Planung'); end if;
    elsif input->>'operation'='series_update' then
      perform ff_private.require_rule((previous->>'starts_at')::timestamptz>clock_timestamp() and not ff_private.roster_frozen(created_event),'Termin inzwischen begonnen oder eingefroren.');
      former_organizer:=ff_private.planning_organizer(created_event);
      update public.events set title=row->>'title',description=row->>'description',event_type=(row->>'event_type')::public.ff_event_type,
        starts_at=(row->>'starts_at')::timestamptz,ends_at=(row->>'ends_at')::timestamptz,location=row->>'location',
        response_deadline=(row->>'response_deadline')::timestamptz,organizer_id=(row->>'organizer_id')::uuid,revision=revision+1 where id=created_event;
      if (row->>'organizer_id')::uuid is distinct from former_organizer then
        perform public.ff_set_primary_organizer(created_event,case when (row->>'organizer_id')::uuid=auth.uid() then null else (row->>'organizer_id')::uuid end,'Serienänderung');
      end if;
      if (row->>'meaning_changed')::boolean then
        update public.participation_responses set invalidated_at=clock_timestamp() where event_id=created_event and invalidated_at is null;
      end if;
      if input->>'selection'='single' then
        insert into public.event_series_exceptions(event_id,changed_by) values(created_event,auth.uid())
          on conflict(event_id) do update set changed_by=excluded.changed_by,changed_at=clock_timestamp();
      end if;
    else
      perform ff_private.require_rule((previous->>'starts_at')::timestamptz>clock_timestamp() and not ff_private.roster_frozen(created_event),'Termin inzwischen begonnen oder eingefroren.');
      update public.events set status='cancelled',revision=revision+1 where id=created_event;
      if input->>'selection'='single' then
        insert into public.event_series_exceptions(event_id,changed_by) values(created_event,auth.uid()) on conflict do nothing;
      end if;
    end if;
    ids:=array_append(ids,created_event);
    perform ff_private.write_audit('event_plan_'||(input->>'operation'),created_event,null,previous,
      (select to_jsonb(e) from public.events e where id=created_event),input->>'reason');
  end loop;
  if series_id is not null then
    update public.event_series set revision=revision+1,
      title=case when input->>'operation'='series_update' and input->>'selection'<>'single' then input->'data'->>'title' else title end,
      frequency=case when input->>'operation'='series_update' and input->>'selection'<>'single' then input->'rule'->>'frequency' else frequency end,
      rule=case when input->>'operation'='series_update' and input->>'selection'<>'single' then input->'rule' else rule end,
      local_start=case when input->>'operation'='series_update' and input->>'selection'<>'single'
        then (plan->'rows'->0->>'starts_at')::timestamptz at time zone 'Europe/Berlin' else local_start end,
      duration_minutes=case when input->>'operation'='series_update' and input->>'selection'<>'single'
        then (extract(epoch from (((plan->'rows'->0->>'ends_at')::timestamptz at time zone 'Europe/Berlin')-
          ((plan->'rows'->0->>'starts_at')::timestamptz at time zone 'Europe/Berlin')))/60)::int else duration_minutes end,
      ended_on=case when input->>'operation'='series_end' then ff_private.plan_date(input->>'end_date') else ended_on end where id=series_id;
  end if;
  result:=jsonb_build_object('event_ids',to_jsonb(ids),'series_id',series_id,'count',cardinality(ids),'replayed',false);
  insert into ff_private.event_plan_commits(request_id,actor_id,input_hash,result) values(request,auth.uid(),input_hash,result);
  perform ff_private.write_audit('event_plan_committed',ids[1],null,null,
    jsonb_build_object('request_id',request,'series_id',series_id,'operation',input->>'operation','count',cardinality(ids)));
  return result;
end;
$$;

-- Existing single-event inserts/edits join the same planning mutex before row locks.
alter function public.ff_create_single_event(jsonb) set schema ff_private;
alter function ff_private.ff_create_single_event(jsonb) rename to create_single_event_062;
alter function public.ff_update_single_event(uuid,integer,jsonb) set schema ff_private;
alter function ff_private.ff_update_single_event(uuid,integer,jsonb) rename to update_single_event_062;
create function public.ff_create_single_event(input jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
begin
  perform pg_advisory_xact_lock(hashtext('ff.membership_eligibility'));
  perform pg_advisory_xact_lock(hashtext('ff.event_planning'));
  return ff_private.create_single_event_062(input);
end;
$$;
create function public.ff_update_single_event(target_event uuid,expected_revision integer,input jsonb) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform pg_advisory_xact_lock(hashtext('ff.membership_eligibility'));
  perform pg_advisory_xact_lock(hashtext('ff.event_planning'));
  perform ff_private.update_single_event_062(target_event,expected_revision,input);
end;
$$;
alter function ff_private.event_summary(uuid) rename to event_summary_062;
create function ff_private.event_summary(target uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select ff_private.event_summary_062(target)||jsonb_build_object(
    'can_manage',ff_private.manages_scope(e.scope_kind,e.unit_id,e.function_id),
    'series_exception',exists(select 1 from public.event_series_exceptions where event_id=e.id))
    from public.events e where e.id=target and ff_private.can_view_event(e.id);
$$;
alter function ff_private.calendar_summary(uuid) rename to calendar_summary_062;
create function ff_private.calendar_summary(target uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select ff_private.calendar_summary_062(target)||jsonb_build_object('can_manage',
    case when e.series_id is not null and not exists(select 1 from public.event_calendar where event_id=e.id)
      then ff_private.manages_scope(e.scope_kind,e.unit_id,e.function_id)
      else (ff_private.calendar_summary_062(target)->>'can_manage')::boolean end)
    from public.events e where e.id=target and ff_private.can_view_event(e.id);
$$;
revoke all on function ff_private.plan_hash(jsonb),ff_private.berlin_instant(date,text),ff_private.plan_date(text),
  ff_private.series_dates(jsonb),ff_private.normalize_planned_event(jsonb),ff_private.planned_key(jsonb),ff_private.build_event_plan(jsonb),
  ff_private.planning_organizer(uuid),
  ff_private.create_single_event_062(jsonb),ff_private.update_single_event_062(uuid,integer,jsonb),
  ff_private.event_summary_062(uuid),ff_private.event_summary(uuid),ff_private.calendar_summary_062(uuid),ff_private.calendar_summary(uuid)
  from public,anon,authenticated,service_role;
revoke all on function public.ff_event_planning_context(),public.ff_series_workspace(uuid),public.ff_preview_event_plan(jsonb),
  public.ff_commit_event_plan(jsonb,text,boolean),public.ff_create_single_event(jsonb),public.ff_update_single_event(uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.ff_event_planning_context(),public.ff_series_workspace(uuid),public.ff_preview_event_plan(jsonb),
  public.ff_commit_event_plan(jsonb,text,boolean),public.ff_create_single_event(jsonb),public.ff_update_single_event(uuid,integer,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
