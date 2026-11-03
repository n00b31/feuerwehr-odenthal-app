begin;

-- This reports the same live predicate used by RLS, not a mutable JWT/profile claim.
create function public.ff_my_access()
returns table(
  user_id uuid, display_name text, account_status public.ff_account_status,
  access_granted boolean, unit_id uuid, unit_name text, roles public.ff_role[]
)
language plpgsql stable security definer set search_path = '' as $$
declare allowed boolean;
begin
  perform ff_private.require_rule(auth.uid() is not null, 'Authenticated identity required');
  allowed := ff_private.is_active();
  return query
    select p.id, p.display_name, p.status, allowed, m.unit_id, u.name,
      case when allowed then array(
        select distinct r.role from public.role_assignments r
        where r.user_id = auth.uid() and r.revoked_at is null order by r.role
      ) else array[]::public.ff_role[] end
    from public.profiles p
    left join lateral (
      select um.unit_id from public.unit_memberships um
      where allowed and um.user_id = p.id and um.valid_from <= statement_timestamp()
        and (um.valid_until is null or um.valid_until > statement_timestamp())
      order by um.valid_from desc limit 1
    ) m on true
    left join public.units u on u.id = m.unit_id
    where p.id = auth.uid();
end;
$$;
revoke all on function public.ff_my_access() from public, anon, authenticated;
grant execute on function public.ff_my_access() to authenticated;

commit;
