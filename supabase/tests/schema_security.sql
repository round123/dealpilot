-- Catalog-level guardrails for the personal-account schema.
-- Run after all migrations with psql -v ON_ERROR_STOP=1.

begin;

do $$
declare
  expected_tables constant text[] := array[
    'audit_events',
    'companies',
    'configuration',
    'contact_notes',
    'contact_tags',
    'contacts',
    'customer_purge_jobs',
    'deal_contacts',
    'deal_milestones',
    'deal_notes',
    'deal_risks',
    'deals',
    'follow_ups',
    'migration_jobs',
    'profiles',
    'reminders',
    'social_accounts',
    'tags',
    'tasks'
  ];
  expected_views constant text[] := array[
    'companies_summary',
    'contacts_summary'
  ];
  owner_tables constant text[] := array[
    'audit_events',
    'companies',
    'configuration',
    'contact_notes',
    'contact_tags',
    'contacts',
    'deal_contacts',
    'deal_milestones',
    'deal_notes',
    'deal_risks',
    'deals',
    'follow_ups',
    'migration_jobs',
    'reminders',
    'social_accounts',
    'tags',
    'tasks'
  ];
  company_summary_fields constant text[] := array[
    'id', 'owner_user_id', 'name', 'company', 'sector', 'size', 'linkedin_url',
    'website', 'phone_number', 'address', 'zipcode', 'city', 'state_abbr',
    'country', 'description', 'revenue', 'tax_identifier', 'logo',
    'context_links', 'source', 'grade', 'status', 'deleted_at', 'created_at',
    'updated_at', 'sales_id', 'search_text', 'nb_contacts', 'nb_deals'
  ];
  contact_summary_fields constant text[] := array[
    'id', 'owner_user_id', 'company_id', 'first_name', 'last_name', 'name',
    'gender', 'title', 'background', 'avatar', 'first_seen', 'last_seen',
    'has_newsletter', 'status', 'linkedin_url', 'email_jsonb', 'phone_jsonb',
    'created_at', 'updated_at', 'sales_id', 'company_name', 'tags', 'nb_tasks',
    'email_fts', 'phone_fts'
  ];
  purge_job_fields constant text[] := array[
    'id', 'owner_user_id', 'customer_id', 'cutoff', 'object_paths', 'status',
    'attempt_count', 'next_attempt_at', 'claimed_at', 'last_error',
    'completed_at', 'created_at', 'updated_at'
  ];
  actual_tables text[];
  actual_views text[];
  actual_purge_statuses text[];
  failures text[];
