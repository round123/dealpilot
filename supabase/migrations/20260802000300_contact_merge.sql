-- Replace the undeployed contact-merge Edge Function with one owner-scoped,
-- transactional database command.

create function public.merge_contacts(
  p_source_id uuid,
  p_target_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  source_contact public.contacts;
  target_contact public.contacts;
  merged_emails jsonb;
  merged_phones jsonb;
  merged_at timestamptz := clock_timestamp();
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if p_source_id = p_target_id then
    raise exception using errcode = '22023', message = 'Source and target contact must differ';
  end if;

  -- Stable lock ordering prevents reciprocal merge requests from deadlocking.
  perform contact_record.id
  from public.contacts as contact_record
  join public.companies as company_record
    on company_record.owner_user_id = contact_record.owner_user_id
   and company_record.id = contact_record.company_id
   and company_record.deleted_at is null
  where contact_record.owner_user_id = current_user_id
    and contact_record.id in (p_source_id, p_target_id)
  order by contact_record.id
  for update of contact_record;

  select contact_record.* into source_contact
  from public.contacts as contact_record
  join public.companies as company_record
    on company_record.owner_user_id = contact_record.owner_user_id
   and company_record.id = contact_record.company_id
   and company_record.deleted_at is null
  where contact_record.owner_user_id = current_user_id
    and contact_record.id = p_source_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'Active source contact not found';
  end if;

  select contact_record.* into target_contact
  from public.contacts as contact_record
  join public.companies as company_record
    on company_record.owner_user_id = contact_record.owner_user_id
   and company_record.id = contact_record.company_id
   and company_record.deleted_at is null
  where contact_record.owner_user_id = current_user_id
    and contact_record.id = p_target_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'Active target contact not found';
  end if;

  select coalesce(jsonb_agg(item order by preference, item_order), '[]'::jsonb)
  into merged_emails
  from (
    select item, preference, item_order
    from (
      select
        candidate.*,
        row_number() over (
          partition by candidate.item ->> 'email'
          order by candidate.preference, candidate.item_order
        ) as duplicate_rank
      from (
        select value as item, 0 as preference, ordinality as item_order
        from jsonb_array_elements(target_contact.email_jsonb) with ordinality
        where coalesce(value ->> 'email', '') <> ''
        union all
        select value as item, 1 as preference, ordinality as item_order
        from jsonb_array_elements(source_contact.email_jsonb) with ordinality
        where coalesce(value ->> 'email', '') <> ''
      ) as candidate
    ) as ranked
    where duplicate_rank = 1
  ) as deduplicated;

  select coalesce(jsonb_agg(item order by preference, item_order), '[]'::jsonb)
  into merged_phones
  from (
    select item, preference, item_order
    from (
      select
        candidate.*,
        row_number() over (
          partition by candidate.item ->> 'number'
          order by candidate.preference, candidate.item_order
        ) as duplicate_rank
      from (
        select value as item, 0 as preference, ordinality as item_order
        from jsonb_array_elements(target_contact.phone_jsonb) with ordinality
        where coalesce(value ->> 'number', '') <> ''
        union all
        select value as item, 1 as preference, ordinality as item_order
        from jsonb_array_elements(source_contact.phone_jsonb) with ordinality
        where coalesce(value ->> 'number', '') <> ''
      ) as candidate
    ) as ranked
    where duplicate_rank = 1
  ) as deduplicated;

  set constraints all deferred;

  insert into public.contact_tags (owner_user_id, contact_id, tag_id, created_at)
  select current_user_id, p_target_id, source_tag.tag_id, source_tag.created_at
  from public.contact_tags as source_tag
  where source_tag.owner_user_id = current_user_id
    and source_tag.contact_id = p_source_id
  on conflict (owner_user_id, contact_id, tag_id) do nothing;

  delete from public.contact_tags
  where owner_user_id = current_user_id and contact_id = p_source_id;

  update public.contact_notes
  set contact_id = p_target_id
  where owner_user_id = current_user_id and contact_id = p_source_id;

  update public.tasks
  set contact_id = p_target_id
  where owner_user_id = current_user_id and contact_id = p_source_id;

  insert into public.deal_contacts (owner_user_id, deal_id, contact_id, created_at)
  select current_user_id, source_link.deal_id, p_target_id, source_link.created_at
  from public.deal_contacts as source_link
  where source_link.owner_user_id = current_user_id
    and source_link.contact_id = p_source_id
  on conflict (owner_user_id, deal_id, contact_id) do nothing;

  delete from public.deal_contacts
  where owner_user_id = current_user_id and contact_id = p_source_id;

  update public.social_accounts
  set company_id = target_contact.company_id,
      contact_id = p_target_id
  where owner_user_id = current_user_id and contact_id = p_source_id;

  update public.contacts
  set
    name = coalesce(target_contact.name, source_contact.name),
    gender = coalesce(target_contact.gender, source_contact.gender),
    first_name = coalesce(target_contact.first_name, source_contact.first_name),
    last_name = coalesce(target_contact.last_name, source_contact.last_name),
    title = coalesce(target_contact.title, source_contact.title),
    background = coalesce(target_contact.background, source_contact.background),
    avatar = case
      when coalesce(target_contact.avatar ->> 'src', '') <> '' then target_contact.avatar
      else source_contact.avatar
    end,
    first_seen = coalesce(target_contact.first_seen, source_contact.first_seen),
    last_seen = greatest(target_contact.last_seen, source_contact.last_seen),
    has_newsletter = target_contact.has_newsletter,
    status = coalesce(target_contact.status, source_contact.status),
    linkedin_url = coalesce(nullif(target_contact.linkedin_url, ''), source_contact.linkedin_url),
    email_jsonb = merged_emails,
    phone_jsonb = merged_phones
  where owner_user_id = current_user_id and id = p_target_id
  returning * into target_contact;

  delete from public.contacts
  where owner_user_id = current_user_id and id = p_source_id;

  insert into public.audit_events (
    owner_user_id, event_type, entity_type, entity_id, metadata, occurred_at
  ) values (
    current_user_id,
    'contact.merged',
    'contact',
    p_source_id,
    jsonb_build_object(
      'source_id', p_source_id,
      'target_id', p_target_id,
      'source_company_id', source_contact.company_id,
      'target_company_id', target_contact.company_id
    ),
    merged_at
  );

  return jsonb_build_object('data', to_jsonb(target_contact));
end;
$$;

revoke all on function public.merge_contacts(uuid, uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.merge_contacts(uuid, uuid) to authenticated;
