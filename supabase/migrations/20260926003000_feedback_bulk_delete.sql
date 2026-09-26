-- Bulk deletion of feedback records for administrators.
--
-- A single transaction rather than a loop of delete_feedback calls from the
-- browser: one round trip, and a partial failure cannot leave half the batch
-- deleted with the UI reporting an error.
--
-- Authorization is identical to delete_feedback and re-checked here rather
-- than trusted from the client, because admin access in the app is decided by
-- a client-side admin_users lookup plus a route guard, neither of which is a
-- security boundary.

-- 1. Drop any previous overload so the RPC call can never be ambiguous.
do $$
declare
  v_signature regprocedure;
begin
  for v_signature in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'delete_feedback_bulk'
  loop
    raise notice 'dropping stale overload %', v_signature;
    execute format('drop function if exists %s', v_signature);
  end loop;
end
$$;

-- 2. The RPC. Returns the number of rows actually removed, which can be lower
--    than the number of ids sent if some were already gone.
create or replace function public.delete_feedback_bulk(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  -- Authorize before validating input, so a non-admin learns nothing about
  -- the shape of the request.
  if not exists (
    select 1
    from public.admin_users au
    where au.user_id::text = auth.uid()::text
  ) then
    raise exception 'not_authorized';
  end if;

  if p_ids is null or cardinality(p_ids) = 0 then
    raise exception 'no_feedback_selected';
  end if;

  -- A hard ceiling so a crafted call cannot turn into an unbounded delete.
  -- The inbox never presents more than this in one selection.
  if cardinality(p_ids) > 500 then
    raise exception 'too_many_feedback_selected';
  end if;

  delete from public.feedback where id = any(p_ids);
  get diagnostics v_deleted = row_count;

  return v_deleted;
end;
$$;

-- 3. Grants. Authenticated only; the admin check refuses anon regardless.
grant execute on function public.delete_feedback_bulk(uuid[]) to authenticated;
revoke execute on function public.delete_feedback_bulk(uuid[]) from anon;

-- 4. Re-assert the revoke in case this migration is applied on its own or out
--    of order. SECURITY DEFINER runs as the owner, so the RPC is unaffected.
revoke delete on public.feedback from anon, authenticated;
