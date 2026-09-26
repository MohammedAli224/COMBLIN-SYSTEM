-- Readable employee code on identified feedback, and a locked-down read path.
--
-- Decision change. The employee code used to be stored as a SHA-256 digest so
-- that nobody, including the admin, could read it back. That is reversed here
-- at the client's request: management needs to know who submitted a complaint
-- in order to act on it and follow up. The code is therefore stored as typed.
--
-- That decision has a consequence which is the reason this migration is mostly
-- about permissions rather than about the column. The digest made a leak
-- harmless. Plain text does not. The inbox and the dashboard both read the
-- feedback table directly through PostgREST, and no policy in this project
-- restricts that, so the table has to stop being readable through REST before it
-- can hold readable identifiers. Both read paths move behind admin-guarded
-- SECURITY DEFINER RPCs, and direct SELECT is revoked.
--
-- Grants are used rather than row level security on purpose. The current RLS
-- state of these tables is not known, and enabling RLS blind could lock the
-- public survey list out. A REVOKE is deterministic: it blocks the REST path
-- regardless of what RLS is doing, and RLS can only narrow things further.
--
-- Scope note: surveys are untouched. A survey code is a de-duplication key, so
-- it stays hashed; nobody needs to read it back to count respondents.

-- 1. Swap the column. The constraint is dropped first because it references
--    employee_code_hash, and dropping a column a constraint depends on fails
--    without CASCADE.
alter table public.feedback drop constraint if exists feedback_identity_all_or_none;
alter table public.feedback add column if not exists employee_code text;

-- The digest is dropped rather than kept. It is unreadable, so it holds no
-- information worth preserving, and leaving it invites a future reader to
-- assume the code is still protected.
alter table public.feedback drop column if exists employee_code_hash;
alter table public.feedback alter column employee_code drop not null;

-- Same all-or-nothing rule as before, now over employee_code. NOT VALID skips
-- the scan of rows written under the previous column set, and is still
-- enforced on every insert and update from here on.
alter table public.feedback
  add constraint feedback_identity_all_or_none
  check (
    (name is null and employee_code is null and department is null)
    or (name is not null and employee_code is not null and department is not null)
  ) not valid;

-- 2. Drop every existing overload of each function redefined below. The
--    submit_feedback parameter name changes but its types do not, and parameter
--    names are not part of a function's identity, so CREATE OR REPLACE alone
--    would leave a stale same-signature variant in place.
do $$
declare
  v_signature regprocedure;
begin
  for v_signature in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'submit_feedback',
        'admin_get_feedback',
        'admin_get_dashboard_metrics'
      )
  loop
    raise notice 'dropping stale overload %', v_signature;
    execute format('drop function if exists %s', v_signature);
  end loop;
end
$$;

