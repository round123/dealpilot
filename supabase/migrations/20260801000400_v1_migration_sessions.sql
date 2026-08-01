-- Transactional V1 SQLite migration sessions. Clients can upload deterministic
-- bundle records out of order, but only a reconciled owner-scoped session can
-- atomically materialize data into the cloud tables.

alter table public.migration_jobs
  add column snapshot_checksum text,
  add column user_preferences jsonb not null default '{}'::jsonb,
  add column abandoned_at timestamptz,
  add constraint migration_jobs_snapshot_checksum_shape check (
    snapshot_checksum is null or snapshot_checksum ~ '^[0-9a-f]{64}$'
  ),
  add constraint migration_jobs_user_preferences_object check (
    jsonb_typeof(user_preferences) = 'object'
  );

create table public.migration_staging_rows (
  owner_user_id uuid not null default auth.uid(),
  migration_job_id uuid not null,
  collection text not null check (collection in (
    'companies', 'contacts', 'social_accounts', 'deals', 'follow_ups',
    'reminders', 'deal_risks', 'deal_milestones', 'audit_events',
    'deletion_snapshots'
  )),
  source_id uuid not null,
  idempotency_key text not null check (btrim(idempotency_key) <> ''),
  payload_json text not null check (btrim(payload_json) <> ''),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  payload_checksum text not null check (payload_checksum ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  primary key (owner_user_id, migration_job_id, collection, source_id),
  unique (owner_user_id, migration_job_id, idempotency_key),
  constraint migration_staging_rows_job_fkey
    foreign key (owner_user_id, migration_job_id)
    references public.migration_jobs(owner_user_id, id)
    on delete cascade
);

create index migration_staging_rows_job_collection_idx
  on public.migration_staging_rows (
    owner_user_id, migration_job_id, collection, source_id
  );

alter table public.migration_staging_rows enable row level security;
alter table public.migration_staging_rows force row level security;

create policy migration_staging_rows_owner_select
on public.migration_staging_rows
for select to authenticated
using (owner_user_id = auth.uid());

revoke all on table public.migration_staging_rows
  from public, anon, authenticated, service_role;
grant select on table public.migration_staging_rows to authenticated;

-- Migration job mutation is RPC-only. Existing owner RLS still protects reads.
revoke insert, update, delete on table public.migration_jobs from authenticated;

create function public.v1_migration_collections()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    'companies', 'contacts', 'social_accounts', 'deals', 'follow_ups',
    'reminders', 'deal_risks', 'deal_milestones', 'audit_events',
    'deletion_snapshots'
  ]::text[];
$$;

create function public.v1_migration_target_id(
  p_owner_user_id uuid,
  p_collection text,
  p_source_id uuid
)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select (
    substr(hash_value, 1, 8) || '-' ||
    substr(hash_value, 9, 4) || '-5' ||
    substr(hash_value, 14, 3) || '-8' ||
    substr(hash_value, 18, 3) || '-' ||
    substr(hash_value, 21, 12)
  )::uuid
  from (
    select encode(
      extensions.digest(
        p_owner_user_id::text || ':' || p_collection || ':' || p_source_id::text,
        'sha256'
      ),
      'hex'
    ) as hash_value
  ) as digest_value;
$$;

create function public.validate_v1_migration_manifest(
  p_counts jsonb,
  p_checksums jsonb
)
returns void
language plpgsql
immutable
set search_path = ''
as $$
declare
  collection_name text;
  count_value numeric;
