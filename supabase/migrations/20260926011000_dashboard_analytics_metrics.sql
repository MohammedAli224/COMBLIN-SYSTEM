-- Dashboard analytics: submission trend over time, and identity breakdown.
--
-- Both figures have to be computed here rather than in the browser. Direct
-- SELECT on public.feedback was revoked in 20260926008000, so there is no
-- client-side path to either one, and the same single admin-guarded RPC that
-- already serves the four stat cards is the natural home for them.
--
-- This is create or replace, not the drop-then-recreate pattern the other
-- migrations use, because the signature and return type are unchanged.
-- Replacing keeps the existing grants and any dependent objects intact, where
-- dropping first would discard them and leave a window where the dashboard RPC
-- does not exist. The grant and revoke at the end reassert what is already in
-- place rather than being the thing that establishes it.

create or replace function public.admin_get_dashboard_metrics()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Trend window. Declared once so the length of the series and the label the
  -- client shows for it cannot drift apart, and so it is a one line change.
  v_window_days constant integer := 30;
  v_today date;
  v_window_start date;
  v_month_start timestamptz;
  v_feedback_total bigint;
  v_feedback_month bigint;
  v_active_surveys bigint;
  v_responses_total bigint;
  v_critical bigint;
  v_floor bigint;
  v_ambulatory bigint;
  v_identified bigint;
  v_anonymous bigint;
  v_incomplete bigint;
  v_trend jsonb;
begin
  if not exists (
    select 1
    from public.admin_users au
    where au.user_id::text = auth.uid()::text
  ) then
    raise exception 'not_authorized';
  end if;

  v_month_start := (date_trunc('month', now() at time zone 'utc')) at time zone 'utc';
  v_today := (now() at time zone 'utc')::date;
  v_window_start := v_today - (v_window_days - 1);

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

  -- Identity split. The form requires all three identifying fields or none of
  -- them, but the check constraint that codifies that was added NOT VALID, so
  -- rows submitted before it existed can still be partial. Counting them
  -- separately is the honest option: folding them into either bucket would
  -- report a split that does not match the data.
  with classified as (
    select
      (case when name is not null then 1 else 0 end)
      + (case when employee_code is not null then 1 else 0 end)
      + (case when department is not null then 1 else 0 end) as parts
    from public.feedback
  )
  select
    count(*) filter (where parts = 3),
    count(*) filter (where parts = 0),
    count(*) filter (where parts between 1 and 2)
  into v_identified, v_anonymous, v_incomplete
  from classified;

  -- Daily submission counts across the window.
  --
  -- generate_series is the load bearing part. Without it this query can only
  -- return days that actually have feedback, and the client would then draw a
  -- quiet week as though submissions were arriving on consecutive days. The
  -- series is dense and the gaps are explicit zeroes instead.
  --
  -- Bucketing by UTC date matches how v_month_start is computed above, so a
  -- submission near midnight cannot land in a different day than the one the
  -- month total counted it in.
  with days as (
    select generate_series(v_window_start, v_today, interval '1 day')::date as day
  ),
  counts as (
    select (created_at at time zone 'utc')::date as day, count(*) as total
    from public.feedback
    where (created_at at time zone 'utc')::date between v_window_start and v_today
    group by 1
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'day', to_char(d.day, 'YYYY-MM-DD'),
        -- A left join produces a null total for a day with no rows, which would
        -- reach the client as null and turn into NaN in the chart's scale.
        'total', coalesce(c.total, 0)
      )
      order by d.day
    ),
    '[]'::jsonb
  )
  into v_trend
  from days d
  left join counts c on c.day = d.day;

  return jsonb_build_object(
    'feedbackTotal', v_feedback_total,
    'feedbackThisMonth', v_feedback_month,
    'activeSurveys', v_active_surveys,
    'responsesTotal', v_responses_total,
    'byDepartment', jsonb_build_object(
      'critical', v_critical,
      'floor', v_floor,
      'ambulatory', v_ambulatory
    ),
    'feedbackByDay', v_trend,
    'identity', jsonb_build_object(
      'identified', v_identified,
      'anonymous', v_anonymous,
      'incomplete', v_incomplete
    ),
    -- Sent to the client so the chart's period label comes from the same place
    -- the series length does, rather than the number being written twice.
    'windowDays', v_window_days
  );
end;
$$;

grant execute on function public.admin_get_dashboard_metrics() to authenticated;
revoke execute on function public.admin_get_dashboard_metrics() from anon;
