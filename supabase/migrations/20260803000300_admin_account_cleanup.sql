-- Durable, service-only account cleanup. The job deliberately has no foreign
-- key to auth.users/profiles so the approval evidence survives account deletion.

create type public.admin_account_cleanup_job_status as enum (
  'pending', 'processing', 'retry', 'completed'
);

create table public.admin_account_cleanup_jobs (
  id uuid primary key default extensions.gen_random_uuid(),
  target_user_id uuid not null,
  idempotency_key text not null check (
    char_length(idempotency_key) between 1 and 128
    and idempotency_key ~ '^[A-Za-z0-9._:-]+$'
  ),
  request_id text not null check (char_length(request_id) between 1 and 128),
  approval_url text not null check (
    char_length(approval_url) <= 2048
    and approval_url ~ '^https://[^[:space:]]+$'
  ),
  requested_by text not null check (
    char_length(requested_by) between 1 and 128
    and requested_by ~ '^[A-Za-z0-9._@:-]+$'
  ),
  status public.admin_account_cleanup_job_status not null default 'pending',
  attempt_count integer not null default 0 check (attempt_count >= 0),
  claimed_at timestamptz,
  last_error_code text check (
    last_error_code is null
    or (
      char_length(last_error_code) between 1 and 64
      and last_error_code ~ '^[A-Z0-9_]+$'
    )
  ),
  last_error_at timestamptz,
  storage_objects_deleted integer not null default 0
    check (storage_objects_deleted >= 0),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (idempotency_key)
);

create index admin_account_cleanup_jobs_retry_idx
  on public.admin_account_cleanup_jobs (status, updated_at);

create index admin_account_cleanup_jobs_terminal_retention_idx
  on public.admin_account_cleanup_jobs (updated_at)
  where status = 'completed';

alter table public.admin_account_cleanup_jobs enable row level security;
alter table public.admin_account_cleanup_jobs force row level security;

