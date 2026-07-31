-- Transactional cloud backup/restore and cross-account isolation checks.
-- Run after all migrations with psql -v ON_ERROR_STOP=1.

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000000', '31000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'backup-a@example.test', '', now(), '{}', '{"display_name":"Backup A"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '32000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'backup-b@example.test', '', now(), '{}', '{"display_name":"Backup B"}', now(), now());

insert into public.audit_events (
  id, owner_user_id, event_type, entity_type, metadata
) values (
  '31000000-0000-4000-8000-000000000020',
  '31000000-0000-4000-8000-000000000001',
  'test.audit.before_backup',
  'test',
  '{}'::jsonb
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"31000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

insert into public.companies (id, name, grade)
values ('31000000-0000-4000-8000-000000000010', 'Snapshot baseline', 'A');

insert into public.migration_jobs (
  id, idempotency_key, source_fingerprint
) values (
  '31000000-0000-4000-8000-000000000030',
  'backup-test-migration',
  'backup-test-source'
);

do $$
declare
  result jsonb;
begin
  select public.create_backup_snapshot('  Before import  ') into result;
  if result -> 'data' ->> 'id' is null
    or result -> 'data' ->> 'owner_user_id'
      <> '31000000-0000-4000-8000-000000000001'
    or result -> 'data' ->> 'schema_version' <> '1'
    or result -> 'data' ->> 'label' <> 'Before import'
    or char_length(result -> 'data' ->> 'checksum') <> 64
    or (result -> 'data' -> 'row_counts' ->> 'companies')::integer <> 1 then
    raise exception 'create backup response differs from contract: %', result;
  end if;

  perform set_config('dealpilot_test.backup_id', result -> 'data' ->> 'id', true);

  if exists (
    select 1
    from public.backup_snapshots
    where id = (result -> 'data' ->> 'id')::uuid
      and (payload ? 'audit_events' or payload ? 'migration_jobs')
  ) then
    raise exception 'backup payload includes operational audit or migration history';
  end if;
end;
$$;

do $$
begin
  begin
    insert into public.backup_snapshots (
      owner_user_id, schema_version, checksum, payload
    ) values (
      auth.uid(), 1, repeat('0', 64), '{}'::jsonb
    );
    raise exception 'authenticated user unexpectedly inserted a raw backup';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

update public.companies
set name = 'Changed after snapshot', grade = 'C'
where id = '31000000-0000-4000-8000-000000000010';

do $$
declare
  result jsonb;
begin
  select public.restore_backup_snapshot(
    current_setting('dealpilot_test.backup_id')::uuid
  ) into result;

  if result -> 'data' ->> 'id' <> current_setting('dealpilot_test.backup_id')
    or result -> 'data' ->> 'schema_version' <> '1'
    or char_length(result -> 'data' ->> 'checksum') <> 64
    or result -> 'data' ->> 'safety_snapshot_id' is null
    or (result -> 'data' -> 'restored_counts' ->> 'companies')::integer <> 1
    or (result -> 'data' -> 'restored_counts' ->> 'configuration')::integer <> 1 then
    raise exception 'restore backup response differs from contract: %', result;
  end if;

  if (select count(*) from public.backup_snapshots) <> 2 then
    raise exception 'restore did not retain the original and safety snapshots';
  end if;

  if not exists (
    select 1
    from public.companies
    where id = '31000000-0000-4000-8000-000000000010'
      and name = 'Snapshot baseline'
      and grade = 'A'
  ) then
    raise exception 'restore did not replace the current owner data';
  end if;

  if not exists (
    select 1
    from public.audit_events
    where event_type = 'backup.restored'
      and entity_id = current_setting('dealpilot_test.backup_id')::uuid
  ) then
    raise exception 'restore audit event was not written';
  end if;

  if not exists (
    select 1
    from public.audit_events
    where event_type = 'backup.created'
      and entity_id = (result -> 'data' ->> 'safety_snapshot_id')::uuid
  ) then
    raise exception 'safety snapshot audit event was not preserved';
  end if;

  if not exists (
    select 1
    from public.audit_events
    where id = '31000000-0000-4000-8000-000000000020'
      and event_type = 'test.audit.before_backup'
  ) then
    raise exception 'restore replaced existing audit history';
  end if;

  if not exists (
    select 1
    from public.migration_jobs
    where id = '31000000-0000-4000-8000-000000000030'
      and idempotency_key = 'backup-test-migration'
  ) then
    raise exception 'restore replaced existing migration history';
  end if;
end;
$$;

select set_config(
  'request.jwt.claims',
  '{"sub":"32000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

do $$
begin
  if exists (select 1 from public.backup_snapshots) then
    raise exception 'RLS exposed another account backup';
  end if;

  begin
    perform public.restore_backup_snapshot(
      current_setting('dealpilot_test.backup_id')::uuid
    );
    raise exception 'cross-account backup restore unexpectedly succeeded';
  exception
    when no_data_found then null;
  end;
end;
$$;

rollback;
