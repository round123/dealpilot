-- Keep Deal fields and contact links inside one owner-scoped transaction.

create function public.update_deal_with_contacts(
  p_deal_id uuid,
  p_patch jsonb,
  p_contact_ids uuid[] default null,
  p_expected_updated_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  current_deal public.deals;
  patched_deal public.deals;
  updated_deal public.deals;
  desired_contact_ids uuid[];
  final_contact_ids uuid[];
  desired_contact_count integer;
  owned_contact_count integer;
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if p_deal_id is null then
    raise exception using errcode = 'PT422', message = 'Deal ID is required';
  end if;
  if p_patch is null or pg_catalog.jsonb_typeof(p_patch) <> 'object' then
    raise exception using errcode = 'PT422', message = 'Deal patch must be an object';
  end if;
  if exists (
    select 1
    from pg_catalog.jsonb_object_keys(p_patch) as patch_key(key)
    where patch_key.key not in (
      'company_id', 'name', 'category', 'stage', 'grade', 'description',
      'currency', 'amount', 'probability', 'expected_closing_date',
      'closed_reason', 'archived_at', 'sort_index'
    )
  ) then
    raise exception using errcode = 'PT422', message = 'Deal patch contains read-only or unknown fields';
  end if;
  if p_contact_ids is not null
    and pg_catalog.array_position(p_contact_ids, null::uuid) is not null then
    raise exception using errcode = 'PT422', message = 'Contact IDs cannot contain null';
  end if;

  select deal_record.* into current_deal
  from public.deals as deal_record
  where deal_record.owner_user_id = current_user_id
    and deal_record.id = p_deal_id
  for update;

  if not found then
    raise exception using errcode = 'PT404', message = 'Deal not found';
  end if;
  if p_expected_updated_at is not null
    and current_deal.updated_at is distinct from p_expected_updated_at then
    raise exception using errcode = 'PT409', message = 'Deal was modified by another request';
  end if;

  select * into patched_deal
  from pg_catalog.jsonb_populate_record(current_deal, p_patch);

  if not exists (
    select 1
    from public.companies as company_record
    where company_record.owner_user_id = current_user_id
      and company_record.id = patched_deal.company_id
  ) then
    raise exception using errcode = 'PT404', message = 'Deal customer not found';
  end if;

  if p_contact_ids is not null then
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
  end if;

  update public.deals
  set
    company_id = patched_deal.company_id,
    name = patched_deal.name,
    category = patched_deal.category,
    stage = patched_deal.stage,
    grade = patched_deal.grade,
    description = patched_deal.description,
    currency = patched_deal.currency,
    amount = patched_deal.amount,
    probability = patched_deal.probability,
    expected_closing_date = patched_deal.expected_closing_date,
    closed_reason = patched_deal.closed_reason,
    archived_at = patched_deal.archived_at,
    sort_index = patched_deal.sort_index
  where owner_user_id = current_user_id
    and id = p_deal_id
  returning * into updated_deal;

  if p_contact_ids is not null then
    insert into public.deal_contacts (owner_user_id, deal_id, contact_id)
    select current_user_id, p_deal_id, contact_id
    from pg_catalog.unnest(desired_contact_ids) as desired_contact(contact_id)
    on conflict (owner_user_id, deal_id, contact_id) do nothing;

    delete from public.deal_contacts as deal_contact
    where deal_contact.owner_user_id = current_user_id
      and deal_contact.deal_id = p_deal_id
      and not (deal_contact.contact_id = any(desired_contact_ids));
  end if;

  select coalesce(pg_catalog.array_agg(deal_contact.contact_id order by deal_contact.contact_id), '{}'::uuid[])
  into final_contact_ids
  from public.deal_contacts as deal_contact
  where deal_contact.owner_user_id = current_user_id
    and deal_contact.deal_id = p_deal_id;

  return pg_catalog.jsonb_build_object(
    'data',
    pg_catalog.to_jsonb(updated_deal) || pg_catalog.jsonb_build_object(
      'contact_ids', pg_catalog.to_jsonb(final_contact_ids)
    )
  );
exception
  when invalid_text_representation
    or not_null_violation
    or check_violation
    or numeric_value_out_of_range
    or string_data_right_truncation then
    raise exception using errcode = 'PT422', message = 'Invalid Deal patch';
end;
$$;

revoke all on function public.update_deal_with_contacts(
  uuid, jsonb, uuid[], timestamptz
) from public, anon, authenticated, service_role;

grant execute on function public.update_deal_with_contacts(
  uuid, jsonb, uuid[], timestamptz
) to authenticated;
