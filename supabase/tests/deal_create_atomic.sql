-- Deal creation and contact links must commit or roll back together.

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000000', '71000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'deal-create-a@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '72000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'deal-create-b@example.test', '', now(), '{}', '{}', now(), now());

insert into public.companies (id, owner_user_id, name)
values
  ('71000000-0000-4000-8000-000000000010', '71000000-0000-4000-8000-000000000001', 'Owner A customer'),
  ('72000000-0000-4000-8000-000000000010', '72000000-0000-4000-8000-000000000002', 'Owner B customer');

insert into public.contacts (id, owner_user_id, company_id, name)
values
  ('71000000-0000-4000-8000-000000000021', '71000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000010', 'Contact A'),
  ('71000000-0000-4000-8000-000000000022', '71000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000010', 'Contact B'),
  ('71000000-0000-4000-8000-000000000023', '71000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000010', 'Contact C'),
  ('72000000-0000-4000-8000-000000000021', '72000000-0000-4000-8000-000000000002', '72000000-0000-4000-8000-000000000010', 'Owner B contact');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"71000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

do $$
declare
  response jsonb;
  created_id uuid;
begin
  select public.create_deal_with_contacts(
    '{
      "company_id":"71000000-0000-4000-8000-000000000010",
      "name":"Atomic created deal",
      "category":"new-business",
      "stage":"proposal",
      "grade":"A",
      "description":"Created atomically",
      "currency":"CNY",
      "amount":25000,
      "probability":80,
      "expected_closing_date":"2026-10-31",
      "closed_reason":null,
      "archived_at":null,
      "sort_index":7
    }'::jsonb,
    array[
      '71000000-0000-4000-8000-000000000022',
      '71000000-0000-4000-8000-000000000021',
      '71000000-0000-4000-8000-000000000022'
    ]::uuid[]
  ) into response;
  created_id := (response -> 'data' ->> 'id')::uuid;

  if response -> 'data' ->> 'owner_user_id' <> '71000000-0000-4000-8000-000000000001'
    or response -> 'data' ->> 'name' <> 'Atomic created deal'
    or response -> 'data' ->> 'stage' <> 'proposal'
    or response -> 'data' ->> 'grade' <> 'A'
    or response -> 'data' ->> 'currency' <> 'CNY'
    or (response -> 'data' ->> 'amount')::numeric <> 25000
    or (response -> 'data' ->> 'probability')::integer <> 80
    or response -> 'data' ->> 'expected_closing_date' <> '2026-10-31'
    or (response -> 'data' ->> 'sort_index')::integer <> 7
    or response -> 'data' -> 'contact_ids' is distinct from jsonb_build_array(
      '71000000-0000-4000-8000-000000000021',
      '71000000-0000-4000-8000-000000000022'
    ) then
    raise exception 'atomic Deal create response is invalid: %', response;
  end if;
  if not exists (
    select 1 from public.deals
    where id = created_id
      and owner_user_id = '71000000-0000-4000-8000-000000000001'
      and company_id = '71000000-0000-4000-8000-000000000010'
      and description = 'Created atomically'
  ) or (select array_agg(contact_id order by contact_id) from public.deal_contacts where deal_id = created_id)
    is distinct from array[
      '71000000-0000-4000-8000-000000000021',
      '71000000-0000-4000-8000-000000000022'
    ]::uuid[] then
    raise exception 'atomic Deal create did not persist fields and unique links';
  end if;

  select public.create_deal_with_contacts(
    '{"company_id":"71000000-0000-4000-8000-000000000010","name":"Default Deal"}'::jsonb
  ) into response;
  if response -> 'data' ->> 'stage' <> 'lead'
    or response -> 'data' ->> 'grade' <> 'C'
    or response -> 'data' ->> 'currency' <> 'USD'
    or response -> 'data' -> 'contact_ids' <> '[]'::jsonb
    or exists (
      select 1 from public.deal_contacts
      where deal_id = (response -> 'data' ->> 'id')::uuid
    ) then
    raise exception 'Deal create defaults or empty contact list are invalid: %', response;
  end if;

  begin
    perform public.create_deal_with_contacts(
      '{"company_id":"72000000-0000-4000-8000-000000000010","name":"Cross-owner company"}'::jsonb
    );
    raise exception 'cross-owner company unexpectedly succeeded';
  exception
    when sqlstate 'PT404' then null;
  end;

  begin
    perform public.create_deal_with_contacts(
      '{"company_id":"71000000-0000-4000-8000-000000000099","name":"Missing company"}'::jsonb
    );
    raise exception 'missing company unexpectedly succeeded';
  exception
    when sqlstate 'PT404' then null;
  end;

  begin
    perform public.create_deal_with_contacts(
      '{"company_id":"71000000-0000-4000-8000-000000000010","name":"Cross-owner contact"}'::jsonb,
      array['72000000-0000-4000-8000-000000000021']::uuid[]
    );
    raise exception 'cross-owner contact unexpectedly succeeded';
  exception
    when sqlstate 'PT404' then null;
  end;

  begin
    perform public.create_deal_with_contacts(
      '{"company_id":"71000000-0000-4000-8000-000000000010","name":"Missing contact"}'::jsonb,
      array['71000000-0000-4000-8000-000000000099']::uuid[]
    );
    raise exception 'missing contact unexpectedly succeeded';
  exception
    when sqlstate 'PT404' then null;
  end;

  begin
    perform public.create_deal_with_contacts(
      '{"id":"71000000-0000-4000-8000-000000000099","company_id":"71000000-0000-4000-8000-000000000010","name":"Read-only field"}'::jsonb
    );
    raise exception 'read-only Deal create field unexpectedly succeeded';
  exception
    when sqlstate 'PT422' then null;
  end;

  begin
    perform public.create_deal_with_contacts(
      '{"company_id":"71000000-0000-4000-8000-000000000010","name":"Unknown field","sales_id":"71000000-0000-4000-8000-000000000001"}'::jsonb
    );
    raise exception 'unknown Deal create field unexpectedly succeeded';
  exception
    when sqlstate 'PT422' then null;
  end;

  begin
    perform public.create_deal_with_contacts('{"name":"Missing customer"}'::jsonb);
    raise exception 'missing required customer unexpectedly succeeded';
  exception
    when sqlstate 'PT422' then null;
  end;

  begin
    perform public.create_deal_with_contacts(
      '{"company_id":"71000000-0000-4000-8000-000000000010"}'::jsonb
    );
    raise exception 'missing required name unexpectedly succeeded';
  exception
    when sqlstate 'PT422' then null;
  end;

  begin
    perform public.create_deal_with_contacts(
      '{"company_id":"71000000-0000-4000-8000-000000000010","name":"Null contacts"}'::jsonb,
      null
    );
    raise exception 'NULL contact array unexpectedly succeeded';
  exception
    when sqlstate 'PT422' then null;
  end;

  begin
    perform public.create_deal_with_contacts(null);
    raise exception 'NULL Deal input unexpectedly succeeded';
  exception
    when sqlstate 'PT422' then null;
  end;

  begin
    perform public.create_deal_with_contacts(
      '{"company_id":"71000000-0000-4000-8000-000000000010","name":"Null contact item"}'::jsonb,
      array[null::uuid]
    );
    raise exception 'NULL contact item unexpectedly succeeded';
  exception
    when sqlstate 'PT422' then null;
  end;

  begin
    perform public.create_deal_with_contacts(
      '{"company_id":"71000000-0000-4000-8000-000000000010","name":"   "}'::jsonb
    );
    raise exception 'blank Deal name unexpectedly succeeded';
  exception
    when sqlstate 'PT422' then null;
  end;

  begin
    perform public.create_deal_with_contacts(
      '{"company_id":"71000000-0000-4000-8000-000000000010","name":"Lowercase currency","currency":"usd"}'::jsonb
    );
    raise exception 'lowercase Deal currency unexpectedly succeeded';
  exception
    when sqlstate 'PT422' then null;
  end;

  begin
    perform public.create_deal_with_contacts(
      '{"company_id":"71000000-0000-4000-8000-000000000010","name":"Oversized sort index","sort_index":40000}'::jsonb
    );
    raise exception 'oversized Deal sort index unexpectedly succeeded';
  exception
    when sqlstate 'PT422' then null;
  end;

  if exists (
    select 1 from public.deals
    where name in (
      'Cross-owner company', 'Missing company', 'Cross-owner contact',
      'Missing contact', 'Read-only field', 'Unknown field',
      'Missing customer'
    )
  ) then
    raise exception 'rejected Deal create left a row behind';
  end if;
