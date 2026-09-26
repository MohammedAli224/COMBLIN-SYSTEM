-- Admin survey results.
--
-- Returns denormalized answer rows (one row per response, question, and chosen
-- option) plus the full question/option tree, so the browser can aggregate
-- without a second round trip and can still render options that nobody chose.
--
-- Why an RPC and not a direct select: survey responses are restricted to
-- administrators. Admin access in the app is only a client-side admin_users
-- lookup plus a route guard, so a direct read would be authorized by whatever
-- RLS happens to exist. This re-checks admin_users server-side against
-- auth.uid() and is SECURITY DEFINER.
--
-- Note: option_ids stores option ids, not labels, so every breakdown has to
-- resolve them through survey_options. The unnest is what makes multiple
-- choice aggregatable.

-- 1. Drop any previous overload so the RPC call can never be ambiguous.
do $$
declare
  v_signature regprocedure;
begin
  for v_signature in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'admin_get_survey_results'
  loop
    raise notice 'dropping stale overload %', v_signature;
    execute format('drop function if exists %s', v_signature);
  end loop;
end
$$;

-- 2. The RPC. The three elements of the payload:
--      total_responses - counts every response, including ones with no answers
--      questions       - the full tree, so zero-count options can be shown
--      rows            - one entry per response, question, and chosen option
create or replace function public.admin_get_survey_results(p_survey_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total integer;
  v_questions jsonb;
  v_rows jsonb;
begin
  if not exists (
    select 1
    from public.admin_users au
    where au.user_id::text = auth.uid()::text
  ) then
    raise exception 'not_authorized';
  end if;

  if p_survey_id is null then
    raise exception 'invalid_survey';
  end if;

  if not exists (select 1 from public.surveys s where s.id = p_survey_id) then
    raise exception 'invalid_survey';
  end if;

  select count(*) into v_total
  from public.survey_responses
  where survey_id = p_survey_id;

  select coalesce(jsonb_agg(t.j), '[]'::jsonb) into v_questions
  from (
    select jsonb_build_object(
      'id', q.id,
      'type', q.type::text,
      'position', q.position,
      'title_ar', q.title_ar,
      'title_en', q.title_en,
      'is_required', q.is_required,
      'options', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', o.id,
            'position', o.position,
            'label_ar', o.label_ar,
            'label_en', o.label_en
          ) order by o.position
        )
        from public.survey_options o
        where o.question_id = q.id
      ), '[]'::jsonb)
    ) as j
    from public.survey_questions q
    where q.survey_id = p_survey_id
  ) t;

  -- LEFT JOIN LATERAL keeps answers whose option_ids is null, which is every
  -- rating, yes/no, and free-text answer. Those rows carry null option fields
  -- and their value in the rating, boolean_value, or text_value column.
  select coalesce(jsonb_agg(t.j), '[]'::jsonb) into v_rows
  from (
    select jsonb_build_object(
      'response_id', r.id,
      'question_id', q.id,
      'option_id', o.id,
      'rating', a.rating,
      'boolean_value', a.boolean_value,
      'text_value', a.text_value
    ) as j
    from public.survey_responses r
    join public.survey_answers a on a.response_id = r.id
    join public.survey_questions q on q.id = a.question_id
    left join lateral unnest(a.option_ids) as u(option_id) on true
    left join public.survey_options o on o.id = u.option_id
    where r.survey_id = p_survey_id
  ) t;

  return jsonb_build_object(
    'total_responses', v_total,
    'questions', v_questions,
    'rows', v_rows
  );
end;
$$;

grant execute on function public.admin_get_survey_results(uuid) to authenticated;
revoke execute on function public.admin_get_survey_results(uuid) from anon;

-- Reads are not revoked from authenticated: the dashboard already counts
-- survey_responses directly through PostgREST, and revoking here would break
-- it. If you want employee_code_hash locked down, that needs its own migration
-- plus a dashboard count RPC.
