-- DealPilot personal-cloud baseline.
-- Atomic CRM source: marmelab/atomic-crm@167a4cdb652b1ab2b4b030831cfa7adcf2099321 (MIT).
-- This keeps Atomic's core CRM vocabulary while replacing shared-organization
-- access with owner-bound rows, composite foreign keys, and strict RLS.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create type public.customer_grade as enum ('A', 'B', 'C');
create type public.customer_status as enum ('active', 'inactive');
create type public.deal_stage as enum (
  'lead', 'qualified', 'proposal', 'negotiation', 'closed_won', 'closed_lost', 'archived'
);
create type public.deal_grade as enum ('S', 'A', 'B', 'C');
create type public.follow_up_type as enum ('call', 'email', 'chat', 'visit', 'note', 'message');
create type public.message_direction as enum ('inbound', 'outbound');
create type public.reminder_type as enum ('fixed_time', 'waiting_reply', 'paused');
create type public.reminder_status as enum ('pending', 'completed', 'snoozed', 'ignored', 'overdue', 'replied');
create type public.reminder_priority as enum ('low', 'normal', 'high', 'urgent');
create type public.risk_severity as enum ('low', 'medium', 'high', 'critical');
create type public.risk_status as enum ('open', 'handling', 'resolved', 'ignored');
create type public.migration_job_status as enum ('pending', 'running', 'awaiting_confirmation', 'confirmed', 'abandoned', 'failed');
create type public.customer_purge_job_status as enum (
  'pending', 'processing', 'retry', 'completed', 'cancelled'
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  locale text not null default 'zh-CN',
  theme text not null default 'light' check (theme in ('light', 'dark', 'system')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.companies (
  id uuid primary key default extensions.gen_random_uuid(),
  owner_user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  -- Legacy V1 customer.company value; distinct from the Atomic company record name.
  company text,
  sector text,
  size smallint check (size is null or size >= 0),
  linkedin_url text,
  website text,
  phone_number text,
  address text,
  zipcode text,
  city text,
  state_abbr text,
  country text,
  description text,
  revenue text,
  tax_identifier text,
  logo jsonb,
  context_links text[] not null default '{}'::text[],
  source text,
  grade public.customer_grade not null default 'B',
  status public.customer_status not null default 'active',
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id, id)
);

create table public.tags (
  id uuid primary key default extensions.gen_random_uuid(),
  owner_user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  color text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id, id)
);
create unique index tags_owner_name_key on public.tags (owner_user_id, lower(name));

create table public.contacts (
  id uuid primary key default extensions.gen_random_uuid(),
  owner_user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  company_id uuid not null,
  first_name text,
  last_name text,
  name text,
  gender text,
  title text,
  background text,
  avatar jsonb,
  first_seen timestamptz,
  last_seen timestamptz,
  has_newsletter boolean not null default false,
  status text,
  linkedin_url text,
  email_jsonb jsonb not null default '[]'::jsonb check (jsonb_typeof(email_jsonb) = 'array'),
  phone_jsonb jsonb not null default '[]'::jsonb check (jsonb_typeof(phone_jsonb) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id, id),
  unique (owner_user_id, company_id, id),
  constraint contacts_company_fkey foreign key (owner_user_id, company_id)
    references public.companies(owner_user_id, id) on update cascade on delete cascade
    deferrable initially deferred,
  constraint contacts_name_present check (
    coalesce(
      nullif(btrim(name), ''),
      nullif(btrim(first_name), ''),
      nullif(btrim(last_name), '')
    ) is not null
  )
);

create table public.contact_tags (
  owner_user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  contact_id uuid not null,
  tag_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (owner_user_id, contact_id, tag_id),
  constraint contact_tags_contact_fkey foreign key (owner_user_id, contact_id)
    references public.contacts(owner_user_id, id) on update cascade on delete cascade
    deferrable initially deferred,
  constraint contact_tags_tag_fkey foreign key (owner_user_id, tag_id)
    references public.tags(owner_user_id, id) on update cascade on delete cascade
    deferrable initially deferred
);

create table public.contact_notes (
  id uuid primary key default extensions.gen_random_uuid(),
  owner_user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  contact_id uuid not null,
  text text,
  date timestamptz not null default now(),
  status text,
  attachments jsonb not null default '[]'::jsonb check (jsonb_typeof(attachments) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id, id),
  constraint contact_notes_contact_fkey foreign key (owner_user_id, contact_id)
    references public.contacts(owner_user_id, id) on update cascade on delete cascade
    deferrable initially deferred
);

create table public.deals (
  id uuid primary key default extensions.gen_random_uuid(),
  owner_user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  company_id uuid not null,
  name text not null check (btrim(name) <> ''),
  category text,
  stage public.deal_stage not null default 'lead',
  grade public.deal_grade not null default 'C',
  description text,
  currency char(3) not null default 'USD' check (currency = upper(currency)),
  amount numeric(18,2) check (amount is null or amount >= 0),
  probability smallint check (probability is null or probability between 0 and 100),
  expected_closing_date date,
  closed_reason text,
  archived_at timestamptz,
  sort_index smallint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id, id),
  unique (owner_user_id, company_id, id),
  constraint deals_company_fkey foreign key (owner_user_id, company_id)
    references public.companies(owner_user_id, id) on update cascade on delete cascade
    deferrable initially deferred
);

