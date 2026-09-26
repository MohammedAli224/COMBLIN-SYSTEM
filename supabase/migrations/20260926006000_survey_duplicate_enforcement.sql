-- Harden one_per_employee enforcement.
--
-- Why this migration exists. The previous one ended with
--
--   create unique index ... on survey_responses (survey_id, employee_code_hash)
--     where employee_code_hash is not null;
--
-- If even one duplicate pair already existed, that statement raised and, because
-- the Supabase SQL editor runs a file as one transaction, the whole file rolled
-- back, RPC included. The result is a database where submissions work and the
-- restriction silently does not. This version makes the migration succeed on a
-- database that already contains the duplicates it is meant to prevent.
--
-- Three changes:
--   1. Remove pre-existing duplicates before the index is built.
--   2. Translate a unique violation into duplicate_employee_code, so the index
--      rather than the earlier SELECT is the authority. The SELECT alone is a
--      time-of-check/time-of-use race: two submissions sent together can both
--      pass it and both insert.
--   3. Recreate the RPC so all of the above is actually in place.

-- 1. Deduplicate so the index below can be created.
--
--    Only rows with a hash are considered, so responses to open surveys (which
--    store a null hash) are never touched.
--
--    Survivors are chosen by id rather than by created_at on purpose: nothing
--    in this project reads survey_responses.created_at, so its existence cannot
--    be assumed. ids are unique, which makes the choice deterministic and the
--    migration idempotent, which is all the index needs. *Which* copy survives
--    is arbitrary and carries no meaning.
--
--    A temporary table is avoided for the same reason of idempotency: a
--    re-run inside the same SQL editor session would collide with the one left
--    by `on commit drop`. The id list is recomputed instead, and nothing else
--    writes to the table mid-transaction, so both statements see the same set.
do $$
declare
  v_removed integer;
begin
  select count(*) into v_removed
  from (
    select 1
    from (
      select
        row_number() over (
          partition by survey_id, employee_code_hash
          order by id
        ) as position_in_group
      from public.survey_responses
      where employee_code_hash is not null
    ) ranked
    where position_in_group > 1
  ) duplicates;

  raise notice 'survey_responses: % duplicate hashed responses found', v_removed;
end
$$;

-- Answers first: the response rows are referenced and may not cascade.
delete from public.survey_answers
where response_id in (
  select id
  from (
    select
      id,
      row_number() over (
        partition by survey_id, employee_code_hash
        order by id
      ) as position_in_group
    from public.survey_responses
    where employee_code_hash is not null
  ) ranked
  where position_in_group > 1
);

delete from public.survey_responses
where id in (
  select id
  from (
    select
      id,
      row_number() over (
        partition by survey_id, employee_code_hash
        order by id
      ) as position_in_group
    from public.survey_responses
    where employee_code_hash is not null
  ) ranked
  where position_in_group > 1
);

-- 2. The uniqueness backstop. Partial, so open surveys are unconstrained.
create unique index if not exists survey_responses_one_per_employee_key
  on public.survey_responses (survey_id, employee_code_hash)
  where employee_code_hash is not null;

-- 3. Drop every existing overload so the RPC call can never be ambiguous.
do $$
declare
  v_signature regprocedure;
begin
  for v_signature in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'submit_survey_response'
  loop
    raise notice 'dropping stale overload %', v_signature;
    execute format('drop function if exists %s', v_signature);
  end loop;
end
$$;

-- 4. The RPC. The policy gate and the duplicate check are unchanged; what is new
--    is that the insert is wrapped so a unique violation surfaces as
--    duplicate_employee_code instead of a generic 23505.
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

  -- Friendly early exit for the common case. The unique index below is the
  -- actual guarantee; this check only avoids reaching it.
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

  -- The index is the authority. Two submissions for the same code that arrive
  -- together both clear the SELECT above; only one can win this insert.
  begin
    insert into public.survey_responses (survey_id, employee_code_hash)
    values (p_survey_id, v_employee_code_hash)
    returning id into v_response_id;
  exception
    when unique_violation then
      raise exception 'duplicate_employee_code';
  end;

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

grant execute on function public.submit_survey_response(uuid, text, jsonb) to anon, authenticated;
revoke insert on public.survey_responses from anon, authenticated;
revoke insert on public.survey_answers from anon, authenticated;

-- 5. Report what is actually in place. Pasted into the SQL editor these notices
--    are the only way to tell a real fix from a migration that appeared to run.
--    Expect: the index found, and zero duplicate pairs remaining.
do $$
declare
  v_index text;
  v_responses integer;
  v_hashed integer;
  v_restricted integer;
begin
  select indexname into v_index
  from pg_indexes
  where schemaname = 'public'
    and indexname = 'survey_responses_one_per_employee_key';

  select count(*) into v_responses from public.survey_responses;
  select count(*) into v_hashed
  from public.survey_responses where employee_code_hash is not null;
  select count(*) into v_restricted
  from public.survey_responses r
  join public.surveys s on s.id = r.survey_id
  where s.response_policy = 'one_per_employee';

  raise notice 'one_per_employee index: %', coalesce(v_index, 'MISSING');
  raise notice 'responses: % total, % hashed, % on restricted surveys', v_responses, v_hashed, v_restricted;
end
$$;