begin
  if jsonb_typeof(p_counts) is distinct from 'object'
    or jsonb_typeof(p_checksums) is distinct from 'object' then
    raise exception using errcode = '22023', message = 'Migration manifest must contain count and checksum objects';
  end if;

  if exists (
    select 1 from jsonb_object_keys(p_counts) as key
    where not (key = any(public.v1_migration_collections()))
  ) or exists (
    select 1 from jsonb_object_keys(p_checksums) as key
    where not (key = any(public.v1_migration_collections()))
  ) then
    raise exception using errcode = '22023', message = 'Migration manifest contains an unsupported collection';
  end if;

  foreach collection_name in array public.v1_migration_collections() loop
    if jsonb_typeof(p_counts -> collection_name) is distinct from 'number'
      or jsonb_typeof(p_checksums -> collection_name) is distinct from 'string'
      or (p_checksums ->> collection_name) !~ '^[0-9a-f]{64}$' then
      raise exception using errcode = '22023', message = format('Invalid manifest summary for %s', collection_name);
    end if;
    count_value := (p_counts ->> collection_name)::numeric;
    if count_value < 0 or count_value > 100000 or trunc(count_value) <> count_value then
      raise exception using errcode = '22023', message = format('Invalid migration count for %s', collection_name);
    end if;
  end loop;
end;
$$;