end;
$$;

reset role;

create function pg_temp.reject_test_deal_contact_insert()
returns trigger
language plpgsql
as $$
begin
  if new.contact_id = '71000000-0000-4000-8000-000000000023'::uuid then
    raise exception 'test Deal link insert rejection';
  end if;
  return new;
end;
$$;

create trigger reject_test_deal_contact_insert
before insert on public.deal_contacts
for each row execute function pg_temp.reject_test_deal_contact_insert();

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"71000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

do $$
begin
  begin
    perform public.create_deal_with_contacts(
      '{"company_id":"71000000-0000-4000-8000-000000000010","name":"Must roll back"}'::jsonb,
      array['71000000-0000-4000-8000-000000000023']::uuid[]
    );
    raise exception 'forced Deal create failure unexpectedly succeeded';
  exception
    when sqlstate 'P0001' then
      if sqlerrm <> 'test Deal link insert rejection' then
        raise exception 'unexpected forced Deal create failure: %', sqlerrm;
      end if;
  end;

  if exists (select 1 from public.deals where name = 'Must roll back') then
    raise exception 'failed Deal link insert left the Deal row behind';
  end if;
end;
$$;

reset role;
drop trigger reject_test_deal_contact_insert on public.deal_contacts;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

do $$
begin
  begin
    perform public.create_deal_with_contacts(
      '{"company_id":"71000000-0000-4000-8000-000000000010","name":"Anonymous Deal"}'::jsonb
    );
    raise exception 'anonymous Deal create unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

reset role;

do $$
declare
  function_oid oid := to_regprocedure(
    'public.create_deal_with_contacts(jsonb,uuid[])'
  );
begin
  if function_oid is null
    or not (select p.prosecdef from pg_catalog.pg_proc as p where p.oid = function_oid)
    or (select p.proconfig from pg_catalog.pg_proc as p where p.oid = function_oid)
      is distinct from array['search_path=""']::text[]
    or not pg_catalog.has_function_privilege('authenticated', function_oid, 'EXECUTE')
    or pg_catalog.has_function_privilege('anon', function_oid, 'EXECUTE')
    or pg_catalog.has_function_privilege('service_role', function_oid, 'EXECUTE') then
    raise exception 'atomic Deal create RPC privileges are unsafe';
  end if;
end;
$$;

rollback;
