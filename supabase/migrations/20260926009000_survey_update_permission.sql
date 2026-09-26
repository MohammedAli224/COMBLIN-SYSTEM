-- Admin survey editing.
--
-- Why an RPC. Two reasons, one of them forced.
--
--   1. Direct DELETE on survey_questions and survey_options was revoked in
--      20260926007000, because leaving it granted would let any authenticated
--      user delete published surveys. Removing a question or an option is a
--      delete, so it has to be a SECURITY DEFINER function to work at all.
--   2. An edit is several statements: the survey row, every question, every
--      option, plus deletions for whatever the admin removed. Run as separate
--      calls from the browser, a failure halfway through leaves a survey whose
--      questions no longer match its answers. One function is one transaction,
--      so it either fully applies or changes nothing.
--
-- The contract is declarative: the caller sends the full desired state and the
-- database reconciles towards it. Questions and options carry their existing id
-- so unchanged rows are updated in place rather than recreated, which matters
-- because survey_answers.question_id and option_ids point at those ids.
--
-- Two guards protect recorded data, and they raise rather than silently
-- damaging it:
--
--   question_has_answers  a question that has answers cannot be deleted
--   option_has_answers    an option that has been chosen cannot be deleted
--
-- The second one also fires when a question is converted away from a choice
-- type, because that drops the question's options. Rewording a question is
-- always allowed. Restructuring one that already has data is not, and the only
-- way to do that is to create a new survey.

-- 1. Drop any previous overload so the RPC call can never be ambiguous.
do $$
declare
  v_signature regprocedure;
begin
  for v_signature in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'admin_update_survey'
  loop
    raise notice 'dropping stale overload %', v_signature;
    execute format('drop function if exists %s', v_signature);
  end loop;
end
$$;

