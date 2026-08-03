begin;

-- Fixed UUIDs make failures reproducible and keep this script independent of psql variables.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'owner-a@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '20000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'owner-b@example.test', '', now(), '{}', '{}', now(), now());

insert into public.companies (id, owner_user_id, name, logo, deleted_at)
values
  (
    'a8000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'Inside restore window',
    null,
    now() - interval '30 days' + interval '1 second'
  ),
  (
    'a8000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000001',
    'At restore boundary',
    jsonb_build_object('path', 'boundary-logo.png'),
    now() - interval '30 days'
  ),
  (
    'a8000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000001',
    'Outside restore window',
    null,
    now() - interval '31 days'
  );

insert into public.audit_events (
  id, owner_user_id, event_type, entity_type, entity_id, metadata, occurred_at
)
values (
  'a8100000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'customer.soft_deleted',
  'customer',
  'a8000000-0000-0000-0000-000000000001',
  jsonb_build_object('reminders', '[]'::jsonb),
  now() - interval '30 days' + interval '1 second'
);

insert into public.contacts (
  id, owner_user_id, company_id, first_name, avatar
)
values (
  'a8200000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'a8000000-0000-0000-0000-000000000003',
  'Expired',
  jsonb_build_object('path', 'expired-avatar.png')
);

insert into public.contact_notes (
  id, owner_user_id, contact_id, text, attachments
)
values (
  'a8300000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'a8200000-0000-0000-0000-000000000001',
  'Expired contact attachment',
  '[{"path":"expired-contact-note.png"}]'
);

insert into public.deals (
  id, owner_user_id, company_id, name
)
values (
  'a8400000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'a8000000-0000-0000-0000-000000000003',
  'Expired deal'
);

