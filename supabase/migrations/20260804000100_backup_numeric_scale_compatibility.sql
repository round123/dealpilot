-- Browser JSON parsing removes insignificant numeric scale (for example,
-- numeric(18,2) 175000.00 becomes 175000). Keep the exact checksum path and
-- narrowly reconstruct typed deal rows only as a compatibility fallback.

create function public.backup_payload_with_typed_deals(p_payload jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select case
    when jsonb_typeof(p_payload -> 'deals') is distinct from 'array' then null
    else jsonb_set(
      p_payload,
      '{deals}',
      coalesce((
        select jsonb_agg(to_jsonb(deal_record) order by deal_record.id)
        from jsonb_populate_recordset(
          null::public.deals,
          p_payload -> 'deals'
        ) as deal_record
      ), '[]'::jsonb),
      false
    )
  end
$$;

create or replace function public.restore_backup_payload(
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
  typed_payload jsonb;
begin
  if current_owner is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if p_schema_version is distinct from 1 then
    raise exception using errcode = '22023', message = 'Unsupported backup schema version';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) is distinct from 'object'
     or p_checksum is null or p_checksum !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'Backup checksum mismatch';
  end if;

  if encode(extensions.digest(p_payload::text, 'sha256'), 'hex')
    is distinct from p_checksum then
    begin
      typed_payload := public.backup_payload_with_typed_deals(p_payload);
    exception when others then
      raise exception using errcode = '22023', message = 'Backup checksum mismatch';
    end;

    -- jsonb equality ignores numeric scale but still detects changed values,
    -- unknown fields, missing fields, and every non-numeric representation.
    if typed_payload is null
       or typed_payload is distinct from p_payload
       or encode(extensions.digest(typed_payload::text, 'sha256'), 'hex')
         is distinct from p_checksum then
      raise exception using errcode = '22023', message = 'Backup checksum mismatch';
    end if;
    p_payload := typed_payload;
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

revoke execute on function public.backup_payload_with_typed_deals(jsonb)
  from public, anon, authenticated, service_role;
