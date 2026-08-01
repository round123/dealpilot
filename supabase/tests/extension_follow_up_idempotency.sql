-- Extension follow-up idempotency, ownership, and RPC privilege checks.
-- Run after all migrations with psql -v ON_ERROR_STOP=1.

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000000', '41000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'follow-up-a@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '42000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'follow-up-b@example.test', '', now(), '{}', '{}', now(), now());

insert into public.companies (id, owner_user_id, name)
values
  ('41000000-0000-4000-8000-000000000010', '41000000-0000-4000-8000-000000000001', 'Owner A customer'),
  ('41000000-0000-4000-8000-000000000011', '41000000-0000-4000-8000-000000000001', 'Owner A other customer'),
  ('42000000-0000-4000-8000-000000000010', '42000000-0000-4000-8000-000000000002', 'Owner B customer');

insert into public.deals (id, owner_user_id, company_id, name)
values
  ('41000000-0000-4000-8000-000000000020', '41000000-0000-4000-8000-000000000001', '41000000-0000-4000-8000-000000000010', 'Owner A deal'),
  ('41000000-0000-4000-8000-000000000021', '41000000-0000-4000-8000-000000000001', '41000000-0000-4000-8000-000000000011', 'Owner A other deal'),
  ('42000000-0000-4000-8000-000000000020', '42000000-0000-4000-8000-000000000002', '42000000-0000-4000-8000-000000000010', 'Owner B deal');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"41000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

do $$
declare
  first_response jsonb;
  replay_response jsonb;
begin
  select public.create_follow_up_idempotent(
    '41000000-0000-4000-8000-000000000100',
    '41000000-0000-4000-8000-000000000010',
    '41000000-0000-4000-8000-000000000020',
    'message',
    'Initial note',
    'Please confirm the proposal.',
    'outbound',
    '2026-08-01T09:00:00Z'
  ) into first_response;

  select public.create_follow_up_idempotent(
    '41000000-0000-4000-8000-000000000100',
    '41000000-0000-4000-8000-000000000010',
    '41000000-0000-4000-8000-000000000020',
    'message',
    'Initial note',
    'Please confirm the proposal.',
    'outbound',
    '2026-08-01T09:00:00Z'
  ) into replay_response;

  if first_response is distinct from replay_response
    or first_response -> 'data' ->> 'id' is null
    or first_response -> 'data' ? 'owner_user_id'
    or (select count(*) from public.follow_ups) <> 1 then
    raise exception 'same-payload replay did not return the original single result: %, %',
      first_response, replay_response;
  end if;

  begin
    perform public.create_follow_up_idempotent(
      '41000000-0000-4000-8000-000000000100',
      '41000000-0000-4000-8000-000000000010',
      '41000000-0000-4000-8000-000000000020',
      'message',
      'Changed note',
      'Please confirm the proposal.',
      'outbound',
      '2026-08-01T09:00:00Z'
    );
    raise exception 'same key with a different payload unexpectedly succeeded';
  exception
    when unique_violation then null;
  end;

  begin
    perform public.create_follow_up_idempotent(
      '41000000-0000-4000-8000-000000000101',
      '42000000-0000-4000-8000-000000000010',
      null,
      'note',
      'Cross-owner customer',
      null,
      null,
      '2026-08-01T09:10:00Z'
    );
    raise exception 'cross-owner customer unexpectedly succeeded';
  exception
    when no_data_found then null;
  end;

  begin
    perform public.create_follow_up_idempotent(
      '41000000-0000-4000-8000-000000000102',
      '41000000-0000-4000-8000-000000000010',
      '41000000-0000-4000-8000-000000000021',
      'note',
      'Wrong customer deal',
      null,
      null,
      '2026-08-01T09:20:00Z'
    );
    raise exception 'deal from another customer unexpectedly succeeded';
  exception
    when no_data_found then null;
  end;
end;
$$;

select set_config(
  'request.jwt.claims',
  '{"sub":"42000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

do $$
declare
  response jsonb;
begin
  select public.create_follow_up_idempotent(
    '41000000-0000-4000-8000-000000000100',
    '42000000-0000-4000-8000-000000000010',
    '42000000-0000-4000-8000-000000000020',
    'note',
    'Owner B can reuse the key',
    null,
    null,
    '2026-08-01T10:00:00Z'
  ) into response;

  if response -> 'data' ->> 'id' is null
    or (select count(*) from public.follow_ups) <> 1 then
    raise exception 'same key was not independently usable by another owner: %', response;
  end if;
end;
$$;

reset role;

do $$
declare
  function_oid oid;
begin
  select p.oid into function_oid
  from pg_catalog.pg_proc as p
  join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'create_follow_up_idempotent'
    and pg_catalog.pg_get_function_identity_arguments(p.oid) =
      'p_idempotency_key uuid, p_company_id uuid, p_deal_id uuid, p_type follow_up_type, p_note text, p_message_body text, p_message_direction message_direction, p_occurred_at timestamp with time zone';

  if function_oid is null then
    raise exception 'idempotent follow-up function signature is missing';
  end if;
  if not (select p.prosecdef from pg_catalog.pg_proc as p where p.oid = function_oid)
    or (select p.proconfig from pg_catalog.pg_proc as p where p.oid = function_oid)
      is distinct from array['search_path=""']::text[] then
    raise exception 'idempotent follow-up function is not hardened';
  end if;
  if not pg_catalog.has_function_privilege('authenticated', function_oid, 'EXECUTE')
    or pg_catalog.has_function_privilege('anon', function_oid, 'EXECUTE')
    or pg_catalog.has_function_privilege('service_role', function_oid, 'EXECUTE') then
    raise exception 'idempotent follow-up function privileges are unsafe';
  end if;
end;
$$;

rollback;