create function public.request_admin_account_cleanup(
  p_target_user_id uuid,
  p_idempotency_key text,
  p_request_id text,
  p_approval_url text,
  p_requested_by text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  cleanup_job public.admin_account_cleanup_jobs;
begin
  if p_target_user_id is null then
    raise exception using errcode = '22023', message = 'Target user ID is required';
  end if;
  if p_idempotency_key is null
     or char_length(p_idempotency_key) not between 1 and 128
     or p_idempotency_key !~ '^[A-Za-z0-9._:-]+$' then
    raise exception using errcode = '22023', message = 'Invalid idempotency key';
  end if;
  if p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode = '22023', message = 'Invalid request ID';
  end if;
  if p_approval_url is null
     or char_length(p_approval_url) > 2048
     or p_approval_url !~ '^https://[^[:space:]]+$' then
    raise exception using errcode = '22023', message = 'Invalid approval URL';
  end if;
  if p_requested_by is null
     or char_length(p_requested_by) not between 1 and 128
     or p_requested_by !~ '^[A-Za-z0-9._@:-]+$' then
    raise exception using errcode = '22023', message = 'Invalid operator identifier';
  end if;

  insert into public.admin_account_cleanup_jobs (
    target_user_id, idempotency_key, request_id, approval_url, requested_by
  ) values (
    p_target_user_id, p_idempotency_key, p_request_id, p_approval_url,
    p_requested_by
  )
  on conflict (idempotency_key) do nothing;

  select * into strict cleanup_job
  from public.admin_account_cleanup_jobs
  where idempotency_key = p_idempotency_key;

  if cleanup_job.target_user_id <> p_target_user_id
     or cleanup_job.approval_url <> p_approval_url
     or cleanup_job.requested_by <> p_requested_by then
    raise exception using
      errcode = '23505',
      message = 'Idempotency key is already bound to another cleanup request';
  end if;

  return jsonb_build_object(
    'data', jsonb_build_object(
      'job_id', cleanup_job.id,
      'status', cleanup_job.status,
      'attempt_count', cleanup_job.attempt_count,
      'storage_objects_deleted', cleanup_job.storage_objects_deleted
    )
  );
end;
$$;

create function public.claim_admin_account_cleanup(
  p_job_id uuid,
  p_object_limit integer default 1000
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  cleanup_job public.admin_account_cleanup_jobs;
  storage_paths text[];
  has_more_objects boolean;
begin
  if p_object_limit is null or p_object_limit < 1 or p_object_limit > 5000 then
    raise exception using errcode = '22023', message = 'Invalid object limit';
  end if;

  select * into strict cleanup_job
  from public.admin_account_cleanup_jobs
  where id = p_job_id
  for update;

  if cleanup_job.status = 'completed' then
    return jsonb_build_object(
      'data', jsonb_build_object(
        'job_id', cleanup_job.id,
        'status', 'completed',
        'attempt_count', cleanup_job.attempt_count,
        'storage_objects_deleted', cleanup_job.storage_objects_deleted,
        'object_paths', '[]'::jsonb,
        'has_more_objects', false
      )
    );
  end if;

  if cleanup_job.status = 'processing'
     and cleanup_job.updated_at >= now() - interval '15 minutes' then
    return jsonb_build_object(
      'data', jsonb_build_object(
        'job_id', cleanup_job.id,
        'status', 'busy',
        'attempt_count', cleanup_job.attempt_count
      )
    );
  end if;

  select coalesce(array_agg(object_name order by object_name), '{}'::text[])
  into storage_paths
  from (
    select storage_object.name as object_name
    from storage.objects as storage_object
    where storage_object.bucket_id = 'attachments'
      and storage_object.name like cleanup_job.target_user_id::text || '/%'
    order by storage_object.name
    limit p_object_limit
  ) as limited_objects;

  select exists (
    select 1
    from storage.objects as storage_object
    where storage_object.bucket_id = 'attachments'
      and storage_object.name like cleanup_job.target_user_id::text || '/%'
    offset p_object_limit
  ) into has_more_objects;

  update public.admin_account_cleanup_jobs
  set status = 'processing',
      attempt_count = attempt_count + 1,
      claimed_at = now(),
      last_error_code = null,
      last_error_at = null,
      updated_at = now()
  where id = cleanup_job.id
  returning * into cleanup_job;

  return jsonb_build_object(
    'data', jsonb_build_object(
      'job_id', cleanup_job.id,
      'target_user_id', cleanup_job.target_user_id,
      'status', cleanup_job.status,
      'attempt_count', cleanup_job.attempt_count,
      'storage_objects_deleted', cleanup_job.storage_objects_deleted,
      'object_paths', to_jsonb(storage_paths),
      'has_more_objects', has_more_objects
    )
  );
end;
$$;

create function public.complete_admin_account_cleanup(
  p_job_id uuid,
  p_storage_objects_deleted integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  cleanup_job public.admin_account_cleanup_jobs;
begin
  if p_storage_objects_deleted is null or p_storage_objects_deleted < 0 then
    raise exception using errcode = '22023', message = 'Invalid deleted object count';
  end if;

  select * into strict cleanup_job
  from public.admin_account_cleanup_jobs
  where id = p_job_id
  for update;

  if cleanup_job.status = 'completed' then
    return jsonb_build_object(
      'data', jsonb_build_object(
        'job_id', cleanup_job.id,
        'status', cleanup_job.status,
        'attempt_count', cleanup_job.attempt_count,
        'storage_objects_deleted', cleanup_job.storage_objects_deleted
      )
    );
  end if;

  if cleanup_job.status <> 'processing' then
    raise exception using errcode = '55000', message = 'Cleanup job is not processing';
  end if;
  if exists (select 1 from auth.users where id = cleanup_job.target_user_id) then
    raise exception using errcode = '55000', message = 'Auth user still exists';
  end if;
  if exists (select 1 from public.profiles where id = cleanup_job.target_user_id) then
    raise exception using errcode = '55000', message = 'Profile cascade is incomplete';
  end if;
  if exists (
    select 1 from storage.objects
    where bucket_id = 'attachments'
      and name like cleanup_job.target_user_id::text || '/%'
  ) then
    raise exception using errcode = '55000', message = 'Storage cleanup is incomplete';
  end if;

  update public.admin_account_cleanup_jobs
  set status = 'completed',
      storage_objects_deleted = storage_objects_deleted + p_storage_objects_deleted,
      completed_at = now(),
      updated_at = now(),
      last_error_code = null,
      last_error_at = null
  where id = cleanup_job.id
  returning * into cleanup_job;

  return jsonb_build_object(
    'data', jsonb_build_object(
      'job_id', cleanup_job.id,
      'status', cleanup_job.status,
      'attempt_count', cleanup_job.attempt_count,
      'storage_objects_deleted', cleanup_job.storage_objects_deleted
    )
  );
end;
$$;

create function public.fail_admin_account_cleanup(
  p_job_id uuid,
  p_error_code text,
  p_storage_objects_deleted integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  cleanup_job public.admin_account_cleanup_jobs;
begin
  if p_error_code is null
     or char_length(p_error_code) not between 1 and 64
     or p_error_code !~ '^[A-Z0-9_]+$' then
    raise exception using errcode = '22023', message = 'Invalid sanitized error code';
  end if;
  if p_storage_objects_deleted is null or p_storage_objects_deleted < 0 then
    raise exception using errcode = '22023', message = 'Invalid deleted object count';
  end if;

  select * into strict cleanup_job
  from public.admin_account_cleanup_jobs
  where id = p_job_id
  for update;

  if cleanup_job.status = 'completed' then
    return jsonb_build_object(
      'data', jsonb_build_object(
        'job_id', cleanup_job.id,
        'status', cleanup_job.status,
        'attempt_count', cleanup_job.attempt_count,
        'storage_objects_deleted', cleanup_job.storage_objects_deleted
      )
    );
  end if;

  update public.admin_account_cleanup_jobs
  set status = 'retry',
      storage_objects_deleted = storage_objects_deleted + p_storage_objects_deleted,
      last_error_code = p_error_code,
      last_error_at = now(),
      updated_at = now()
  where id = cleanup_job.id
  returning * into cleanup_job;

  return jsonb_build_object(
    'data', jsonb_build_object(
      'job_id', cleanup_job.id,
      'status', cleanup_job.status,
      'attempt_count', cleanup_job.attempt_count,
      'storage_objects_deleted', cleanup_job.storage_objects_deleted,
      'last_error_code', cleanup_job.last_error_code
    )
  );
end;
$$;

revoke all on table public.admin_account_cleanup_jobs
  from public, anon, authenticated, service_role;
revoke execute on function
  public.request_admin_account_cleanup(uuid, text, text, text, text),
  public.claim_admin_account_cleanup(uuid, integer),
  public.complete_admin_account_cleanup(uuid, integer),
  public.fail_admin_account_cleanup(uuid, text, integer)
  from public, anon, authenticated;
grant execute on function
  public.request_admin_account_cleanup(uuid, text, text, text, text),
  public.claim_admin_account_cleanup(uuid, integer),
  public.complete_admin_account_cleanup(uuid, integer),
  public.fail_admin_account_cleanup(uuid, text, integer)
  to service_role;

-- Extend the database-local retention task without changing its schedule.
create or replace function public.enforce_data_retention(
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_backup_snapshots bigint;
  deleted_audit_events bigint;
  deleted_customer_purge_jobs bigint;
  deleted_admin_account_cleanup_jobs bigint;
begin
  if p_now is null then
    raise exception using
      errcode = '22023',
      message = 'Retention reference time is required';
  end if;

  delete from public.backup_snapshots
  where created_at < p_now - interval '35 days';
  get diagnostics deleted_backup_snapshots = row_count;

  delete from public.audit_events
  where occurred_at < p_now - interval '180 days';
  get diagnostics deleted_audit_events = row_count;

  delete from public.customer_purge_jobs
  where status in ('completed', 'cancelled')
    and updated_at < p_now - interval '180 days';
  get diagnostics deleted_customer_purge_jobs = row_count;

  delete from public.admin_account_cleanup_jobs
  where status = 'completed'
    and updated_at < p_now - interval '180 days';
  get diagnostics deleted_admin_account_cleanup_jobs = row_count;

  return jsonb_build_object(
    'data', jsonb_build_object(
      'backup_snapshots_deleted', deleted_backup_snapshots,
      'audit_events_deleted', deleted_audit_events,
      'customer_purge_jobs_deleted', deleted_customer_purge_jobs,
      'admin_account_cleanup_jobs_deleted', deleted_admin_account_cleanup_jobs
    )
  );
end;
$$;

revoke execute on function public.enforce_data_retention(timestamptz)
  from public, anon, authenticated;
grant execute on function public.enforce_data_retention(timestamptz)
  to service_role;
