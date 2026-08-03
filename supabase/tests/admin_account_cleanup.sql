-- Security, idempotency, retry and completion gates for administrator cleanup.

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '41000000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'admin-cleanup-target@example.test',
  '',
  now(),
  '{}',
  '{}',
  now(),
  now()
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"41000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

do $$
begin
  begin
    perform public.request_admin_account_cleanup(
      '41000000-0000-4000-8000-000000000001',
      'ticket-410',
      'request-410',
      'https://github.com/round123/dealpilot/issues/410',
      'security-test'
    );
    raise exception 'authenticated user unexpectedly requested account cleanup';
  exception when insufficient_privilege then null;
  end;

  begin
    perform 1 from public.admin_account_cleanup_jobs;
    raise exception 'authenticated user unexpectedly read cleanup jobs';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;
set local role service_role;

select set_config(
  'dealpilot_test.admin_cleanup_job_id',
  public.request_admin_account_cleanup(
    '41000000-0000-4000-8000-000000000001',
    'ticket-410',
    'request-410',
    'https://github.com/round123/dealpilot/issues/410',
    'security-test'
  ) -> 'data' ->> 'job_id',
  true
);

do $$
declare
  replay_job_id text;
begin
  replay_job_id := public.request_admin_account_cleanup(
    '41000000-0000-4000-8000-000000000001',
    'ticket-410',
    'request-retry',
    'https://github.com/round123/dealpilot/issues/410',
    'security-test'
  ) -> 'data' ->> 'job_id';

  if replay_job_id <> current_setting('dealpilot_test.admin_cleanup_job_id') then
    raise exception 'idempotent request created a different cleanup job';
  end if;

  begin
    perform public.request_admin_account_cleanup(
      '41000000-0000-4000-8000-000000000099',
      'ticket-410',
      'request-conflict',
      'https://github.com/round123/dealpilot/issues/410',
      'security-test'
    );
    raise exception 'idempotency key accepted a different target';
  exception when unique_violation then null;
  end;
end;
$$;

select public.claim_admin_account_cleanup(
  current_setting('dealpilot_test.admin_cleanup_job_id')::uuid,
  1000
);

do $$
begin
  begin
    perform public.complete_admin_account_cleanup(
      current_setting('dealpilot_test.admin_cleanup_job_id')::uuid,
      0
    );
    raise exception 'cleanup completed while Auth user still existed';
  exception when object_not_in_prerequisite_state then null;
  end;
end;
$$;

select public.fail_admin_account_cleanup(
  current_setting('dealpilot_test.admin_cleanup_job_id')::uuid,
  'AUTH_USER_DELETE_FAILED',
  0
);

reset role;

do $$
begin
  if not exists (
    select 1 from public.admin_account_cleanup_jobs
    where id = current_setting('dealpilot_test.admin_cleanup_job_id')::uuid
      and status = 'retry'
      and attempt_count = 1
      and last_error_code = 'AUTH_USER_DELETE_FAILED'
  ) then
    raise exception 'cleanup retry state was not durably recorded';
  end if;
end;
$$;

set local role service_role;
select public.claim_admin_account_cleanup(
  current_setting('dealpilot_test.admin_cleanup_job_id')::uuid,
  1000
);
reset role;

delete from auth.users
where id = '41000000-0000-4000-8000-000000000001';

set local role service_role;
select public.complete_admin_account_cleanup(
  current_setting('dealpilot_test.admin_cleanup_job_id')::uuid,
  0
);
reset role;

do $$
begin
  if exists (
    select 1 from auth.users
    where id = '41000000-0000-4000-8000-000000000001'
  ) or exists (
    select 1 from public.profiles
    where id = '41000000-0000-4000-8000-000000000001'
  ) then
    raise exception 'Auth/profile cascade is incomplete';
  end if;

  if not exists (
    select 1 from public.admin_account_cleanup_jobs
    where id = current_setting('dealpilot_test.admin_cleanup_job_id')::uuid
      and status = 'completed'
      and completed_at is not null
      and attempt_count = 2
  ) then
    raise exception 'completed cleanup evidence did not survive account deletion';
  end if;
end;
$$;

-- A completed job strictly older than 180 days expires; retry evidence survives.
update public.admin_account_cleanup_jobs
set updated_at = '2026-02-04 11:59:59+00'
where id = current_setting('dealpilot_test.admin_cleanup_job_id')::uuid;

set local role service_role;
select public.enforce_data_retention('2026-08-03 12:00:00+00');
reset role;

do $$
begin
  if exists (
    select 1 from public.admin_account_cleanup_jobs
    where id = current_setting('dealpilot_test.admin_cleanup_job_id')::uuid
  ) then
    raise exception 'expired completed cleanup evidence was not removed';
  end if;
end;
$$;

rollback;
