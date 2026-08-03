-- Create a Deal and all requested contact links in one owner-scoped transaction.

create function public.create_deal_with_contacts(
  p_input jsonb,
  p_contact_ids uuid[] default '{}'::uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  input_deal public.deals;
  created_deal public.deals;
  desired_contact_ids uuid[];
  desired_contact_count integer;
  owned_contact_count integer;
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if p_input is null or pg_catalog.jsonb_typeof(p_input) <> 'object' then
    raise exception using errcode = 'PT422', message = 'Deal input must be an object';
  end if;
  if exists (
    select 1
    from pg_catalog.jsonb_object_keys(p_input) as input_key(key)
    where input_key.key not in (
      'company_id', 'name', 'category', 'stage', 'grade', 'description',
      'currency', 'amount', 'probability', 'expected_closing_date',
      'closed_reason', 'archived_at', 'sort_index'
    )
  ) then
    raise exception using errcode = 'PT422', message = 'Deal input contains read-only or unknown fields';
  end if;
  if not (p_input ? 'company_id') or p_input ->> 'company_id' is null then
    raise exception using errcode = 'PT422', message = 'Deal customer is required';
  end if;
  if not (p_input ? 'name') or pg_catalog.btrim(coalesce(p_input ->> 'name', '')) = '' then
    raise exception using errcode = 'PT422', message = 'Deal name is required';
  end if;
  if p_contact_ids is null then
    raise exception using errcode = 'PT422', message = 'Contact IDs must be an array';
  end if;
  if pg_catalog.array_position(p_contact_ids, null::uuid) is not null then
    raise exception using errcode = 'PT422', message = 'Contact IDs cannot contain null';
  end if;

  select * into input_deal
  from pg_catalog.jsonb_populate_record(null::public.deals, p_input);

  if not exists (
    select 1
    from public.companies as company_record
    where company_record.owner_user_id = current_user_id
      and company_record.id = input_deal.company_id
  ) then
    raise exception using errcode = 'PT404', message = 'Deal customer not found';
  end if;

  select coalesce(pg_catalog.array_agg(candidate.contact_id order by candidate.contact_id), '{}'::uuid[])
  into desired_contact_ids
  from (
    select distinct contact_id
    from pg_catalog.unnest(p_contact_ids) as requested_contact(contact_id)
  ) as candidate;

  desired_contact_count := coalesce(pg_catalog.array_length(desired_contact_ids, 1), 0);
  select count(*)::integer into owned_contact_count
  from public.contacts as contact_record
  where contact_record.owner_user_id = current_user_id
    and contact_record.id = any(desired_contact_ids);

  if owned_contact_count <> desired_contact_count then
    raise exception using errcode = 'PT404', message = 'Contact not found';
  end if;

  insert into public.deals (
    owner_user_id, company_id, name, category, stage, grade, description,
    currency, amount, probability, expected_closing_date, closed_reason,
    archived_at, sort_index
  ) values (
    current_user_id,
    input_deal.company_id,
    input_deal.name,
    input_deal.category,
    case when p_input ? 'stage' then input_deal.stage else 'lead' end,
    case when p_input ? 'grade' then input_deal.grade else 'C' end,
    input_deal.description,
    case when p_input ? 'currency' then input_deal.currency else 'USD' end,
    input_deal.amount,
    input_deal.probability,
    input_deal.expected_closing_date,
    input_deal.closed_reason,
    input_deal.archived_at,
    input_deal.sort_index
  )
  returning * into created_deal;

  insert into public.deal_contacts (owner_user_id, deal_id, contact_id)
  select current_user_id, created_deal.id, contact_id
  from pg_catalog.unnest(desired_contact_ids) as desired_contact(contact_id);

  return pg_catalog.jsonb_build_object(
    'data',
    pg_catalog.to_jsonb(created_deal) || pg_catalog.jsonb_build_object(
      'contact_ids', pg_catalog.to_jsonb(desired_contact_ids)
    )
  );
exception
  when invalid_text_representation
    or not_null_violation
    or check_violation
    or numeric_value_out_of_range
    or string_data_right_truncation then
    raise exception using errcode = 'PT422', message = 'Invalid Deal input';
end;
$$;

revoke all on function public.create_deal_with_contacts(
  jsonb, uuid[]
) from public, anon, authenticated, service_role;

grant execute on function public.create_deal_with_contacts(
  jsonb, uuid[]
) to authenticated;