insert into public.deal_notes (
  id, owner_user_id, deal_id, text, attachments
)
values (
  'a8500000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'a8400000-0000-0000-0000-000000000001',
  'Expired deal attachment',
  '[{"path":"10000000-0000-0000-0000-000000000001/expired-deal-note.png"}]'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

do $$
declare
  result jsonb;
begin
  select public.restore_customer('a8000000-0000-0000-0000-000000000001') into result;
  if result -> 'data' ->> 'id' <> 'a8000000-0000-0000-0000-000000000001'
    or (result -> 'data' ->> 'deleted_at') is not null then
    raise exception 'customer inside the 30-day restore window was not restored';
  end if;

  begin
    perform public.restore_customer('a8000000-0000-0000-0000-000000000002');
    raise exception 'customer at the 30-day boundary unexpectedly restored';
  exception
    when sqlstate 'P0001' then
      if sqlerrm <> 'Customer restore window expired' then
        raise exception 'unstable boundary error: %', sqlerrm;
      end if;
  end;

  begin
    perform public.restore_customer('a8000000-0000-0000-0000-000000000003');
    raise exception 'customer outside the 30-day window unexpectedly restored';
  exception
    when sqlstate 'P0001' then
      if sqlerrm <> 'Customer restore window expired' then
        raise exception 'unstable expired error: %', sqlerrm;
      end if;
  end;
end;
$$;

insert into public.companies (id, name, company, country, grade)
values
  ('a0000000-0000-0000-0000-000000000001', 'A Source', 'A Organization', 'China', 'A'),
  ('a0000000-0000-0000-0000-000000000002', 'A Target', null, null, 'B');

insert into public.contacts (
  id, company_id, first_name, last_name, email_jsonb, phone_jsonb
)
values (
  'a1000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'Ada',
  'Owner',
  '[{"email":"ada@example.test","type":"Work"}]',
  '[{"number":"+86-100","type":"Work"}]'
);

insert into public.tags (id, name, color)
values ('a6000000-0000-0000-0000-000000000001', 'Priority', '#ff0000');

insert into public.contact_tags (contact_id, tag_id)
values (
  'a1000000-0000-0000-0000-000000000001',
  'a6000000-0000-0000-0000-000000000001'
);

insert into public.tasks (id, contact_id, text)
values (
  'a7000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000001',
  'Open task'
);

insert into public.deals (id, company_id, name, stage, grade)
values ('a2000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'A Deal', 'lead', 'A');

insert into public.social_accounts (
  id, company_id, contact_id, platform, raw_identifier, normalized_identifier
)
values (
  'a3000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000001',
  'telegram', '@ada', 'ada'
);

insert into public.follow_ups (id, company_id, deal_id, type, note, occurred_at)
values (
  'a4000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'a2000000-0000-0000-0000-000000000001',
  'note', 'owner A follow-up', now()
);

insert into public.reminders (id, company_id, deal_id, type, status, due_at, resolution)
values
  ('a5000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001', 'fixed_time', 'pending', now(), null),
  ('a5000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', null, 'waiting_reply', 'completed', now(), 'Already done'),
  ('a5000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', null, 'paused', 'snoozed', now(), 'Waiting');

insert into storage.objects (bucket_id, name)
values ('attachments', '10000000-0000-0000-0000-000000000001/customer/a.txt');

do $$
begin
  if not exists (
    select 1
    from public.companies_summary
    where id = 'a0000000-0000-0000-0000-000000000001'
      and company = 'A Organization'
      and sales_id = '10000000-0000-0000-0000-000000000001'
      and search_text = 'A Source A Organization China'
      and nb_contacts = 1
      and nb_deals = 1
  ) then
    raise exception 'companies_summary does not expose the Atomic company contract';
  end if;

  if not exists (
    select 1
    from public.contacts_summary
    where id = 'a1000000-0000-0000-0000-000000000001'
      and company_name = 'A Source'
      and sales_id = '10000000-0000-0000-0000-000000000001'
      and tags = array['a6000000-0000-0000-0000-000000000001'::uuid]
      and nb_tasks = 1
      and email_fts = 'ada@example.test'
      and phone_fts = '+86-100'
  ) then
    raise exception 'contacts_summary does not expose the Atomic contact contract';
  end if;
end;
$$;

do $$
begin
  begin
    insert into storage.objects (bucket_id, name)
    values ('attachments', '20000000-0000-0000-0000-000000000002/forged.txt');
    raise exception 'cross-owner storage path unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

do $$
declare
  result jsonb;
begin
  begin
    perform public.get_customer_detail('ffffffff-ffff-ffff-ffff-ffffffffffff');
    raise exception 'missing customer detail unexpectedly succeeded';
  exception
    when no_data_found then null;
  end;

  select public.get_customer_detail('a0000000-0000-0000-0000-000000000001') into result;

  if jsonb_typeof(result) <> 'object'
    or not (result ? 'data')
    or result -> 'data' ->> 'id' <> 'a0000000-0000-0000-0000-000000000001'
    or result -> 'data' ->> 'company' <> 'A Organization'
    or jsonb_array_length(result -> 'data' -> 'contacts') <> 1
    or jsonb_array_length(result -> 'data' -> 'social_accounts') <> 1
    or jsonb_array_length(result -> 'data' -> 'deals') <> 1
    or jsonb_array_length(result -> 'data' -> 'recent_follow_ups') <> 1
    or jsonb_array_length(result -> 'data' -> 'open_reminders') <> 2 then
    raise exception 'customer detail envelope or related summaries are invalid: %', result;
  end if;
end;
$$;

do $$
declare
  result jsonb;
begin
  select public.soft_delete_customer('a0000000-0000-0000-0000-000000000001') into result;
  if jsonb_typeof(result) <> 'object'
    or not (result ? 'data')
    or result -> 'data' ->> 'id' <> 'a0000000-0000-0000-0000-000000000001'
    or (result -> 'data' ->> 'deleted_at') is null then
    raise exception 'soft delete did not return a data envelope: %', result;
  end if;
end;
$$;

do $$
begin
  begin
    perform public.get_customer_detail('a0000000-0000-0000-0000-000000000001');
    raise exception 'deleted customer detail unexpectedly succeeded';
  exception
    when no_data_found then null;
  end;
end;
$$;

do $$
begin
  if not exists (
    select 1 from public.companies
    where id = 'a0000000-0000-0000-0000-000000000001' and deleted_at is not null
  ) then
    raise exception 'soft delete did not mark the customer';
  end if;
  if not exists (
    select 1 from public.reminders
    where id = 'a5000000-0000-0000-0000-000000000001'
      and status = 'ignored' and resolution = 'Customer deleted'
  ) then
    raise exception 'soft delete did not suspend an open reminder';
  end if;
  if not exists (
    select 1 from public.reminders
    where id = 'a5000000-0000-0000-0000-000000000002'
      and status = 'completed' and resolution = 'Already done'
  ) then
    raise exception 'soft delete changed a completed reminder';
  end if;
end;
$$;

-- A user action after deletion wins over the old deletion snapshot. The marker
-- trigger clears deletion_event_id as compare-and-set protection.
select public.update_reminder_status_idempotent(
  'a5000000-0000-0000-0000-000000000103',
  'a5000000-0000-0000-0000-000000000003',
  'completed',
  null,
  'Manually handled after deletion'
);

do $$
declare
  result jsonb;
begin
  select public.restore_customer('a0000000-0000-0000-0000-000000000001') into result;
  if jsonb_typeof(result) <> 'object'
    or not (result ? 'data')
    or result -> 'data' ->> 'id' <> 'a0000000-0000-0000-0000-000000000001'
    or (result -> 'data' ->> 'deleted_at') is not null then
    raise exception 'restore did not return a data envelope: %', result;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from public.companies
    where id = 'a0000000-0000-0000-0000-000000000001' and deleted_at is null
  ) then
    raise exception 'restore did not reactivate the customer';
  end if;
  if not exists (
    select 1 from public.reminders
    where id = 'a5000000-0000-0000-0000-000000000001'
      and status = 'pending' and resolution is null
  ) then
    raise exception 'restore did not restore the reminder snapshot';
  end if;
  if not exists (
    select 1 from public.reminders
    where id = 'a5000000-0000-0000-0000-000000000003'
      and status = 'completed'
      and resolution = 'Manually handled after deletion'
      and deletion_event_id is null
  ) then
    raise exception 'restore overwrote a reminder changed after deletion';
  end if;
end;
$$;

do $$
declare
  result jsonb;
begin
  select public.merge_customers(
    'a0000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000002',
    '{"name":"Merged Customer","grade":"A"}'::jsonb
  ) into result;
  if jsonb_typeof(result) <> 'object'
    or not (result ? 'data')
    or result -> 'data' ->> 'id' <> 'a0000000-0000-0000-0000-000000000002'
    or result -> 'data' ->> 'name' <> 'Merged Customer' then
    raise exception 'merge did not return a data envelope: %', result;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from public.companies
    where id = 'a0000000-0000-0000-0000-000000000001' and deleted_at is not null
  ) then
    raise exception 'merge did not retire the source customer';
  end if;
  if not exists (
    select 1 from public.companies
    where id = 'a0000000-0000-0000-0000-000000000002'
      and name = 'Merged Customer' and grade = 'A'
  ) then
    raise exception 'merge did not apply target field resolutions';
  end if;
  if (select count(*) from public.contacts where company_id = 'a0000000-0000-0000-0000-000000000002') <> 1
    or (select count(*) from public.deals where company_id = 'a0000000-0000-0000-0000-000000000002') <> 1
    or (select count(*) from public.social_accounts where company_id = 'a0000000-0000-0000-0000-000000000002') <> 1
    or (select count(*) from public.follow_ups where company_id = 'a0000000-0000-0000-0000-000000000002') <> 1
    or (select count(*) from public.reminders where company_id = 'a0000000-0000-0000-0000-000000000002') <> 3 then
    raise exception 'merge did not move every customer child';
  end if;
