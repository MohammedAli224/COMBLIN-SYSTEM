-- Feedback: identity is optional name + department. No employee code.
--
-- Supersedes 20260926001000_feedback_employee_code_hash.sql, which hashed a
-- code the form no longer collects. Run this instead of it.
--
-- The RPC is written in full because the parameter list changes shape:
-- p_employee_code is gone and p_nurse_name becomes p_name.

-- 1. Normalize the identity column name, tolerating either legacy spelling.
do $$
begin
  if not exists (
    select 1 from pg_attribute
    where attrelid = 'public.feedback'::regclass
      and attname = 'name' and not attisdropped
  ) then
    if exists (
      select 1 from pg_attribute
      where attrelid = 'public.feedback'::regclass
        and attname = 'nurse_name' and not attisdropped
    ) then
      alter table public.feedback rename column nurse_name to name;
      raise notice 'feedback: renamed nurse_name to name';
    elsif exists (
      select 1 from pg_attribute
      where attrelid = 'public.feedback'::regclass
        and attname = 'reporter_name' and not attisdropped
    ) then
      alter table public.feedback rename column reporter_name to name;
      raise notice 'feedback: renamed reporter_name to name';
    end if;
  end if;
end
$$;

-- 2. Add name if the table used some other name entirely.
alter table public.feedback
  add column if not exists name text;

-- 3. Drop every employee code column, including a hash left by the earlier run.
do $$
declare
  v_col text;
begin
  foreach v_col in array array['employee_code', 'employee_code_hash', 'employee_id', 'staff_code'] loop
    if exists (
      select 1 from pg_attribute
      where attrelid = 'public.feedback'::regclass
        and attname = v_col and not attisdropped
    ) then
      raise notice 'feedback: dropping column %', v_col;
      execute format('alter table public.feedback drop column if exists %I', v_col);
    end if;
  end loop;
end
$$;

-- 4. Drop every existing overload. Parameter names are not part of a
--    function's identity, so a leftover variant would make the RPC ambiguous.
do $$
declare
  v_signature regprocedure;
begin
  for v_signature in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'submit_feedback'
  loop
    raise notice 'dropping stale overload %', v_signature;
    execute format('drop function if exists %s', v_signature);
  end loop;
end
$$;

-- 5. New RPC. Validates the same 10..1000 character range the form enforces,
--    so the limit holds even for a direct API call.
create or replace function public.submit_feedback(
  p_description text,
  p_department text default null,
  p_name text default null,
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
begin
  v_description := btrim(coalesce(p_description, ''));

  if length(v_description) < 10 then
    raise exception 'description_too_short';
  end if;

  if length(v_description) > 1000 then
    raise exception 'description_too_long';
  end if;

  v_department := nullif(btrim(coalesce(p_department, '')), '');

  -- Reject an unknown department before it reaches a column that may be an
  -- enum or carry a check constraint.
  if v_department is not null
     and v_department not in ('critical', 'floor', 'ambulatory') then
    raise exception 'invalid_department';
  end if;

  insert into public.feedback (description, department, name, attachment_path)
  values (
    v_description,
    v_department,
    nullif(btrim(coalesce(p_name, '')), ''),
    nullif(btrim(coalesce(p_attachment_path, '')), '')
  )
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.submit_feedback(text, text, text, text) to anon, authenticated;

-- 6. Rows are only ever created through the RPC. SECURITY DEFINER means this
--    revoke does not affect the function itself.
revoke insert on public.feedback from anon, authenticated;