begin
  select array_agg(c.relname::text order by c.relname)
  into actual_tables
  from pg_catalog.pg_class as c
  join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('r', 'p');

  if actual_tables is distinct from expected_tables then
    raise exception 'public table set differs from baseline. expected=%, actual=%',
      expected_tables, actual_tables;
  end if;

  select array_agg(c.relname::text order by c.relname)
  into actual_views
  from pg_catalog.pg_class as c
  join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'v';

  if actual_views is distinct from expected_views then
    raise exception 'public view set differs from baseline. expected=%, actual=%',
      expected_views, actual_views;
  end if;

  select array_agg(c.relname::text order by c.relname)
  into failures
  from pg_catalog.pg_class as c
  join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = any(expected_views)
    and not (coalesce(c.reloptions, '{}'::text[]) @> array['security_invoker=true']);

  if failures is not null then
    raise exception 'views missing security_invoker=true: %', failures;
  end if;

  select array_agg(c.relname::text order by c.relname)
  into failures
  from pg_catalog.pg_class as c
  join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = any(expected_views)
    and (
      not pg_catalog.has_table_privilege('authenticated', c.oid, 'SELECT')
      or pg_catalog.has_table_privilege(
        'authenticated',
        c.oid,
        'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
      )
    );

  if failures is not null then
    raise exception 'summary views must grant authenticated SELECT only: %', failures;
  end if;

  select array_agg(required_field order by required_field)
  into failures
  from unnest(company_summary_fields) as required_company_field(required_field)
  where not exists (
    select 1
    from information_schema.columns as column_info
    where column_info.table_schema = 'public'
      and column_info.table_name = 'companies_summary'
      and column_info.column_name = required_field
  );

  if failures is not null then
    raise exception 'companies_summary is missing Atomic fields: %', failures;
  end if;

  select array_agg(required_field order by required_field)
  into failures
  from unnest(contact_summary_fields) as required_contact_field(required_field)
  where not exists (
    select 1
    from information_schema.columns as column_info
    where column_info.table_schema = 'public'
      and column_info.table_name = 'contacts_summary'
      and column_info.column_name = required_field
  );

  if failures is not null then
    raise exception 'contacts_summary is missing Atomic fields: %', failures;
  end if;

  select array_agg(expected.view_name || '.' || expected.column_name order by expected.view_name, expected.column_name)
  into failures
  from (
    values
      ('companies_summary', 'company', 'text'),
      ('companies_summary', 'context_links', '_text'),
      ('companies_summary', 'sales_id', 'uuid'),
      ('companies_summary', 'search_text', 'text'),
      ('companies_summary', 'nb_contacts', 'int4'),
      ('companies_summary', 'nb_deals', 'int4'),
      ('contacts_summary', 'sales_id', 'uuid'),
      ('contacts_summary', 'tags', '_uuid'),
      ('contacts_summary', 'nb_tasks', 'int4'),
      ('contacts_summary', 'email_fts', 'text'),
      ('contacts_summary', 'phone_fts', 'text')
  ) as expected(view_name, column_name, type_name)
  where not exists (
    select 1
    from information_schema.columns as column_info
    where column_info.table_schema = 'public'
      and column_info.table_name = expected.view_name
      and column_info.column_name = expected.column_name
      and column_info.udt_name = expected.type_name
  );

  if failures is not null then
    raise exception 'summary view field types differ from the Atomic contract: %', failures;
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_attribute as a
    join pg_catalog.pg_class as c on c.oid = a.attrelid
    join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'companies'
      and a.attname = 'company'
      and pg_catalog.format_type(a.atttypid, a.atttypmod) = 'text'
      and not a.attnotnull
      and not a.attisdropped
  ) then
    raise exception 'companies.company must be nullable text for lossless V1 migration';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_attribute as a
    join pg_catalog.pg_class as c on c.oid = a.attrelid
    join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
    join pg_catalog.pg_attrdef as d
      on d.adrelid = a.attrelid and d.adnum = a.attnum
    where n.nspname = 'public'
      and c.relname = 'companies'
      and a.attname = 'grade'
      and pg_catalog.pg_get_expr(d.adbin, d.adrelid)
        ~ '^''B''::(public\.)?customer_grade$'
  ) then
    raise exception 'companies.grade default must be B';
  end if;

  select array_agg(required_field order by required_field)
  into failures
  from unnest(purge_job_fields) as required_purge_field(required_field)
  where not exists (
    select 1
    from information_schema.columns as column_info
    where column_info.table_schema = 'public'
      and column_info.table_name = 'customer_purge_jobs'
      and column_info.column_name = required_field
  );

  if failures is not null then
    raise exception 'customer_purge_jobs is missing durable retry fields: %', failures;
  end if;

  select array_agg(e.enumlabel order by e.enumsortorder)
  into actual_purge_statuses
  from pg_catalog.pg_enum as e
  join pg_catalog.pg_type as t on t.oid = e.enumtypid
  join pg_catalog.pg_namespace as n on n.oid = t.typnamespace
  where n.nspname = 'public'
    and t.typname = 'customer_purge_job_status';

  if actual_purge_statuses is distinct from array[
    'pending', 'processing', 'retry', 'completed', 'cancelled'
  ] then
    raise exception 'customer purge status lifecycle differs from baseline: %', actual_purge_statuses;
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_index as i
    join pg_catalog.pg_class as table_class on table_class.oid = i.indrelid
    join pg_catalog.pg_namespace as n on n.oid = table_class.relnamespace
    where n.nspname = 'public'
      and table_class.relname = 'customer_purge_jobs'
      and i.indisunique
      and (
        select array_agg(a.attname::text order by key_column.ordinality)
        from unnest(i.indkey) with ordinality as key_column(attnum, ordinality)
        join pg_catalog.pg_attribute as a
          on a.attrelid = i.indrelid and a.attnum = key_column.attnum
      ) = array['customer_id']
  ) then
    raise exception 'customer_purge_jobs must be unique by Customer';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_constraint as con
    join pg_catalog.pg_class as child on child.oid = con.conrelid
    join pg_catalog.pg_class as parent on parent.oid = con.confrelid
    join pg_catalog.pg_namespace as child_ns on child_ns.oid = child.relnamespace
    join pg_catalog.pg_namespace as parent_ns on parent_ns.oid = parent.relnamespace
    where con.contype = 'f'
      and child_ns.nspname = 'public'
      and child.relname = 'customer_purge_jobs'
      and parent_ns.nspname = 'public'
      and parent.relname = 'companies'
  ) then
    raise exception 'customer_purge_jobs must survive the Customer delete cascade';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_policies as p
    where p.schemaname = 'public'
      and p.tablename = 'customer_purge_jobs'
  ) then
    raise exception 'customer_purge_jobs must not expose an RLS policy';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_class as c
    join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'customer_purge_jobs'
      and (
        pg_catalog.has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE')
        or pg_catalog.has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE')
        or pg_catalog.has_table_privilege('service_role', c.oid, 'SELECT,INSERT,UPDATE,DELETE')
      )
  ) then
    raise exception 'customer_purge_jobs must only be accessed through service RPCs';
  end if;

  select array_agg(c.relname::text order by c.relname)
  into failures
  from pg_catalog.pg_class as c
  join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = any(expected_tables)
    and (not c.relrowsecurity or not c.relforcerowsecurity);

  if failures is not null then
    raise exception 'tables missing enabled and forced RLS: %', failures;
  end if;

  select array_agg(owner_table order by owner_table)
  into failures
  from unnest(owner_tables) as expected_owner(owner_table)
  where not exists (
    select 1
    from pg_catalog.pg_attribute as a
    join pg_catalog.pg_class as c on c.oid = a.attrelid
    join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = owner_table
      and a.attname = 'owner_user_id'
      and a.attnum > 0
      and not a.attisdropped
      and a.attnotnull
  );

  if failures is not null then
    raise exception 'owner-bound tables missing a non-null owner_user_id: %', failures;
  end if;

  select array_agg(owner_table order by owner_table)
  into failures
  from unnest(owner_tables) as expected_owner(owner_table)
  where not exists (
    select 1
    from pg_catalog.pg_policies as p
    where p.schemaname = 'public'
      and p.tablename = owner_table
      and 'authenticated' = any(p.roles)
      and p.cmd = 'ALL'
      and coalesce(p.qual, '') ~ 'owner_user_id.*auth\.uid\(\)'
      and coalesce(p.with_check, '') ~ 'owner_user_id.*auth\.uid\(\)'
  );

  if failures is not null then
    raise exception 'owner-bound tables missing an authenticated owner policy: %', failures;
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_policies as p
    where p.schemaname = 'public'
      and p.tablename = 'profiles'
      and 'authenticated' = any(p.roles)
      and p.cmd = 'ALL'
      and coalesce(p.qual, '') ~ 'id.*auth\.uid\(\)'
      and coalesce(p.with_check, '') ~ 'id.*auth\.uid\(\)'
  ) then
    raise exception 'profiles is missing its authenticated identity policy';
  end if;

  select array_agg(con.conname::text order by con.conname)
  into failures
  from pg_catalog.pg_constraint as con
  join pg_catalog.pg_class as child on child.oid = con.conrelid
  join pg_catalog.pg_namespace as child_ns on child_ns.oid = child.relnamespace
  join pg_catalog.pg_class as parent on parent.oid = con.confrelid
  join pg_catalog.pg_namespace as parent_ns on parent_ns.oid = parent.relnamespace
  where con.contype = 'f'
    and child_ns.nspname = 'public'
    and parent_ns.nspname = 'public'
    and child.relname = any(owner_tables)
    and parent.relname = any(owner_tables)
    and not exists (
      select 1
      from generate_subscripts(con.conkey, 1) as key_position(position)
      join pg_catalog.pg_attribute as child_column
        on child_column.attrelid = con.conrelid
       and child_column.attnum = con.conkey[position]
      join pg_catalog.pg_attribute as parent_column
        on parent_column.attrelid = con.confrelid
       and parent_column.attnum = con.confkey[position]
      where child_column.attname = 'owner_user_id'
        and parent_column.attname = 'owner_user_id'
    );

  if failures is not null then
    raise exception 'owner-bound foreign keys missing paired owner_user_id columns: %', failures;
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_index as i
    join pg_catalog.pg_class as table_class on table_class.oid = i.indrelid
    join pg_catalog.pg_namespace as n on n.oid = table_class.relnamespace
    where n.nspname = 'public'
      and table_class.relname = 'tags'
      and i.indisunique
      and pg_catalog.pg_get_indexdef(i.indexrelid)
        ~ '\(owner_user_id, lower\(name\)\)$'
  ) then
    raise exception 'tags is missing unique (owner_user_id, lower(name))';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_index as i
    join pg_catalog.pg_class as table_class on table_class.oid = i.indrelid
    join pg_catalog.pg_namespace as n on n.oid = table_class.relnamespace
    where n.nspname = 'public'
      and table_class.relname = 'social_accounts'
      and i.indisunique
      and (
        select array_agg(a.attname::text order by key_column.ordinality)
        from unnest(i.indkey) with ordinality as key_column(attnum, ordinality)
        join pg_catalog.pg_attribute as a
          on a.attrelid = i.indrelid and a.attnum = key_column.attnum
      ) = array['owner_user_id', 'platform', 'normalized_identifier']
  ) then
    raise exception 'social_accounts is missing its owner-scoped identity unique index';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_index as i
    join pg_catalog.pg_class as table_class on table_class.oid = i.indrelid
    join pg_catalog.pg_namespace as n on n.oid = table_class.relnamespace
    where n.nspname = 'public'
      and table_class.relname = 'migration_jobs'
      and i.indisunique
      and (
        select array_agg(a.attname::text order by key_column.ordinality)
        from unnest(i.indkey) with ordinality as key_column(attnum, ordinality)
        join pg_catalog.pg_attribute as a
          on a.attrelid = i.indrelid and a.attnum = key_column.attnum
      ) = array['owner_user_id', 'idempotency_key']
  ) then
    raise exception 'migration_jobs is missing its owner-scoped idempotency unique index';
  end if;
