-- Reminder status actions must be replayable, owner-scoped, and RPC-only.

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000000', '51000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'reminder-a@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '52000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'reminder-b@example.test', '', now(), '{}', '{}', now(), now());

insert into public.companies (id, owner_user_id, name)
values
  ('51000000-0000-4000-8000-000000000010', '51000000-0000-4000-8000-000000000001', 'Owner A customer'),
  ('51000000-0000-4000-8000-000000000011', '51000000-0000-4000-8000-000000000001', 'Owner A deleted customer'),
  ('52000000-0000-4000-8000-000000000010', '52000000-0000-4000-8000-000000000002', 'Owner B customer');

insert into public.reminders (
  id, owner_user_id, company_id, type, status, due_at, priority
)
values
  ('51000000-0000-4000-8000-000000000020', '51000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000010', 'fixed_time', 'pending', '2026-08-02T09:00:00Z', 'normal'),
  ('51000000-0000-4000-8000-000000000021', '51000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000010', 'fixed_time', 'pending', '2026-08-02T10:00:00Z', 'normal'),
  ('51000000-0000-4000-8000-000000000022', '51000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000010', 'fixed_time', 'pending', '2026-08-02T11:00:00Z', 'normal'),
  ('51000000-0000-4000-8000-000000000023', '51000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000010', 'waiting_reply', 'pending', '2026-08-02T12:00:00Z', 'high'),
  ('51000000-0000-4000-8000-000000000025', '51000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000011', 'fixed_time', 'pending', '2026-08-02T13:00:00Z', 'normal'),
  ('51000000-0000-4000-8000-000000000026', '51000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000010', 'fixed_time', 'ignored', '2026-08-02T14:00:00Z', 'normal'),
  ('52000000-0000-4000-8000-000000000020', '52000000-0000-4000-8000-000000000002', '52000000-0000-4000-8000-000000000010', 'fixed_time', 'pending', '2026-08-02T09:00:00Z', 'normal');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"51000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

do $$
declare
  first_response jsonb;
  replay_response jsonb;
  action_response jsonb;
begin
  select public.update_reminder_status_idempotent(
    '51000000-0000-4000-8000-000000000100',
    '51000000-0000-4000-8000-000000000020',
    'completed', null, null
  ) into first_response;
  select public.update_reminder_status_idempotent(
    '51000000-0000-4000-8000-000000000100',
    '51000000-0000-4000-8000-000000000020',
    'completed', null, null
  ) into replay_response;

  if first_response is distinct from replay_response
    or first_response -> 'data' ->> 'status' <> 'completed'
    or first_response -> 'data' ->> 'resolution' <> 'completed'
    or (select count(*) from public.audit_events where event_type = 'reminder.status_updated.idempotent') <> 1 then
    raise exception 'completed replay did not return the original response exactly: %, %',
      first_response, replay_response;
  end if;

  begin
    perform public.update_reminder_status_idempotent(
      '51000000-0000-4000-8000-000000000100',
      '51000000-0000-4000-8000-000000000020',
      'ignored', null, null
    );
    raise exception 'same key with different payload unexpectedly succeeded';
  exception
    when unique_violation then null;
  end;

  select public.update_reminder_status_idempotent(
    '51000000-0000-4000-8000-000000000101',
    '51000000-0000-4000-8000-000000000021',
    'snoozed', '2026-08-04T10:00:00Z', null
  ) into action_response;
  if action_response -> 'data' ->> 'status' <> 'snoozed'
    or action_response -> 'data' ->> 'snooze_until' <> '2026-08-04T10:00:00+00:00' then
    raise exception 'snooze action returned an invalid response: %', action_response;
  end if;

  select public.update_reminder_status_idempotent(
    '51000000-0000-4000-8000-000000000102',
    '51000000-0000-4000-8000-000000000022',
    'ignored', null, null
  ) into action_response;
  if action_response -> 'data' ->> 'status' <> 'ignored'
    or action_response -> 'data' ->> 'resolution' <> 'ignored' then
    raise exception 'ignore action returned an invalid response: %', action_response;
  end if;

  select public.update_reminder_status_idempotent(
    '51000000-0000-4000-8000-000000000103',
    '51000000-0000-4000-8000-000000000023',
    'replied', null, null
  ) into action_response;
  if action_response -> 'data' ->> 'status' <> 'replied'
    or action_response -> 'data' ->> 'resolution' <> 'reply_received' then
    raise exception 'manual reply confirmation returned an invalid response: %', action_response;
  end if;

  begin
    perform public.update_reminder_status_idempotent(
      '51000000-0000-4000-8000-000000000104',
      '52000000-0000-4000-8000-000000000020',
      'completed', null, null
    );
    raise exception 'cross-owner reminder update unexpectedly succeeded';
  exception
    when no_data_found then null;
  end;

  perform public.soft_delete_customer(
    '51000000-0000-4000-8000-000000000011'
  );
  if not exists (
    select 1 from public.reminders
    where id = '51000000-0000-4000-8000-000000000025'
      and status = 'ignored'
      and deletion_event_id is not null
  ) then
    raise exception 'customer deletion did not mark the reminder for restore CAS';
  end if;

  select public.update_reminder_status_idempotent(
    '51000000-0000-4000-8000-000000000105',
    '51000000-0000-4000-8000-000000000025',
    'completed', null, 'Handled after customer deletion'
  ) into action_response;
  if action_response -> 'data' ->> 'status' <> 'completed'
    or action_response -> 'data' ->> 'resolution' <> 'Handled after customer deletion'
    or action_response -> 'data' ->> 'deletion_event_id' is not null
    or not exists (
      select 1 from public.reminders
      where id = '51000000-0000-4000-8000-000000000025'
        and status = 'completed'
        and resolution = 'Handled after customer deletion'
        and deletion_event_id is null
    ) then
    raise exception 'delete-concurrent reminder command did not win restore CAS: %',
      action_response;
  end if;

  begin
    perform public.update_reminder_status_idempotent(
      '51000000-0000-4000-8000-000000000106',
      '51000000-0000-4000-8000-000000000026',
      'completed', null, null
    );
    raise exception 'ordinary ignored reminder unexpectedly changed state';
  exception
    when invalid_parameter_value then null;
  end;

  begin
    update public.reminders
    set status = 'ignored'
    where id = '51000000-0000-4000-8000-000000000021';
    raise exception 'authenticated role retained direct reminder UPDATE';
  exception
    when insufficient_privilege then null;
  end;

  update public.reminders
  set priority = 'urgent'
  where id = '51000000-0000-4000-8000-000000000021';
  if not exists (
    select 1 from public.reminders
    where id = '51000000-0000-4000-8000-000000000021'
      and status = 'snoozed'
      and priority = 'urgent'
  ) then
    raise exception 'ordinary reminder editing was damaged by status permissions';
  end if;

  insert into public.reminders (
    id, company_id, type, status, due_at, priority
  ) values (
    '51000000-0000-4000-8000-000000000024',
    '51000000-0000-4000-8000-000000000010',
    'fixed_time', 'pending', '2026-08-05T09:00:00Z', 'normal'
  );
  if not exists (
    select 1 from public.reminders
    where id = '51000000-0000-4000-8000-000000000024'
      and owner_user_id = '51000000-0000-4000-8000-000000000001'
  ) then
    raise exception 'ordinary reminder creation was damaged by status permissions';
  end if;
