begin;

-- Operator-only helper: migration registration never creates fixtures automatically.
create function ff_private.seed_dev_vehicles(expected_project text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare admin_id uuid; member_id uuid; pilot uuid; allowed uuid[]; ids uuid[]:='{}'; target uuid; event uuid;
  i int; fixture text; names text[]:=array['MTF Scheuren','Reserve-HLF','Bunte Kuh','KdoW'];
  types text[]:=array['mtf','hlf','other','kdow']; previous_claim text;
begin
  perform ff_private.require_rule(expected_project='orxinqhhbtjpkzwlfaxq','Ausschließlich das geprüfte vorhandene Supabase DEV verwenden.');
  select id into pilot from public.units where code='scheuren';
  select p.id into admin_id from public.profiles p where ff_private.is_approved_user(p.id)
    and exists(select 1 from public.role_assignments a where a.user_id=p.id and a.role='GLOBAL_ADMIN' and a.revoked_at is null)
    order by p.id limit 1;
  select p.id into member_id from public.profiles p join public.unit_memberships m on m.user_id=p.id
    where m.unit_id=pilot and m.valid_from<=statement_timestamp() and (m.valid_until is null or m.valid_until>statement_timestamp())
      and ff_private.is_approved_user(p.id)
      and not exists(select 1 from public.role_assignments a where a.user_id=p.id and a.revoked_at is null and a.role<>'MEMBER')
    order by p.id limit 1;
  perform ff_private.require_rule(pilot is not null and admin_id is not null and member_id is not null,
    'Vorhandene aktive DEV-Administration und nichtadministratives Scheurener Mitglied erforderlich; keine neuen Mitglieder anlegen.');
  select array_agg(id order by id) into allowed from public.units;
  previous_claim:=coalesce(current_setting('request.jwt.claim.sub',true),'');
  perform set_config('request.jwt.claim.sub',admin_id::text,true);
  for i in 1..4 loop
    fixture:='DEV060-vehicle-'||i;
    select resource_id into target from public.vehicles where dev_seed_key=fixture;
    if target is null then
      target:=public.ff_save_vehicle(jsonb_build_object('name','DEV synthetisch - '||names[i],'unit_id',pilot,
        'type_key',types[i],'call_sign','','location','Synthetischer DEV-Pilot Scheuren; keine reale Fahrzeugzuordnung',
        'description','Fiktives DEV-Testfahrzeug. Kein echtes Kennzeichen oder Funkrufzeichen. Globale DEV-Administration als Testverwalter.',
        'active',true,'reservable',true,'unit_admin_enabled',i=1,'manager_ids',jsonb_build_array(admin_id),'usage_units',to_jsonb(allowed)));
      update public.vehicles set dev_seed_key=fixture where resource_id=target;
      perform ff_private.write_audit('dev_vehicle_fixture',null,null,null,jsonb_build_object('source','DEV060-vehicles','key',fixture,'vehicle_id',target));
    end if;
    ids:=array_append(ids,target);
  end loop;
  for i in 1..5 loop
    fixture:='DEV060-reservation-'||i;
    if exists(select 1 from public.vehicle_reservations where dev_seed_key=fixture) then continue; end if;
    perform set_config('request.jwt.claim.sub',case when i=5 then admin_id::text else member_id::text end,true);
    event:=(public.ff_request_vehicle(jsonb_build_object('vehicle_id',ids[case when i=5 then 1 else i end],
      'unit_id',pilot,'responsible_id',case when i=5 then admin_id else member_id end,
      'kind',case when i=5 then 'block' else 'reservation' end,
      'title','DEV synthetisch - '||case i when 1 then 'Offene Anfrage' when 2 then 'Genehmigte Lehrgangsfahrt'
        when 3 then 'Abgelehnte Anfrage' when 4 then 'Stornierte Nutzung' else 'Wartungssperrung' end,
      'description','Synthetische DEV-Reservierung; keine reale Nutzung','destination','','notes','DEV060 reproduzierbare Testdaten',
      'purpose_key',case when i=5 then null else 'course' end,
      'starts_at',((current_date+i+1)::timestamp+interval '9 hours') at time zone 'Europe/Berlin',
      'ends_at',((current_date+i+1)::timestamp+interval '11 hours') at time zone 'Europe/Berlin'))->>'id')::uuid;
    update public.vehicle_reservations set dev_seed_key=fixture where event_id=event;
    perform set_config('request.jwt.claim.sub',admin_id::text,true);
    if i=2 then perform public.ff_decide_vehicle(event,0,'APPROVED','Synthetische DEV-Genehmigung');
    elsif i=3 then perform public.ff_decide_vehicle(event,0,'REJECTED','Synthetische DEV-Ablehnung');
    elsif i=4 then
      perform public.ff_decide_vehicle(event,0,'APPROVED','Synthetische DEV-Genehmigung');
      perform public.ff_decide_vehicle(event,1,'CANCELLED','Synthetische DEV-Stornierung');
    end if;
    perform ff_private.write_audit('dev_vehicle_fixture',event,null,null,jsonb_build_object('source','DEV060-vehicles','key',fixture));
  end loop;
  perform set_config('request.jwt.claim.sub',previous_claim,true);
  return jsonb_build_object('vehicles',(select count(*) from public.vehicles where dev_seed_key like 'DEV060-vehicle-%'),
    'reservations',(select count(*) from public.vehicle_reservations where dev_seed_key like 'DEV060-reservation-%'));
end;
$$;
revoke all on function ff_private.seed_dev_vehicles(text) from public,anon,authenticated;
commit;