create table public.deal_contacts (
  owner_user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  deal_id uuid not null,
  contact_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (owner_user_id, deal_id, contact_id),
  constraint deal_contacts_deal_fkey foreign key (owner_user_id, deal_id)
    references public.deals(owner_user_id, id) on update cascade on delete cascade
    deferrable initially deferred,
  constraint deal_contacts_contact_fkey foreign key (owner_user_id, contact_id)
    references public.contacts(owner_user_id, id) on update cascade on delete cascade
    deferrable initially deferred
);

create table public.deal_notes (
  id uuid primary key default extensions.gen_random_uuid(),
  owner_user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  deal_id uuid not null,
  type text,
  text text,
  date timestamptz not null default now(),
  attachments jsonb not null default '[]'::jsonb check (jsonb_typeof(attachments) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id, id),
  constraint deal_notes_deal_fkey foreign key (owner_user_id, deal_id)
    references public.deals(owner_user_id, id) on update cascade on delete cascade
    deferrable initially deferred
);

create table public.tasks (
  id uuid primary key default extensions.gen_random_uuid(),
  owner_user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  contact_id uuid not null,
  type text,
  text text,
  due_date timestamptz,
  done_date timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id, id),
  constraint tasks_contact_fkey foreign key (owner_user_id, contact_id)
    references public.contacts(owner_user_id, id) on update cascade on delete cascade
    deferrable initially deferred
);

create table public.configuration (
  owner_user_id uuid primary key default auth.uid() references public.profiles(id) on delete cascade,
  config jsonb not null default '{}'::jsonb check (jsonb_typeof(config) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.social_accounts (
  id uuid primary key default extensions.gen_random_uuid(),
  owner_user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  company_id uuid not null,
  contact_id uuid,
  platform text not null check (btrim(platform) <> ''),
  raw_identifier text not null check (btrim(raw_identifier) <> ''),
  normalized_identifier text not null check (btrim(normalized_identifier) <> ''),
  manually_bound boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id, id),
  unique (owner_user_id, platform, normalized_identifier),
  constraint social_accounts_company_fkey foreign key (owner_user_id, company_id)
    references public.companies(owner_user_id, id) on update cascade on delete cascade
    deferrable initially deferred,
  constraint social_accounts_contact_fkey foreign key (owner_user_id, company_id, contact_id)
    references public.contacts(owner_user_id, company_id, id) on update cascade on delete set null (contact_id)
    deferrable initially deferred
);

create table public.follow_ups (
  id uuid primary key default extensions.gen_random_uuid(),
  owner_user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  company_id uuid not null,
  deal_id uuid,
  type public.follow_up_type not null,
  note text,
  message_body text,
  message_direction public.message_direction,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id, id),
  constraint follow_ups_company_fkey foreign key (owner_user_id, company_id)
    references public.companies(owner_user_id, id) on update cascade on delete cascade
    deferrable initially deferred,
  constraint follow_ups_deal_fkey foreign key (owner_user_id, company_id, deal_id)
    references public.deals(owner_user_id, company_id, id) on update cascade on delete set null (deal_id)
    deferrable initially deferred,
  constraint follow_ups_message_shape check (
    (type <> 'message') or (message_body is not null and message_direction is not null)
  )
);

create table public.reminders (
  id uuid primary key default extensions.gen_random_uuid(),
  owner_user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  company_id uuid not null,
  deal_id uuid,
  type public.reminder_type not null,
  status public.reminder_status not null default 'pending',
  due_at timestamptz not null,
  priority public.reminder_priority not null default 'normal',
  last_notified_at timestamptz,
  snooze_until timestamptz,
  resolution text,
  deletion_event_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id, id),
  constraint reminders_company_fkey foreign key (owner_user_id, company_id)
    references public.companies(owner_user_id, id) on update cascade on delete cascade
    deferrable initially deferred,
  constraint reminders_deal_fkey foreign key (owner_user_id, company_id, deal_id)
    references public.deals(owner_user_id, company_id, id) on update cascade on delete set null (deal_id)
    deferrable initially deferred
);

create table public.deal_risks (
  id uuid primary key default extensions.gen_random_uuid(),
  owner_user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  deal_id uuid not null,
  description text not null check (btrim(description) <> ''),
  severity public.risk_severity not null,
  status public.risk_status not null default 'open',
  handled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id, id),
  constraint deal_risks_deal_fkey foreign key (owner_user_id, deal_id)
    references public.deals(owner_user_id, id) on update cascade on delete cascade
    deferrable initially deferred
);

create table public.deal_milestones (
  id uuid primary key default extensions.gen_random_uuid(),
  owner_user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  deal_id uuid not null,
  name text not null check (btrim(name) <> ''),
  due_date date not null,
  completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id, id),
  constraint deal_milestones_deal_fkey foreign key (owner_user_id, deal_id)
    references public.deals(owner_user_id, id) on update cascade on delete cascade
    deferrable initially deferred
);

create table public.audit_events (
  id uuid primary key default extensions.gen_random_uuid(),
  owner_user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  event_type text not null check (btrim(event_type) <> ''),
  entity_type text,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  occurred_at timestamptz not null default now(),
  unique (owner_user_id, id)
);

