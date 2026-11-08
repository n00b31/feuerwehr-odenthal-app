do $$ begin
  if current_database()<>'ff_dev_ci' then raise exception 'Disposable CI required'; end if;
  if upgrade_test.data_063() is distinct from (select value from upgrade_test.snapshot where key='063_data')
    or public.ff_year_report(2025,'organization') is distinct from (select value from upgrade_test.snapshot where key='063_report')
    or to_jsonb(ff_private.history_data_hash()) is distinct from (select value from upgrade_test.snapshot where key='063_hash')
  then raise exception '063 upgrade changed existing data, series, frozen attendance, report or registered hash'; end if;
  raise notice 'PASS: 062 to 063 migration preserves all original fields, legacy series instances, reports and historical hash';
end $$;
