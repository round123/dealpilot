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

insert into public.deals (id, company_id, name, amount)
values (
  '31000000-0000-4000-8000-000000000011',
  '31000000-0000-4000-8000-000000000010',
  'Snapshot scaled amount',
  175000.00
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
      and payload ? 'audit_events'
  ) then
    raise exception 'backup payload includes operational audit history';
  end if;
end;
$$;

do $$
declare
  exported jsonb;
begin
  select public.export_backup_snapshot(
    current_setting('dealpilot_test.backup_id')::uuid
  ) into exported;
  if exported -> 'data' ->> 'id' <> current_setting('dealpilot_test.backup_id')
    or exported -> 'data' ->> 'schema_version' <> '1'
    or char_length(exported -> 'data' ->> 'checksum') <> 64
    or jsonb_typeof(exported -> 'data' -> 'payload') is distinct from 'object'
    or exported -> 'data' -> 'payload' -> 'companies' -> 0 ->> 'name'
      <> 'Snapshot baseline' then
    raise exception 'export backup response differs from contract: %', exported;
  end if;
  perform set_config('dealpilot_test.exported_backup', exported::text, true);
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
set name = 'Changed before encrypted restore', grade = 'C'
where id = '31000000-0000-4000-8000-000000000010';

do $$
declare
  exported jsonb := current_setting('dealpilot_test.exported_backup')::jsonb;
  wire_payload jsonb;
  result jsonb;
  snapshot_count_before integer;
begin
  wire_payload := jsonb_set(
    exported -> 'data' -> 'payload',
    '{deals,0,amount}',
    '175000'::jsonb
  );
  if encode(extensions.digest(wire_payload::text, 'sha256'), 'hex')
    = exported -> 'data' ->> 'checksum' then
    raise exception 'wire payload unexpectedly retained the scaled checksum';
  end if;

  select count(*) into snapshot_count_before from public.backup_snapshots;
  select public.restore_backup_payload(
    (exported -> 'data' ->> 'schema_version')::integer,
    exported -> 'data' ->> 'checksum',
    wire_payload
  ) into result;

  if result -> 'data' ->> 'checksum' <> exported -> 'data' ->> 'checksum'
    or result -> 'data' ->> 'safety_snapshot_id' is null
    or (result -> 'data' -> 'restored_counts' ->> 'companies')::integer <> 1 then
    raise exception 'portable payload restore response differs from contract: %', result;
  end if;
  if (select count(*) from public.backup_snapshots) <> snapshot_count_before + 1 then
    raise exception 'portable restore did not retain exactly one safety snapshot';
  end if;
  if exists (
    select 1 from public.backup_snapshots
    where id = (result -> 'data' ->> 'id')::uuid
  ) then
    raise exception 'temporary portable restore snapshot was retained';
  end if;
  if not exists (
    select 1 from public.companies
    where id = '31000000-0000-4000-8000-000000000010'
      and name = 'Snapshot baseline'
      and grade = 'A'
  ) then
    raise exception 'portable payload restore did not replace current owner data';
  end if;
  if not exists (
    select 1 from public.deals
    where id = '31000000-0000-4000-8000-000000000011'
      and amount = 175000.00
  ) then
    raise exception 'portable payload restore did not preserve numeric scale';
  end if;
end;
$$;

update public.deals
set amount = 190000.00
where id = '31000000-0000-4000-8000-000000000011';

do $$
declare
  exported jsonb := current_setting('dealpilot_test.exported_backup')::jsonb;
  tampered_payload jsonb;
  snapshot_count_before integer;
begin
  tampered_payload := jsonb_set(
    exported -> 'data' -> 'payload',
    '{deals,0,amount}',
    '175001'::jsonb
  );
  select count(*) into snapshot_count_before from public.backup_snapshots;
  begin
    perform public.restore_backup_payload(
      1,
      exported -> 'data' ->> 'checksum',
      tampered_payload
    );
    raise exception 'changed numeric value unexpectedly passed checksum validation';
  exception
    when invalid_parameter_value then null;
  end;

  if not exists (
    select 1 from public.deals
    where id = '31000000-0000-4000-8000-000000000011'
      and amount = 190000.00
  ) or (select count(*) from public.backup_snapshots) <> snapshot_count_before then
    raise exception 'changed numeric restore modified current data or snapshots';
  end if;
