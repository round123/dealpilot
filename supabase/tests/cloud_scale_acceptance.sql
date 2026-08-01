-- Cloud P0 scale gate. Run after all migrations with psql -v ON_ERROR_STOP=1.
-- Timings are printed for trend visibility. Limits are deliberately wide so
-- the gate catches pathological regressions rather than CI host variance.

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values (
  '00000000-0000-0000-0000-000000000000',
  '90000000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'scale-owner@example.test',
  '',
  now(),
  '{}',
  '{}',
  now(),
  now()
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"90000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

do $$
declare
  import_rows jsonb;
  import_result jsonb;
  replay_result jsonb;
  started_at timestamptz;
  elapsed_ms numeric;
  customer_count integer;
  import_job_count integer;
  import_limit_ms constant integer := 120000;
begin
  select jsonb_agg(
    jsonb_build_object(
      'row_index', item,
      'name', format('Scale Customer %s', lpad(item::text, 4, '0')),
      'company', format('Scale Company %s', lpad(item::text, 4, '0')),
      'country', 'CN',
      'source', 'scale-acceptance',
      'grade', case item % 3 when 0 then 'A' when 1 then 'B' else 'C' end,
      'contact_name', null,
      'email', null,
      'phone', null,
      'platform', null,
      'platform_account', null
    ) order by item
  ) into import_rows
  from generate_series(1, 1000) as generated(item);

  started_at := clock_timestamp();
  select public.commit_customer_import(
    '90000000-0000-4000-8000-000000000101',
    'scale-import-1000',
    repeat('a', 64),
    import_rows,
    '[]'::jsonb,
    0
  ) into import_result;
  elapsed_ms := extract(epoch from (clock_timestamp() - started_at)) * 1000;
  raise notice 'scale: transactional 1000-row import completed in % ms', round(elapsed_ms, 2);

  if import_result -> 'data' ->> 'success' <> '1000'
     or import_result -> 'data' ->> 'failed' <> '0' then
    raise exception '1000-row import returned unexpected counts: %', import_result;
  end if;
  if elapsed_ms > import_limit_ms then
    raise exception '1000-row import exceeded wide % ms limit: % ms',
      import_limit_ms, round(elapsed_ms, 2);
  end if;

  select count(*) into customer_count
  from public.companies
  where name like 'Scale Customer %';
  if customer_count <> 1000 then
    raise exception '1000-row import persisted % customers', customer_count;
  end if;

  select public.commit_customer_import(
    '90000000-0000-4000-8000-000000000102',
    'scale-import-1000',
    repeat('a', 64),
    import_rows,
    '[]'::jsonb,
    0
  ) into replay_result;
  if replay_result is distinct from import_result then
    raise exception 'idempotent import replay changed its result: first=%, replay=%',
      import_result, replay_result;
  end if;

  select count(*) into customer_count
  from public.companies
  where name like 'Scale Customer %';
  select count(*) into import_job_count
  from public.import_jobs
  where idempotency_key = 'scale-import-1000';
  if customer_count <> 1000 or import_job_count <> 1 then
    raise exception 'idempotent replay duplicated data: customers=%, jobs=%',
      customer_count, import_job_count;
  end if;
end;
$$;

do $$
declare
  failed_job_count integer;
  partial_customer_count integer;
begin
  begin
    perform public.commit_customer_import(
      '90000000-0000-4000-8000-000000000201',
      'scale-import-must-rollback',
      repeat('b', 64),
      jsonb_build_array(
        jsonb_build_object(
          'row_index', 1, 'name', 'Rollback Sentinel One',
          'company', null, 'country', null, 'source', null, 'grade', 'B',
          'contact_name', null, 'email', null, 'phone', null,
          'platform', null, 'platform_account', null
        ),
        jsonb_build_object(
          'row_index', 2, 'name', 'Rollback Sentinel Two',
          'company', null, 'country', null, 'source', null, 'grade', 'B',
          'contact_name', null, 'email', null, 'phone', null,
          'platform', null, 'platform_account', null
        )
      ),
      jsonb_build_array(jsonb_build_object(
        'row_index', 2,
        'action', 'merge',
        'target_customer_id', '90000000-0000-4000-8000-000000009999'
      )),
      0
    );
    raise exception 'invalid merge target unexpectedly committed';
  exception
    when foreign_key_violation then null;
  end;

  select count(*) into partial_customer_count
  from public.companies
  where name like 'Rollback Sentinel %';
  select count(*) into failed_job_count
  from public.import_jobs
  where idempotency_key = 'scale-import-must-rollback';
  if partial_customer_count <> 0 or failed_job_count <> 0 then
    raise exception 'failed import left partial state: customers=%, jobs=%',
      partial_customer_count, failed_job_count;
  end if;
end;
$$;

do $$
declare
  started_at timestamptz := clock_timestamp();
  elapsed_ms numeric;
  follow_up_count integer;
  seed_limit_ms constant integer := 60000;
begin
  insert into public.follow_ups (
    company_id, type, note, occurred_at
  )
  select
    customer.id,
    'note'::public.follow_up_type,
    format('Scale follow-up %s for %s', follow_up_number, customer.name),
    now() - make_interval(mins => follow_up_number)
  from public.companies as customer
  cross join generate_series(1, 10) as generated(follow_up_number)
  where customer.name like 'Scale Customer %';

  elapsed_ms := extract(epoch from (clock_timestamp() - started_at)) * 1000;
  raise notice 'scale: 10000 follow-up seed completed in % ms', round(elapsed_ms, 2);
  if elapsed_ms > seed_limit_ms then
    raise exception '10000 follow-up seed exceeded wide % ms limit: % ms',
      seed_limit_ms, round(elapsed_ms, 2);
  end if;

  select count(*) into follow_up_count
  from public.follow_ups;
  if follow_up_count <> 10000 then
    raise exception 'scale fixture contains % follow-ups instead of 10000', follow_up_count;
  end if;
end;
$$;

do $$
declare
  started_at timestamptz := clock_timestamp();
  elapsed_ms numeric;
  total_count integer;
  page_count integer;
  list_limit_ms constant integer := 15000;
begin
  select count(*) into total_count
  from public.companies_summary
  where deleted_at is null
    and search_text ilike '%scale customer%';

  perform id
  from public.companies_summary
  where deleted_at is null
    and search_text ilike '%scale customer%'
  order by updated_at desc, id
  limit 50;
  get diagnostics page_count = row_count;

  elapsed_ms := extract(epoch from (clock_timestamp() - started_at)) * 1000;
  raise notice 'scale: 1000-customer list count + first page completed in % ms', round(elapsed_ms, 2);
  if total_count <> 1000 or page_count <> 50 then
    raise exception 'customer list query returned total=% and page=%', total_count, page_count;
  end if;
  if elapsed_ms > list_limit_ms then
    raise exception 'customer list query exceeded wide % ms limit: % ms',
      list_limit_ms, round(elapsed_ms, 2);
  end if;
end;
$$;

do $$
declare
  target_id uuid;
  detail_result jsonb;
  started_at timestamptz;
  elapsed_ms numeric;
  detail_limit_ms constant integer := 15000;
begin
  select id into target_id
  from public.companies
  where name = 'Scale Customer 0500';

  started_at := clock_timestamp();
  select public.get_customer_detail(target_id) into detail_result;
  elapsed_ms := extract(epoch from (clock_timestamp() - started_at)) * 1000;
  raise notice 'scale: customer detail over 10000 follow-ups completed in % ms', round(elapsed_ms, 2);

  if detail_result -> 'data' ->> 'id' <> target_id::text
     or jsonb_array_length(detail_result -> 'data' -> 'recent_follow_ups') <> 10 then
    raise exception 'customer detail query returned an invalid summary: %', detail_result;
  end if;
  if elapsed_ms > detail_limit_ms then
    raise exception 'customer detail query exceeded wide % ms limit: % ms',
      detail_limit_ms, round(elapsed_ms, 2);
  end if;
end;
$$;

rollback;
