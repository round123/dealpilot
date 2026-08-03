-- Customer keyset pagination behavior and owner isolation.

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000000', '91000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'cursor-a@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '92000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'cursor-b@example.test', '', now(), '{}', '{}', now(), now());

insert into public.companies (
  id, owner_user_id, name, company, grade, status, deleted_at, created_at, updated_at
)
values
  ('91100000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', 'Cursor Alpha', 'Northwind', 'A', 'active', null, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('91100000-0000-4000-8000-000000000002', '91000000-0000-4000-8000-000000000001', 'Cursor Beta', 'Northwind', 'A', 'active', null, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('91100000-0000-4000-8000-000000000003', '91000000-0000-4000-8000-000000000001', 'Cursor Gamma', 'Northwind', 'A', 'active', null, '2026-01-02T00:00:00Z', '2026-01-02T00:00:00Z'),
  ('91100000-0000-4000-8000-000000000004', '91000000-0000-4000-8000-000000000001', 'Other Customer', 'Elsewhere', 'A', 'active', null, '2026-01-03T00:00:00Z', '2026-01-03T00:00:00Z'),
  ('91100000-0000-4000-8000-000000000005', '91000000-0000-4000-8000-000000000001', 'Cursor Inactive', 'Northwind', 'A', 'inactive', null, '2026-01-04T00:00:00Z', '2026-01-04T00:00:00Z'),
  ('91100000-0000-4000-8000-000000000006', '91000000-0000-4000-8000-000000000001', 'Cursor Grade B', 'Northwind', 'B', 'active', null, '2026-01-05T00:00:00Z', '2026-01-05T00:00:00Z'),
  ('91100000-0000-4000-8000-000000000007', '91000000-0000-4000-8000-000000000001', 'Cursor Deleted', 'Northwind', 'A', 'active', now(), '2026-01-06T00:00:00Z', '2026-01-06T00:00:00Z'),
  ('92100000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000002', 'Cursor Secret', 'Northwind', 'A', 'active', null, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

do $$
declare
  first_page jsonb;
  second_page jsonb;
  descending_page jsonb;
  first_cursor text;
begin
  select public.list_customers_cursor(
    null, 2, 'Cursor', 'A', 'active', 'created_at', 'asc'
  ) into first_page;

  if first_page -> 'data' ->> 'total' <> '3'
    or first_page -> 'data' -> 'items' -> 0 ->> 'id' <> '91100000-0000-4000-8000-000000000001'
    or first_page -> 'data' -> 'items' -> 1 ->> 'id' <> '91100000-0000-4000-8000-000000000002'
    or first_page -> 'data' ->> 'next_cursor' is null then
    raise exception 'first Customer cursor page is invalid: %', first_page;
  end if;

  first_cursor := first_page -> 'data' ->> 'next_cursor';
  perform set_config('dealpilot.test_customer_cursor', first_cursor, true);
  select public.list_customers_cursor(
    first_cursor, 2, 'Cursor', 'A', 'active', 'created_at', 'asc'
  ) into second_page;

  if jsonb_array_length(second_page -> 'data' -> 'items') <> 1
    or second_page -> 'data' -> 'items' -> 0 ->> 'id' <> '91100000-0000-4000-8000-000000000003'
    or second_page -> 'data' ->> 'next_cursor' is not null then
    raise exception 'second Customer cursor page repeated, skipped, or overran rows: %', second_page;
  end if;

  select public.list_customers_cursor(
    null, 3, 'Cursor', 'A', 'active', 'name', 'desc'
  ) into descending_page;
  if descending_page -> 'data' -> 'items' -> 0 ->> 'name' <> 'Cursor Gamma'
    or descending_page -> 'data' -> 'items' -> 2 ->> 'name' <> 'Cursor Alpha' then
    raise exception 'descending Customer cursor sort is invalid: %', descending_page;
  end if;

  begin
    perform public.list_customers_cursor(
      first_cursor, 2, 'Other', 'A', 'active', 'created_at', 'asc'
    );
    raise exception 'Customer cursor unexpectedly survived a filter change';
  exception when sqlstate '22023' then null;
  end;

  begin
    perform public.list_customers_cursor(
      'not-a-valid-cursor', 2, 'Cursor', 'A', 'active', 'created_at', 'asc'
    );
    raise exception 'malformed Customer cursor was accepted';
  exception when sqlstate '22023' then null;
  end;
end;
$$;

select set_config(
  'request.jwt.claims',
  '{"sub":"92000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

do $$
declare
  owner_b_page jsonb;
begin
  select public.list_customers_cursor(
    null, 25, 'Cursor', 'A', 'active', 'created_at', 'asc'
  ) into owner_b_page;

  if owner_b_page -> 'data' ->> 'total' <> '1'
    or owner_b_page -> 'data' -> 'items' -> 0 ->> 'id' <> '92100000-0000-4000-8000-000000000001' then
    raise exception 'Customer cursor page crossed the owner RLS boundary: %', owner_b_page;
  end if;

  begin
    perform public.list_customers_cursor(
      current_setting('dealpilot.test_customer_cursor'),
      2,
      'Cursor',
      'A',
      'active',
      'created_at',
      'asc'
    );
    raise exception 'Customer cursor from another owner was accepted';
  exception when sqlstate '22023' then null;
  end;
end;
$$;

rollback;
