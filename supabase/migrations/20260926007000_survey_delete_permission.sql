-- Admin survey deletion.
--
-- Same reasoning as 20260926002000_feedback_delete_permission.sql: the app's
-- admin check is a client-side admin_users lookup plus a route guard, neither of
-- which is a security boundary. Deleting a survey must therefore re-check
-- admin_users server-side against auth.uid(), and the direct DELETE privilege
-- is revoked so the RPC is the only path in.
--
-- The five tables are deleted in dependency order rather than relying on
-- ON DELETE CASCADE. The live schema is not known to declare cascading foreign
-- keys, and a delete that assumes a cascade which is not there would delete the
-- survey and leave orphaned questions and answers behind.

-- 1. Refuse to install if the id column is not a uuid, so a mismatch surfaces
--    here rather than as an obscure failure inside the function.
do $$
declare
  v_type text;
begin
  select a.atttypid::regtype::text into v_type
  from pg_attribute a
  where a.attrelid = 'public.surveys'::regclass
    and a.attname = 'id'
    and a.attnum > 0
    and not a.attisdropped;

  if v_type is distinct from 'uuid' then
    raise exception 'public.surveys.id is %, but this migration expects uuid', v_type;
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
    where n.nspname = 'public' and p.proname = 'admin_delete_survey'
  loop
    raise notice 'dropping stale overload %', v_signature;
    execute format('drop function if exists %s', v_signature);
  end loop;
end
$$;

-- 3. The RPC. Returns the number of rows removed from each table so the caller
--    can report what actually went, rather than echoing a count that may have
--    been read before something else changed.
create or replace function public.admin_delete_survey(p_survey_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_answers integer := 0;
  v_responses integer := 0;
  v_options integer := 0;
  v_questions integer := 0;
begin
  if p_survey_id is null then
    raise exception 'invalid_survey';
  end if;

  -- Checked before the survey is looked up, so a non-admin cannot use the error
  -- difference to probe which survey ids exist.
  if not exists (
    select 1
    from public.admin_users au
    where au.user_id::text = auth.uid()::text
  ) then
    raise exception 'not_authorized';
  end if;

  if not exists (select 1 from public.surveys s where s.id = p_survey_id) then
    raise exception 'survey_not_found';
  end if;

  -- Answers first: they reference both a response and a question.
  delete from public.survey_answers
  where response_id in (select r.id from public.survey_responses r where r.survey_id = p_survey_id)
     or question_id in (select q.id from public.survey_questions q where q.survey_id = p_survey_id);
  get diagnostics v_answers = row_count;

  delete from public.survey_responses where survey_id = p_survey_id;
  get diagnostics v_responses = row_count;

  delete from public.survey_options
  where question_id in (select q.id from public.survey_questions q where q.survey_id = p_survey_id);
  get diagnostics v_options = row_count;

  delete from public.survey_questions where survey_id = p_survey_id;
  get diagnostics v_questions = row_count;

  delete from public.surveys where id = p_survey_id;

  return jsonb_build_object(
    'answers', v_answers,
    'responses', v_responses,
    'options', v_options,
    'questions', v_questions
  );
end;
$$;

grant execute on function public.admin_delete_survey(uuid) to authenticated;
revoke execute on function public.admin_delete_survey(uuid) from anon;

-- 4. Close the direct path on every table in the chain. The RPC is SECURITY
--    DEFINER and runs as the owner, so it keeps working after these revokes.
--
--    Note: createSurvey() in src/services/surveyService.ts used to roll back a
--    partially created survey with a direct delete on public.surveys. That call
--    is now routed through admin_delete_survey, because leaving delete granted on
--    surveys just to serve a rollback would hand any authenticated user the
--    ability to remove published surveys.
revoke delete on public.surveys from anon, authenticated;
revoke delete on public.survey_questions from anon, authenticated;
revoke delete on public.survey_options from anon, authenticated;
revoke delete on public.survey_responses from anon, authenticated;
revoke delete on public.survey_answers from anon, authenticated;
