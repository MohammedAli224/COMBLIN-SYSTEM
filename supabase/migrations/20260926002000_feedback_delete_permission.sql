-- Admin feedback deletion.
--
-- Why an RPC instead of supabase.from("feedback").delete() from the browser:
-- admin access in the app is decided by a client-side lookup of admin_users
-- (see src/auth/AuthContext.tsx) plus a route guard. Neither is a security
-- boundary. A direct DELETE would be authorized by whatever RLS policy happens
-- to exist on the feedback table, so any authenticated user who can reach the
-- REST endpoint could delete records regardless of the UI.
--
-- This function re-checks admin_users server-side using auth.uid(), which is
-- read from the caller's JWT. It is SECURITY DEFINER, so it bypasses RLS on the
-- table, and the revoke at the bottom closes the direct-delete path so the RPC
-- is the only way in.

-- 1. Refuse to install if the id column is not a uuid, instead of failing later
--    inside the function where the cause would be hard to read.
do $$
declare
  v_type text;
begin
  select a.atttypid::regtype::text into v_type
  from pg_attribute a
  where a.attrelid = 'public.feedback'::regclass
    and a.attname = 'id'
    and a.attnum > 0
    and not a.attisdropped;

  if v_type is distinct from 'uuid' then
    raise exception 'public.feedback.id is %, but this migration expects uuid', v_type;
  end if;
end
$$;

-- 2. Drop any previous overload so the RPC call can never be ambiguous.
do $$
declare
  v_signature regprocedure;
begin
  for v_signature in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'delete_feedback'
  loop
    raise notice 'dropping stale overload %', v_signature;
    execute format('drop function if exists %s', v_signature);
  end loop;
end
$$;

-- 3. The RPC. Anonymous callers are refused by the admin check itself, since
--    auth.uid() is null for them and can never match a row in admin_users.
create or replace function public.delete_feedback(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_id is null then
    raise exception 'invalid_feedback_id';
  end if;

  if not exists (
    select 1
    from public.admin_users au
    where au.user_id::text = auth.uid()::text
  ) then
    raise exception 'not_authorized';
  end if;

  delete from public.feedback where id = p_id;

  if not found then
    raise exception 'feedback_not_found';
  end if;

  return true;
end;
$$;

-- 4. Grants. Authenticated only; anon is refused explicitly rather than left
--    to rely on the admin_users check.
grant execute on function public.delete_feedback(uuid) to authenticated;
revoke execute on function public.delete_feedback(uuid) from anon;

-- 5. Close the direct path. The RPC is SECURITY DEFINER and runs as the owner,
--    so it keeps working after this revoke.
revoke delete on public.feedback from anon, authenticated;
