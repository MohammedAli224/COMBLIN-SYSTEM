-- Survey responses: conditional employee-code hashing, policy aware.
--
-- Rewritten after ERROR 42703 (column "employee_code" does not exist). The
-- earlier version backfilled from a survey_responses.employee_code column that
-- this database does not have, so the UPDATE aborted mid-migration. This
-- version assumes nothing about the old shape: it adds the hashed column and
-- only migrates legacy plain text when such a column is genuinely present.
--
-- Business rule: the employee code is required, hashed, and de-duplicated ONLY
-- when the survey's response_policy is 'one_per_employee'. An 'open' survey
-- stores a null hash and is never checked for duplicates.
--
-- Verified against the live schema:
--   survey_answers(id, response_id, question_id, option_ids, rating,
--                  boolean_value, text_value)
--   option_ids is uuid[]. There is no single option_id column.

create extension if not exists pgcrypto;

-- 1. Hashed column. Idempotent, so it repairs the earlier partial run.
alter table public.survey_responses
  add column if not exists employee_code_hash text;

-- 2. Legacy backfill, guarded by a real catalog lookup.
--    Emits a notice and skips when no plain text column exists.
do $$
declare
  v_legacy text;
begin
  select a.attname into v_legacy
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'survey_responses'
    and a.attname in ('employee_code', 'employee_id', 'staff_code')
    and a.attnum > 0
    and not a.attisdropped
  order by a.attname
  limit 1;

  if v_legacy is null then
    raise notice 'survey_responses: no legacy employee code column, skipping backfill';
    return;
  end if;

  raise notice 'survey_responses: backfilling from legacy column %', v_legacy;
  execute format(
    'update public.survey_responses
        set employee_code_hash = encode(
              digest(nullif(lower(btrim(coalesce(%I, ''''), E'' \t\n\r'')), ''''), ''sha256''),
              ''hex''
            )
      where %I is not null
        and employee_code_hash is null',
    v_legacy, v_legacy
  );
end
$$;

-- 3. Drop the legacy plain text column, if one was found.
do $$
declare
  v_legacy text;
begin
  foreach v_legacy in array array['employee_code', 'employee_id', 'staff_code'] loop
    if exists (
      select 1 from pg_attribute
      where attrelid = 'public.survey_responses'::regclass
        and attname = v_legacy and not attisdropped
    ) then
      raise notice 'survey_responses: dropping legacy column %', v_legacy;
      execute format('alter table public.survey_responses drop column if exists %I', v_legacy);
    end if;
  end loop;
end
$$;

-- 4. Remove every existing overload so the RPC call can never be ambiguous.
--    Parameter names are not part of a function's identity, so a leftover
--    (uuid, text, jsonb) variant from an earlier run would silently win.
do $$
declare
  v_signature regprocedure;
begin
  for v_signature in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'submit_survey_response'
  loop
    raise notice 'dropping stale overload %', v_signature;
    execute format('drop function if exists %s', v_signature);
  end loop;
end
$$;

-- 5. Policy-aware RPC, written in full.
create or replace function public.submit_survey_response(
  p_survey_id uuid,
  p_employee_code_hash text,
  p_answers jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_response_id uuid;
  v_employee_code_hash text;
  v_requires_code boolean := false;
  v_option_ids uuid[];
  v_rating integer;
  v_boolean boolean;
  v_text text;
  v_elem jsonb;
  v_question_id uuid;
begin
  if p_survey_id is null then
    raise exception 'invalid_survey';
  end if;

  -- A response is only accepted for a published survey.
  select (s.response_policy = 'one_per_employee') into v_requires_code
  from public.surveys s
  where s.id = p_survey_id
    and s.status = 'published';

  if v_requires_code is null then
    raise exception 'survey_not_available';
  end if;

  -- Normalize as the browser does, then require a well formed digest so a
  -- malformed value is rejected instead of silently stored.
  v_employee_code_hash := nullif(lower(btrim(coalesce(p_employee_code_hash, ''))), '');
  if v_employee_code_hash is not null
     and v_employee_code_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_employee_code_hash';
  end if;

  -- Required only for one_per_employee.
  if v_requires_code and v_employee_code_hash is null then
    raise exception 'employee_code_required';
  end if;

  -- Duplicate check only where the policy actually demands uniqueness.
  if v_requires_code then
    if exists (
      select 1
      from public.survey_responses
      where survey_id = p_survey_id
        and employee_code_hash = v_employee_code_hash
    ) then
      raise exception 'duplicate_employee_code';
    end if;
  end if;

  insert into public.survey_responses (survey_id, employee_code_hash)
  values (p_survey_id, v_employee_code_hash)
  returning id into v_response_id;

  for v_elem in select elem from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb)) as elem loop
    v_question_id := nullif(v_elem ->> 'questionId', '')::uuid;
    -- Skip answers for questions that do not belong to this survey, rather than
    -- failing the whole submission.
    if v_question_id is null or not exists (
      select 1 from public.survey_questions q
      where q.id = v_question_id and q.survey_id = p_survey_id
    ) then
      continue;
    end if;

    v_option_ids := null;
    v_rating := null;
    v_boolean := null;
    v_text := null;

    if v_elem ? 'optionIds' and jsonb_typeof(v_elem -> 'optionIds') = 'array' then
      select array_agg(t::uuid)
        into v_option_ids
        from jsonb_array_elements_text(v_elem -> 'optionIds') as t;
    end if;

    v_rating := nullif(v_elem ->> 'rating', '')::integer;
    v_boolean := (v_elem ->> 'booleanValue')::boolean;
    v_text := nullif(v_elem ->> 'textValue', '');

    insert into public.survey_answers (
      response_id, question_id, option_ids, rating, boolean_value, text_value
    ) values (
      v_response_id, v_question_id, v_option_ids, v_rating, v_boolean, v_text
    );
  end loop;

  return v_response_id;
end;
$$;

-- 6. Grants. The RPC is SECURITY DEFINER, so revoking direct table writes does
--    not affect it; it only closes off the bypass path.
grant execute on function public.submit_survey_response(uuid, text, jsonb) to anon, authenticated;
revoke insert on public.survey_responses from anon, authenticated;
revoke insert on public.survey_answers from anon, authenticated;

-- 7. Uniqueness backstop, partial so open surveys (null hash) are unconstrained.
create unique index if not exists survey_responses_one_per_employee_key
  on public.survey_responses (survey_id, employee_code_hash)
  where employee_code_hash is not null;