alter table public.reminders
  add constraint reminders_deletion_event_fkey foreign key (owner_user_id, deletion_event_id)
  references public.audit_events(owner_user_id, id) on delete set null (deletion_event_id)
  deferrable initially deferred;

create table public.migration_jobs (
  id uuid primary key default extensions.gen_random_uuid(),
  owner_user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  idempotency_key text not null check (btrim(idempotency_key) <> ''),
  source_fingerprint text not null check (btrim(source_fingerprint) <> ''),
  status public.migration_job_status not null default 'pending',
  counts jsonb not null default '{}'::jsonb check (jsonb_typeof(counts) = 'object'),
  checksums jsonb not null default '{}'::jsonb check (jsonb_typeof(checksums) = 'object'),
  error_code text,
  started_at timestamptz,
  completed_at timestamptz,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id, id),
  unique (owner_user_id, idempotency_key)
);

-- This queue deliberately has no Customer foreign key: its path snapshot and
-- retry history must survive the Customer cascade it coordinates.
create table public.customer_purge_jobs (
  id uuid primary key default extensions.gen_random_uuid(),
  owner_user_id uuid not null,
  customer_id uuid not null,
  cutoff timestamptz not null,
  object_paths text[] not null default '{}'::text[],
  status public.customer_purge_job_status not null default 'pending',
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz not null default now(),
  claimed_at timestamptz,
  last_error text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (customer_id)
);

create index companies_owner_active_idx on public.companies (owner_user_id, updated_at desc) where deleted_at is null;
create index companies_owner_deleted_idx on public.companies (owner_user_id, deleted_at) where deleted_at is not null;
create index contacts_owner_company_idx on public.contacts (owner_user_id, company_id);
create index contact_notes_owner_contact_idx on public.contact_notes (owner_user_id, contact_id, date desc);
create index deals_owner_company_idx on public.deals (owner_user_id, company_id, updated_at desc);
create index deal_notes_owner_deal_idx on public.deal_notes (owner_user_id, deal_id, date desc);
create index tasks_owner_contact_due_idx on public.tasks (owner_user_id, contact_id, due_date) where done_date is null;
create index social_accounts_owner_company_idx on public.social_accounts (owner_user_id, company_id);
create index follow_ups_owner_company_occurred_idx on public.follow_ups (owner_user_id, company_id, occurred_at desc);
create index reminders_owner_status_due_idx on public.reminders (owner_user_id, status, due_at);
create index reminders_owner_company_idx on public.reminders (owner_user_id, company_id);
create index deal_risks_owner_deal_idx on public.deal_risks (owner_user_id, deal_id, status);
create index deal_milestones_owner_deal_idx on public.deal_milestones (owner_user_id, deal_id, due_date);
create index audit_events_owner_entity_idx on public.audit_events (owner_user_id, entity_type, entity_id, occurred_at desc);
create index migration_jobs_owner_created_idx on public.migration_jobs (owner_user_id, created_at desc);
create index customer_purge_jobs_claim_idx
  on public.customer_purge_jobs (status, next_attempt_at, created_at);

create view public.companies_summary
with (security_invoker = true)
as
select
  company_record.*,
  company_record.owner_user_id as sales_id,
  concat_ws(
    ' ',
    nullif(btrim(company_record.name), ''),
    nullif(btrim(company_record.company), ''),
    nullif(btrim(company_record.country), '')
  ) as search_text,
  (
    select count(*)::integer
    from public.contacts as contact_record
    where contact_record.owner_user_id = company_record.owner_user_id
      and contact_record.company_id = company_record.id
  ) as nb_contacts,
  (
    select count(*)::integer
    from public.deals as deal_record
    where deal_record.owner_user_id = company_record.owner_user_id
      and deal_record.company_id = company_record.id
  ) as nb_deals
from public.companies as company_record
where company_record.deleted_at is null;

create view public.contacts_summary
with (security_invoker = true)
as
select
  contact_record.*,
  contact_record.owner_user_id as sales_id,
  company_record.name as company_name,
  coalesce(
    (
      select array_agg(contact_tag.tag_id order by contact_tag.tag_id)
      from public.contact_tags as contact_tag
      where contact_tag.owner_user_id = contact_record.owner_user_id
        and contact_tag.contact_id = contact_record.id
    ),
    '{}'::uuid[]
  ) as tags,
  (
    select count(*)::integer
    from public.tasks as task_record
    where task_record.owner_user_id = contact_record.owner_user_id
      and task_record.contact_id = contact_record.id
      and task_record.done_date is null
  ) as nb_tasks,
  coalesce(
    (
      select string_agg(email_item.value ->> 'email', ' ')
      from jsonb_array_elements(contact_record.email_jsonb) as email_item(value)
    ),
    ''
  ) as email_fts,
  coalesce(
    (
      select string_agg(phone_item.value ->> 'number', ' ')
      from jsonb_array_elements(contact_record.phone_jsonb) as phone_item(value)
    ),
    ''
  ) as phone_fts