end;
$$;

select set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);

insert into public.companies (id, name)
values ('b0000000-0000-0000-0000-000000000001', 'B Customer');

do $$
begin
  if (select count(*) from public.companies) <> 1 then
    raise exception 'RLS exposed another owner customer';
  end if;
  if (select count(*) from public.companies_summary) <> 1
    or exists (
      select 1 from public.companies_summary
      where owner_user_id = '10000000-0000-0000-0000-000000000001'
    ) then
    raise exception 'companies_summary exposed another owner customer';
  end if;
  if exists (
    select 1 from public.companies_summary
    where search_text ilike '%A Organization%'
  ) then
    raise exception 'companies_summary search_text exposed another owner customer';
  end if;
  if (select count(*) from public.contacts_summary) <> 0 then
    raise exception 'contacts_summary exposed another owner contact';
  end if;
  if not exists (
    select 1 from public.companies_summary
    where id = 'b0000000-0000-0000-0000-000000000001'
      and grade = 'B'
      and search_text = 'B Customer'
  ) then
    raise exception 'companies.grade default or null-safe search_text is invalid';
  end if;
  if (select count(*) from storage.objects where bucket_id = 'attachments') <> 0 then
    raise exception 'Storage RLS exposed another owner object';
  end if;

  begin
    insert into public.companies (owner_user_id, name, grade)
    values ('10000000-0000-0000-0000-000000000001', 'Forged owner', 'C');
    raise exception 'forged owner_user_id insert unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;

  begin
    insert into public.contacts (owner_user_id, company_id, first_name)
    values (
      '20000000-0000-0000-0000-000000000002',
      'a0000000-0000-0000-0000-000000000002',
      'Cross owner'
    );
    set constraints all immediate;
    raise exception 'cross-owner parent reference unexpectedly succeeded';
  exception
    when foreign_key_violation then
      set constraints all deferred;
  end;

  begin
    perform public.soft_delete_customer('a0000000-0000-0000-0000-000000000002');
    raise exception 'cross-owner RPC unexpectedly succeeded';
  exception
    when no_data_found then null;
  end;

  begin
    perform public.get_customer_detail('a0000000-0000-0000-0000-000000000002');
    raise exception 'cross-owner detail RPC unexpectedly succeeded';
  exception
    when no_data_found then null;
  end;

  begin
    perform public.purge_expired_customers();
    raise exception 'authenticated purge unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;

  begin
    perform public.claim_customer_purge_jobs();
    raise exception 'authenticated purge claim unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;

  begin
    perform 1 from public.customer_purge_jobs;
    raise exception 'authenticated purge queue read unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

