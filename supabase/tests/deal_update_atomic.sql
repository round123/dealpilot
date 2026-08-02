-- Deal fields and contact links must update as one owner-scoped command.

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000000', '61000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'deal-owner-a@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '62000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'deal-owner-b@example.test', '', now(), '{}', '{}', now(), now());

insert into public.companies (id, owner_user_id, name)
values
  ('61000000-0000-4000-8000-000000000010', '61000000-0000-4000-8000-000000000001', 'Owner A customer'),
  ('62000000-0000-4000-8000-000000000010', '62000000-0000-4000-8000-000000000002', 'Owner B customer');

insert into public.contacts (id, owner_user_id, company_id, name)
values
  ('61000000-0000-4000-8000-000000000021', '61000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000010', 'Contact A'),
  ('61000000-0000-4000-8000-000000000022', '61000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000010', 'Contact B'),
  ('61000000-0000-4000-8000-000000000023', '61000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000010', 'Contact C'),
  ('62000000-0000-4000-8000-000000000021', '62000000-0000-4000-8000-000000000002', '62000000-0000-4000-8000-000000000010', 'Owner B contact');

insert into public.deals (
  id, owner_user_id, company_id, name, stage, grade, currency, amount,
  probability, sort_index, updated_at
)
values
  (
    '61000000-0000-4000-8000-000000000030',
    '61000000-0000-4000-8000-000000000001',
    '61000000-0000-4000-8000-000000000010',
    'Original deal', 'lead', 'C', 'CNY', 1000, 10, 1,
    '2026-08-01T00:00:00Z'
  ),
  (
    '61000000-0000-4000-8000-000000000031',
    '61000000-0000-4000-8000-000000000001',
    '61000000-0000-4000-8000-000000000010',
    'Rollback deal', 'lead', 'C', 'CNY', 2000, 20, 2,
    '2026-08-01T00:00:00Z'
  );

insert into public.deal_contacts (owner_user_id, deal_id, contact_id)
values
  ('61000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000030', '61000000-0000-4000-8000-000000000021'),
  ('61000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000030', '61000000-0000-4000-8000-000000000022'),
  ('61000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000031', '61000000-0000-4000-8000-000000000021'),
  ('61000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000031', '61000000-0000-4000-8000-000000000022');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"61000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

do $$
declare
  response jsonb;
  stale_version timestamptz := '2026-08-01T00:00:00Z';
begin
  select public.update_deal_with_contacts(
    '61000000-0000-4000-8000-000000000030',
    '{"name":"Updated deal","stage":"proposal","grade":"A","amount":12500,"probability":70,"sort_index":4}'::jsonb,
    array[
      '61000000-0000-4000-8000-000000000022',
      '61000000-0000-4000-8000-000000000023'
    ]::uuid[],
    stale_version
  ) into response;

  if response -> 'data' ->> 'name' <> 'Updated deal'
    or response -> 'data' ->> 'stage' <> 'proposal'
    or response -> 'data' ->> 'grade' <> 'A'
    or (response -> 'data' ->> 'amount')::numeric <> 12500
    or (response -> 'data' ->> 'probability')::integer <> 70
    or (response -> 'data' ->> 'sort_index')::integer <> 4
    or response -> 'data' -> 'contact_ids' is distinct from jsonb_build_array(
      '61000000-0000-4000-8000-000000000022',
      '61000000-0000-4000-8000-000000000023'
    ) then
    raise exception 'atomic Deal update returned an invalid response: %', response;
  end if;
  if exists (
    select 1 from public.deal_contacts
    where deal_id = '61000000-0000-4000-8000-000000000030'
      and contact_id = '61000000-0000-4000-8000-000000000021'
  ) or (select count(*) from public.deal_contacts where deal_id = '61000000-0000-4000-8000-000000000030') <> 2 then
    raise exception 'A/B to B/C replacement did not persist exactly';
  end if;

  select public.update_deal_with_contacts(
    '61000000-0000-4000-8000-000000000030',
    '{"description":"Contacts unchanged"}'::jsonb,
    null,
    null
  ) into response;
  if response -> 'data' ->> 'description' <> 'Contacts unchanged'
    or response -> 'data' -> 'contact_ids' is distinct from jsonb_build_array(
      '61000000-0000-4000-8000-000000000022',
      '61000000-0000-4000-8000-000000000023'
    ) then
    raise exception 'NULL contact_ids changed links: %', response;
  end if;

  select public.update_deal_with_contacts(
    '61000000-0000-4000-8000-000000000030',
    '{}'::jsonb,
    array[
      '61000000-0000-4000-8000-000000000023',
      '61000000-0000-4000-8000-000000000022',
      '61000000-0000-4000-8000-000000000023'
    ]::uuid[],
    null
  ) into response;
  if response -> 'data' -> 'contact_ids' is distinct from jsonb_build_array(
    '61000000-0000-4000-8000-000000000022',
    '61000000-0000-4000-8000-000000000023'
  ) or (select count(*) from public.deal_contacts where deal_id = '61000000-0000-4000-8000-000000000030') <> 2 then
    raise exception 'duplicate contact IDs were not normalized: %', response;
  end if;

  select public.update_deal_with_contacts(
    '61000000-0000-4000-8000-000000000030', '{}'::jsonb, '{}'::uuid[], null
  ) into response;
  if response -> 'data' -> 'contact_ids' <> '[]'::jsonb
    or exists (select 1 from public.deal_contacts where deal_id = '61000000-0000-4000-8000-000000000030') then
    raise exception 'empty contact array did not clear links: %', response;
  end if;

  select public.update_deal_with_contacts(
    '61000000-0000-4000-8000-000000000030',
    '{}'::jsonb,
    array['61000000-0000-4000-8000-000000000022']::uuid[],
    null
  ) into response;

  begin
    perform public.update_deal_with_contacts(
      '61000000-0000-4000-8000-000000000030',
      '{"name":"Cross-owner mutation"}'::jsonb,
      array['62000000-0000-4000-8000-000000000021']::uuid[],
      null
    );
    raise exception 'cross-owner contact unexpectedly succeeded';
  exception
    when sqlstate 'PT404' then null;
  end;

  begin
    perform public.update_deal_with_contacts(
      '61000000-0000-4000-8000-000000000030',
      '{"name":"Missing-contact mutation"}'::jsonb,
      array['61000000-0000-4000-8000-000000000099']::uuid[],
      null
    );
    raise exception 'missing contact unexpectedly succeeded';
  exception
    when sqlstate 'PT404' then null;
  end;

  begin
    perform public.update_deal_with_contacts(
      '61000000-0000-4000-8000-000000000030',
      '{"name":"Stale mutation"}'::jsonb,
      null,
      stale_version
    );
    raise exception 'stale Deal update unexpectedly succeeded';
  exception
    when sqlstate 'PT409' then null;
  end;

  begin
    perform public.update_deal_with_contacts(
      '61000000-0000-4000-8000-000000000030',
      '{"owner_user_id":"62000000-0000-4000-8000-000000000002"}'::jsonb,
      null,
      null
    );
    raise exception 'read-only Deal patch unexpectedly succeeded';
  exception
    when sqlstate 'PT422' then null;
  end;

  if not exists (
    select 1 from public.deals
    where id = '61000000-0000-4000-8000-000000000030'
      and name = 'Updated deal'
      and description = 'Contacts unchanged'
  ) or (select array_agg(contact_id order by contact_id) from public.deal_contacts where deal_id = '61000000-0000-4000-8000-000000000030')
    is distinct from array['61000000-0000-4000-8000-000000000022']::uuid[] then
    raise exception 'rejected Deal commands changed fields or links';
  end if;