end;
$$;

select set_config(
  'request.jwt.claims',
  '{"sub":"52000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

do $$
declare
  response jsonb;
begin
  select public.update_reminder_status_idempotent(
    '51000000-0000-4000-8000-000000000100',
    '52000000-0000-4000-8000-000000000020',
    'completed', null, null
  ) into response;

  if response -> 'data' ->> 'status' <> 'completed'
    or response -> 'data' ->> 'owner_user_id' <> '52000000-0000-4000-8000-000000000002' then
    raise exception 'another owner could not independently reuse the UUID key: %', response;
  end if;
end;
$$;

reset role;

do $$
declare
  function_oid oid := to_regprocedure(
    'public.update_reminder_status_idempotent(uuid,uuid,public.reminder_status,timestamptz,text)'
  );
begin
  if function_oid is null
    or not (select p.prosecdef from pg_catalog.pg_proc as p where p.oid = function_oid)
    or (select p.proconfig from pg_catalog.pg_proc as p where p.oid = function_oid)
      is distinct from array['search_path=""']::text[]
    or not pg_catalog.has_function_privilege('authenticated', function_oid, 'EXECUTE')
    or pg_catalog.has_function_privilege('anon', function_oid, 'EXECUTE')
    or pg_catalog.has_function_privilege('service_role', function_oid, 'EXECUTE') then
    raise exception 'idempotent reminder RPC privileges are unsafe';
  end if;

  if exists (
    select 1
    from information_schema.column_privileges
    where table_schema = 'public'
      and table_name = 'reminders'
      and grantee = 'authenticated'
      and privilege_type = 'UPDATE'
      and column_name in ('status', 'snooze_until', 'resolution')
  ) then
    raise exception 'authenticated retains direct reminder status column updates';
  end if;
  if not exists (
    select 1
    from information_schema.column_privileges
    where table_schema = 'public'
      and table_name = 'reminders'
      and grantee = 'authenticated'
      and privilege_type = 'UPDATE'
      and column_name = 'priority'
  ) then
    raise exception 'authenticated lost ordinary reminder editing privileges';
  end if;
end;
$$;

rollback;