create function public.v1_migration_actual_manifest(
  p_owner_user_id uuid,
  p_job_id uuid
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  collection_name text;
  actual_count integer;
  actual_checksum text;
  actual_counts jsonb := '{}'::jsonb;
  actual_checksums jsonb := '{}'::jsonb;
begin
  foreach collection_name in array public.v1_migration_collections() loop
    select
      count(*)::integer,
      encode(
        extensions.digest(
          coalesce(string_agg(row.payload_checksum, '' order by row.source_id), ''),
          'sha256'
        ),
        'hex'
      )
    into actual_count, actual_checksum
    from public.migration_staging_rows as row
    where row.owner_user_id = p_owner_user_id
      and row.migration_job_id = p_job_id
      and row.collection = collection_name;

    actual_counts := actual_counts || jsonb_build_object(collection_name, actual_count);
    actual_checksums := actual_checksums || jsonb_build_object(collection_name, actual_checksum);
  end loop;

  return jsonb_build_object('counts', actual_counts, 'checksums', actual_checksums);
end;
$$;

create function public.begin_v1_migration(
  p_idempotency_key text,
  p_source_fingerprint text,
  p_snapshot_checksum text,
  p_expected_counts jsonb,
  p_expected_checksums jsonb,
  p_user_preferences jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_owner uuid := auth.uid();
  normalized_key text := btrim(p_idempotency_key);
  job public.migration_jobs;
begin
  if current_owner is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if normalized_key is null or normalized_key = '' or char_length(normalized_key) > 200
    or p_source_fingerprint is null
    or p_source_fingerprint !~ '^[0-9a-f]{64}$'
    or p_snapshot_checksum is null
    or p_snapshot_checksum !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'Invalid migration identity or source fingerprint';
  end if;
  perform public.validate_v1_migration_manifest(p_expected_counts, p_expected_checksums);
  if jsonb_typeof(p_user_preferences) is distinct from 'object'
    or jsonb_typeof(p_user_preferences -> 'locale') is distinct from 'string'
    or btrim(p_user_preferences ->> 'locale') = ''
    or char_length(p_user_preferences ->> 'locale') > 35
    or jsonb_typeof(p_user_preferences -> 'theme') is distinct from 'string'
    or p_user_preferences ->> 'theme' not in ('light', 'dark', 'system') then
    raise exception using errcode = '22023', message = 'Invalid migrated user preferences';
  end if;

  select * into job
  from public.migration_jobs
  where owner_user_id = current_owner and idempotency_key = normalized_key
  for update;

  if not found then
    insert into public.migration_jobs (
      owner_user_id, idempotency_key, source_fingerprint, snapshot_checksum,
      status, counts, checksums, user_preferences, started_at
    ) values (
      current_owner, normalized_key, p_source_fingerprint, p_snapshot_checksum,
      'running', p_expected_counts, p_expected_checksums,
      p_user_preferences, now()
    )
    on conflict (owner_user_id, idempotency_key) do nothing
    returning * into job;

    if not found then
      select * into job
      from public.migration_jobs
      where owner_user_id = current_owner and idempotency_key = normalized_key
      for update;
    end if;
  end if;

  if job.source_fingerprint is distinct from p_source_fingerprint
    or job.snapshot_checksum is distinct from p_snapshot_checksum
    or job.counts is distinct from p_expected_counts
    or job.checksums is distinct from p_expected_checksums
    or job.user_preferences is distinct from p_user_preferences then
    raise exception using errcode = '23505', message = 'Migration idempotency key was reused with different input';
  end if;
  if job.status in ('abandoned', 'failed') then
    delete from public.migration_staging_rows
    where owner_user_id = current_owner and migration_job_id = job.id;
    update public.migration_jobs
    set status = 'running', error_code = null, started_at = now(),
        completed_at = null, confirmed_at = null, abandoned_at = null,
        updated_at = now()
    where owner_user_id = current_owner and id = job.id
    returning * into job;
  end if;

  return jsonb_build_object('data', jsonb_build_object(
    'id', job.id,
    'status', job.status,
    'source_fingerprint', job.source_fingerprint,
    'snapshot_checksum', job.snapshot_checksum,
    'expected_counts', job.counts,
    'expected_checksums', job.checksums
  ));
end;
$$;

create function public.v1_migration_deletion_metadata(
  p_owner_user_id uuid,
  p_metadata jsonb
)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_set(
    p_metadata,
    '{reminders}',
    coalesce((
      select jsonb_agg(
        reminder.value || jsonb_build_object(
          'id',
          public.v1_migration_target_id(
            p_owner_user_id,
            'reminders',
            (reminder.value ->> 'id')::uuid
          )
        )
        order by reminder.ordinality
      )
      from jsonb_array_elements(
        coalesce(p_metadata -> 'reminders', '[]'::jsonb)
      ) with ordinality as reminder(value, ordinality)
    ), '[]'::jsonb),
    true
  );
$$;

create function public.confirm_v1_migration(
  p_job_id uuid,
  p_source_fingerprint text,
  p_expected_counts jsonb,
  p_expected_checksums jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_owner uuid := auth.uid();
  job public.migration_jobs;
  actual_manifest jsonb;
  confirmed_at_value timestamptz := clock_timestamp();
  imported_counts jsonb;
begin
  if current_owner is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  select * into job
  from public.migration_jobs
  where owner_user_id = current_owner and id = p_job_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Migration job not found';
  end if;
  if job.status <> 'awaiting_confirmation' then
    raise exception using errcode = '55000', message = 'Migration job is not awaiting confirmation';
  end if;
  if job.source_fingerprint is distinct from p_source_fingerprint
    or job.counts is distinct from p_expected_counts
    or job.checksums is distinct from p_expected_checksums then
    raise exception using errcode = '22023', message = 'Migration confirmation does not match the reconciled source';
  end if;

  actual_manifest := public.v1_migration_actual_manifest(current_owner, p_job_id);
  if actual_manifest -> 'counts' is distinct from job.counts
    or actual_manifest -> 'checksums' is distinct from job.checksums then
    raise exception using errcode = '22023', message = 'Staged migration data changed after reconciliation';
  end if;

  -- Child inserts take a key-share lock on profiles, so this closes the race
  -- between the empty-account check and materializing the staged snapshot.
  perform 1 from public.profiles where id = current_owner for update;

  if exists (select 1 from public.companies where owner_user_id = current_owner)
    or exists (select 1 from public.contacts where owner_user_id = current_owner)
    or exists (select 1 from public.social_accounts where owner_user_id = current_owner)
    or exists (select 1 from public.deals where owner_user_id = current_owner)
    or exists (select 1 from public.follow_ups where owner_user_id = current_owner)
    or exists (select 1 from public.reminders where owner_user_id = current_owner)
    or exists (select 1 from public.deal_risks where owner_user_id = current_owner)
    or exists (select 1 from public.deal_milestones where owner_user_id = current_owner) then
    raise exception using errcode = '55000', message = 'V1 migration requires an empty cloud CRM account';
  end if;

  set constraints all deferred;

  insert into public.companies (
    id, owner_user_id, name, company, country, source, grade, status,
    deleted_at, created_at, updated_at
  )
  select
    public.v1_migration_target_id(current_owner, 'companies', row.source_id),
    current_owner,
    row.payload ->> 'name',
    row.payload ->> 'company',
    row.payload ->> 'country',
    row.payload ->> 'source',
    coalesce((row.payload ->> 'grade')::public.customer_grade, 'B'),
    coalesce((row.payload ->> 'status')::public.customer_status, 'active'),
    (row.payload ->> 'deleted_at')::timestamptz,
    coalesce((row.payload ->> 'created_at')::timestamptz, confirmed_at_value),
    coalesce((row.payload ->> 'updated_at')::timestamptz, confirmed_at_value)
  from public.migration_staging_rows as row
  where row.owner_user_id = current_owner
    and row.migration_job_id = p_job_id
    and row.collection = 'companies';

  insert into public.contacts (
    id, owner_user_id, company_id, first_name, last_name, name, gender,
    title, background, first_seen, last_seen, has_newsletter, status,
    linkedin_url, email_jsonb, phone_jsonb, created_at, updated_at
  )
  select
    public.v1_migration_target_id(current_owner, 'contacts', row.source_id),
    current_owner,
    public.v1_migration_target_id(
      current_owner, 'companies', (row.payload ->> 'company_id')::uuid
    ),
    row.payload ->> 'first_name',
    row.payload ->> 'last_name',
    row.payload ->> 'name',
    row.payload ->> 'gender',
    row.payload ->> 'title',
    row.payload ->> 'background',
    (row.payload ->> 'first_seen')::timestamptz,
    (row.payload ->> 'last_seen')::timestamptz,
    coalesce((row.payload ->> 'has_newsletter')::boolean, false),
    row.payload ->> 'status',
    row.payload ->> 'linkedin_url',
    coalesce(row.payload -> 'email_jsonb', '[]'::jsonb),
    coalesce(row.payload -> 'phone_jsonb', '[]'::jsonb),
    coalesce((row.payload ->> 'created_at')::timestamptz, confirmed_at_value),
    coalesce((row.payload ->> 'updated_at')::timestamptz, confirmed_at_value)
  from public.migration_staging_rows as row
  where row.owner_user_id = current_owner
    and row.migration_job_id = p_job_id
    and row.collection = 'contacts';

  insert into public.social_accounts (
    id, owner_user_id, company_id, contact_id, platform, raw_identifier,
    normalized_identifier, manually_bound, created_at, updated_at
  )
  select
    public.v1_migration_target_id(current_owner, 'social_accounts', row.source_id),
    current_owner,
    public.v1_migration_target_id(
      current_owner, 'companies', (row.payload ->> 'company_id')::uuid
    ),
    case when row.payload ->> 'contact_id' is null then null else
      public.v1_migration_target_id(
        current_owner, 'contacts', (row.payload ->> 'contact_id')::uuid
      )
    end,
    row.payload ->> 'platform',
    row.payload ->> 'raw_identifier',
    row.payload ->> 'normalized_identifier',
    coalesce((row.payload ->> 'manually_bound')::boolean, false),
    coalesce((row.payload ->> 'created_at')::timestamptz, confirmed_at_value),
    coalesce((row.payload ->> 'updated_at')::timestamptz, confirmed_at_value)
  from public.migration_staging_rows as row
  where row.owner_user_id = current_owner
    and row.migration_job_id = p_job_id
    and row.collection = 'social_accounts';

  insert into public.deals (
    id, owner_user_id, company_id, name, category, stage, grade, description,
    currency, amount, probability, expected_closing_date, closed_reason,
    archived_at, sort_index, created_at, updated_at
  )
  select
    public.v1_migration_target_id(current_owner, 'deals', row.source_id),
    current_owner,
    public.v1_migration_target_id(
      current_owner, 'companies', (row.payload ->> 'company_id')::uuid
    ),
    row.payload ->> 'name',
    row.payload ->> 'category',
    coalesce((row.payload ->> 'stage')::public.deal_stage, 'lead'),
    coalesce((row.payload ->> 'grade')::public.deal_grade, 'C'),
    row.payload ->> 'description',
    coalesce(row.payload ->> 'currency', 'USD'),
    (row.payload ->> 'amount')::numeric,
    (row.payload ->> 'probability')::smallint,
    (row.payload ->> 'expected_closing_date')::date,
    row.payload ->> 'closed_reason',
    (row.payload ->> 'archived_at')::timestamptz,
    (row.payload ->> 'sort_index')::smallint,
    coalesce((row.payload ->> 'created_at')::timestamptz, confirmed_at_value),
    coalesce((row.payload ->> 'updated_at')::timestamptz, confirmed_at_value)
  from public.migration_staging_rows as row
  where row.owner_user_id = current_owner
    and row.migration_job_id = p_job_id
    and row.collection = 'deals';

  insert into public.follow_ups (
    id, owner_user_id, company_id, deal_id, type, note, message_body,
    message_direction, occurred_at, created_at, updated_at
  )
  select
    public.v1_migration_target_id(current_owner, 'follow_ups', row.source_id),
    current_owner,
    public.v1_migration_target_id(
      current_owner, 'companies', (row.payload ->> 'company_id')::uuid
    ),
    case when row.payload ->> 'deal_id' is null then null else
      public.v1_migration_target_id(
        current_owner, 'deals', (row.payload ->> 'deal_id')::uuid
      )
    end,
    (row.payload ->> 'type')::public.follow_up_type,
    row.payload ->> 'note',
    row.payload ->> 'message_body',
    (row.payload ->> 'message_direction')::public.message_direction,
    (row.payload ->> 'occurred_at')::timestamptz,
    coalesce((row.payload ->> 'created_at')::timestamptz, confirmed_at_value),
    coalesce((row.payload ->> 'updated_at')::timestamptz, confirmed_at_value)
  from public.migration_staging_rows as row
  where row.owner_user_id = current_owner
    and row.migration_job_id = p_job_id
    and row.collection = 'follow_ups';

  insert into public.reminders (
    id, owner_user_id, company_id, deal_id, type, status, due_at, priority,
    last_notified_at, snooze_until, resolution, deletion_event_id,
    created_at, updated_at
  )
  select
    public.v1_migration_target_id(current_owner, 'reminders', row.source_id),
    current_owner,
    public.v1_migration_target_id(
      current_owner, 'companies', (row.payload ->> 'company_id')::uuid
    ),
    case when row.payload ->> 'deal_id' is null then null else
      public.v1_migration_target_id(
        current_owner, 'deals', (row.payload ->> 'deal_id')::uuid
      )
    end,
    (row.payload ->> 'type')::public.reminder_type,
    coalesce((row.payload ->> 'status')::public.reminder_status, 'pending'),
    (row.payload ->> 'due_at')::timestamptz,
    coalesce((row.payload ->> 'priority')::public.reminder_priority, 'normal'),
    (row.payload ->> 'last_notified_at')::timestamptz,
    (row.payload ->> 'snooze_until')::timestamptz,
    row.payload ->> 'resolution',
    case when row.payload ->> 'status' = 'ignored' then (
      select public.v1_migration_target_id(
        current_owner, 'deletion_snapshots', snapshot.source_id
      )
      from public.migration_staging_rows as snapshot
      cross join lateral jsonb_array_elements(
        coalesce(snapshot.payload -> 'metadata' -> 'reminders', '[]'::jsonb)
      ) as snapshot_reminder(value)
      where snapshot.owner_user_id = current_owner
        and snapshot.migration_job_id = p_job_id
        and snapshot.collection = 'deletion_snapshots'
        and snapshot_reminder.value ->> 'id' = row.source_id::text
      order by (snapshot.payload ->> 'occurred_at')::timestamptz desc
      limit 1
    ) else null end,
    coalesce((row.payload ->> 'created_at')::timestamptz, confirmed_at_value),
    coalesce((row.payload ->> 'updated_at')::timestamptz, confirmed_at_value)
  from public.migration_staging_rows as row
  where row.owner_user_id = current_owner
    and row.migration_job_id = p_job_id
    and row.collection = 'reminders';

  insert into public.deal_risks (
    id, owner_user_id, deal_id, description, severity, status, handled_at,
    created_at, updated_at
  )
  select
    public.v1_migration_target_id(current_owner, 'deal_risks', row.source_id),
    current_owner,
    public.v1_migration_target_id(
      current_owner, 'deals', (row.payload ->> 'deal_id')::uuid
    ),
    row.payload ->> 'description',
    (row.payload ->> 'severity')::public.risk_severity,
    coalesce((row.payload ->> 'status')::public.risk_status, 'open'),
    (row.payload ->> 'handled_at')::timestamptz,
    coalesce((row.payload ->> 'created_at')::timestamptz, confirmed_at_value),
    coalesce((row.payload ->> 'updated_at')::timestamptz, confirmed_at_value)
  from public.migration_staging_rows as row
  where row.owner_user_id = current_owner
    and row.migration_job_id = p_job_id
    and row.collection = 'deal_risks';

  insert into public.deal_milestones (
    id, owner_user_id, deal_id, name, due_date, completed, created_at, updated_at
  )
  select
    public.v1_migration_target_id(current_owner, 'deal_milestones', row.source_id),
    current_owner,
    public.v1_migration_target_id(
      current_owner, 'deals', (row.payload ->> 'deal_id')::uuid
    ),
    row.payload ->> 'name',
    (row.payload ->> 'due_date')::date,
    coalesce((row.payload ->> 'completed')::boolean, false),
    coalesce((row.payload ->> 'created_at')::timestamptz, confirmed_at_value),
    coalesce((row.payload ->> 'updated_at')::timestamptz, confirmed_at_value)
  from public.migration_staging_rows as row
  where row.owner_user_id = current_owner
    and row.migration_job_id = p_job_id
    and row.collection = 'deal_milestones';

  insert into public.audit_events (
    id, owner_user_id, event_type, entity_type, entity_id, metadata, occurred_at
  )
  select
    public.v1_migration_target_id(current_owner, 'audit_events', row.source_id),
    current_owner,
    row.payload ->> 'event_type',
    row.payload ->> 'entity_type',
    case row.payload ->> 'entity_type'
      when 'customer' then public.v1_migration_target_id(
        current_owner, 'companies', (row.payload ->> 'entity_id')::uuid
      )
      when 'project' then public.v1_migration_target_id(
        current_owner, 'deals', (row.payload ->> 'entity_id')::uuid
      )
      else null
    end,
    coalesce(row.payload -> 'metadata', '{}'::jsonb),
    coalesce((row.payload ->> 'occurred_at')::timestamptz, confirmed_at_value)
  from public.migration_staging_rows as row
  where row.owner_user_id = current_owner
    and row.migration_job_id = p_job_id
    and row.collection = 'audit_events';

  insert into public.audit_events (
    id, owner_user_id, event_type, entity_type, entity_id, metadata, occurred_at
  )
  select
    public.v1_migration_target_id(
      current_owner, 'deletion_snapshots', row.source_id
    ),
    current_owner,
    'customer.soft_deleted',
    'customer',
    public.v1_migration_target_id(
      current_owner, 'companies', (row.payload ->> 'entity_id')::uuid
    ),
    public.v1_migration_deletion_metadata(
      current_owner,
      coalesce(row.payload -> 'metadata', '{}'::jsonb)
    ),
    coalesce((
      select (company.payload ->> 'deleted_at')::timestamptz
      from public.migration_staging_rows as company
      where company.owner_user_id = current_owner
        and company.migration_job_id = p_job_id
        and company.collection = 'companies'
        and company.source_id = (row.payload ->> 'entity_id')::uuid
    ), (row.payload ->> 'occurred_at')::timestamptz, confirmed_at_value)
  from public.migration_staging_rows as row
  where row.owner_user_id = current_owner
    and row.migration_job_id = p_job_id
    and row.collection = 'deletion_snapshots';

  update public.profiles
  set locale = btrim(job.user_preferences ->> 'locale'),
      theme = job.user_preferences ->> 'theme',
      updated_at = confirmed_at_value
  where id = current_owner;

  imported_counts := actual_manifest -> 'counts';
  delete from public.migration_staging_rows
  where owner_user_id = current_owner and migration_job_id = p_job_id;

  update public.migration_jobs
  set status = 'confirmed', error_code = null,
      confirmed_at = confirmed_at_value, completed_at = confirmed_at_value,
      abandoned_at = null, updated_at = confirmed_at_value
  where owner_user_id = current_owner and id = p_job_id;

  insert into public.audit_events (
    owner_user_id, event_type, entity_type, entity_id, metadata, occurred_at
  ) values (
    current_owner,
    'migration.confirmed',
    'migration_job',
    p_job_id,
    jsonb_build_object(
      'source_fingerprint', job.source_fingerprint,
      'snapshot_checksum', job.snapshot_checksum,
      'counts', imported_counts
    ),
    confirmed_at_value
  );

  return jsonb_build_object('data', jsonb_build_object(
    'id', p_job_id,
    'status', 'confirmed',
    'confirmed_at', confirmed_at_value,
    'imported_counts', imported_counts,
    'staging_cleared', true
  ));
end;
$$;

create function public.stage_v1_migration_batch(
  p_job_id uuid,
  p_collection text,
  p_records jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_owner uuid := auth.uid();
  job public.migration_jobs;
  item jsonb;
  source_id_value uuid;
  idempotency_key_value text;
  payload_json_value text;
  payload_value jsonb;
  checksum_value text;
  existing public.migration_staging_rows;
  inserted_count integer := 0;
  replayed_count integer := 0;
  staged_collection_count integer;
begin
  if current_owner is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if p_collection is null
    or not (p_collection = any(public.v1_migration_collections()))
    or jsonb_typeof(p_records) is distinct from 'array'
    or jsonb_array_length(p_records) < 1
    or jsonb_array_length(p_records) > 500 then
    raise exception using errcode = '22023', message = 'Invalid migration batch';
  end if;

  select * into job
  from public.migration_jobs
  where owner_user_id = current_owner and id = p_job_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Migration job not found';
  end if;
  if job.status <> 'running' then
    raise exception using errcode = '55000', message = 'Migration job does not accept staging rows';
  end if;

  for item in select value from jsonb_array_elements(p_records) loop
    if jsonb_typeof(item) is distinct from 'object' then
      raise exception using errcode = '22023', message = 'Migration batch records must be objects';
    end if;
    begin
      source_id_value := (item ->> 'source_id')::uuid;
      idempotency_key_value := item ->> 'idempotency_key';
      payload_json_value := item ->> 'payload_json';
      checksum_value := item ->> 'checksum_sha256';
      payload_value := payload_json_value::jsonb;
    exception when invalid_text_representation then
      raise exception using errcode = '22023', message = 'Malformed migration batch record';
    end;
    if idempotency_key_value is distinct from
        format('v1:%s:%s', p_collection, source_id_value)
      or jsonb_typeof(payload_value) is distinct from 'object'
      or checksum_value !~ '^[0-9a-f]{64}$'
      or encode(extensions.digest(payload_json_value, 'sha256'), 'hex')
        is distinct from checksum_value then
      raise exception using errcode = '22023', message = 'Migration record checksum or identity is invalid';
    end if;

    select * into existing
    from public.migration_staging_rows
    where owner_user_id = current_owner
      and migration_job_id = p_job_id
      and collection = p_collection
      and source_id = source_id_value
    for update;

    if found then
      if existing.idempotency_key is distinct from idempotency_key_value
        or existing.payload_json is distinct from payload_json_value
        or existing.payload_checksum is distinct from checksum_value then
        raise exception using errcode = '23505', message = 'Staged migration record conflicts with an earlier payload';
      end if;
      replayed_count := replayed_count + 1;
    else
      if exists (
        select 1 from public.migration_staging_rows
        where owner_user_id = current_owner
          and migration_job_id = p_job_id
          and idempotency_key = idempotency_key_value
      ) then
        raise exception using errcode = '23505', message = 'Migration record idempotency key is already used';
      end if;
      insert into public.migration_staging_rows (
        owner_user_id, migration_job_id, collection, source_id,
        idempotency_key, payload_json, payload, payload_checksum
      ) values (
        current_owner, p_job_id, p_collection, source_id_value,
        idempotency_key_value, payload_json_value, payload_value, checksum_value
      );
      inserted_count := inserted_count + 1;
    end if;
  end loop;

  select count(*)::integer into staged_collection_count
  from public.migration_staging_rows
  where owner_user_id = current_owner
    and migration_job_id = p_job_id
    and collection = p_collection;
  if staged_collection_count > (job.counts ->> p_collection)::integer then
    raise exception using errcode = '22023', message = 'Staged rows exceed the declared collection count';
  end if;

  update public.migration_jobs set updated_at = now()
  where owner_user_id = current_owner and id = p_job_id;
  return jsonb_build_object('data', jsonb_build_object(
    'id', p_job_id,
    'collection', p_collection,
    'inserted', inserted_count,
    'replayed', replayed_count,
    'staged_count', staged_collection_count
  ));
end;
$$;

create function public.reconcile_v1_migration(p_job_id uuid)
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
  set status = case when ready then 'awaiting_confirmation' else 'running' end,
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

create function public.abandon_v1_migration(p_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_owner uuid := auth.uid();
  job public.migration_jobs;
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
  if job.status = 'confirmed' then
    raise exception using errcode = '55000', message = 'Confirmed migrations cannot be abandoned';
  end if;
  delete from public.migration_staging_rows
  where owner_user_id = current_owner and migration_job_id = p_job_id;
  update public.migration_jobs
  set status = 'abandoned', error_code = null, abandoned_at = now(),
      completed_at = now(), updated_at = now()
  where owner_user_id = current_owner and id = p_job_id;
  return jsonb_build_object('data', jsonb_build_object(
    'id', p_job_id, 'status', 'abandoned', 'staging_cleared', true
  ));
end;
$$;

revoke execute on function public.v1_migration_collections()
  from public, anon, authenticated, service_role;
revoke execute on function public.v1_migration_target_id(uuid, text, uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.validate_v1_migration_manifest(jsonb, jsonb)
  from public, anon, authenticated, service_role;
revoke execute on function public.v1_migration_actual_manifest(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.v1_migration_deletion_metadata(uuid, jsonb)
  from public, anon, authenticated, service_role;

revoke execute on function public.begin_v1_migration(text, text, text, jsonb, jsonb, jsonb)
  from public, anon, service_role;
revoke execute on function public.stage_v1_migration_batch(uuid, text, jsonb)
  from public, anon, service_role;
revoke execute on function public.reconcile_v1_migration(uuid)
  from public, anon, service_role;
revoke execute on function public.confirm_v1_migration(uuid, text, jsonb, jsonb)
  from public, anon, service_role;
revoke execute on function public.abandon_v1_migration(uuid)
  from public, anon, service_role;

grant execute on function public.begin_v1_migration(text, text, text, jsonb, jsonb, jsonb)
  to authenticated;
grant execute on function public.stage_v1_migration_batch(uuid, text, jsonb)
  to authenticated;
grant execute on function public.reconcile_v1_migration(uuid)
  to authenticated;
grant execute on function public.confirm_v1_migration(uuid, text, jsonb, jsonb)
  to authenticated;
grant execute on function public.abandon_v1_migration(uuid)
  to authenticated;
