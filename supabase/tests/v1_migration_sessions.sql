-- V1 SQLite-to-cloud migration protocol, isolation, and atomicity checks.
-- Run after all migrations with psql -v ON_ERROR_STOP=1.

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000000', '41000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'migration-a@example.test', '', now(), '{}', '{"display_name":"Migration A"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '42000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'migration-b@example.test', '', now(), '{}', '{"display_name":"Migration B"}', now(), now());

create function pg_temp.make_migration_record(
  p_collection text,
  p_source_id uuid,
  p_payload jsonb
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'source_id', p_source_id,
    'idempotency_key', format('v1:%s:%s', p_collection, p_source_id),
    'payload_json', p_payload::text,
    'checksum_sha256', encode(
      extensions.digest(p_payload::text, 'sha256'),
      'hex'
    )
  );
$$;

create function pg_temp.migration_manifest(p_records jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  collection_name text;
  collection_records jsonb;
  counts jsonb := '{}'::jsonb;
  checksums jsonb := '{}'::jsonb;
begin
  foreach collection_name in array array[
    'companies', 'contacts', 'social_accounts', 'deals', 'follow_ups',
    'reminders', 'deal_risks', 'deal_milestones', 'audit_events',
    'deletion_snapshots'
  ] loop
    collection_records := coalesce(p_records -> collection_name, '[]'::jsonb);
    counts := counts || jsonb_build_object(
      collection_name,
      jsonb_array_length(collection_records)
    );
    checksums := checksums || jsonb_build_object(
      collection_name,
      encode(extensions.digest(coalesce((
        select string_agg(record ->> 'checksum_sha256', '' order by record ->> 'source_id')
        from jsonb_array_elements(collection_records) as staged(record)
      ), ''), 'sha256'), 'hex')
    );
  end loop;
  return jsonb_build_object('counts', counts, 'checksums', checksums);
end;
$$;

do $$
declare
  deleted_at_value timestamptz := date_trunc('second', now() - interval '1 day');
  all_records jsonb;
begin
  all_records := jsonb_build_object(
    'companies', jsonb_build_array(pg_temp.make_migration_record(
      'companies', '41000000-0000-4000-8000-000000000010', jsonb_build_object(
        'id', '41000000-0000-4000-8000-000000000010',
        'name', 'Migrated customer',
        'company', 'V1 Company Ltd',
        'country', 'CN',
        'source', 'v1',
        'grade', 'A',
        'status', 'active',
        'deleted_at', deleted_at_value,
        'created_at', deleted_at_value - interval '30 days',
        'updated_at', deleted_at_value
      )
    )),
    'contacts', jsonb_build_array(pg_temp.make_migration_record(
      'contacts', '41000000-0000-4000-8000-000000000011', jsonb_build_object(
        'id', '41000000-0000-4000-8000-000000000011',
        'company_id', '41000000-0000-4000-8000-000000000010',
        'name', 'V1 Buyer',
        'title', 'Manager',
        'email_jsonb', jsonb_build_array(jsonb_build_object('email', 'buyer@example.test', 'type', 'Work')),
        'phone_jsonb', jsonb_build_array(jsonb_build_object('number', '+8613800000000', 'type', 'Work')),
        'created_at', deleted_at_value - interval '29 days'
      )
    )),
    'social_accounts', jsonb_build_array(pg_temp.make_migration_record(
      'social_accounts', '41000000-0000-4000-8000-000000000012', jsonb_build_object(
        'id', '41000000-0000-4000-8000-000000000012',
        'company_id', '41000000-0000-4000-8000-000000000010',
        'contact_id', '41000000-0000-4000-8000-000000000011',
        'platform', 'whatsapp',
        'raw_identifier', '+8613800000000',
        'normalized_identifier', '+8613800000000',
        'manually_bound', true,
        'created_at', deleted_at_value - interval '28 days'
      )
    )),
    'deals', jsonb_build_array(pg_temp.make_migration_record(
      'deals', '41000000-0000-4000-8000-000000000013', jsonb_build_object(
        'id', '41000000-0000-4000-8000-000000000013',
        'company_id', '41000000-0000-4000-8000-000000000010',
        'name', 'V1 Deal',
        'stage', 'proposal',
        'grade', 'A',
        'currency', 'USD',
        'amount', 1000,
        'probability', 50,
        'expected_closing_date', (current_date + 30)::text,
        'created_at', deleted_at_value - interval '27 days',
        'updated_at', deleted_at_value
      )
    )),
    'follow_ups', jsonb_build_array(pg_temp.make_migration_record(
      'follow_ups', '41000000-0000-4000-8000-000000000014', jsonb_build_object(
        'id', '41000000-0000-4000-8000-000000000014',
        'company_id', '41000000-0000-4000-8000-000000000010',
        'deal_id', '41000000-0000-4000-8000-000000000013',
        'type', 'call',
        'note', 'Migrated follow-up',
        'occurred_at', deleted_at_value - interval '2 days',
        'created_at', deleted_at_value - interval '2 days'
      )
    )),
    'reminders', jsonb_build_array(pg_temp.make_migration_record(
      'reminders', '41000000-0000-4000-8000-000000000015', jsonb_build_object(
        'id', '41000000-0000-4000-8000-000000000015',
        'company_id', '41000000-0000-4000-8000-000000000010',
        'deal_id', '41000000-0000-4000-8000-000000000013',
        'type', 'fixed_time',
        'status', 'ignored',
        'due_at', deleted_at_value + interval '2 days',
        'priority', 'high',
        'resolution', 'Customer deleted',
        'created_at', deleted_at_value - interval '3 days',
        'updated_at', deleted_at_value
      )
    )),
    'deal_risks', jsonb_build_array(pg_temp.make_migration_record(
      'deal_risks', '41000000-0000-4000-8000-000000000016', jsonb_build_object(
        'id', '41000000-0000-4000-8000-000000000016',
        'deal_id', '41000000-0000-4000-8000-000000000013',
        'description', 'Migrated risk',
        'severity', 'high',
        'status', 'open',
        'created_at', deleted_at_value - interval '5 days'
      )
    )),
    'deal_milestones', jsonb_build_array(pg_temp.make_migration_record(
      'deal_milestones', '41000000-0000-4000-8000-000000000017', jsonb_build_object(
        'id', '41000000-0000-4000-8000-000000000017',
        'deal_id', '41000000-0000-4000-8000-000000000013',
        'name', 'Migrated milestone',
        'due_date', (current_date + 15)::text,
        'completed', false,
        'created_at', deleted_at_value - interval '4 days'
      )
    )),
    'audit_events', jsonb_build_array(pg_temp.make_migration_record(
      'audit_events', '41000000-0000-4000-8000-000000000018', jsonb_build_object(
        'id', '41000000-0000-4000-8000-000000000018',
        'event_type', 'project.stage_changed',
        'entity_type', 'project',
        'entity_id', '41000000-0000-4000-8000-000000000013',
        'metadata', jsonb_build_object('from', 'lead', 'to', 'proposal'),
        'occurred_at', deleted_at_value - interval '1 day'
      )
    )),
    'deletion_snapshots', jsonb_build_array(pg_temp.make_migration_record(
      'deletion_snapshots', '41000000-0000-4000-8000-000000000019', jsonb_build_object(
        'id', '41000000-0000-4000-8000-000000000019',
        'event_type', 'customer.soft_deleted',
        'entity_type', 'customer',
        'entity_id', '41000000-0000-4000-8000-000000000010',
        'metadata', jsonb_build_object(
          'reminders', jsonb_build_array(jsonb_build_object(
            'id', '41000000-0000-4000-8000-000000000015',
            'status', 'pending',
            'resolution', null
          ))
        ),
        'occurred_at', deleted_at_value
      )
    ))
  );

  perform set_config('dealpilot_test.migration_records', all_records::text, true);
  perform set_config(
    'dealpilot_test.migration_manifest',
    pg_temp.migration_manifest(all_records)::text,
    true
  );
end;
$$;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"41000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

do $$
begin
  begin
    insert into public.migration_jobs (
      idempotency_key, source_fingerprint
    ) values ('raw-job', repeat('1', 64));
    raise exception 'authenticated user unexpectedly inserted a raw migration job';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.migration_staging_rows (
      migration_job_id, collection, source_id, idempotency_key,
      payload_json, payload, payload_checksum
    ) values (
      '41000000-0000-4000-8000-000000000099',
      'companies',
      '41000000-0000-4000-8000-000000000098',
      'raw-stage',
      '{}', '{}'::jsonb, repeat('0', 64)
    );
    raise exception 'authenticated user unexpectedly inserted a raw staging row';
  exception when insufficient_privilege then null;
  end;
end;
$$;

do $$
declare
  manifest jsonb := current_setting('dealpilot_test.migration_manifest')::jsonb;
  first_result jsonb;
  replay_result jsonb;
begin
  select public.begin_v1_migration(
    'v1-session-success', repeat('a', 64), repeat('b', 64),
    manifest -> 'counts', manifest -> 'checksums',
    '{"locale":"zh-CN","theme":"dark"}'::jsonb
  ) into first_result;
  select public.begin_v1_migration(
    'v1-session-success', repeat('a', 64), repeat('b', 64),
    manifest -> 'counts', manifest -> 'checksums',
    '{"locale":"zh-CN","theme":"dark"}'::jsonb
  ) into replay_result;

  if first_result -> 'data' ->> 'id' is distinct from replay_result -> 'data' ->> 'id'
    or replay_result -> 'data' ->> 'status' <> 'running' then
    raise exception 'begin migration did not replay the original job: %, %', first_result, replay_result;
  end if;
  perform set_config('dealpilot_test.migration_job_id', first_result -> 'data' ->> 'id', true);

  begin
    perform public.begin_v1_migration(
      'v1-session-success', repeat('c', 64), repeat('b', 64),
      manifest -> 'counts', manifest -> 'checksums',
      '{"locale":"zh-CN","theme":"dark"}'::jsonb
    );
    raise exception 'idempotency key accepted a different source';
  exception when unique_violation then null;
  end;

  begin
    update public.migration_jobs set status = 'failed'
    where id = (first_result -> 'data' ->> 'id')::uuid;
    raise exception 'authenticated user unexpectedly updated a migration job';
  exception when insufficient_privilege then null;
  end;
end;
$$;

do $$
declare
  job_id uuid := current_setting('dealpilot_test.migration_job_id')::uuid;
  records jsonb := current_setting('dealpilot_test.migration_records')::jsonb;
  result jsonb;
  collection_name text;
  oversized_batch jsonb;
  conflicting_record jsonb;
begin
  -- Child rows are accepted before parents because staging has no domain FKs.
  select public.stage_v1_migration_batch(
    job_id, 'contacts', records -> 'contacts'
  ) into result;
  if result -> 'data' ->> 'inserted' <> '1' then
    raise exception 'out-of-order contact staging failed: %', result;
  end if;

  select public.reconcile_v1_migration(job_id) into result;
  if (result -> 'data' ->> 'ready')::boolean
    or jsonb_array_length(result -> 'data' -> 'differences') = 0 then
    raise exception 'partial staging unexpectedly reconciled: %', result;
  end if;

  select public.stage_v1_migration_batch(
    job_id, 'contacts', records -> 'contacts'
  ) into result;
  if result -> 'data' ->> 'replayed' <> '1'
    or result -> 'data' ->> 'inserted' <> '0' then
    raise exception 'exact batch retry was not idempotent: %', result;
  end if;

  conflicting_record := pg_temp.make_migration_record(
    'contacts',
    '41000000-0000-4000-8000-000000000011',
    (records -> 'contacts' -> 0 ->> 'payload_json')::jsonb
      || '{"name":"Conflicting buyer"}'::jsonb
  );
  begin
    perform public.stage_v1_migration_batch(
      job_id, 'contacts', jsonb_build_array(conflicting_record)
    );
    raise exception 'same source ID accepted a conflicting payload';
  exception when unique_violation then null;
  end;

  select jsonb_agg(records -> 'companies' -> 0)
  into oversized_batch
  from generate_series(1, 501);
  begin
    perform public.stage_v1_migration_batch(
      job_id, 'companies', oversized_batch
    );
    raise exception 'oversized migration batch was accepted';
  exception when invalid_parameter_value then null;
  end;

  foreach collection_name in array array[
    'companies', 'social_accounts', 'deals', 'follow_ups', 'reminders',
    'deal_risks', 'deal_milestones', 'audit_events', 'deletion_snapshots'
  ] loop
    perform public.stage_v1_migration_batch(
      job_id, collection_name, records -> collection_name
    );
  end loop;

  select public.reconcile_v1_migration(job_id) into result;
  if not (result -> 'data' ->> 'ready')::boolean
    or result -> 'data' ->> 'status' <> 'awaiting_confirmation'
    or jsonb_array_length(result -> 'data' -> 'differences') <> 0 then
    raise exception 'complete staging did not reconcile: %', result;
  end if;
end;
$$;

select set_config(
  'request.jwt.claims',
  '{"sub":"42000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

do $$
declare
  other_job_id uuid := current_setting('dealpilot_test.migration_job_id')::uuid;
  manifest jsonb := current_setting('dealpilot_test.migration_manifest')::jsonb;
  records jsonb := current_setting('dealpilot_test.migration_records')::jsonb;
begin
  if exists (select 1 from public.migration_jobs)
    or exists (select 1 from public.migration_staging_rows) then
    raise exception 'RLS exposed another account migration state';
  end if;

  begin
    perform public.stage_v1_migration_batch(other_job_id, 'companies', records -> 'companies');
    raise exception 'cross-account staging unexpectedly succeeded';
  exception when no_data_found then null;
  end;
  begin
    perform public.reconcile_v1_migration(other_job_id);
    raise exception 'cross-account reconcile unexpectedly succeeded';
  exception when no_data_found then null;
  end;
  begin
    perform public.confirm_v1_migration(
      other_job_id, repeat('a', 64), manifest -> 'counts', manifest -> 'checksums'
    );
    raise exception 'cross-account confirmation unexpectedly succeeded';
  exception when no_data_found then null;
  end;
  begin
    perform public.abandon_v1_migration(other_job_id);
    raise exception 'cross-account abandon unexpectedly succeeded';
  exception when no_data_found then null;
  end;
end;
$$;

select set_config(
  'request.jwt.claims',
  '{"sub":"41000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

do $$
declare
  job_id uuid := current_setting('dealpilot_test.migration_job_id')::uuid;
  manifest jsonb := current_setting('dealpilot_test.migration_manifest')::jsonb;
  result jsonb;
begin
  begin
    perform public.confirm_v1_migration(
      job_id, repeat('f', 64), manifest -> 'counts', manifest -> 'checksums'
    );
    raise exception 'confirmation accepted the wrong source fingerprint';
  exception when invalid_parameter_value then null;
  end;
  if exists (select 1 from public.companies) then
    raise exception 'failed confirmation left partial CRM data';
  end if;

  select public.confirm_v1_migration(
    job_id, repeat('a', 64), manifest -> 'counts', manifest -> 'checksums'
  ) into result;
  if result -> 'data' ->> 'status' <> 'confirmed'
    or not (result -> 'data' ->> 'staging_cleared')::boolean then
    raise exception 'confirmation response differs from contract: %', result;
  end if;

  if (select count(*) from public.companies) <> 1
    or (select count(*) from public.contacts) <> 1
    or (select count(*) from public.social_accounts) <> 1
    or (select count(*) from public.deals) <> 1
    or (select count(*) from public.follow_ups) <> 1
    or (select count(*) from public.reminders) <> 1
    or (select count(*) from public.deal_risks) <> 1
    or (select count(*) from public.deal_milestones) <> 1 then
    raise exception 'confirmed migration did not materialize all CRM collections';
  end if;
  if exists (select 1 from public.migration_staging_rows)
    or not exists (
      select 1 from public.migration_jobs
      where id = job_id and status = 'confirmed'
        and confirmed_at is not null and completed_at is not null
    ) then
    raise exception 'confirmed migration retained staging data or wrong job state';
  end if;
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and locale = 'zh-CN' and theme = 'dark'
  ) or not exists (
    select 1 from public.audit_events
    where event_type = 'migration.confirmed' and entity_id = job_id
  ) then
    raise exception 'confirmed migration omitted preferences or confirmation audit';
  end if;
  if not exists (
    select 1 from public.reminders
    where status = 'ignored' and resolution = 'Customer deleted'
      and deletion_event_id is not null
  ) then
    raise exception 'deletion snapshot was not linked to the migrated reminder';
  end if;

  select public.restore_customer((select id from public.companies limit 1)) into result;
  if result -> 'data' ->> 'deleted_at' is not null
    or not exists (
      select 1 from public.reminders
      where status = 'pending' and resolution is null and deletion_event_id is null
    ) then
    raise exception 'migrated deletion snapshot did not preserve restore behavior: %', result;
  end if;

  begin
    perform public.abandon_v1_migration(job_id);
    raise exception 'confirmed migration unexpectedly returned to local mode';
  exception when object_not_in_prerequisite_state then null;
  end;
  if not exists (select 1 from public.companies)
    or not exists (select 1 from public.migration_jobs where id = job_id and status = 'confirmed') then
    raise exception 'post-confirmation rejection changed PostgreSQL source-of-truth data';
  end if;
end;
$$;

select set_config(
  'request.jwt.claims',
  '{"sub":"42000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

do $$
declare
  bad_records jsonb;
  manifest jsonb;
  job_id uuid;
  result jsonb;
begin
  bad_records := jsonb_build_object(
    'companies', jsonb_build_array(pg_temp.make_migration_record(
      'companies', '42000000-0000-4000-8000-000000000010', jsonb_build_object(
        'id', '42000000-0000-4000-8000-000000000010',
        'name', 'Must roll back',
        'grade', 'B',
        'status', 'active'
      )
    )),
    'contacts', jsonb_build_array(pg_temp.make_migration_record(
      'contacts', '42000000-0000-4000-8000-000000000011', jsonb_build_object(
        'id', '42000000-0000-4000-8000-000000000011',
        'company_id', 'not-a-uuid',
        'name', 'Invalid child',
        'email_jsonb', '[]'::jsonb,
        'phone_jsonb', '[]'::jsonb
      )
    )),
    'social_accounts', '[]'::jsonb,
    'deals', '[]'::jsonb,
    'follow_ups', '[]'::jsonb,
    'reminders', '[]'::jsonb,
    'deal_risks', '[]'::jsonb,
    'deal_milestones', '[]'::jsonb,
    'audit_events', '[]'::jsonb,
    'deletion_snapshots', '[]'::jsonb
  );
  manifest := pg_temp.migration_manifest(bad_records);

  select (public.begin_v1_migration(
    'v1-session-rollback', repeat('d', 64), repeat('e', 64),
    manifest -> 'counts', manifest -> 'checksums',
    '{"locale":"zh-CN","theme":"light"}'::jsonb
  ) -> 'data' ->> 'id')::uuid into job_id;
  perform public.stage_v1_migration_batch(job_id, 'contacts', bad_records -> 'contacts');
  perform public.stage_v1_migration_batch(job_id, 'companies', bad_records -> 'companies');
  select public.reconcile_v1_migration(job_id) into result;
  if not (result -> 'data' ->> 'ready')::boolean then
    raise exception 'invalid domain payload did not pass transport reconciliation';
  end if;

  begin
    perform public.confirm_v1_migration(
      job_id, repeat('d', 64), manifest -> 'counts', manifest -> 'checksums'
    );
    raise exception 'invalid domain payload unexpectedly confirmed';
  exception when invalid_text_representation then null;
  end;
  if exists (select 1 from public.companies)
    or exists (select 1 from public.contacts) then
    raise exception 'failed confirmation did not roll back earlier inserts';
  end if;

  select public.abandon_v1_migration(job_id) into result;
  if result -> 'data' ->> 'status' <> 'abandoned'
    or exists (select 1 from public.migration_staging_rows)
    or not exists (
      select 1 from public.migration_jobs
      where id = job_id and status = 'abandoned' and abandoned_at is not null
    ) then
    raise exception 'abandon did not clear staging and close the session: %', result;
  end if;
end;
$$;

rollback;
