-- Server-side idempotency for follow-ups created by the browser extension.
-- The audit event is both the immutable replay record and the conflict detector.

create function public.create_follow_up_idempotent(
  p_idempotency_key uuid,
  p_company_id uuid,
  p_deal_id uuid,
  p_type public.follow_up_type,
  p_note text,
  p_message_body text,
  p_message_direction public.message_direction,
  p_occurred_at timestamptz
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
  created_follow_up public.follow_ups;
  response_envelope jsonb;
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if p_idempotency_key is null then
    raise exception using errcode = '22023', message = 'Idempotency key is required';
  end if;
  if p_company_id is null or p_type is null or p_occurred_at is null then
    raise exception using errcode = '22023', message = 'Required follow-up fields are missing';
  end if;
  if char_length(p_note) > 5000 then
    raise exception using errcode = '22023', message = 'Follow-up note is too long';
  end if;
  if char_length(p_message_body) > 10000 then
    raise exception using errcode = '22023', message = 'Follow-up message is too long';
  end if;
  if p_type = 'message' and (p_message_body is null or p_message_direction is null) then
    raise exception using errcode = '22023', message = 'Message follow-ups require body and direction';
  end if;

  request_payload := pg_catalog.jsonb_build_object(
    'company_id', p_company_id,
    'deal_id', p_deal_id,
    'type', p_type,
    'note', p_note,
    'message_body', p_message_body,
    'message_direction', p_message_direction,
    'occurred_at', p_occurred_at
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
    if existing_event.event_type <> 'follow_up.created.idempotent'
      or existing_event.metadata ->> 'request_hash' is distinct from request_hash then
      raise exception using
        errcode = '23505',
        message = 'Idempotency key was already used with a different payload',
        constraint = 'extension_follow_up_idempotency_key';
    end if;

    if pg_catalog.jsonb_typeof(existing_event.metadata -> 'response') <> 'object'
      or not (existing_event.metadata -> 'response' ? 'data') then
      raise exception using errcode = 'XX001', message = 'Idempotency replay record is invalid';
    end if;

    return existing_event.metadata -> 'response';
  end if;

  perform 1
  from public.companies
  where owner_user_id = current_user_id
    and id = p_company_id
    and deleted_at is null
  for key share;
  if not found then
    raise exception using errcode = 'P0002', message = 'Active customer not found';
  end if;

  if p_deal_id is not null then
    perform 1
    from public.deals
    where owner_user_id = current_user_id
      and company_id = p_company_id
      and id = p_deal_id
    for key share;
    if not found then
      raise exception using errcode = 'P0002', message = 'Customer deal not found';
    end if;
  end if;

  insert into public.follow_ups (
    owner_user_id,
    company_id,
    deal_id,
    type,
    note,
    message_body,
    message_direction,
    occurred_at
  ) values (
    current_user_id,
    p_company_id,
    p_deal_id,
    p_type,
    p_note,
    p_message_body,
    p_message_direction,
    p_occurred_at
  )
  returning * into created_follow_up;

  response_envelope := pg_catalog.jsonb_build_object(
    'data', pg_catalog.to_jsonb(created_follow_up) - 'owner_user_id'
  );

  insert into public.audit_events (
    id,
    owner_user_id,
    event_type,
    entity_type,
    entity_id,
    metadata
  ) values (
    ledger_event_id,
    current_user_id,
    'follow_up.created.idempotent',
    'follow_up',
    created_follow_up.id,
    pg_catalog.jsonb_build_object(
      'idempotency_key', p_idempotency_key,
      'request_hash', request_hash,
      'response', response_envelope
    )
  );

  return response_envelope;
end;
$$;

revoke all on function public.create_follow_up_idempotent(
  uuid, uuid, uuid, public.follow_up_type, text, text,
  public.message_direction, timestamptz
) from public, anon, authenticated, service_role;

grant execute on function public.create_follow_up_idempotent(
  uuid, uuid, uuid, public.follow_up_type, text, text,
  public.message_direction, timestamptz
) to authenticated;
