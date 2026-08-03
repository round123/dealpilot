-- Disable the retired V1 SQLite-to-cloud migration runtime in databases that
-- applied its historical migrations. Fresh databases reach this as a no-op.
-- The orphaned objects can be dropped during an explicitly approved demo reset.

do $$
declare
  function_signature text;
  table_name text;
begin
  foreach function_signature in array array[
    'public.abandon_v1_migration(uuid)',
    'public.begin_v1_migration(text,text,text,jsonb,jsonb,jsonb)',
    'public.confirm_v1_migration(uuid,text,jsonb,jsonb)',
    'public.reconcile_v1_migration(uuid)',
    'public.stage_v1_migration_batch(uuid,text,jsonb)',
    'public.v1_migration_actual_manifest(uuid,uuid)',
    'public.v1_migration_collections()',
    'public.v1_migration_deletion_metadata(uuid,jsonb)',
    'public.v1_migration_target_id(uuid,text,uuid)',
    'public.validate_v1_migration_manifest(jsonb,jsonb)'
  ]
  loop
    if to_regprocedure(function_signature) is not null then
      execute format(
        'revoke all on function %s from public, anon, authenticated, service_role',
        function_signature
      );
    end if;
  end loop;

  foreach table_name in array array[
    'migration_jobs',
    'migration_staging_rows'
  ]
  loop
    if to_regclass(format('public.%I', table_name)) is not null then
      execute format(
        'revoke all on table public.%I from public, anon, authenticated, service_role',
        table_name
      );
    end if;
  end loop;
end;
$$;