end;
$$;

do $$
declare
  expected_rpcs constant text[] := array[
    'get_customer_detail',
    'merge_customers',
    'restore_customer',
    'soft_delete_customer'
  ];
  trigger_functions constant text[] := array[
    'clear_reminder_deletion_marker',
    'handle_new_auth_user',
    'set_updated_at'
  ];
  actual_rpcs text[];
  failures text[];
begin
  select array_agg(expected.signature order by expected.signature)
  into failures
  from (
    values
      ('public.purge_expired_customers(timestamptz,integer)', 'int8'),
      ('public.claim_customer_purge_jobs(integer)', 'jsonb'),
      ('public.complete_customer_purge_job(uuid)', 'jsonb'),
      ('public.fail_customer_purge_job(uuid,text)', 'jsonb')
  ) as expected(signature, return_type)
  where to_regprocedure(expected.signature) is null
    or not exists (
      select 1
      from pg_catalog.pg_proc as p
      where p.oid = to_regprocedure(expected.signature)
        and p.prosecdef
        and p.prorettype = expected.return_type::regtype
        and p.proconfig = array['search_path=""']::text[]
        and pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE')
        and not pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
        and not pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
    );

  if failures is not null then
    raise exception 'service-only purge RPC security differs from baseline: %', failures;
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_proc as p
    where p.oid = to_regprocedure('public.collect_customer_storage_paths(uuid,uuid)')
      and not p.prosecdef
      and p.prorettype = 'text[]'::regtype
      and p.proconfig = array['search_path=""']::text[]
      and not pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE')
      and not pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
      and not pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
  ) then
    raise exception 'internal Storage path collector is missing or executable externally';
  end if;

  select array_agg(p.proname::text order by p.proname)
  into actual_rpcs
  from pg_catalog.pg_proc as p
  join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE');

  if actual_rpcs is distinct from expected_rpcs then
    raise exception 'authenticated executable function set differs from baseline. expected=%, actual=%',
      expected_rpcs, actual_rpcs;
  end if;

  select array_agg(p.proname::text order by p.proname)
  into failures
  from pg_catalog.pg_proc as p
  join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = any(trigger_functions)
    and pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE');

  if failures is not null then
    raise exception 'trigger functions executable by authenticated: %', failures;
  end if;

  select array_agg(c.relname::text order by c.relname)
  into failures
  from pg_catalog.pg_class as c
  join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('r', 'p', 'v', 'm')
    and pg_catalog.has_table_privilege(
      'anon',
      c.oid,
      'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
    );

  if failures is not null then
    raise exception 'anon retains public table privileges: %', failures;
  end if;

  select array_agg(p.proname::text order by p.proname)
  into failures
  from pg_catalog.pg_proc as p
  join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE');

  if failures is not null then
    raise exception 'anon retains public function execution: %', failures;
  end if;
