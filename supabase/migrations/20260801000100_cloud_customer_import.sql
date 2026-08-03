-- Transactional customer imports. Preview and mapping stay in the browser, but
-- the write path and idempotency record live in PostgreSQL.

create table public.import_jobs (
  id uuid primary key,
  owner_user_id uuid not null references public.profiles(id) on delete cascade,
  idempotency_key text not null check (btrim(idempotency_key) <> ''),
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  status text not null check (status in ('processing', 'completed')),
  row_count integer not null check (row_count between 0 and 1000),
  result jsonb check (result is null or jsonb_typeof(result) = 'object'),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (owner_user_id, idempotency_key)
);

create index import_jobs_owner_created_idx
  on public.import_jobs (owner_user_id, created_at desc);

alter table public.import_jobs enable row level security;
alter table public.import_jobs force row level security;

create policy import_jobs_owner_select
  on public.import_jobs
  for select
  to authenticated
  using (owner_user_id = auth.uid());

revoke all on table public.import_jobs from public, anon, authenticated, service_role;
grant select on table public.import_jobs to authenticated;

create function public.commit_customer_import(
  p_job_id uuid,
  p_idempotency_key text,
  p_payload_hash text,
  p_rows jsonb,
  p_resolutions jsonb default '[]'::jsonb,
  p_invalid_count integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_owner uuid := auth.uid();
  existing_job public.import_jobs;
  item jsonb;
  resolution jsonb;
  target public.companies;
  customer_id uuid;
  contact_id uuid;
  existing_account public.social_accounts;
  row_index integer;
  action text;
  normalized_platform text;
  success_count integer := 0;
  skipped_count integer := 0;
  duplicate_count integer := 0;
  inserted_count integer := 0;
  warnings jsonb := '[]'::jsonb;
  result_payload jsonb;
begin
  if current_owner is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if p_job_id is null then
    raise exception using errcode = '22023', message = 'Import job id is required';
  end if;
  if nullif(btrim(p_idempotency_key), '') is null or length(p_idempotency_key) > 200 then
    raise exception using errcode = '22023', message = 'Invalid import idempotency key';
  end if;
  if p_payload_hash is null or p_payload_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'Invalid import payload hash';
  end if;
  if p_rows is null
     or p_resolutions is null
     or jsonb_typeof(p_rows) <> 'array'
     or jsonb_array_length(p_rows) > 1000
     or jsonb_typeof(p_resolutions) <> 'array'
     or jsonb_array_length(p_resolutions) > 1000
     or p_invalid_count is null
     or p_invalid_count < 0
     or p_invalid_count > 1000
     or jsonb_array_length(p_rows) + p_invalid_count > 1000 then
    raise exception using errcode = '22023', message = 'Import payload exceeds the 1000 row limit';
  end if;

  select * into existing_job
  from public.import_jobs
  where owner_user_id = current_owner
    and idempotency_key = btrim(p_idempotency_key)
  for update;

  if found then
    if existing_job.payload_hash <> p_payload_hash then
      raise exception using errcode = '23505', message = 'Import idempotency key was reused with a different payload';
    end if;
    if existing_job.status = 'completed' and existing_job.result is not null then
      return jsonb_build_object('data', existing_job.result);
    end if;
    raise exception using errcode = '55000', message = 'Import job is already processing';
  end if;

  insert into public.import_jobs (
    id, owner_user_id, idempotency_key, payload_hash, status, row_count
  ) values (
    p_job_id,
    current_owner,
    btrim(p_idempotency_key),
    p_payload_hash,
    'processing',
    jsonb_array_length(p_rows) + p_invalid_count
  ) on conflict (owner_user_id, idempotency_key) do nothing;

  get diagnostics inserted_count = row_count;
  if inserted_count = 0 then
    select * into existing_job
    from public.import_jobs
    where owner_user_id = current_owner
      and idempotency_key = btrim(p_idempotency_key)
    for update;
    if existing_job.payload_hash <> p_payload_hash then
      raise exception using errcode = '23505', message = 'Import idempotency key was reused with a different payload';
    end if;
    if existing_job.status = 'completed' and existing_job.result is not null then
      return jsonb_build_object('data', existing_job.result);
    end if;
    raise exception using errcode = '55000', message = 'Import job is already processing';
  end if;

  for item in select value from jsonb_array_elements(p_rows)
  loop
    begin
      row_index := (item ->> 'row_index')::integer;
    exception when others then
      raise exception using errcode = '22023', message = 'Every import row needs a positive row_index';
    end;
    if row_index <= 0
       or nullif(btrim(item ->> 'name'), '') is null
       or coalesce(item ->> 'grade', 'B') not in ('A', 'B', 'C')
       or ((item ->> 'platform') is null) <> ((item ->> 'platform_account') is null) then
      raise exception using errcode = '22023', message = format('Invalid import row %s', row_index);
    end if;

    select candidate.value into resolution
    from jsonb_array_elements(p_resolutions) as candidate(value)
    where (candidate.value ->> 'row_index')::integer = row_index;

    action := coalesce(resolution ->> 'action', 'new');
    if action = 'skip' then
      skipped_count := skipped_count + 1;
      continue;
    end if;

    if action = 'merge' then
      begin
        customer_id := (resolution ->> 'target_customer_id')::uuid;
      exception when others then
        raise exception using errcode = '22023', message = format('Invalid merge target for row %s', row_index);
      end;
      select * into target
      from public.companies
      where owner_user_id = current_owner
        and id = customer_id
        and deleted_at is null
      for update;
      if not found then
        raise exception using errcode = '23503', message = format('Merge target for row %s does not exist', row_index);
      end if;

      update public.companies
      set company = coalesce(company, nullif(btrim(item ->> 'company'), '')),
          country = coalesce(country, nullif(btrim(item ->> 'country'), '')),
          source = coalesce(source, nullif(btrim(item ->> 'source'), '')),
          updated_at = now()
      where owner_user_id = current_owner and id = customer_id;
      duplicate_count := duplicate_count + 1;
    elsif action = 'new' then
      insert into public.companies (
        owner_user_id, name, company, country, source, grade, status
      ) values (
        current_owner,
        btrim(item ->> 'name'),
        nullif(btrim(item ->> 'company'), ''),
        nullif(btrim(item ->> 'country'), ''),
        nullif(btrim(item ->> 'source'), ''),
        coalesce(item ->> 'grade', 'B')::public.customer_grade,
        'active'
      ) returning id into customer_id;
      success_count := success_count + 1;
    else
      raise exception using errcode = '22023', message = format('Invalid resolution for row %s', row_index);
    end if;

    contact_id := null;
    if nullif(btrim(item ->> 'contact_name'), '') is not null
       or (
         nullif(btrim(item ->> 'email'), '') is not null
         and not exists (
           select 1 from public.contacts as contact,
             jsonb_array_elements(contact.email_jsonb) as email(value)
           where contact.owner_user_id = current_owner
             and contact.company_id = customer_id
             and lower(email.value ->> 'email') = lower(btrim(item ->> 'email'))
         )
       )
       or (
         nullif(btrim(item ->> 'phone'), '') is not null
         and not exists (
           select 1 from public.contacts as contact,
             jsonb_array_elements(contact.phone_jsonb) as phone(value)
           where contact.owner_user_id = current_owner
             and contact.company_id = customer_id
             and phone.value ->> 'number' = btrim(item ->> 'phone')
         )
       ) then
      insert into public.contacts (
        owner_user_id, company_id, name, email_jsonb, phone_jsonb, has_newsletter
      ) values (
        current_owner,
        customer_id,
        coalesce(nullif(btrim(item ->> 'contact_name'), ''), btrim(item ->> 'name')),
        case
          when nullif(btrim(item ->> 'email'), '') is null or exists (
            select 1 from public.contacts as contact,
              jsonb_array_elements(contact.email_jsonb) as email(value)
            where contact.owner_user_id = current_owner
              and contact.company_id = customer_id
              and lower(email.value ->> 'email') = lower(btrim(item ->> 'email'))
          ) then '[]'::jsonb
          else jsonb_build_array(jsonb_build_object('email', btrim(item ->> 'email'), 'type', 'Work'))
        end,
        case
          when nullif(btrim(item ->> 'phone'), '') is null or exists (
            select 1 from public.contacts as contact,
              jsonb_array_elements(contact.phone_jsonb) as phone(value)
            where contact.owner_user_id = current_owner
              and contact.company_id = customer_id
              and phone.value ->> 'number' = btrim(item ->> 'phone')
          ) then '[]'::jsonb
          else jsonb_build_array(jsonb_build_object('number', btrim(item ->> 'phone'), 'type', 'Work'))
        end,
        false
      ) returning id into contact_id;
    end if;

    if nullif(btrim(item ->> 'platform'), '') is not null then
      normalized_platform := case lower(btrim(item ->> 'platform'))
        when 'whatsapp' then regexp_replace(
          regexp_replace(btrim(item ->> 'platform_account'), '@.*$', ''),
          '[^0-9+]', '', 'g'
        )
        when 'telegram' then lower(regexp_replace(btrim(item ->> 'platform_account'), '^@', ''))
        else lower(btrim(item ->> 'platform_account'))
      end;

      select * into existing_account
      from public.social_accounts
      where owner_user_id = current_owner
        and platform = lower(btrim(item ->> 'platform'))
        and normalized_identifier = normalized_platform;

      if found and existing_account.company_id <> customer_id then
        warnings := warnings || jsonb_build_array(jsonb_build_object(
          'code', 'PLATFORM_ACCOUNT_NOT_COPIED',
          'row_index', row_index,
          'field', 'platform_account',
          'platform', lower(btrim(item ->> 'platform')),
          'platform_account', btrim(item ->> 'platform_account'),
          'existing_customer_id', existing_account.company_id
        ));
      elsif not found then
        insert into public.social_accounts (
          owner_user_id, company_id, contact_id, platform, raw_identifier,
          normalized_identifier, manually_bound
        ) values (
          current_owner,
          customer_id,
          contact_id,
          lower(btrim(item ->> 'platform')),
          btrim(item ->> 'platform_account'),
          normalized_platform,
          false
        );
      end if;
    end if;
  end loop;

  result_payload := jsonb_build_object(
    'success', success_count,
    'failed', p_invalid_count,
    'skipped', skipped_count,
    'duplicates', duplicate_count,
    'warnings', warnings
  );

  update public.import_jobs
  set status = 'completed', result = result_payload, completed_at = now()
  where owner_user_id = current_owner and id = p_job_id;

  insert into public.audit_events (
    owner_user_id, event_type, entity_type, entity_id, metadata
  ) values (
    current_owner,
    'import.completed',
    'import_job',
    p_job_id,
    result_payload || jsonb_build_object('payload_hash', p_payload_hash)
  );

  return jsonb_build_object('data', result_payload);
end;
$$;

revoke execute on function public.commit_customer_import(
  uuid, text, text, jsonb, jsonb, integer
) from public, anon, service_role;
grant execute on function public.commit_customer_import(
  uuid, text, text, jsonb, jsonb, integer
) to authenticated;