set local role service_role;

do $$
declare
  first_enqueue_count bigint;
  retry_enqueue_count bigint;
  claim_result jsonb;
  boundary_job jsonb;
  expired_job jsonb;
  rpc_result jsonb;
begin
  select public.purge_expired_customers() into first_enqueue_count;
  if first_enqueue_count <> 2 then
    raise exception 'service-role purge expected 2 queued customers, queued %', first_enqueue_count;
  end if;

  select public.purge_expired_customers() into retry_enqueue_count;
  if retry_enqueue_count <> 0 then
    raise exception 'service-role enqueue was not idempotent: %', retry_enqueue_count;
  end if;

  select public.claim_customer_purge_jobs() into claim_result;
  if jsonb_array_length(claim_result -> 'data') <> 2 then
    raise exception 'expected two claimed purge jobs: %', claim_result;
  end if;

  select item into boundary_job
  from jsonb_array_elements(claim_result -> 'data') as item
  where item ->> 'customer_id' = 'a8000000-0000-0000-0000-000000000002';

  select item into expired_job
  from jsonb_array_elements(claim_result -> 'data') as item
  where item ->> 'customer_id' = 'a8000000-0000-0000-0000-000000000003';

  if boundary_job is null
    or not (boundary_job -> 'object_paths' @> '["10000000-0000-0000-0000-000000000001/boundary-logo.png"]'::jsonb) then
    raise exception 'boundary Customer path snapshot is missing: %', boundary_job;
  end if;
  if expired_job is null
    or jsonb_array_length(expired_job -> 'object_paths') <> 3
    or not (expired_job -> 'object_paths' @> '["10000000-0000-0000-0000-000000000001/expired-avatar.png"]'::jsonb)
    or not (expired_job -> 'object_paths' @> '["10000000-0000-0000-0000-000000000001/expired-contact-note.png"]'::jsonb)
    or not (expired_job -> 'object_paths' @> '["10000000-0000-0000-0000-000000000001/expired-deal-note.png"]'::jsonb) then
    raise exception 'expired Customer path snapshot is incomplete: %', expired_job;
  end if;

  select public.fail_customer_purge_job(
    (expired_job ->> 'id')::uuid,
    'simulated Storage failure'
  ) into rpc_result;
  if rpc_result -> 'data' ->> 'status' <> 'retry' then
    raise exception 'failed purge job did not retain retry state: %', rpc_result;
  end if;

  -- Simulate a path-bearing record changing after the worker deleted its old snapshot.
  update public.companies
  set logo = jsonb_build_object('path', 'boundary-logo-v2.png')
  where id = 'a8000000-0000-0000-0000-000000000002';

  select public.complete_customer_purge_job((boundary_job ->> 'id')::uuid)
  into rpc_result;
  if rpc_result -> 'data' ->> 'status' <> 'retry'
    or rpc_result -> 'data' ->> 'reason' <> 'storage_snapshot_changed' then
    raise exception 'changed Storage snapshot did not defer the cascade: %', rpc_result;
  end if;
