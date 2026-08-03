-- A reminder suspended by customer deletion is still unresolved from the
-- user's perspective. Allow an explicit user command to win the restore CAS.

create or replace function public.update_reminder_status_idempotent(
  p_idempotency_key uuid,
  p_reminder_id uuid,
  p_status public.reminder_status,
  p_snooze_until timestamptz,
  p_resolution text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  request_payload jsonb;
  request_hash text;
  ledger_hash_hex text;
  ledger_event_id uuid;
  existing_event public.audit_events;
  current_reminder public.reminders;
  updated_reminder public.reminders;
  response_envelope jsonb;
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if p_idempotency_key is null or p_reminder_id is null or p_status is null then
    raise exception using errcode = '22023', message = 'Reminder command fields are required';
  end if;
  if p_status not in ('completed', 'snoozed', 'ignored', 'replied') then
    raise exception using errcode = '22023', message = 'Unsupported reminder status transition';
  end if;
  if p_status = 'snoozed' and p_snooze_until is null then
    raise exception using errcode = '22023', message = 'Snooze time is required';
  end if;
  if p_status <> 'snoozed' and p_snooze_until is not null then
    raise exception using errcode = '22023', message = 'Snooze time is only valid for snoozed reminders';
  end if;
  if char_length(p_resolution) > 500 then
    raise exception using errcode = '22023', message = 'Reminder resolution is too long';
  end if;

  request_payload := pg_catalog.jsonb_build_object(
    'reminder_id', p_reminder_id,
    'status', p_status,
    'snooze_until', p_snooze_until,
    'resolution', p_resolution
  );
  request_hash := pg_catalog.encode(
    extensions.digest(request_payload::text, 'sha256'),
    'hex'
  );
  ledger_hash_hex := pg_catalog.encode(
    extensions.digest(current_user_id::text || ':' || p_idempotency_key::text, 'sha256'),
    'hex'
  );
  ledger_event_id := (
    pg_catalog.substr(ledger_hash_hex, 1, 8) || '-' ||
    pg_catalog.substr(ledger_hash_hex, 9, 4) || '-' ||
    pg_catalog.substr(ledger_hash_hex, 13, 4) || '-' ||
    pg_catalog.substr(ledger_hash_hex, 17, 4) || '-' ||
    pg_catalog.substr(ledger_hash_hex, 21, 12)
  )::uuid;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(current_user_id::text || ':' || p_idempotency_key::text, 0)
  );

  select * into existing_event
  from public.audit_events
  where id = ledger_event_id
    and owner_user_id = current_user_id
  for update;

  if found then
    if existing_event.event_type <> 'reminder.status_updated.idempotent'
      or existing_event.metadata ->> 'request_hash' is distinct from request_hash then
      raise exception using
        errcode = '23505',
        message = 'Idempotency key was already used with a different payload',
        constraint = 'reminder_status_idempotency_key';
    end if;
    if pg_catalog.jsonb_typeof(existing_event.metadata -> 'response') <> 'object'
      or not (existing_event.metadata -> 'response' ? 'data') then
      raise exception using errcode = 'XX001', message = 'Idempotency replay record is invalid';
    end if;
    return existing_event.metadata -> 'response';
  end if;

  select * into current_reminder
  from public.reminders
  where id = p_reminder_id
    and owner_user_id = current_user_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Reminder not found';
  end if;
  if current_reminder.status not in ('pending', 'snoozed', 'overdue')
    and not (
      current_reminder.status = 'ignored'
      and current_reminder.deletion_event_id is not null
    ) then
    raise exception using errcode = '22023', message = 'Reminder is already resolved';
  end if;
  if p_status = 'replied' and current_reminder.type <> 'waiting_reply' then
    raise exception using errcode = '22023', message = 'Only waiting-reply reminders can confirm a reply';
  end if;

  update public.reminders
  set
    status = p_status,
    snooze_until = case when p_status = 'snoozed' then p_snooze_until else null end,
    resolution = case p_status
      when 'completed' then coalesce(p_resolution, 'completed')
      when 'ignored' then coalesce(p_resolution, 'ignored')
      when 'replied' then coalesce(p_resolution, 'reply_received')
      else p_resolution
    end
  where id = p_reminder_id
    and owner_user_id = current_user_id
  returning * into updated_reminder;

  response_envelope := pg_catalog.jsonb_build_object(
    'data', pg_catalog.to_jsonb(updated_reminder)
  );

  insert into public.audit_events (
    id, owner_user_id, event_type, entity_type, entity_id, metadata
  ) values (
    ledger_event_id,
    current_user_id,
    'reminder.status_updated.idempotent',
    'reminder',
    updated_reminder.id,
    pg_catalog.jsonb_build_object(
      'idempotency_key', p_idempotency_key,
      'request_hash', request_hash,
      'response', response_envelope
    )
  );

  return response_envelope;
end;
$$;

revoke all on function public.update_reminder_status_idempotent(
  uuid, uuid, public.reminder_status, timestamptz, text
) from public, anon, authenticated, service_role;

grant execute on function public.update_reminder_status_idempotent(
  uuid, uuid, public.reminder_status, timestamptz, text
) to authenticated;
