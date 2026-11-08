begin;

lock table public.calendar_resources in share row exclusive mode;
do $$
declare target record; created public.calendar_resources;
begin
  if exists(select 1 from public.calendar_resources where resource_type='building' and unit_id is not null
    group by unit_id having count(*)>1) then
    raise exception 'Mehrere Gerätehäuser für eine Einheit vorhanden. Bestehende Ressourcen zuerst kontrolliert prüfen.';
  end if;
  for target in select id,name from public.units order by id loop
    if not exists(select 1 from public.calendar_resources where unit_id=target.id and resource_type='building') then
      insert into public.calendar_resources(name,resource_type,unit_id,active)
        values('Gerätehaus '||target.name,'building',target.id,true) returning * into created;
      perform ff_private.write_audit('calendar_resource_saved',null,null,null,
        to_jsonb(created)||jsonb_build_object('source','DEV051-firestations','unit_name',target.name),
        'Fehlendes Gerätehaus aus bestehenden Einheitsstammdaten ergänzt.');
    end if;
  end loop;
end;
$$;

commit;
