begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000000', '31000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'contact-owner-a@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '32000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'contact-owner-b@example.test', '', now(), '{}', '{}', now(), now());

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"31000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

insert into public.companies (id, name)
values
  ('31100000-0000-0000-0000-000000000001', 'Source company'),
  ('31100000-0000-0000-0000-000000000002', 'Target company');

insert into public.contacts (
  id, company_id, first_name, last_name, name, gender, title, background,
  avatar, first_seen, last_seen, status, linkedin_url, email_jsonb, phone_jsonb
)
values
  (
    '31200000-0000-0000-0000-000000000001',
    '31100000-0000-0000-0000-000000000001',
    'Source', 'Person', 'Source Person', 'female', 'CTO', 'Source background',
    '{"src":"source-avatar.png"}', '2025-01-01T00:00:00Z', '2026-08-01T00:00:00Z',
    'active', 'https://example.test/source',
    '[{"email":"shared@example.test","type":"Source"},{"email":"source@example.test","type":"Work"}]',
    '[{"number":"+86-100","type":"Work"}]'
  ),
  (
    '31200000-0000-0000-0000-000000000002',
    '31100000-0000-0000-0000-000000000002',
    null, 'Winner', 'Target Person', null, null, null,
    null, null, '2026-07-01T00:00:00Z', null, '',
    '[{"email":"shared@example.test","type":"Target"},{"email":"target@example.test","type":"Personal"}]',
    '[]'
  );

insert into public.tags (id, name, color)
values
  ('31300000-0000-0000-0000-000000000001', 'Source tag', '#ff0000'),
  ('31300000-0000-0000-0000-000000000002', 'Shared tag', '#00ff00');

insert into public.contact_tags (contact_id, tag_id)
values
  ('31200000-0000-0000-0000-000000000001', '31300000-0000-0000-0000-000000000001'),
  ('31200000-0000-0000-0000-000000000001', '31300000-0000-0000-0000-000000000002'),
  ('31200000-0000-0000-0000-000000000002', '31300000-0000-0000-0000-000000000002');

insert into public.contact_notes (id, contact_id, text)
values (
  '31400000-0000-0000-0000-000000000001',
  '31200000-0000-0000-0000-000000000001',
  'Source note'
);

insert into public.tasks (id, contact_id, text)
values (
  '31500000-0000-0000-0000-000000000001',
  '31200000-0000-0000-0000-000000000001',
  'Source task'
);

insert into public.deals (id, company_id, name)
values
  ('31600000-0000-0000-0000-000000000001', '31100000-0000-0000-0000-000000000001', 'Shared deal'),
  ('31600000-0000-0000-0000-000000000002', '31100000-0000-0000-0000-000000000001', 'Source-only deal');

insert into public.deal_contacts (deal_id, contact_id)
values
  ('31600000-0000-0000-0000-000000000001', '31200000-0000-0000-0000-000000000001'),
  ('31600000-0000-0000-0000-000000000001', '31200000-0000-0000-0000-000000000002'),
  ('31600000-0000-0000-0000-000000000002', '31200000-0000-0000-0000-000000000001');

insert into public.social_accounts (
  id, company_id, contact_id, platform, raw_identifier, normalized_identifier
)
values (
  '31700000-0000-0000-0000-000000000001',
  '31100000-0000-0000-0000-000000000001',
  '31200000-0000-0000-0000-000000000001',
  'telegram', '@source', 'source'
);

do $$
declare
  result jsonb;
begin
  select public.merge_contacts(
    '31200000-0000-0000-0000-000000000001',
    '31200000-0000-0000-0000-000000000002'
  ) into result;

  if result -> 'data' ->> 'id' <> '31200000-0000-0000-0000-000000000002'
    or result -> 'data' ->> 'company_id' <> '31100000-0000-0000-0000-000000000002'
    or result -> 'data' ->> 'first_name' <> 'Source'
    or result -> 'data' ->> 'last_name' <> 'Winner'
    or result -> 'data' ->> 'name' <> 'Target Person'
    or result -> 'data' ->> 'linkedin_url' <> 'https://example.test/source' then
    raise exception 'contact merge response or target-first field resolution is invalid: %', result;
  end if;
end;
$$;

