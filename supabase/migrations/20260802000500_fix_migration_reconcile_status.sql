-- CASE expressions containing enum labels resolve to text unless at least one
-- branch is explicitly typed. Keep reconciliation executable on PostgreSQL.

create or replace function public.reconcile_v1_migration(p_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_owner uuid := auth.uid();
  job public.migration_jobs;
  actual_manifest jsonb;
  differences jsonb := '[]'::jsonb;
  collection_name text;
  ready boolean;
begin
  if current_owner is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  select * into job from public.migration_jobs
  where owner_user_id = current_owner and id = p_job_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Migration job not found';
  end if;
  if job.status not in ('running', 'awaiting_confirmation') then
    raise exception using errcode = '55000', message = 'Migration job cannot be reconciled';
  end if;

  actual_manifest := public.v1_migration_actual_manifest(current_owner, p_job_id);
  foreach collection_name in array public.v1_migration_collections() loop
    if actual_manifest -> 'counts' -> collection_name is distinct from job.counts -> collection_name
      or actual_manifest -> 'checksums' -> collection_name is distinct from job.checksums -> collection_name then
      differences := differences || jsonb_build_array(jsonb_build_object(
        'collection', collection_name,
        'expected_count', job.counts -> collection_name,
        'actual_count', actual_manifest -> 'counts' -> collection_name,
        'expected_checksum', job.checksums -> collection_name,
        'actual_checksum', actual_manifest -> 'checksums' -> collection_name
      ));
    end if;
  end loop;
  ready := jsonb_array_length(differences) = 0;
  update public.migration_jobs
  set status = case
        when ready then 'awaiting_confirmation'::public.migration_job_status
        else 'running'::public.migration_job_status
      end,
      error_code = case when ready then null else 'RECONCILIATION_MISMATCH' end,
      updated_at = now()
  where owner_user_id = current_owner and id = p_job_id;

  return jsonb_build_object('data', jsonb_build_object(
    'id', p_job_id,
    'status', case when ready then 'awaiting_confirmation' else 'running' end,
    'ready', ready,
    'actual_counts', actual_manifest -> 'counts',
    'actual_checksums', actual_manifest -> 'checksums',
    'differences', differences
  ));
end;
$$;

revoke execute on function public.reconcile_v1_migration(uuid)
  from public, anon, service_role;
grant execute on function public.reconcile_v1_migration(uuid)
  to authenticated;
