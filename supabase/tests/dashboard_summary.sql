-- Dashboard aggregation acceptance. Run after all migrations with
-- psql -v ON_ERROR_STOP=1.

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000000', 'd0000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'dashboard-a@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'e0000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'dashboard-b@example.test', '', now(), '{}', '{}', now(), now());

insert into public.companies (id, owner_user_id, name, grade)
values
  ('d1000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'Overdue Customer', 'C'),
  ('d1000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000001', 'Critical Customer', 'C'),
  ('d1000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000001', 'High S Customer', 'C'),
  ('d1000000-0000-4000-8000-000000000004', 'd0000000-0000-4000-8000-000000000001', 'Handled Critical Customer', 'C'),
  ('d1000000-0000-4000-8000-000000000005', 'd0000000-0000-4000-8000-000000000001', 'Grade A Customer', 'A'),
  ('d1000000-0000-4000-8000-000000000006', 'd0000000-0000-4000-8000-000000000001', 'Grade B Customer', 'B'),
  ('d1000000-0000-4000-8000-000000000007', 'd0000000-0000-4000-8000-000000000001', 'Paused Customer', 'A'),
  ('e1000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000002', 'Other Owner Customer', 'A');

insert into public.deals (id, owner_user_id, company_id, name, grade)
values
  ('d2000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000002', 'Old Critical Deal', 'C'),
  ('d2000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000003', 'Old High S Deal', 'S'),
  ('d2000000-0000-4000-8000-000000000004', 'd0000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000004', 'Handled Critical A Deal', 'A'),
  ('e2000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000002', 'e1000000-0000-4000-8000-000000000001', 'Other Owner Deal', 'S');

insert into public.deal_risks (
  id, owner_user_id, deal_id, description, severity, status, handled_at, created_at
)
values
  ('d3000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000002', 'Aged critical risk', 'critical', 'open', null, now() - interval '8 days'),
  ('d3000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000002', 'Duplicate deal risk', 'high', 'handling', null, now()),
  ('d3000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000003', 'Aged high risk', 'high', 'handling', null, now() - interval '8 days'),
  ('d3000000-0000-4000-8000-000000000004', 'd0000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000004', 'Handled critical risk', 'critical', 'open', now(), now() - interval '8 days'),
  ('d3000000-0000-4000-8000-000000000005', 'd0000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000003', 'Resolved risk', 'critical', 'resolved', null, now() - interval '30 days'),
  ('e3000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000002', 'e2000000-0000-4000-8000-000000000001', 'Other owner risk', 'critical', 'open', null, now() - interval '30 days');

insert into public.reminders (
  id, owner_user_id, company_id, deal_id, type, status, due_at, snooze_until
)
values
  ('d5000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', null, 'fixed_time', 'pending', now() - interval '1 day', null),
  ('d5000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000002', 'd2000000-0000-4000-8000-000000000002', 'fixed_time', 'pending', now() + interval '6 days', null),
  ('d5000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000003', 'd2000000-0000-4000-8000-000000000003', 'fixed_time', 'pending', now() + interval '5 days', null),
  ('d5000000-0000-4000-8000-000000000004', 'd0000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000004', 'd2000000-0000-4000-8000-000000000004', 'fixed_time', 'snoozed', now() - interval '2 days', now() + interval '4 days'),
  ('d5000000-0000-4000-8000-000000000005', 'd0000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000005', null, 'waiting_reply', 'pending', now() + interval '7 days', null),
  ('d5000000-0000-4000-8000-000000000006', 'd0000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000006', null, 'waiting_reply', 'overdue', now() + interval '1 day', null),
  ('d5000000-0000-4000-8000-000000000007', 'd0000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000007', null, 'paused', 'snoozed', '9999-12-31 00:00:00+00', null),
  ('d5000000-0000-4000-8000-000000000008', 'd0000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', null, 'fixed_time', 'completed', now() - interval '10 days', null),
  ('e5000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000002', 'e1000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001', 'fixed_time', 'pending', now() - interval '1 day', null);

insert into public.follow_ups (
  owner_user_id, company_id, type, note, occurred_at
)
select
  'd0000000-0000-4000-8000-000000000001',
  'd1000000-0000-4000-8000-000000000001',
  'note',
  format('Dashboard scale follow-up %s', item),
  now() - make_interval(secs => item)
from generate_series(1, 10001) as generated(item);

insert into public.follow_ups (owner_user_id, company_id, type, note, occurred_at)
select
  'e0000000-0000-4000-8000-000000000002',
  'e1000000-0000-4000-8000-000000000001',
  'note',
  format('Other owner follow-up %s', item),
  now()
from generate_series(1, 7) as generated(item);

do $$
begin
  if not pg_catalog.has_function_privilege(
      'authenticated', 'public.get_dashboard_summary()', 'EXECUTE'
    )
    or pg_catalog.has_function_privilege(
      'anon', 'public.get_dashboard_summary()', 'EXECUTE'
    )
    or pg_catalog.has_function_privilege(
      'service_role', 'public.get_dashboard_summary()', 'EXECUTE'
    ) then
    raise exception 'Dashboard RPC grants differ from the authenticated-only contract';
  end if;
end;
$$;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"d0000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

do $$
declare
  result jsonb;
  priority_ids text[];
begin
  select public.get_dashboard_summary() into result;

  if result -> 'data' ->> 'open_reminder_count' <> '6'
    or result -> 'data' ->> 'overdue_reminder_count' <> '1'
    or result -> 'data' ->> 'high_risk_deal_count' <> '3'
    or result -> 'data' ->> 'follow_up_count' <> '10001' then
    raise exception 'Dashboard counts are incomplete or cross-owner: %', result;
  end if;

  if jsonb_array_length(result -> 'data' -> 'priority_reminders') <> 5 then
    raise exception 'Dashboard priority list is not bounded to five rows: %', result;
  end if;

  select array_agg(item ->> 'id' order by ordinal)
  into priority_ids
  from jsonb_array_elements(result -> 'data' -> 'priority_reminders')
    with ordinality as priorities(item, ordinal);

  if priority_ids is distinct from array[
    'd5000000-0000-4000-8000-000000000001',
    'd5000000-0000-4000-8000-000000000002',
    'd5000000-0000-4000-8000-000000000003',
    'd5000000-0000-4000-8000-000000000004',
    'd5000000-0000-4000-8000-000000000005'
  ] then
    raise exception 'Dashboard priority ordering changed: %', priority_ids;
  end if;

  if result -> 'data' -> 'priority_reminders' -> 0 ->> 'company_name'
      <> 'Overdue Customer'
    or result -> 'data' -> 'priority_reminders' -> 1 ->> 'deal_name'
      <> 'Old Critical Deal'
    or (result -> 'data' -> 'priority_reminders' -> 0 -> 'deal_name')
      is distinct from 'null'::jsonb
    or (
      select count(*)
      from jsonb_object_keys(
        result -> 'data' -> 'priority_reminders' -> 0
      )
    ) <> 8 then
    raise exception 'Dashboard priority projection is incomplete: %', result;
  end if;
end;
$$;

select set_config(
  'request.jwt.claims',
  '{"sub":"e0000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

do $$
declare
  result jsonb;
begin
  select public.get_dashboard_summary() into result;

  if result -> 'data' ->> 'open_reminder_count' <> '1'
    or result -> 'data' ->> 'overdue_reminder_count' <> '1'
    or result -> 'data' ->> 'high_risk_deal_count' <> '1'
    or result -> 'data' ->> 'follow_up_count' <> '7'
    or result -> 'data' -> 'priority_reminders' -> 0 ->> 'id'
      <> 'e5000000-0000-4000-8000-000000000001' then
    raise exception 'Dashboard RPC leaked another owner or hid current owner data: %', result;
  end if;
end;
$$;

rollback;