-- 3. The submission RPC. The code is stored exactly as typed, apart from
--    trimming, so the admin sees what the nurse typed. It is deliberately NOT
--    lowercased: that normalisation exists for the survey digest, where case
--    must not create two identities, and it would make a displayed code differ
--    from the submitted one.
create or replace function public.submit_feedback(
  p_description text,
  p_department text default null,
  p_name text default null,
  p_employee_code text default null,
  p_attachment_path text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_description text;
  v_department text;
  v_name text;
  v_employee_code text;
  v_provided integer;
begin
  v_description := btrim(coalesce(p_description, ''));

  if length(v_description) < 10 then
    raise exception 'description_too_short';
  end if;

  if length(v_description) > 1000 then
    raise exception 'description_too_long';
  end if;

  v_name := nullif(btrim(coalesce(p_name, '')), '');
  v_department := nullif(btrim(coalesce(p_department, '')), '');
  v_employee_code := nullif(btrim(coalesce(p_employee_code, '')), '');

  -- Bounded because the value is rendered in the admin panel, and control
  -- characters are rejected because a code containing a newline would break
  -- that layout and cannot be a real badge number.
  if v_employee_code is not null then
    if length(v_employee_code) > 64 then
      raise exception 'invalid_employee_code';
    end if;

    if v_employee_code ~ '[[:cntrl:]]' then
      raise exception 'invalid_employee_code';
    end if;
  end if;

  if v_department is not null
     and v_department not in ('critical', 'floor', 'ambulatory') then
    raise exception 'invalid_department';
  end if;

  v_provided := (case when v_name is not null then 1 else 0 end)
              + (case when v_employee_code is not null then 1 else 0 end)
              + (case when v_department is not null then 1 else 0 end);

  if v_provided not in (0, 3) then
    raise exception 'incomplete_identity';
  end if;

  insert into public.feedback (
    description, department, name, employee_code, attachment_path
  ) values (
    v_description,
    v_department,
    v_name,
    v_employee_code,
    nullif(btrim(coalesce(p_attachment_path, '')), '')
  )
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.submit_feedback(text, text, text, text, text) to anon, authenticated;
revoke insert on public.feedback from anon, authenticated;

-- 4. Inbox read. Replaces supabase.from("feedback").select("*"), which any
--    caller with the anon or authenticated key could otherwise repeat.
--    p_since is the timeframe filter the inbox already applied client side on
--    the server; null means no lower bound.
create or replace function public.admin_get_feedback(p_since timestamptz default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows jsonb;
begin
  if not exists (
    select 1
    from public.admin_users au
    where au.user_id::text = auth.uid()::text
  ) then
    raise exception 'not_authorized';
  end if;

  select coalesce(jsonb_agg(to_jsonb(f) order by f.created_at desc), '[]'::jsonb)
    into v_rows
  from public.feedback f
  where p_since is null or f.created_at >= p_since;

  return v_rows;
end;
$$;

grant execute on function public.admin_get_feedback(timestamptz) to authenticated;
revoke execute on function public.admin_get_feedback(timestamptz) from anon;

-- 5. Dashboard counters. Replaces three direct counts on feedback plus the
--    count on survey_responses, which was a pre-existing exposure of the hashed
--    survey codes. The month boundary is computed in UTC to match what the
--    browser was doing, so the number does not shift with the server timezone.
create or replace function public.admin_get_dashboard_metrics()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_month_start timestamptz;
  v_feedback_total bigint;
  v_feedback_month bigint;
  v_active_surveys bigint;
  v_responses_total bigint;
  v_critical bigint;
  v_floor bigint;
  v_ambulatory bigint;
begin
  if not exists (
    select 1
    from public.admin_users au
    where au.user_id::text = auth.uid()::text
  ) then
    raise exception 'not_authorized';
  end if;

  v_month_start := (date_trunc('month', now() at time zone 'utc')) at time zone 'utc';

  select count(*) into v_feedback_total from public.feedback;
  select count(*) into v_feedback_month
  from public.feedback where created_at >= v_month_start;
  select count(*) into v_active_surveys
  from public.surveys where status = 'published';
  select count(*) into v_responses_total from public.survey_responses;

  select
    count(*) filter (where department = 'critical'),
    count(*) filter (where department = 'floor'),
    count(*) filter (where department = 'ambulatory')
  into v_critical, v_floor, v_ambulatory
  from public.feedback;

  return jsonb_build_object(
    'feedbackTotal', v_feedback_total,
    'feedbackThisMonth', v_feedback_month,
    'activeSurveys', v_active_surveys,
    'responsesTotal', v_responses_total,
    'byDepartment', jsonb_build_object(
      'critical', v_critical,
      'floor', v_floor,
      'ambulatory', v_ambulatory
    )
  );
end;
$$;

grant execute on function public.admin_get_dashboard_metrics() to authenticated;
revoke execute on function public.admin_get_dashboard_metrics() from anon;

-- 6. Close the direct read path on both tables now that the RPCs above are the
--    supported way in. SECURITY DEFINER keeps the RPCs working.
--
--    public.surveys is deliberately NOT revoked: the published survey list is
--    public and anonymous visitors need to read it. Note that this also means a
--    direct REST read can still see draft and closed surveys by omitting the
--    status filter. That is a separate pre-existing issue and is called out
--    rather than changed here, because the fix needs a public read policy whose
--    shape depends on the RLS state of the table.
revoke select on public.feedback from anon, authenticated;
revoke select on public.survey_responses from anon, authenticated;