from public.contacts as contact_record
join public.companies as company_record
  on company_record.owner_user_id = contact_record.owner_user_id
 and company_record.id = contact_record.company_id
 and company_record.deleted_at is null;

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    nullif(btrim(coalesce(new.raw_user_meta_data ->> 'display_name', new.raw_user_meta_data ->> 'full_name', '')), '')
  )
  on conflict (id) do nothing;

  insert into public.configuration (owner_user_id)
  values (new.id)
  on conflict (owner_user_id) do nothing;

  return new;
end;
$$;

create function public.clear_reminder_deletion_marker()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.deletion_event_id is not null
    and new.deletion_event_id is not distinct from old.deletion_event_id
    and (
      new.status is distinct from old.status
      or new.resolution is distinct from old.resolution
      or new.company_id is distinct from old.company_id
    ) then
    new.deletion_event_id = null;
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

create trigger reminders_clear_deletion_marker
before update on public.reminders
for each row execute function public.clear_reminder_deletion_marker();

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles', 'companies', 'contacts', 'contact_notes', 'deals', 'deal_notes',
    'tags', 'tasks', 'configuration', 'social_accounts', 'follow_ups', 'reminders',
    'deal_risks', 'deal_milestones', 'migration_jobs', 'customer_purge_jobs'
  ]
  loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
      table_name || '_set_updated_at',
      table_name
    );
  end loop;
end;
$$;

create function public.soft_delete_customer(p_customer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  customer public.companies;
  deleted_at_value timestamptz := clock_timestamp();
  deletion_event_id_value uuid := gen_random_uuid();
  reminder_snapshot jsonb;
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  select * into customer
  from public.companies
  where owner_user_id = current_user_id and id = p_customer_id and deleted_at is null
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Active customer not found';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object('id', id, 'status', status, 'resolution', resolution)
      order by id
    ),
    '[]'::jsonb
  )
  into reminder_snapshot
  from public.reminders
  where owner_user_id = current_user_id
    and company_id = p_customer_id
    and status in ('pending', 'snoozed', 'overdue');

  update public.companies
  set deleted_at = deleted_at_value
  where owner_user_id = current_user_id and id = p_customer_id
  returning * into customer;

  update public.reminders
  set
    status = 'ignored',
    resolution = 'Customer deleted',
    deletion_event_id = deletion_event_id_value
  where owner_user_id = current_user_id
    and company_id = p_customer_id
    and status in ('pending', 'snoozed', 'overdue');

  insert into public.audit_events (id, owner_user_id, event_type, entity_type, entity_id, metadata, occurred_at)
  values (
    deletion_event_id_value,
    current_user_id,
    'customer.soft_deleted',
    'customer',
    p_customer_id,
    jsonb_build_object('deleted_at', deleted_at_value, 'reminders', reminder_snapshot),
    deleted_at_value
  );

  return jsonb_build_object('data', to_jsonb(customer));
end;
$$;