end;
$$;

do $$
declare
  expected_policy_commands constant jsonb := jsonb_build_object(
    'attachments_owner_select', 'SELECT',
    'attachments_owner_insert', 'INSERT',
    'attachments_owner_update', 'UPDATE',
    'attachments_owner_delete', 'DELETE'
  );
  actual_policy_commands jsonb;
  failures text[];
begin
  select coalesce(jsonb_object_agg(p.policyname, p.cmd), '{}'::jsonb)
  into actual_policy_commands
  from pg_catalog.pg_policies as p
  where p.schemaname = 'storage'
    and p.tablename = 'objects'
    and p.policyname like 'attachments_owner_%';

  if actual_policy_commands is distinct from expected_policy_commands then
    raise exception 'attachment Storage policy set differs from baseline. expected=%, actual=%',
      expected_policy_commands, actual_policy_commands;
  end if;

  select array_agg(p.policyname order by p.policyname)
  into failures
  from pg_catalog.pg_policies as p
  where p.schemaname = 'storage'
    and p.tablename = 'objects'
    and p.policyname like 'attachments_owner_%'
    and (
      not ('authenticated' = any(p.roles))
      or coalesce(p.qual, p.with_check, '') !~ 'bucket_id.*attachments'
      or coalesce(p.qual, p.with_check, '') !~ 'foldername.*auth\.uid\(\)'
      or (
        p.cmd = 'UPDATE'
        and (
          coalesce(p.qual, '') !~ 'bucket_id.*attachments'
          or coalesce(p.qual, '') !~ 'foldername.*auth\.uid\(\)'
          or coalesce(p.with_check, '') !~ 'bucket_id.*attachments'
          or coalesce(p.with_check, '') !~ 'foldername.*auth\.uid\(\)'
        )
      )
    );

  if failures is not null then
    raise exception 'attachment Storage policies do not enforce owner paths: %', failures;
  end if;
end;
$$;

rollback;
