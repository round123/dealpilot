-- Behavioral and privilege gate for automatic operational-data retention.

begin;

do $$
declare
  matching_jobs integer;
begin
  select count(*)
  into matching_jobs
  from cron.job
  where jobname = 'dealpilot-data-retention-daily'
    and schedule = '17 3 * * *'
    and command = 'select public.enforce_data_retention(now());'
    and active;

  if matching_jobs <> 1 then
    raise exception 'daily data retention cron differs from contract';
  end if;
end;
$$;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '39000000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'retention@example.test',
  '',
  now(),
  '{}',
  '{}',
  now(),
  now()
);

insert into public.backup_snapshots (
  id, owner_user_id, checksum, row_counts, payload, created_at
) values
  (
    '39000000-0000-4000-8000-000000000010',
    '39000000-0000-4000-8000-000000000001',
    repeat('0', 64),
    '{}'::jsonb,
    '{}'::jsonb,
    '2026-06-28 11:59:59+00'
  ),
  (
    '39000000-0000-4000-8000-000000000011',
    '39000000-0000-4000-8000-000000000001',
    repeat('1', 64),
    '{}'::jsonb,
    '{}'::jsonb,
    '2026-06-29 12:00:00+00'
  ),
  (
    '39000000-0000-4000-8000-000000000012',
    '39000000-0000-4000-8000-000000000001',
    repeat('2', 64),
    '{}'::jsonb,
    '{}'::jsonb,
    '2026-07-30 12:00:00+00'
  );

insert into public.audit_events (
  id, owner_user_id, event_type, occurred_at
) values
  (
    '39000000-0000-4000-8000-000000000020',
    '39000000-0000-4000-8000-000000000001',
    'retention.expired',
    '2026-02-04 11:59:59+00'
  ),
  (
    '39000000-0000-4000-8000-000000000021',
    '39000000-0000-4000-8000-000000000001',
    'retention.boundary',
    '2026-02-04 12:00:00+00'
  ),
  (
    '39000000-0000-4000-8000-000000000022',
    '39000000-0000-4000-8000-000000000001',
    'retention.current',
    '2026-08-02 12:00:00+00'
  );

insert into public.customer_purge_jobs (
  id, owner_user_id, customer_id, cutoff, status, completed_at,
  created_at, updated_at
) values
  (
    '39000000-0000-4000-8000-000000000030',
    '39000000-0000-4000-8000-000000000001',
    '39000000-0000-4000-8000-000000000031',
    '2025-12-01 12:00:00+00',
    'completed',
    '2026-02-04 11:59:59+00',
    '2026-02-04 11:59:59+00',
    '2026-02-04 11:59:59+00'
  ),
  (
    '39000000-0000-4000-8000-000000000032',
    '39000000-0000-4000-8000-000000000001',
    '39000000-0000-4000-8000-000000000033',
    '2025-12-01 12:00:00+00',
    'cancelled',
    null,
    '2026-02-04 11:59:59+00',
    '2026-02-04 11:59:59+00'
  ),
  (
    '39000000-0000-4000-8000-000000000034',
    '39000000-0000-4000-8000-000000000001',
    '39000000-0000-4000-8000-000000000035',
    '2025-12-01 12:00:00+00',
    'completed',
    '2026-02-04 12:00:00+00',
    '2026-02-04 12:00:00+00',
    '2026-02-04 12:00:00+00'
  ),
  (
    '39000000-0000-4000-8000-000000000036',
    '39000000-0000-4000-8000-000000000001',
    '39000000-0000-4000-8000-000000000037',
    '2025-12-01 12:00:00+00',
    'pending',
    null,
    '2025-12-01 12:00:00+00',
    '2025-12-01 12:00:00+00'
  );

insert into public.import_jobs (
  id, owner_user_id, idempotency_key, payload_hash, status, row_count,
  result, created_at, completed_at
) values (
  '39000000-0000-4000-8000-000000000040',
  '39000000-0000-4000-8000-000000000001',
  'retention-test',
  repeat('a', 64),
  'completed',
  1,
  '{"success": 1}'::jsonb,
  '2025-01-01 12:00:00+00',
  '2025-01-01 12:00:00+00'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"39000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

do $$
begin
  begin
    perform public.enforce_data_retention('2026-08-03 12:00:00+00');
    raise exception 'authenticated user unexpectedly enforced retention';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

reset role;
set local role anon;

do $$
begin
  begin
    perform public.enforce_data_retention('2026-08-03 12:00:00+00');
    raise exception 'anonymous user unexpectedly enforced retention';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

reset role;
set local role service_role;

select set_config(
  'dealpilot_test.retention_result',
  public.enforce_data_retention('2026-08-03 12:00:00+00')::text,
  true
);

reset role;

do $$
declare
  result jsonb := current_setting('dealpilot_test.retention_result')::jsonb;
begin
  if result is distinct from jsonb_build_object(
    'data',
    jsonb_build_object(
      'backup_snapshots_deleted', 1,
      'audit_events_deleted', 1,
      'customer_purge_jobs_deleted', 2,
      'admin_account_cleanup_jobs_deleted', 0
    )
  ) then
    raise exception 'retention response differs from contract: %', result;
  end if;

  if exists (
    select 1 from public.backup_snapshots
    where id = '39000000-0000-4000-8000-000000000010'
  ) or exists (
    select 1 from public.audit_events
    where id = '39000000-0000-4000-8000-000000000020'
  ) or exists (
    select 1 from public.customer_purge_jobs
    where id in (
      '39000000-0000-4000-8000-000000000030',
      '39000000-0000-4000-8000-000000000032'
    )
  ) then
    raise exception 'expired operational records survived retention enforcement';
  end if;

  if (select count(*) from public.backup_snapshots) <> 2
    or (select count(*) from public.audit_events) <> 2
    or (select count(*) from public.customer_purge_jobs) <> 2
    or (select count(*) from public.import_jobs) <> 1 then
    raise exception 'retention enforcement removed a boundary, active, or import record';
  end if;
end;
$$;

set local role service_role;

select set_config(
  'dealpilot_test.retention_second_result',
  public.enforce_data_retention('2026-08-03 12:00:00+00')::text,
  true
);

do $$
begin
  begin
    perform public.enforce_data_retention(null);
    raise exception 'null retention reference time unexpectedly succeeded';
  exception
    when invalid_parameter_value then null;
  end;
end;
$$;

reset role;

do $$
declare
  result jsonb := current_setting('dealpilot_test.retention_second_result')::jsonb;
begin
  if result is distinct from jsonb_build_object(
    'data',
    jsonb_build_object(
      'backup_snapshots_deleted', 0,
      'audit_events_deleted', 0,
      'customer_purge_jobs_deleted', 0,
      'admin_account_cleanup_jobs_deleted', 0
    )
  ) then
    raise exception 'repeated retention enforcement was not idempotent: %', result;
  end if;
end;
$$;

rollback;