end;
$$;

update public.companies
set name = 'Must survive invalid encrypted restore'
where id = '31000000-0000-4000-8000-000000000010';

do $$
declare
  exported jsonb := current_setting('dealpilot_test.exported_backup')::jsonb;
  snapshot_count_before integer;
begin
  select count(*) into snapshot_count_before from public.backup_snapshots;
  begin
    perform public.restore_backup_payload(
      1,
      repeat('0', 64),
      exported -> 'data' -> 'payload'
    );
    raise exception 'tampered portable backup unexpectedly restored';
  exception
    when invalid_parameter_value then null;
  end;

  if not exists (
    select 1 from public.companies
    where id = '31000000-0000-4000-8000-000000000010'
      and name = 'Must survive invalid encrypted restore'
  ) or (select count(*) from public.backup_snapshots) <> snapshot_count_before then
    raise exception 'tampered portable restore changed current data or snapshots';
  end if;
end;
$$;

do $$
declare
  exported jsonb := current_setting('dealpilot_test.exported_backup')::jsonb;
  malformed_payload jsonb;
  malformed_checksum text;
  snapshot_count_before integer;
begin
  malformed_payload := jsonb_set(
    exported -> 'data' -> 'payload',
    '{contacts}',
    jsonb_build_array(jsonb_build_object(
      'id', '31000000-0000-4000-8000-000000000099',
      'owner_user_id', auth.uid(),
      'company_id', '31000000-0000-4000-8000-000000000010',
      'has_newsletter', false,
      'email_jsonb', '[]'::jsonb,
      'phone_jsonb', '[]'::jsonb,
      'created_at', now(),
      'updated_at', now()
    ))
  );
  malformed_checksum := encode(
    extensions.digest(malformed_payload::text, 'sha256'),
    'hex'
  );
  select count(*) into snapshot_count_before from public.backup_snapshots;
  begin
    perform public.restore_backup_payload(
      1,
      malformed_checksum,
      malformed_payload
    );
    raise exception 'malformed portable backup unexpectedly restored';
  exception
    when check_violation then null;
  end;

  if not exists (
    select 1 from public.companies
    where id = '31000000-0000-4000-8000-000000000010'
      and name = 'Must survive invalid encrypted restore'
  ) or (select count(*) from public.backup_snapshots) <> snapshot_count_before then
    raise exception 'failed portable restore changed current data or snapshots';
  end if;
end;
$$;

update public.companies
set name = 'Changed after snapshot', grade = 'C'
where id = '31000000-0000-4000-8000-000000000010';

do $$
declare
  result jsonb;
  snapshot_count_before integer;
begin
  select count(*) into snapshot_count_before from public.backup_snapshots;
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

  if (select count(*) from public.backup_snapshots) <> snapshot_count_before + 1 then
    raise exception 'restore did not retain exactly one additional safety snapshot';
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
    select 1 from public.deals
    where id = '31000000-0000-4000-8000-000000000011'
      and amount = 175000.00
  ) then
    raise exception 'restore did not preserve the scaled deal amount';
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

  begin
    perform public.export_backup_snapshot(
      current_setting('dealpilot_test.backup_id')::uuid
    );
    raise exception 'cross-account backup export unexpectedly succeeded';
  exception
    when no_data_found then null;
  end;

  begin
    perform public.restore_backup_payload(
      1,
      current_setting('dealpilot_test.exported_backup')::jsonb -> 'data' ->> 'checksum',
      current_setting('dealpilot_test.exported_backup')::jsonb -> 'data' -> 'payload'
    );
    raise exception 'cross-account portable restore unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

rollback;
