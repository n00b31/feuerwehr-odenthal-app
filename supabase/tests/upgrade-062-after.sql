begin;
do $$ begin if current_database()<>'ff_dev_ci' then raise exception 'Disposable CI required'; end if; end $$;
create function pg_temp.upgrade_ok(value boolean,label text) returns void language plpgsql as $$
begin
  if value is distinct from true then raise exception 'FAIL: %',label; end if;
  raise notice 'PASS: %',label;
end $$;
set request.jwt.claim.sub='a0622000-0000-4000-8000-000000000001';
set request.jwt.claim.role='authenticated';
set request.jwt.claims='{"iss":"https://orxinqhhbtjpkzwlfaxq.supabase.co/auth/v1"}';
select pg_temp.upgrade_ok(upgrade_test.original_data()=(select value from upgrade_test.snapshot where key='data'),
  'upgrade preserves every original Auth, role, membership, event, roster, RSVP, attendance, confirmation, booking and audit field');
select pg_temp.upgrade_ok(to_jsonb(ff_private.history_data_hash())=(select value from upgrade_test.snapshot where key='seed_hash'),
  'legacy registered history hash survives additive metadata without reset');
select pg_temp.upgrade_ok((select to_jsonb(x) from ff_private.dev_fixture_sets x where fixture_key='DEV041-HISTORY-V1')
  =(select value from upgrade_test.snapshot where key='fixture'),'registered fixture row is unchanged');
select pg_temp.upgrade_ok(public.ff_year_report(2025,'organization')
  =(select value from upgrade_test.snapshot where key='organization_report'),'organization dutybook and all report fields remain identical');
select pg_temp.upgrade_ok(public.ff_year_report(2025)
  =(select value from upgrade_test.snapshot where key='personal_report'),'personal legacy year report remains identical');
select pg_temp.upgrade_ok(public.ff_dev_personal_report(ff_private.history_id('member:scheuren:1'),2025)
  =(select value from upgrade_test.snapshot where key='seed_personal_report'),'non-login historical personal report remains identical');
select pg_temp.upgrade_ok(not exists(select 1 from public.event_roster where not included or invited),
  'legacy frozen roster flags remain included and not explicit');
select pg_temp.upgrade_ok(not exists(select 1 from public.vehicle_reservations q join public.events e on e.id=q.event_id
  where q.actor_id<>q.requester_id or q.starts_at<>e.starts_at or q.ends_at<>e.ends_at),
  'legacy self-request actors and canonical intervals are backfilled correctly');
select public.ff_dev_seed_history('orxinqhhbtjpkzwlfaxq','SEED DEV041-HISTORY-V1');
select pg_temp.upgrade_ok(upgrade_test.original_data()=(select value from upgrade_test.snapshot where key='data'),
  'repeating registered seed after upgrade is read-only');
update public.event_roster set included=false where event_id=ff_private.history_id('event:2025:scheuren:1')
  and user_id=ff_private.history_id('member:scheuren:1');
select pg_temp.upgrade_ok(to_jsonb(ff_private.history_data_hash())<>(select value from upgrade_test.snapshot where key='seed_hash'),
  'nondefault new roster metadata still triggers fixture drift detection');
rollback;
