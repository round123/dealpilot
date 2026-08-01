-- Portable encrypted archives use browser-side encryption. These RPCs expose
-- only the authenticated owner's snapshot payload and reuse the existing
-- transactional restore path after validating a decrypted payload.

create function public.backup_payload_row_counts(p_payload jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  table_name text;
  array_tables constant text[] := array[
    'companies', 'tags', 'contacts', 'deals', 'contact_tags',
    'contact_notes', 'deal_contacts', 'deal_notes', 'tasks',
    'social_accounts', 'follow_ups', 'reminders', 'deal_risks',
    'deal_milestones'
  ];
  counts jsonb := jsonb_build_object('configuration', 1);
begin
  if p_payload ->> 'schema_version' is distinct from '1'
     or jsonb_typeof(p_payload -> 'profile') is distinct from 'object'
     or jsonb_typeof(p_payload -> 'configuration') is distinct from 'object' then
    raise exception using errcode = '22023', message = 'Invalid backup payload';
  end if;

  foreach table_name in array array_tables loop
    if jsonb_typeof(p_payload -> table_name) is distinct from 'array' then
      raise exception using errcode = '22023',
        message = format('Backup field %s must be an array', table_name);
    end if;
    counts := counts || jsonb_build_object(
      table_name,
      jsonb_array_length(p_payload -> table_name)
    );
  end loop;
  return counts;
end;
$$;

create function public.export_backup_snapshot(p_snapshot_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  current_owner uuid := auth.uid();
  snapshot_record public.backup_snapshots;
begin
  if current_owner is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if p_snapshot_id is null then
    raise exception using errcode = '22004', message = 'Snapshot id is required';
  end if;

  select * into snapshot_record
  from public.backup_snapshots as snapshot
  where snapshot.id = p_snapshot_id
    and snapshot.owner_user_id = current_owner;

  if not found then
    raise exception using errcode = 'P0002', message = 'Backup snapshot not found';
  end if;
  if snapshot_record.schema_version <> 1
     or encode(extensions.digest(snapshot_record.payload::text, 'sha256'), 'hex')
       is distinct from snapshot_record.checksum then
    raise exception using errcode = '22023', message = 'Backup checksum mismatch';
  end if;

  return jsonb_build_object('data', jsonb_build_object(
    'id', snapshot_record.id,
    'schema_version', snapshot_record.schema_version,
    'checksum', snapshot_record.checksum,
    'row_counts', snapshot_record.row_counts,
    'created_at', snapshot_record.created_at,
    'payload', snapshot_record.payload
  ));
end;
$$;

create function public.restore_backup_payload(
  p_schema_version integer,
  p_checksum text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_owner uuid := auth.uid();
  temporary_snapshot_id uuid;
  payload_counts jsonb;
  restore_result jsonb;
begin
  if current_owner is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if p_schema_version is distinct from 1 then
    raise exception using errcode = '22023', message = 'Unsupported backup schema version';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) is distinct from 'object'
     or p_checksum is null or p_checksum !~ '^[0-9a-f]{64}$'
     or encode(extensions.digest(p_payload::text, 'sha256'), 'hex')
       is distinct from p_checksum then
    raise exception using errcode = '22023', message = 'Backup checksum mismatch';
  end if;
  if p_payload -> 'profile' ->> 'id' is distinct from current_owner::text
     or p_payload -> 'configuration' ->> 'owner_user_id'
       is distinct from current_owner::text then
    raise exception using errcode = '42501', message = 'Backup belongs to another account';
  end if;

  payload_counts := public.backup_payload_row_counts(p_payload);
  insert into public.backup_snapshots (
    owner_user_id, schema_version, label, checksum, row_counts, payload
  ) values (
    current_owner, p_schema_version, 'Encrypted archive restore',
    p_checksum, payload_counts, p_payload
  ) returning id into temporary_snapshot_id;

  select public.restore_backup_snapshot(temporary_snapshot_id)
  into restore_result;

  delete from public.backup_snapshots
  where owner_user_id = current_owner and id = temporary_snapshot_id;

  return restore_result;
end;
$$;

revoke execute on function public.backup_payload_row_counts(jsonb)
  from public, anon, authenticated, service_role;
revoke execute on function public.export_backup_snapshot(uuid),
  public.restore_backup_payload(integer, text, jsonb)
  from public, anon, service_role;
grant execute on function public.export_backup_snapshot(uuid),
  public.restore_backup_payload(integer, text, jsonb)
  to authenticated;