end;
$$;

reset role;

create function pg_temp.reject_test_deal_contact_delete()
returns trigger
language plpgsql
as $$
begin
  if old.deal_id = '61000000-0000-4000-8000-000000000031'::uuid
    and old.contact_id = '61000000-0000-4000-8000-000000000021'::uuid then
    raise exception 'test Deal link delete rejection';
  end if;
  return old;
end;
$$;

create trigger reject_test_deal_contact_delete
before delete on public.deal_contacts
for each row execute function pg_temp.reject_test_deal_contact_delete();

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"61000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

do $$
begin
  begin
    perform public.update_deal_with_contacts(
      '61000000-0000-4000-8000-000000000031',
      '{"name":"Must roll back","amount":9999}'::jsonb,
      array[
        '61000000-0000-4000-8000-000000000022',
        '61000000-0000-4000-8000-000000000023'
      ]::uuid[],
      null
    );
    raise exception 'forced Deal failure unexpectedly succeeded';
  exception
    when sqlstate 'P0001' then
      if sqlerrm <> 'test Deal link delete rejection' then
        raise exception 'unexpected forced Deal failure: %', sqlerrm;
      end if;
  end;

  if not exists (
    select 1 from public.deals
    where id = '61000000-0000-4000-8000-000000000031'
      and name = 'Rollback deal'
      and amount = 2000
  ) or (select array_agg(contact_id order by contact_id) from public.deal_contacts where deal_id = '61000000-0000-4000-8000-000000000031')
    is distinct from array[
      '61000000-0000-4000-8000-000000000021',
      '61000000-0000-4000-8000-000000000022'
    ]::uuid[] then
    raise exception 'failed Deal command did not roll back fields and links atomically';
  end if;
end;
$$;

reset role;
drop trigger reject_test_deal_contact_delete on public.deal_contacts;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"62000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

do $$
begin
  begin
    perform public.update_deal_with_contacts(
      '61000000-0000-4000-8000-000000000030',
      '{"name":"Cross-owner Deal mutation"}'::jsonb,
      null,
      null
    );
    raise exception 'cross-owner Deal update unexpectedly succeeded';
  exception
    when sqlstate 'PT404' then null;
  end;
end;
$$;

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

do $$
begin
  begin
    perform public.update_deal_with_contacts(
      '61000000-0000-4000-8000-000000000030', '{}'::jsonb, null, null
    );
    raise exception 'anonymous Deal update unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

reset role;

do $$
declare
  function_oid oid := to_regprocedure(
    'public.update_deal_with_contacts(uuid,jsonb,uuid[],timestamptz)'
  );
begin
  if function_oid is null
    or not (select p.prosecdef from pg_catalog.pg_proc as p where p.oid = function_oid)
    or (select p.proconfig from pg_catalog.pg_proc as p where p.oid = function_oid)
      is distinct from array['search_path=""']::text[]
    or not pg_catalog.has_function_privilege('authenticated', function_oid, 'EXECUTE')
    or pg_catalog.has_function_privilege('anon', function_oid, 'EXECUTE')
    or pg_catalog.has_function_privilege('service_role', function_oid, 'EXECUTE') then
    raise exception 'atomic Deal RPC privileges are unsafe';
  end if;
end;
$$;

rollback;
