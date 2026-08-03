-- Cloud backup/restore for one personal account.
-- The payload contains relational data only. Auth credentials and Storage objects
-- remain outside the database snapshot and are handled by their own services.

create table public.backup_snapshots (
  id uuid primary key default extensions.gen_random_uuid(),
  owner_user_id uuid not null default auth.uid()
    references public.profiles(id) on delete cascade,
  schema_version integer not null default 1 check (schema_version > 0),
  label text check (label is null or char_length(label) between 1 and 200),
  checksum text not null check (checksum ~ '^[0-9a-f]{64}$'),
  row_counts jsonb not null check (jsonb_typeof(row_counts) = 'object'),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default now(),
  unique (owner_user_id, id)
);

create index backup_snapshots_owner_created_idx
  on public.backup_snapshots (owner_user_id, created_at desc);

alter table public.backup_snapshots enable row level security;
alter table public.backup_snapshots force row level security;

create policy backup_snapshots_owner_select
on public.backup_snapshots
for select to authenticated
using (owner_user_id = auth.uid());

revoke all on table public.backup_snapshots from anon, authenticated, service_role;
grant select on table public.backup_snapshots to authenticated;

create function public.create_backup_snapshot(p_label text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_owner uuid := auth.uid();
  snapshot_payload jsonb;
  snapshot_id uuid;
  snapshot_checksum text;
  snapshot_row_counts jsonb;
  snapshot_created_at timestamptz;
  normalized_label text := nullif(btrim(p_label), '');
begin
  if current_owner is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if p_label is not null and normalized_label is null then
    raise exception using errcode = '22023', message = 'Backup label cannot be blank';
  end if;
  if normalized_label is not null and char_length(normalized_label) > 200 then
    raise exception using errcode = '22023', message = 'Backup label is too long';
  end if;

  -- Every subquery is owner-scoped. The snapshot intentionally excludes
  -- customer_purge_jobs (an operational queue) and backup_snapshots itself.
  select jsonb_build_object(
    'schema_version', 1,
    'profile', (
      select to_jsonb(profile_record)
      from public.profiles as profile_record
      where profile_record.id = current_owner
    ),
    'companies', coalesce((
      select jsonb_agg(to_jsonb(item) order by item.id)
      from public.companies as item
      where item.owner_user_id = current_owner
    ), '[]'::jsonb),
    'tags', coalesce((
      select jsonb_agg(to_jsonb(item) order by item.id)
      from public.tags as item
      where item.owner_user_id = current_owner
    ), '[]'::jsonb),
    'contacts', coalesce((
      select jsonb_agg(to_jsonb(item) order by item.id)
      from public.contacts as item
      where item.owner_user_id = current_owner
    ), '[]'::jsonb),
    'deals', coalesce((
      select jsonb_agg(to_jsonb(item) order by item.id)
      from public.deals as item
      where item.owner_user_id = current_owner
    ), '[]'::jsonb),
    'contact_tags', coalesce((
      select jsonb_agg(to_jsonb(item) order by item.contact_id, item.tag_id)
      from public.contact_tags as item
      where item.owner_user_id = current_owner
    ), '[]'::jsonb),
    'contact_notes', coalesce((
      select jsonb_agg(to_jsonb(item) order by item.id)
      from public.contact_notes as item
      where item.owner_user_id = current_owner
    ), '[]'::jsonb),
    'deal_contacts', coalesce((
      select jsonb_agg(to_jsonb(item) order by item.deal_id, item.contact_id)
      from public.deal_contacts as item
      where item.owner_user_id = current_owner
    ), '[]'::jsonb),
    'deal_notes', coalesce((
      select jsonb_agg(to_jsonb(item) order by item.id)
      from public.deal_notes as item
      where item.owner_user_id = current_owner
    ), '[]'::jsonb),
    'tasks', coalesce((
      select jsonb_agg(to_jsonb(item) order by item.id)
      from public.tasks as item
      where item.owner_user_id = current_owner
    ), '[]'::jsonb),
    'configuration', coalesce((
      select to_jsonb(item)
      from public.configuration as item
      where item.owner_user_id = current_owner
    ), '{}'::jsonb),
    'social_accounts', coalesce((
      select jsonb_agg(to_jsonb(item) order by item.id)
      from public.social_accounts as item
      where item.owner_user_id = current_owner
    ), '[]'::jsonb),
    'follow_ups', coalesce((
      select jsonb_agg(to_jsonb(item) order by item.id)
      from public.follow_ups as item
      where item.owner_user_id = current_owner
    ), '[]'::jsonb),
    'reminders', coalesce((
      select jsonb_agg(to_jsonb(item) order by item.id)
      from public.reminders as item
      where item.owner_user_id = current_owner
    ), '[]'::jsonb),
    'deal_risks', coalesce((
      select jsonb_agg(to_jsonb(item) order by item.id)
      from public.deal_risks as item
      where item.owner_user_id = current_owner
    ), '[]'::jsonb),
    'deal_milestones', coalesce((
      select jsonb_agg(to_jsonb(item) order by item.id)
      from public.deal_milestones as item
      where item.owner_user_id = current_owner
    ), '[]'::jsonb)
  ) into snapshot_payload;

  if jsonb_typeof(snapshot_payload -> 'profile') is distinct from 'object' then
    raise exception using errcode = 'P0002', message = 'Profile not found';
  end if;
  if snapshot_payload -> 'configuration' ->> 'owner_user_id'
    is distinct from current_owner::text then
    raise exception using errcode = 'P0002', message = 'Configuration not found';
  end if;

  snapshot_row_counts := jsonb_build_object(
    'companies', jsonb_array_length(snapshot_payload -> 'companies'),
    'tags', jsonb_array_length(snapshot_payload -> 'tags'),
    'contacts', jsonb_array_length(snapshot_payload -> 'contacts'),
    'deals', jsonb_array_length(snapshot_payload -> 'deals'),
    'contact_tags', jsonb_array_length(snapshot_payload -> 'contact_tags'),
    'contact_notes', jsonb_array_length(snapshot_payload -> 'contact_notes'),
    'deal_contacts', jsonb_array_length(snapshot_payload -> 'deal_contacts'),
    'deal_notes', jsonb_array_length(snapshot_payload -> 'deal_notes'),
    'tasks', jsonb_array_length(snapshot_payload -> 'tasks'),
    'configuration', 1,
    'social_accounts', jsonb_array_length(snapshot_payload -> 'social_accounts'),
    'follow_ups', jsonb_array_length(snapshot_payload -> 'follow_ups'),
    'reminders', jsonb_array_length(snapshot_payload -> 'reminders'),
    'deal_risks', jsonb_array_length(snapshot_payload -> 'deal_risks'),
    'deal_milestones', jsonb_array_length(snapshot_payload -> 'deal_milestones')
  );

  snapshot_checksum := encode(
    extensions.digest(snapshot_payload::text, 'sha256'),
    'hex'
  );

  insert into public.backup_snapshots (
    owner_user_id, schema_version, label, checksum, row_counts, payload
  ) values (
    current_owner, 1, normalized_label, snapshot_checksum,
    snapshot_row_counts, snapshot_payload
  )
  returning id, created_at
  into snapshot_id, snapshot_created_at;

  insert into public.audit_events (
    owner_user_id, event_type, entity_type, entity_id, metadata
  ) values (
    current_owner,
    'backup.created',
    'backup_snapshot',
    snapshot_id,
    jsonb_build_object('schema_version', 1, 'checksum', snapshot_checksum)
  );

  return jsonb_build_object(
    'data', jsonb_build_object(
      'id', snapshot_id,
      'owner_user_id', current_owner,
      'schema_version', 1,
      'label', normalized_label,
      'checksum', snapshot_checksum,
      'row_counts', snapshot_row_counts,
      'created_at', snapshot_created_at
    )
  );
end;
$$;

create function public.restore_backup_snapshot(p_snapshot_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_owner uuid := auth.uid();
  snapshot_record public.backup_snapshots;
  snapshot_payload jsonb;
  table_name text;
  restore_tables constant text[] := array[
    'companies', 'tags', 'contacts', 'deals', 'contact_tags',
    'contact_notes', 'deal_contacts', 'deal_notes', 'tasks',
    'social_accounts', 'follow_ups', 'reminders', 'deal_risks',
    'deal_milestones'
  ];
  owner_tables constant text[] := array[
    'companies', 'tags', 'contacts', 'deals', 'contact_tags',
    'contact_notes', 'deal_contacts', 'deal_notes', 'tasks',
    'social_accounts', 'follow_ups', 'reminders', 'deal_risks',
    'deal_milestones'
  ];
  restored_counts jsonb := '{}'::jsonb;
  safety_snapshot_result jsonb;
begin
  if current_owner is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if p_snapshot_id is null then
    raise exception using errcode = '22004', message = 'Snapshot id is required';
  end if;

  select *
  into snapshot_record
  from public.backup_snapshots as snapshot
  where snapshot.id = p_snapshot_id
    and snapshot.owner_user_id = current_owner
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Backup snapshot not found';
  end if;
  if snapshot_record.schema_version <> 1 then
    raise exception using errcode = '22023', message = 'Unsupported backup schema version';
  end if;

  snapshot_payload := snapshot_record.payload;
  if encode(extensions.digest(snapshot_payload::text, 'sha256'), 'hex')
    is distinct from snapshot_record.checksum then
    raise exception using errcode = '22023', message = 'Backup checksum mismatch';
  end if;
  if snapshot_payload ->> 'schema_version' is distinct from '1'
    or jsonb_typeof(snapshot_payload -> 'profile') is distinct from 'object' then
    raise exception using errcode = '22023', message = 'Invalid backup payload';
  end if;
  if snapshot_payload -> 'profile' ->> 'id' is distinct from current_owner::text then
    raise exception using errcode = '42501', message = 'Backup belongs to another account';
  end if;
  if jsonb_typeof(snapshot_payload -> 'configuration') is distinct from 'object'
    or snapshot_payload -> 'configuration' ->> 'owner_user_id'
      is distinct from current_owner::text then
    raise exception using errcode = '42501', message = 'Invalid backup configuration owner';
  end if;

  foreach table_name in array owner_tables loop
    if jsonb_typeof(snapshot_payload -> table_name) is distinct from 'array' then
      raise exception using errcode = '22023',
        message = format('Backup field %s must be an array', table_name);
    end if;
    if exists (
      select 1
      from jsonb_array_elements(snapshot_payload -> table_name) as item
      where item ->> 'owner_user_id' is distinct from current_owner::text
    ) then
      raise exception using errcode = '42501',
        message = format('Backup contains a cross-account row in %s', table_name);
    end if;
  end loop;

  -- Keep a point-in-time copy of the current state before replacing it. Backup
  -- rows are deliberately excluded from the delete list below, so a successful
  -- restore retains both the requested snapshot and this safety snapshot. A
  -- failed restore rolls back the entire transaction and leaves current data intact.
  select public.create_backup_snapshot(
    format('Before restore %s', left(p_snapshot_id::text, 8))
  ) into safety_snapshot_result;

  -- Remove current relational data from children to parents. The operation is
  -- transactional: any malformed row or FK violation rolls the whole restore back.
  delete from public.customer_purge_jobs where owner_user_id = current_owner;
  delete from public.contact_tags where owner_user_id = current_owner;
  delete from public.deal_contacts where owner_user_id = current_owner;
  delete from public.contact_notes where owner_user_id = current_owner;
  delete from public.deal_notes where owner_user_id = current_owner;
  delete from public.tasks where owner_user_id = current_owner;
  delete from public.social_accounts where owner_user_id = current_owner;
  delete from public.follow_ups where owner_user_id = current_owner;
  delete from public.reminders where owner_user_id = current_owner;
  delete from public.deal_risks where owner_user_id = current_owner;
  delete from public.deal_milestones where owner_user_id = current_owner;
  delete from public.deals where owner_user_id = current_owner;
  delete from public.contacts where owner_user_id = current_owner;
  delete from public.tags where owner_user_id = current_owner;
  delete from public.companies where owner_user_id = current_owner;
  delete from public.configuration where owner_user_id = current_owner;

  update public.profiles
  set display_name = snapshot_payload -> 'profile' ->> 'display_name',
      locale = snapshot_payload -> 'profile' ->> 'locale',
      theme = snapshot_payload -> 'profile' ->> 'theme'
  where id = current_owner;

  insert into public.configuration
  select * from jsonb_populate_record(
    null::public.configuration,
    snapshot_payload -> 'configuration'
  );
  restored_counts := restored_counts || jsonb_build_object('configuration', 1);

  foreach table_name in array restore_tables loop
    execute format(
      'insert into public.%I select * from jsonb_populate_recordset(null::public.%I, $1)',
      table_name,
      table_name
    ) using snapshot_payload -> table_name;
    restored_counts := restored_counts || jsonb_build_object(
      table_name,
      jsonb_array_length(snapshot_payload -> table_name)
    );
  end loop;

  insert into public.audit_events (
    owner_user_id, event_type, entity_type, entity_id, metadata
  ) values (
    current_owner,
    'backup.restored',
    'backup_snapshot',
    snapshot_record.id,
    jsonb_build_object(
      'schema_version', snapshot_record.schema_version,
      'safety_snapshot_id', safety_snapshot_result -> 'data' ->> 'id'
    )
  );

  return jsonb_build_object(
    'data', jsonb_build_object(
      'id', snapshot_record.id,
      'schema_version', snapshot_record.schema_version,
      'checksum', snapshot_record.checksum,
      'safety_snapshot_id', safety_snapshot_result -> 'data' -> 'id',
      'restored_counts', restored_counts
    )
  );
end;
$$;

revoke execute on function public.create_backup_snapshot(text),
  public.restore_backup_snapshot(uuid)
  from public, anon;
grant execute on function public.create_backup_snapshot(text),
  public.restore_backup_snapshot(uuid)
  to authenticated;