create function public.restore_customer(p_customer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  customer public.companies;
  deletion_event_id_value uuid;
  deletion_metadata jsonb;
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  select * into customer
  from public.companies
  where owner_user_id = current_user_id and id = p_customer_id and deleted_at is not null
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Deleted customer not found';
  end if;

  if customer.deleted_at <= now() - interval '30 days' then
    raise exception using errcode = 'P0001', message = 'Customer restore window expired';
  end if;

  select id, metadata into deletion_event_id_value, deletion_metadata
  from public.audit_events
  where owner_user_id = current_user_id
    and event_type = 'customer.soft_deleted'
    and entity_id = p_customer_id
    and occurred_at = customer.deleted_at
  order by occurred_at desc
  limit 1;

  if deletion_metadata is null then
    raise exception using errcode = 'P0001', message = 'Customer deletion snapshot not found';
  end if;

  update public.reminders as current_reminder
  set
    status = snapshot.status::public.reminder_status,
    resolution = snapshot.resolution,
    deletion_event_id = null
  from jsonb_to_recordset(deletion_metadata -> 'reminders')
    as snapshot(id uuid, status text, resolution text)
  where current_reminder.owner_user_id = current_user_id
    and current_reminder.company_id = p_customer_id
    and current_reminder.id = snapshot.id
    and current_reminder.deletion_event_id = deletion_event_id_value
    and current_reminder.status = 'ignored'
    and current_reminder.resolution = 'Customer deleted'
    and snapshot.status in ('pending', 'snoozed', 'overdue');

  update public.companies
  set deleted_at = null
  where owner_user_id = current_user_id and id = p_customer_id
  returning * into customer;

  insert into public.audit_events (owner_user_id, event_type, entity_type, entity_id)
  values (current_user_id, 'customer.restored', 'customer', p_customer_id);

  return jsonb_build_object('data', to_jsonb(customer));
end;
$$;

create function public.collect_customer_storage_paths(
  p_owner_user_id uuid,
  p_customer_id uuid
)
returns text[]
language sql
stable
set search_path = ''
as $$
  select coalesce(
    array_agg(distinct normalized.path order by normalized.path),
    '{}'::text[]
  )
  from (
    select case
      when raw.path like p_owner_user_id::text || '/%'
        then raw.path
      else p_owner_user_id::text || '/' || ltrim(raw.path, '/')
    end as path
    from (
      select company_record.logo ->> 'path' as path
      from public.companies as company_record
      where company_record.owner_user_id = p_owner_user_id
        and company_record.id = p_customer_id

      union all

      select contact_record.avatar ->> 'path'
      from public.contacts as contact_record
      where contact_record.owner_user_id = p_owner_user_id
        and contact_record.company_id = p_customer_id

      union all

      select attachment.value ->> 'path'
      from public.contact_notes as note_record
      join public.contacts as contact_record
        on contact_record.owner_user_id = note_record.owner_user_id
       and contact_record.id = note_record.contact_id
      cross join lateral jsonb_array_elements(note_record.attachments) as attachment(value)
      where contact_record.owner_user_id = p_owner_user_id
        and contact_record.company_id = p_customer_id

      union all

      select attachment.value ->> 'path'
      from public.deal_notes as note_record
      join public.deals as deal_record
        on deal_record.owner_user_id = note_record.owner_user_id
       and deal_record.id = note_record.deal_id
      cross join lateral jsonb_array_elements(note_record.attachments) as attachment(value)
      where deal_record.owner_user_id = p_owner_user_id
        and deal_record.company_id = p_customer_id
    ) as raw(path)
    where nullif(btrim(raw.path), '') is not null
  ) as normalized;
$$;

create function public.purge_expired_customers(
  p_cutoff timestamptz default now() - interval '30 days',
  p_limit integer default 100
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  queued_count bigint;
begin
  if p_cutoff is null then
    raise exception using errcode = '22004', message = 'Purge cutoff is required';
  end if;
  if p_limit < 1 or p_limit > 500 then
    raise exception using errcode = '22023', message = 'Purge limit must be between 1 and 500';
  end if;

  with candidates as (
    select customer.id, customer.owner_user_id
    from public.companies as customer
    where customer.deleted_at is not null
      and customer.deleted_at <= p_cutoff
      and not exists (
        select 1
        from public.customer_purge_jobs as existing_job
        where existing_job.customer_id = customer.id
          and existing_job.status <> 'cancelled'
      )
    order by customer.deleted_at, customer.id
    limit p_limit
    for update skip locked
  )
  insert into public.customer_purge_jobs (
    owner_user_id,
    customer_id,
    cutoff,
    object_paths
  )
  select
    candidate.owner_user_id,
    candidate.id,
    p_cutoff,
    public.collect_customer_storage_paths(candidate.owner_user_id, candidate.id)
  from candidates as candidate
  on conflict (customer_id) do update
  set
    owner_user_id = excluded.owner_user_id,
    cutoff = excluded.cutoff,
    object_paths = excluded.object_paths,
    status = 'pending',
    attempt_count = 0,
    next_attempt_at = now(),
    claimed_at = null,
    last_error = null,
    completed_at = null
  where customer_purge_jobs.status = 'cancelled';

  get diagnostics queued_count = row_count;
  return queued_count;
end;
$$;

create function public.claim_customer_purge_jobs(p_limit integer default 20)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed_jobs jsonb;
begin
  if p_limit < 1 or p_limit > 100 then
    raise exception using errcode = '22023', message = 'Claim limit must be between 1 and 100';
  end if;

  with candidates as (
    select job.id
    from public.customer_purge_jobs as job
    where (
      job.status in ('pending', 'retry')
      and job.next_attempt_at <= now()
    ) or (
      job.status = 'processing'
      and job.claimed_at <= now() - interval '15 minutes'
    )
    order by job.next_attempt_at, job.created_at, job.id
    limit p_limit
    for update skip locked
  ), claimed as (
    update public.customer_purge_jobs as job
    set
      status = 'processing',
      attempt_count = job.attempt_count + 1,
      claimed_at = now(),
      last_error = null
    from candidates
    where job.id = candidates.id
    returning
      job.id,
      job.owner_user_id,
      job.customer_id,
      job.cutoff,
      job.object_paths,
      job.attempt_count,
      job.created_at
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', claimed.id,
        'owner_user_id', claimed.owner_user_id,
        'customer_id', claimed.customer_id,
        'cutoff', claimed.cutoff,
        'object_paths', to_jsonb(claimed.object_paths),
        'attempt_count', claimed.attempt_count
      )
      order by claimed.created_at, claimed.id
    ),
    '[]'::jsonb
  )
  into claimed_jobs
  from claimed;

  return jsonb_build_object('data', claimed_jobs);
end;
$$;