-- 2. The RPC. Returns a count of what changed, so the caller can report the
--    real outcome rather than assuming the save applied.
create or replace function public.admin_update_survey(
  p_survey_id uuid,
  p_survey jsonb,
  p_questions jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title_ar text;
  v_title_en text;
  v_description_ar text;
  v_description_en text;
  v_response_policy text;
  v_question jsonb;
  v_option jsonb;
  v_question_id uuid;
  v_option_id uuid;
  v_question_type text;
  v_question_title_ar text;
  v_question_title_en text;
  v_is_required boolean;
  v_label_ar text;
  v_label_en text;
  v_options_json jsonb;
  v_kept_question_ids uuid[] := '{}'::uuid[];
  v_kept_option_ids uuid[];
  v_dropped_question_id uuid;
  v_dropped_option_id uuid;
  v_question_position integer := 0;
  v_option_position integer;
  v_added_questions integer := 0;
  v_updated_questions integer := 0;
  v_removed_questions integer := 0;
  v_added_options integer := 0;
  v_updated_options integer := 0;
  v_removed_options integer := 0;
begin
  if p_survey_id is null then
    raise exception 'invalid_survey';
  end if;

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

  -- 3. Survey fields. The slug is deliberately absent: it is the public URL and
  --    is generated once at creation, so renaming it would break links that
  --    have already been shared.
  v_title_ar := btrim(coalesce(p_survey ->> 'title_ar', ''));
  v_title_en := btrim(coalesce(p_survey ->> 'title_en', ''));
  v_description_ar := nullif(btrim(coalesce(p_survey ->> 'description_ar', '')), '');
  v_description_en := nullif(btrim(coalesce(p_survey ->> 'description_en', '')), '');
  v_response_policy := coalesce(p_survey ->> 'response_policy', 'open');

  if length(v_title_ar) = 0 or length(v_title_en) = 0
     or length(v_title_ar) > 300 or length(v_title_en) > 300 then
    raise exception 'invalid_survey_title';
  end if;

  if length(coalesce(v_description_ar, '')) > 2000
     or length(coalesce(v_description_en, '')) > 2000 then
    raise exception 'invalid_description';
  end if;

  if v_response_policy not in ('open', 'one_per_employee') then
    raise exception 'invalid_response_policy';
  end if;

  -- 4. Every question id in the payload must already belong to this survey.
  --    Checked before anything is written. Option ids are not checked here
  --    because an option on a brand new question has no question to belong to
  --    yet; those are verified inline, once the parent id is known.
  for v_question in select * from jsonb_array_elements(coalesce(p_questions, '[]'::jsonb)) loop
    if nullif(v_question ->> 'id', '') is not null then
      if not exists (
        select 1
        from public.survey_questions q
        where q.id = (v_question ->> 'id')::uuid
          and q.survey_id = p_survey_id
      ) then
        raise exception 'question_not_in_survey';
      end if;
    end if;
  end loop;

  update public.surveys
  set title_ar = v_title_ar,
      title_en = v_title_en,
      description_ar = v_description_ar,
      description_en = v_description_en,
      response_policy = v_response_policy,
      updated_at = now()
  where id = p_survey_id;

  -- 5. Questions, in payload order. position is renumbered from the array
  --    index, so reordering in the form is all it takes to reorder the survey.
  v_question_position := 0;

  for v_question in select * from jsonb_array_elements(coalesce(p_questions, '[]'::jsonb)) loop
    v_question_position := v_question_position + 1;
    v_question_id := nullif(v_question ->> 'id', '')::uuid;
    v_question_type := v_question ->> 'type';
    v_question_title_ar := btrim(coalesce(v_question ->> 'title_ar', ''));
    v_question_title_en := btrim(coalesce(v_question ->> 'title_en', ''));
    v_is_required := coalesce((v_question ->> 'is_required')::boolean, true);

    if v_question_type is null
       or v_question_type not in ('single_choice', 'multiple_choice', 'rating', 'yes_no', 'free_text') then
      raise exception 'invalid_question_type';
    end if;

    if length(v_question_title_ar) = 0 or length(v_question_title_en) = 0
       or length(v_question_title_ar) > 300 or length(v_question_title_en) > 300 then
      raise exception 'invalid_question_text';
    end if;

    if v_question_id is null then
      insert into public.survey_questions (survey_id, type, title_ar, title_en, is_required, position)
      values (p_survey_id, v_question_type, v_question_title_ar, v_question_title_en, v_is_required, v_question_position)
      returning id into v_question_id;
      v_added_questions := v_added_questions + 1;
    else
      update public.survey_questions
      set type = v_question_type,
          title_ar = v_question_title_ar,
          title_en = v_question_title_en,
          is_required = v_is_required,
          position = v_question_position
      where id = v_question_id;
      v_updated_questions := v_updated_questions + 1;
    end if;

    v_kept_question_ids := array_append(v_kept_question_ids, v_question_id);

    -- Treated as an empty list when absent or not an array. jsonb_array_length
    -- raises on a scalar, and a JSON null here would otherwise turn a
    -- malformed payload into an opaque database error instead of a clean one.
    v_options_json := case
      when jsonb_typeof(v_question -> 'options') = 'array' then v_question -> 'options'
      else '[]'::jsonb
    end;

    -- A choice question with fewer than two options cannot be answered
    -- meaningfully. Options are ignored entirely for the other types, which is
    -- also what lets a choice question be converted to a free text one.
    if v_question_type in ('single_choice', 'multiple_choice')
       and jsonb_array_length(v_options_json) < 2 then
      raise exception 'too_few_options';
    end if;

    v_kept_option_ids := '{}'::uuid[];
    v_option_position := 0;

    for v_option in select * from jsonb_array_elements(v_options_json) loop
      v_option_position := v_option_position + 1;
      v_option_id := nullif(v_option ->> 'id', '')::uuid;
      v_label_ar := btrim(coalesce(v_option ->> 'label_ar', ''));
      v_label_en := btrim(coalesce(v_option ->> 'label_en', ''));

      if length(v_label_ar) = 0 or length(v_label_en) = 0
         or length(v_label_ar) > 300 or length(v_label_en) > 300 then
        raise exception 'invalid_option_text';
      end if;

      if v_option_id is null then
        insert into public.survey_options (question_id, label_ar, label_en, position)
        values (v_question_id, v_label_ar, v_label_en, v_option_position)
        returning id into v_option_id;
        v_added_options := v_added_options + 1;
      else
        if not exists (
          select 1 from public.survey_options o
          where o.id = v_option_id and o.question_id = v_question_id
        ) then
          raise exception 'option_not_in_question';
        end if;

        update public.survey_options
        set label_ar = v_label_ar,
            label_en = v_label_en,
            position = v_option_position
        where id = v_option_id;
        v_updated_options := v_updated_options + 1;
      end if;

      v_kept_option_ids := array_append(v_kept_option_ids, v_option_id);
    end loop;

    -- Options dropped from this question, either explicitly or because the type
    -- is no longer a choice type.
    for v_dropped_option_id in
      select o.id
      from public.survey_options o
      where o.question_id = v_question_id
        and not (o.id = any(v_kept_option_ids))
    loop
      if exists (
        select 1
        from public.survey_answers a
        where a.question_id = v_question_id
          and v_dropped_option_id = any(a.option_ids)
      ) then
        raise exception 'option_has_answers';
      end if;

      delete from public.survey_options where id = v_dropped_option_id;
      v_removed_options := v_removed_options + 1;
    end loop;
  end loop;

  -- 6. Questions the admin removed from the form. Answers referencing one of
  --    these stop the whole edit rather than leaving a dangling question_id.
  for v_dropped_question_id in
    select q.id
    from public.survey_questions q
    where q.survey_id = p_survey_id
      and not (q.id = any(v_kept_question_ids))
  loop
    if exists (
      select 1 from public.survey_answers a where a.question_id = v_dropped_question_id
    ) then
      raise exception 'question_has_answers';
    end if;

    -- Options first: they reference the question and may not cascade.
    delete from public.survey_options where question_id = v_dropped_question_id;
    delete from public.survey_questions where id = v_dropped_question_id;
    v_removed_questions := v_removed_questions + 1;
  end loop;

  return jsonb_build_object(
    'questionsAdded', v_added_questions,
    'questionsUpdated', v_updated_questions,
    'questionsRemoved', v_removed_questions,
    'optionsAdded', v_added_options,
    'optionsUpdated', v_updated_options,
    'optionsRemoved', v_removed_options
  );
end;
$$;

grant execute on function public.admin_update_survey(uuid, jsonb, jsonb) to authenticated;
revoke execute on function public.admin_update_survey(uuid, jsonb, jsonb) from anon;

-- 7. No direct DELETE is granted to the browser. This function is the only
--    path that can remove a question or an option, and it refuses when answers
--    would be orphaned. The 07000 revokes stand.
revoke delete on public.survey_questions from anon, authenticated;
revoke delete on public.survey_options from anon, authenticated;
