-- Automated retention for operational data with an approved retention period.
-- Import job summaries remain outside this policy until their own retention
-- period is approved; uploaded import source files do not exist in this schema.

create extension if not exists pg_cron with schema pg_catalog;

create index if not exists audit_events_retention_idx
  on public.audit_events (occurred_at);

create index if not exists backup_snapshots_retention_idx
  on public.backup_snapshots (created_at);

create index if not exists customer_purge_jobs_terminal_retention_idx
  on public.customer_purge_jobs (updated_at)
  where status in ('completed', 'cancelled');

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

  return jsonb_build_object(
    'data',
    jsonb_build_object(
      'backup_snapshots_deleted', deleted_backup_snapshots,
      'audit_events_deleted', deleted_audit_events,
      'customer_purge_jobs_deleted', deleted_customer_purge_jobs
    )
  );
end;
$$;

revoke execute on function public.enforce_data_retention(timestamptz)
  from public, anon, authenticated;
grant execute on function public.enforce_data_retention(timestamptz)
  to service_role;

do $$
declare
  existing_job record;
begin
  for existing_job in
    select jobid
    from cron.job
    where jobname = 'dealpilot-data-retention-daily'
  loop
    perform cron.unschedule(existing_job.jobid);
  end loop;

  perform cron.schedule(
    'dealpilot-data-retention-daily',
    '17 3 * * *',
    'select public.enforce_data_retention(now());'
  );
end;
$$;