create function public.complete_customer_purge_job(p_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  purge_job public.customer_purge_jobs;
  customer public.companies;
  current_paths text[];
  merged_paths text[];
begin
  select * into purge_job
  from public.customer_purge_jobs
  where id = p_job_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Customer purge job not found';
  end if;
  if purge_job.status in ('completed', 'cancelled') then
    return jsonb_build_object(
      'data',
      jsonb_build_object('id', purge_job.id, 'status', purge_job.status)
    );
  end if;
  if purge_job.status <> 'processing' then
    raise exception using errcode = 'P0001', message = 'Customer purge job is not processing';
  end if;

  select * into customer
  from public.companies
  where owner_user_id = purge_job.owner_user_id
    and id = purge_job.customer_id
  for update;

  if not found then
    update public.customer_purge_jobs
    set status = 'completed', completed_at = now(), claimed_at = null, last_error = null
    where id = purge_job.id;

    return jsonb_build_object(
      'data',
      jsonb_build_object('id', purge_job.id, 'status', 'completed')
    );
  end if;

  if customer.deleted_at is null or customer.deleted_at > purge_job.cutoff then
    update public.customer_purge_jobs
    set status = 'cancelled', claimed_at = null, last_error = 'customer_no_longer_expired'
    where id = purge_job.id;

    return jsonb_build_object(
      'data',
      jsonb_build_object('id', purge_job.id, 'status', 'cancelled')
    );
  end if;

  -- Block path-bearing rows from changing between the final snapshot and cascade.
  perform contact_record.id
  from public.contacts as contact_record
  where contact_record.owner_user_id = purge_job.owner_user_id
    and contact_record.company_id = purge_job.customer_id
  for update;

  perform note_record.id
  from public.contact_notes as note_record
  join public.contacts as contact_record
    on contact_record.owner_user_id = note_record.owner_user_id
   and contact_record.id = note_record.contact_id
  where contact_record.owner_user_id = purge_job.owner_user_id
    and contact_record.company_id = purge_job.customer_id
  for update of note_record;

  perform deal_record.id
  from public.deals as deal_record
  where deal_record.owner_user_id = purge_job.owner_user_id
    and deal_record.company_id = purge_job.customer_id
  for update;

  perform note_record.id
  from public.deal_notes as note_record
  join public.deals as deal_record
    on deal_record.owner_user_id = note_record.owner_user_id
   and deal_record.id = note_record.deal_id
  where deal_record.owner_user_id = purge_job.owner_user_id
    and deal_record.company_id = purge_job.customer_id
  for update of note_record;

  current_paths := public.collect_customer_storage_paths(
    purge_job.owner_user_id,
    purge_job.customer_id
  );

  if not (current_paths <@ purge_job.object_paths) then
    select array_agg(distinct path order by path)
    into merged_paths
    from unnest(purge_job.object_paths || current_paths) as queued_path(path);

    update public.customer_purge_jobs
    set
      object_paths = coalesce(merged_paths, '{}'::text[]),
      status = 'retry',
      next_attempt_at = now(),
      claimed_at = null,
      last_error = 'storage_snapshot_changed'
    where id = purge_job.id;

    return jsonb_build_object(
      'data',
      jsonb_build_object(
        'id', purge_job.id,
        'status', 'retry',
        'reason', 'storage_snapshot_changed'
      )
    );
  end if;

  delete from public.companies
  where owner_user_id = purge_job.owner_user_id
    and id = purge_job.customer_id;

  update public.customer_purge_jobs
  set status = 'completed', completed_at = now(), claimed_at = null, last_error = null
  where id = purge_job.id;

  return jsonb_build_object(
    'data',
    jsonb_build_object('id', purge_job.id, 'status', 'completed')
  );
end;
$$;

create function public.fail_customer_purge_job(p_job_id uuid, p_error text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  purge_job public.customer_purge_jobs;
  retry_seconds integer;
begin
  select * into purge_job
  from public.customer_purge_jobs
  where id = p_job_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Customer purge job not found';
  end if;
  if purge_job.status in ('completed', 'cancelled') then
    return jsonb_build_object(
      'data',
      jsonb_build_object('id', purge_job.id, 'status', purge_job.status)
    );
  end if;
  if purge_job.status <> 'processing' then
    raise exception using errcode = 'P0001', message = 'Customer purge job is not processing';
  end if;

  retry_seconds := least(
    3600,
    (30 * power(2::numeric, least(greatest(purge_job.attempt_count - 1, 0), 7)))::integer
  );

  update public.customer_purge_jobs
  set
    status = 'retry',
    next_attempt_at = now() + make_interval(secs => retry_seconds),
    claimed_at = null,
    last_error = left(coalesce(nullif(btrim(p_error), ''), 'Unknown purge failure'), 2000)
  where id = purge_job.id;

  return jsonb_build_object(
    'data',
    jsonb_build_object(
      'id', purge_job.id,
      'status', 'retry',
      'retry_after_seconds', retry_seconds
    )
  );
end;
$$;

create function public.merge_customers(
  p_source_id uuid,
  p_target_id uuid,
  p_field_resolutions jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  source_customer public.companies;
  target_customer public.companies;
  field_name text;
  merged_at timestamptz := clock_timestamp();
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if p_source_id = p_target_id then
    raise exception using errcode = '22023', message = 'Source and target customer must differ';
  end if;
  if p_field_resolutions is null or jsonb_typeof(p_field_resolutions) <> 'object' then
    raise exception using errcode = '22023', message = 'field_resolutions must be an object';
  end if;

  for field_name in select jsonb_object_keys(p_field_resolutions)
  loop
    if field_name not in (
      'name', 'sector', 'size', 'linkedin_url', 'website', 'phone_number', 'address',
      'zipcode', 'city', 'state_abbr', 'country', 'description', 'revenue',
      'tax_identifier', 'logo', 'context_links', 'company', 'source', 'grade', 'status'
    ) then
      raise exception using errcode = '22023', message = format('Unsupported field resolution: %s', field_name);
    end if;
    if field_name = 'context_links'
      and jsonb_typeof(p_field_resolutions -> field_name) not in ('array', 'null') then
      raise exception using errcode = '22023', message = 'context_links must be an array or null';
    end if;
  end loop;

  perform id
  from public.companies
  where owner_user_id = current_user_id
    and id in (p_source_id, p_target_id)
    and deleted_at is null
  order by id
  for update;

  select * into source_customer
  from public.companies
  where owner_user_id = current_user_id and id = p_source_id and deleted_at is null;
  if not found then
    raise exception using errcode = 'P0002', message = 'Active source customer not found';
  end if;

  select * into target_customer
  from public.companies
  where owner_user_id = current_user_id and id = p_target_id and deleted_at is null;
  if not found then
    raise exception using errcode = 'P0002', message = 'Active target customer not found';
  end if;

  set constraints all deferred;

  update public.contacts
  set company_id = p_target_id
  where owner_user_id = current_user_id and company_id = p_source_id;

  update public.deals
  set company_id = p_target_id
  where owner_user_id = current_user_id and company_id = p_source_id;

  update public.social_accounts
  set company_id = p_target_id
  where owner_user_id = current_user_id and company_id = p_source_id;

  update public.follow_ups
  set company_id = p_target_id
  where owner_user_id = current_user_id and company_id = p_source_id;

  update public.reminders
  set company_id = p_target_id
  where owner_user_id = current_user_id and company_id = p_source_id;

  update public.companies
  set
    name = case when p_field_resolutions ? 'name' then p_field_resolutions ->> 'name' else name end,
    company = case when p_field_resolutions ? 'company' then p_field_resolutions ->> 'company' else company end,
    sector = case when p_field_resolutions ? 'sector' then p_field_resolutions ->> 'sector' else sector end,
    size = case when p_field_resolutions ? 'size' then (p_field_resolutions ->> 'size')::smallint else size end,
    linkedin_url = case when p_field_resolutions ? 'linkedin_url' then p_field_resolutions ->> 'linkedin_url' else linkedin_url end,
    website = case when p_field_resolutions ? 'website' then p_field_resolutions ->> 'website' else website end,
    phone_number = case when p_field_resolutions ? 'phone_number' then p_field_resolutions ->> 'phone_number' else phone_number end,
    address = case when p_field_resolutions ? 'address' then p_field_resolutions ->> 'address' else address end,
    zipcode = case when p_field_resolutions ? 'zipcode' then p_field_resolutions ->> 'zipcode' else zipcode end,
    city = case when p_field_resolutions ? 'city' then p_field_resolutions ->> 'city' else city end,
    state_abbr = case when p_field_resolutions ? 'state_abbr' then p_field_resolutions ->> 'state_abbr' else state_abbr end,
    country = case when p_field_resolutions ? 'country' then p_field_resolutions ->> 'country' else country end,
    description = case when p_field_resolutions ? 'description' then p_field_resolutions ->> 'description' else description end,
    revenue = case when p_field_resolutions ? 'revenue' then p_field_resolutions ->> 'revenue' else revenue end,
    tax_identifier = case when p_field_resolutions ? 'tax_identifier' then p_field_resolutions ->> 'tax_identifier' else tax_identifier end,
    logo = case when p_field_resolutions ? 'logo' then p_field_resolutions -> 'logo' else logo end,
    context_links = case
      when jsonb_typeof(p_field_resolutions -> 'context_links') = 'array'
        then array(select jsonb_array_elements_text(p_field_resolutions -> 'context_links'))
      when jsonb_typeof(p_field_resolutions -> 'context_links') = 'null'
        then '{}'::text[]
      else context_links
    end,
    source = case when p_field_resolutions ? 'source' then p_field_resolutions ->> 'source' else source end,
    grade = case when p_field_resolutions ? 'grade' then (p_field_resolutions ->> 'grade')::public.customer_grade else grade end,
    status = case when p_field_resolutions ? 'status' then (p_field_resolutions ->> 'status')::public.customer_status else status end
  where owner_user_id = current_user_id and id = p_target_id
  returning * into target_customer;

  update public.companies
  set deleted_at = merged_at
  where owner_user_id = current_user_id and id = p_source_id;

  insert into public.audit_events (owner_user_id, event_type, entity_type, entity_id, metadata, occurred_at)
  values (
    current_user_id,
    'customer.merged',
    'customer',
    p_source_id,
    jsonb_build_object('source_id', p_source_id, 'target_id', p_target_id, 'field_resolutions', p_field_resolutions),
    merged_at
  );

  return jsonb_build_object('data', to_jsonb(target_customer));
end;
$$;

create function public.get_customer_detail(p_customer_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  customer public.companies;
  contact_items jsonb;
  social_account_items jsonb;
  deal_items jsonb;
  recent_follow_up_items jsonb;
  open_reminder_items jsonb;
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  select * into customer
  from public.companies
  where owner_user_id = current_user_id
    and id = p_customer_id
    and deleted_at is null;

  if not found then
    raise exception using errcode = 'P0002', message = 'Active customer not found';
  end if;

  select coalesce(jsonb_agg(to_jsonb(item) order by item.created_at, item.id), '[]'::jsonb)
  into contact_items
  from public.contacts as item
  where item.owner_user_id = current_user_id
    and item.company_id = p_customer_id;

  select coalesce(jsonb_agg(to_jsonb(item) order by item.platform, item.id), '[]'::jsonb)
  into social_account_items
  from public.social_accounts as item
  where item.owner_user_id = current_user_id
    and item.company_id = p_customer_id;

  select coalesce(jsonb_agg(to_jsonb(item) order by item.updated_at desc, item.id), '[]'::jsonb)
  into deal_items
  from public.deals as item
  where item.owner_user_id = current_user_id
    and item.company_id = p_customer_id;

  select coalesce(jsonb_agg(to_jsonb(item) order by item.occurred_at desc, item.id desc), '[]'::jsonb)
  into recent_follow_up_items
  from (
    select follow_up.*
    from public.follow_ups as follow_up
    where follow_up.owner_user_id = current_user_id
      and follow_up.company_id = p_customer_id
    order by follow_up.occurred_at desc, follow_up.id desc
    limit 10
  ) as item;

  select coalesce(jsonb_agg(to_jsonb(item) order by item.due_at, item.id), '[]'::jsonb)
  into open_reminder_items
  from public.reminders as item
  where item.owner_user_id = current_user_id
    and item.company_id = p_customer_id
    and item.status in ('pending', 'snoozed', 'overdue');

  return jsonb_build_object(
    'data',
    to_jsonb(customer) || jsonb_build_object(
      'contacts', contact_items,
      'social_accounts', social_account_items,
      'deals', deal_items,
      'recent_follow_ups', recent_follow_up_items,
      'open_reminders', open_reminder_items
    )
  );
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles', 'companies', 'contacts', 'contact_tags', 'contact_notes', 'deals',
    'deal_contacts', 'deal_notes', 'tags', 'tasks', 'configuration', 'social_accounts',
    'follow_ups', 'reminders', 'deal_risks', 'deal_milestones', 'audit_events',
    'migration_jobs', 'customer_purge_jobs'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
  end loop;
end;
$$;

create policy profiles_owner_access on public.profiles
  for all to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'companies', 'contacts', 'contact_tags', 'contact_notes', 'deals', 'deal_contacts',
    'deal_notes', 'tags', 'tasks', 'configuration', 'social_accounts', 'follow_ups',
    'reminders', 'deal_risks', 'deal_milestones', 'audit_events', 'migration_jobs'
  ]
  loop
    execute format(
      'create policy %I on public.%I for all to authenticated using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid())',
      table_name || '_owner_access',
      table_name
    );
  end loop;
end;
$$;

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from public, anon;
revoke all on function public.set_updated_at() from authenticated;
revoke all on function public.handle_new_auth_user() from authenticated;
revoke all on function public.clear_reminder_deletion_marker() from authenticated;
revoke execute on function public.collect_customer_storage_paths(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.purge_expired_customers(timestamptz, integer),
  public.claim_customer_purge_jobs(integer),
  public.complete_customer_purge_job(uuid),
  public.fail_customer_purge_job(uuid, text)
  from public, anon, authenticated;
revoke all on table public.customer_purge_jobs
  from public, anon, authenticated, service_role;

grant usage on schema public to authenticated;
grant usage on schema public to service_role;
grant select, update on table public.companies to service_role;
grant select, insert, update, delete on table
  public.companies,
  public.contacts,
  public.contact_tags,
  public.contact_notes,
  public.deals,
  public.deal_contacts,
  public.deal_notes,
  public.tags,
  public.tasks,
  public.configuration,
  public.social_accounts,
  public.follow_ups,
  public.deal_risks,
  public.deal_milestones,
  public.migration_jobs
to authenticated;
grant select, delete on table public.reminders to authenticated;
grant insert (
  id, company_id, deal_id, type, status, due_at, priority, last_notified_at,
  snooze_until, resolution, created_at, updated_at
) on table public.reminders to authenticated;
grant update (
  company_id, deal_id, type, status, due_at, priority, last_notified_at,
  snooze_until, resolution
) on table public.reminders to authenticated;
grant select, update on table public.profiles to authenticated;
grant select on table public.audit_events to authenticated;
revoke all on table public.companies_summary, public.contacts_summary
  from public, anon, authenticated;
grant select on table public.companies_summary, public.contacts_summary to authenticated;
grant execute on function public.soft_delete_customer(uuid) to authenticated;
grant execute on function public.restore_customer(uuid) to authenticated;
grant execute on function public.merge_customers(uuid, uuid, jsonb) to authenticated;
grant execute on function public.get_customer_detail(uuid) to authenticated;
grant execute on function public.purge_expired_customers(timestamptz, integer),
  public.claim_customer_purge_jobs(integer),
  public.complete_customer_purge_job(uuid),
  public.fail_customer_purge_job(uuid, text)
  to service_role;

alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema public revoke execute on functions from public;

insert into storage.buckets (id, name, public, file_size_limit)
values ('attachments', 'attachments', false, 52428800)
on conflict (id) do update
set public = excluded.public, file_size_limit = excluded.file_size_limit;

create policy attachments_owner_select
on storage.objects for select to authenticated
using (
  bucket_id = 'attachments'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy attachments_owner_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'attachments'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy attachments_owner_update
on storage.objects for update to authenticated
using (
  bucket_id = 'attachments'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'attachments'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy attachments_owner_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'attachments'
  and (storage.foldername(name))[1] = auth.uid()::text
);
