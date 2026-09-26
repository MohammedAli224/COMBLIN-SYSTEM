-- Per-survey response counts for the admin panel.
--
-- Why this exists. Migration 20260926008000 revoked direct SELECT on
-- public.survey_responses, so the admin could no longer read responses or
-- count them. Two call sites were relying on PostgREST embedding to count:
--
--   .select("*, survey_responses(count)")
--
-- PostgREST needs SELECT on the embedded table to resolve that, so both the
-- survey list and the single-survey load in the admin panel were going to fail
-- with a permission error the moment 08000 was applied. Restoring the grant
-- would undo that hardening, so the counts move behind a SECURITY DEFINER
-- function instead, alongside admin_get_feedback and admin_get_dashboard_metrics.
--
-- Returns a jsonb object keyed by survey id rather than an array, because every
-- caller is looking up the count of a survey it already has in hand. A survey
-- with no responses is present with a count of 0, which is what a left join
-- produces, so the caller never has to distinguish "no responses" from
-- "unknown survey".
--
-- Grants, not row level security, for the same reason as the other admin RPCs:
-- the current RLS state of this schema is not known from the project files, and
-- a REVOKE is deterministic where enabling RLS blind is not.

-- 1. Drop any previous overload so the RPC call can never be ambiguous.
do $$
declare
  v_signature regprocedure;
begin
  for v_signature in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'admin_get_survey_response_counts'
  loop
    raise notice 'dropping stale overload %', v_signature;
    execute format('drop function if exists %s', v_signature);
  end loop;
end
$$;

-- 2. The RPC. Read only, so it is marked stable and never needs an EXECUTE
--    block of its own beyond the grants below.
create or replace function public.admin_get_survey_response_counts()
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  -- Same admin_users check as the other admin RPCs. auth.uid() is null for an
  -- anonymous caller, which matches no row, so the revoke below is not the only
  -- thing standing between this data and the public.
  if not exists (
    select 1
    from public.admin_users au
    where au.user_id::text = auth.uid()::text
  ) then
    raise exception 'not_authorized';
  end if;

  -- Counting from the responses table directly rather than from a count over
  -- an embedded select: this is the only place left that is allowed to read
  -- survey_responses, so it is also the only place the number can come from.
  return coalesce(
    (
      select jsonb_object_agg(v.survey_id::text, to_jsonb(v.total))
      from (
        select s.id as survey_id, count(r.id) as total
        from public.surveys s
        left join public.survey_responses r on r.survey_id = s.id
        group by s.id
      ) v
    ),
    '{}'::jsonb
  );
end;
$$;

grant execute on function public.admin_get_survey_response_counts() to authenticated;
revoke execute on function public.admin_get_survey_response_counts() from anon;