do $$
begin
  if exists (
    select 1 from public.contacts
    where id = '31200000-0000-0000-0000-000000000001'
  ) then
    raise exception 'source contact was not deleted';
  end if;

  if (select count(*) from public.contact_tags where contact_id = '31200000-0000-0000-0000-000000000002') <> 2
    or exists (select 1 from public.contact_tags where contact_id = '31200000-0000-0000-0000-000000000001') then
    raise exception 'contact tags were not deduplicated and transferred';
  end if;

  if not exists (
    select 1 from public.contact_notes
    where id = '31400000-0000-0000-0000-000000000001'
      and contact_id = '31200000-0000-0000-0000-000000000002'
  ) or not exists (
    select 1 from public.tasks
    where id = '31500000-0000-0000-0000-000000000001'
      and contact_id = '31200000-0000-0000-0000-000000000002'
  ) then
    raise exception 'contact notes or tasks were not transferred';
  end if;

  if (select count(*) from public.deal_contacts where contact_id = '31200000-0000-0000-0000-000000000002') <> 2
    or exists (select 1 from public.deal_contacts where contact_id = '31200000-0000-0000-0000-000000000001') then
    raise exception 'deal links were not deduplicated and transferred';
  end if;

  if not exists (
    select 1 from public.social_accounts
    where id = '31700000-0000-0000-0000-000000000001'
      and company_id = '31100000-0000-0000-0000-000000000002'
      and contact_id = '31200000-0000-0000-0000-000000000002'
  ) then
    raise exception 'social account was not moved to the target contact and company';
  end if;

  if not exists (
    select 1 from public.contacts
    where id = '31200000-0000-0000-0000-000000000002'
      and avatar = '{"src":"source-avatar.png"}'::jsonb
      and first_seen = '2025-01-01T00:00:00Z'::timestamptz
      and last_seen = '2026-08-01T00:00:00Z'::timestamptz
      and jsonb_array_length(email_jsonb) = 3
      and email_jsonb @> '[{"email":"shared@example.test","type":"Target"}]'::jsonb
      and not (email_jsonb @> '[{"email":"shared@example.test","type":"Source"}]'::jsonb)
      and phone_jsonb = '[{"number":"+86-100","type":"Work"}]'::jsonb
  ) then
    raise exception 'contact fields, email precedence, or phone merge is invalid';
  end if;

  if not exists (
    select 1 from public.audit_events
    where event_type = 'contact.merged'
      and entity_id = '31200000-0000-0000-0000-000000000001'
      and metadata ->> 'target_id' = '31200000-0000-0000-0000-000000000002'
  ) then
    raise exception 'contact merge audit event is missing';
  end if;
end;
$$;

-- A failing final delete must roll the entire command back, including moved children.
insert into public.contacts (id, company_id, name)
values
  ('31200000-0000-0000-0000-000000000003', '31100000-0000-0000-0000-000000000001', 'Rollback source'),
  ('31200000-0000-0000-0000-000000000004', '31100000-0000-0000-0000-000000000002', 'Rollback target');

insert into public.tasks (id, contact_id, text)
values (
  '31500000-0000-0000-0000-000000000002',
  '31200000-0000-0000-0000-000000000003',
  'Must roll back'
);

reset role;
create function pg_temp.reject_test_source_delete()
returns trigger
language plpgsql
as $$
begin
  if old.id = '31200000-0000-0000-0000-000000000003'::uuid then
    raise exception 'test delete rejection';
  end if;
  return old;
end;
$$;
create trigger reject_test_source_delete
before delete on public.contacts
for each row execute function pg_temp.reject_test_source_delete();

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"31000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

do $$
begin
  begin
    perform public.merge_contacts(
      '31200000-0000-0000-0000-000000000003',
      '31200000-0000-0000-0000-000000000004'
    );
    raise exception 'contact merge unexpectedly bypassed the forced failure';
  exception
    when sqlstate 'P0001' then
      if sqlerrm <> 'test delete rejection' then
        raise exception 'unexpected contact merge failure: %', sqlerrm;
      end if;
  end;

  if not exists (
    select 1 from public.contacts
    where id = '31200000-0000-0000-0000-000000000003'
  ) or not exists (
    select 1 from public.tasks
    where id = '31500000-0000-0000-0000-000000000002'
      and contact_id = '31200000-0000-0000-0000-000000000003'
  ) then
    raise exception 'failed contact merge did not roll back atomically';
  end if;
end;
$$;

reset role;
drop trigger reject_test_source_delete on public.contacts;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"32000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);

insert into public.companies (id, name)
values ('32100000-0000-0000-0000-000000000001', 'Owner B company');

insert into public.contacts (id, company_id, name)
values (
  '32200000-0000-0000-0000-000000000001',
  '32100000-0000-0000-0000-000000000001',
  'Owner B contact'
);

do $$
begin
  begin
    perform public.merge_contacts(
      '31200000-0000-0000-0000-000000000004',
      '32200000-0000-0000-0000-000000000001'
    );
    raise exception 'cross-owner contact merge unexpectedly succeeded';
  exception
    when no_data_found then null;
  end;

  begin
    perform public.merge_contacts(
      '32200000-0000-0000-0000-000000000001',
      '32200000-0000-0000-0000-000000000001'
    );
    raise exception 'same-contact merge unexpectedly succeeded';
  exception
    when invalid_parameter_value then null;
  end;
end;
$$;

rollback;
