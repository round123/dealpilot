-- Full, owner-scoped Dashboard aggregation. The response stays bounded while
-- counts are computed over every matching row.

create function public.get_dashboard_summary()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  dashboard_data jsonb;
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  with open_reminders as materialized (
    select
      reminder.id,
      reminder.company_id,
      reminder.deal_id,
      reminder.status,
      reminder.due_at,
      reminder.snooze_until,
      coalesce(reminder.snooze_until, reminder.due_at) as effective_due_at
    from public.reminders as reminder
    where reminder.owner_user_id = current_user_id
      and reminder.status in ('pending', 'snoozed', 'overdue')
      and not (
        reminder.type = 'paused'
        and reminder.due_at::date = date '9999-12-31'
      )
  ),
  risk_priority as materialized (
    select
      risk.deal_id,
      max(
        case
          when risk.status in ('resolved', 'ignored') then 0
          else
            case risk.severity
              when 'low' then 1
              when 'medium' then 2
              when 'high' then 4
              when 'critical' then 8
            end
            + case
                when risk.handled_at is null
                  and risk.created_at <= current_timestamp - interval '7 days'
                  then 4
                else 0
              end
        end
      ) as weight
    from public.deal_risks as risk
    where risk.owner_user_id = current_user_id
    group by risk.deal_id
  ),
  priority_rows as materialized (
    select
      reminder.id,
      reminder.company_id,
      reminder.deal_id,
      company.name as company_name,
      deal.name as deal_name,
      reminder.status,
      reminder.due_at,
      reminder.snooze_until,
      reminder.effective_due_at,
      reminder.effective_due_at < current_timestamp as is_overdue,
      coalesce(risk.weight, 0) as risk_weight,
      case coalesce(deal.grade::text, company.grade::text, 'C')
        when 'S' then 4
        when 'A' then 3
        when 'B' then 2
        else 1
      end as grade_weight
    from open_reminders as reminder
    join public.companies as company
      on company.owner_user_id = current_user_id
     and company.id = reminder.company_id
    left join public.deals as deal
      on deal.owner_user_id = current_user_id
     and deal.id = reminder.deal_id
    left join risk_priority as risk on risk.deal_id = reminder.deal_id
    order by
      is_overdue desc,
      risk_weight desc,
      grade_weight desc,
      reminder.effective_due_at asc,
      reminder.id asc
    limit 5
  )
  select jsonb_build_object(
    'open_reminder_count', (select count(*) from open_reminders),
    'overdue_reminder_count', (
      select count(*)
      from open_reminders
      where effective_due_at < current_timestamp
    ),
    'high_risk_deal_count', (
      select count(distinct risk.deal_id)
      from public.deal_risks as risk
      where risk.owner_user_id = current_user_id
        and risk.status in ('open', 'handling')
        and risk.severity in ('high', 'critical')
    ),
    'follow_up_count', (
      select count(*)
      from public.follow_ups as follow_up
      where follow_up.owner_user_id = current_user_id
    ),
    'priority_reminders', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', priority.id,
            'company_id', priority.company_id,
            'deal_id', priority.deal_id,
            'company_name', priority.company_name,
            'deal_name', priority.deal_name,
            'status', priority.status,
            'due_at', priority.due_at,
            'snooze_until', priority.snooze_until
          )
          order by
            priority.is_overdue desc,
            priority.risk_weight desc,
            priority.grade_weight desc,
            priority.effective_due_at asc,
            priority.id asc
        )
        from priority_rows as priority
      ),
      '[]'::jsonb
    )
  )
  into dashboard_data;

  return jsonb_build_object('data', dashboard_data);
end;
$$;

revoke all on function public.get_dashboard_summary()
  from public, anon, service_role;

grant execute on function public.get_dashboard_summary()
  to authenticated;