end;
$$;

reset role;

do $$
begin
  if not exists (
    select 1
    from public.customer_purge_jobs
    where customer_id = 'a8000000-0000-0000-0000-000000000002'
      and status = 'retry'
      and last_error = 'storage_snapshot_changed'
      and object_paths @> array[
        '10000000-0000-0000-0000-000000000001/boundary-logo.png',
        '10000000-0000-0000-0000-000000000001/boundary-logo-v2.png'
      ]
  ) then
    raise exception 'resnapshotted purge job did not preserve old and new paths';
  end if;

  if not exists (
    select 1
    from public.customer_purge_jobs
    where customer_id = 'a8000000-0000-0000-0000-000000000003'
      and status = 'retry'
      and attempt_count = 1
      and last_error = 'simulated Storage failure'
  ) then
    raise exception 'Storage failure retry state was not persisted';
  end if;

  if (select count(*) from public.companies where id in (
    'a8000000-0000-0000-0000-000000000002',
    'a8000000-0000-0000-0000-000000000003'
  )) <> 2 then
    raise exception 'Customer cascade ran before Storage cleanup stabilized';
  end if;

  update public.customer_purge_jobs
  set next_attempt_at = now() - interval '1 second'
  where status = 'retry';
end;
$$;

set local role service_role;

do $$
declare
  claim_result jsonb;
  job jsonb;
  rpc_result jsonb;
begin
  select public.claim_customer_purge_jobs() into claim_result;
  if jsonb_array_length(claim_result -> 'data') <> 2 then
    raise exception 'retry jobs were not claimable: %', claim_result;
  end if;

  for job in select value from jsonb_array_elements(claim_result -> 'data')
  loop
    select public.complete_customer_purge_job((job ->> 'id')::uuid) into rpc_result;
    if rpc_result -> 'data' ->> 'status' <> 'completed' then
      raise exception 'retry purge did not complete: %', rpc_result;
    end if;
  end loop;

  select public.complete_customer_purge_job(
    (
      select (value ->> 'id')::uuid
      from jsonb_array_elements(claim_result -> 'data')
      where value ->> 'customer_id' = 'a8000000-0000-0000-0000-000000000003'
    )
  ) into rpc_result;
  if rpc_result -> 'data' ->> 'status' <> 'completed' then
    raise exception 'completed purge RPC was not idempotent: %', rpc_result;
  end if;

  select public.claim_customer_purge_jobs() into claim_result;
  if jsonb_array_length(claim_result -> 'data') <> 0 then
    raise exception 'completed purge jobs were reclaimed: %', claim_result;
  end if;
end;
$$;

rollback;
