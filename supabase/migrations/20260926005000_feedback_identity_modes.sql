-- Feedback: two submission modes.
--
--   anonymous  - description only. name, employee_code_hash, department are
--                all NULL.
--   identified - all three of name, employee_code_hash, department are set.
--
-- Any other combination is rejected. The rule is enforced in three places, on
-- purpose: the form blocks it, the RPC rejects it, and a NOT VALID check
-- constraint stops a direct write from creating it.
--
-- The employee code is stored as a SHA-256 digest, never as plain text, for the
-- same reason the survey code is. The parameter is named p_employee_code_hash
-- rather than p_employee_code so that nobody later "fixes" it by passing a raw
-- code. The browser hashes before sending, so the raw code never reaches the
-- database. The trade-off is that an administrator cannot read the code back:
-- it is proof of employment, not identification.

-- 1. Column shape. The hash column is added; any plain text code column is
--    dropped, because leaving one around is the exact leak this project is
--    trying to avoid.
do $$
declare
  v_col text;
begin
  foreach v_col in array array['employee_code', 'employee_id', 'staff_code'] loop
    if exists (
      select 1 from pg_attribute
      where attrelid = 'public.feedback'::regclass
        and attname = v_col and not attisdropped
    ) then
      raise notice 'feedback: dropping plain text column %', v_col;
      execute format('alter table public.feedback drop column if exists %I', v_col);
    end if;
  end loop;
end
$$;

alter table public.feedback
  add column if not exists employee_code_hash text;

-- 2. Identity must be optional. These columns may carry a NOT NULL from the
--    original schema, which would make an anonymous submission fail on insert
--    rather than on validation.
alter table public.feedback alter column name drop not null;
alter table public.feedback alter column department drop not null;
alter table public.feedback alter column employee_code_hash drop not null;

-- 3. Database-level guarantee. NOT VALID skips the scan of existing rows, which
--    matters because rows written before this change may have a partial
--    identity. It is still enforced on every insert and update from here on.
alter table public.feedback drop constraint if exists feedback_identity_all_or_none;
alter table public.feedback
  add constraint feedback_identity_all_or_none
  check (
    (name is null and employee_code_hash is null and department is null)
    or (name is not null and employee_code_hash is not null and department is not null)
  ) not valid;

-- 4. Drop every existing overload. The parameter list changes shape, and
--    parameter names are not part of a function's identity, so a leftover
--    four-text-argument variant would silently keep accepting the old shape.
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

-- 5. The RPC. Empty strings are normalised to NULL before the all-or-none test,
--    so a whitespace-only field counts as absent rather than as a half-filled
--    identity.
create or replace function public.submit_feedback(
  p_description text,
  p_department text default null,
  p_name text default null,
  p_employee_code_hash text default null,
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
  v_employee_code_hash text;
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
  -- Lowercased to match the browser's normalisation, so the same code typed in
  -- two cases produces one digest.
  v_employee_code_hash := nullif(lower(btrim(coalesce(p_employee_code_hash, ''))), '');

  -- Reject a malformed digest rather than storing it, so a plain code sent by
  -- mistake fails loudly instead of quietly becoming an identifier.
  if v_employee_code_hash is not null
     and v_employee_code_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_employee_code_hash';
  end if;

  if v_department is not null
     and v_department not in ('critical', 'floor', 'ambulatory') then
    raise exception 'invalid_department';
  end if;

  v_provided := (case when v_name is not null then 1 else 0 end)
              + (case when v_employee_code_hash is not null then 1 else 0 end)
              + (case when v_department is not null then 1 else 0 end);

  if v_provided not in (0, 3) then
    raise exception 'incomplete_identity';
  end if;

  insert into public.feedback (
    description, department, name, employee_code_hash, attachment_path
  ) values (
    v_description,
    v_department,
    v_name,
    v_employee_code_hash,
    nullif(btrim(coalesce(p_attachment_path, '')), '')
  )
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.submit_feedback(text, text, text, text, text) to anon, authenticated;

-- 6. Rows are only ever created through the RPC. SECURITY DEFINER means this
--    revoke does not affect the function itself.
revoke insert on public.feedback from anon, authenticated;
