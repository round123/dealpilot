-- Stable, owner-scoped keyset pagination for the Customer list.

create index companies_owner_active_updated_cursor_idx
  on public.companies (owner_user_id, updated_at desc, id asc)
  where deleted_at is null;

create function public.list_customers_cursor(
  p_cursor text default null,
  p_limit integer default 25,
  p_search text default null,
  p_grade public.customer_grade default null,
  p_status public.customer_status default null,
  p_sort_field text default 'created_at',
  p_sort_order text default 'desc'
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_search text := nullif(btrim(p_search), '');
  normalized_sort_field text := lower(btrim(p_sort_field));
  normalized_sort_order text := lower(btrim(p_sort_order));
  query_fingerprint text;
  cursor_payload jsonb;
  cursor_value text;
  cursor_id uuid;
  sort_expression text;
  cursor_cast text;
  cursor_operator text;
  cursor_clause text := '';
  page_entries jsonb := '[]'::jsonb;
  page_items jsonb := '[]'::jsonb;
  last_entry jsonb;
  next_cursor text;
  total_count integer;
  has_more boolean := false;
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception using errcode = '22023', message = 'Customer page limit must be between 1 and 100';
  end if;
  if normalized_search is not null and length(normalized_search) > 200 then
    raise exception using errcode = '22023', message = 'Customer search exceeds 200 characters';
  end if;
  if normalized_sort_field not in ('name', 'created_at', 'updated_at', 'grade') then
    raise exception using errcode = '22023', message = 'Unsupported Customer sort field';
  end if;
  if normalized_sort_order not in ('asc', 'desc') then
    raise exception using errcode = '22023', message = 'Unsupported Customer sort order';
  end if;

  sort_expression := case normalized_sort_field
    when 'name' then 'customer_record.name'
    when 'created_at' then 'customer_record.created_at'
    when 'updated_at' then 'customer_record.updated_at'
    when 'grade' then 'customer_record.grade'
  end;
  cursor_cast := case normalized_sort_field
    when 'name' then 'text'
    when 'created_at' then 'timestamptz'
    when 'updated_at' then 'timestamptz'
    when 'grade' then 'public.customer_grade'
  end;
  cursor_operator := case normalized_sort_order when 'asc' then '>' else '<' end;

  query_fingerprint := encode(
    extensions.digest(
      convert_to(
        concat_ws(
          E'\x1f',
          current_user_id::text,
          coalesce(normalized_search, ''),
          coalesce(p_grade::text, ''),
          coalesce(p_status::text, ''),
          normalized_sort_field,
          normalized_sort_order
        ),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  if p_cursor is not null then
    begin
      cursor_payload := convert_from(decode(p_cursor, 'base64'), 'UTF8')::jsonb;
      cursor_value := cursor_payload ->> 'value';
      cursor_id := (cursor_payload ->> 'id')::uuid;
    exception when others then
      raise exception using errcode = '22023', message = 'Invalid Customer cursor';
    end;

    if cursor_payload ->> 'v' <> '1'
      or cursor_payload ->> 'query' is distinct from query_fingerprint
      or cursor_value is null
      or cursor_id is null then
      raise exception using errcode = '22023', message = 'Customer cursor does not match the current query';
    end if;

    cursor_clause := format(
      'and ((%1$s %2$s $5::%3$s) or (%1$s = $5::%3$s and customer_record.id > $6))',
      sort_expression,
      cursor_operator,
      cursor_cast
    );
  end if;

  select count(*)::integer
  into total_count
  from public.companies_summary as customer_record
  where customer_record.owner_user_id = current_user_id
    and (
      normalized_search is null
      or position(lower(normalized_search) in lower(customer_record.search_text)) > 0
    )
    and (p_grade is null or customer_record.grade = p_grade)
    and (p_status is null or customer_record.status = p_status);

  execute format(
    $query$
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'item', to_jsonb(page_row) - '__cursor_value' - '__row_number',
            'cursor_value', page_row.__cursor_value
          )
          order by page_row.__row_number
        ),
        '[]'::jsonb
      )
      from (
        select
          customer_record.*,
          (%1$s)::text as __cursor_value,
          row_number() over (order by %1$s %2$s, customer_record.id asc) as __row_number
        from public.companies_summary as customer_record
        where customer_record.owner_user_id = $1
          and ($2 is null or position(lower($2) in lower(customer_record.search_text)) > 0)
          and ($3 is null or customer_record.grade = $3)
          and ($4 is null or customer_record.status = $4)
          %3$s
        order by %1$s %2$s, customer_record.id asc
        limit $7
      ) as page_row
    $query$,
    sort_expression,
    normalized_sort_order,
    cursor_clause
  )
  into page_entries
  using
    current_user_id,
    normalized_search,
    p_grade,
    p_status,
    cursor_value,
    cursor_id,
    p_limit + 1;

  if jsonb_array_length(page_entries) > p_limit then
    has_more := true;
    page_entries := page_entries - p_limit;
  end if;

  select coalesce(jsonb_agg(entry -> 'item' order by ordinal), '[]'::jsonb)
  into page_items
  from jsonb_array_elements(page_entries) with ordinality as items(entry, ordinal);

  if has_more and jsonb_array_length(page_entries) > 0 then
    last_entry := page_entries -> (jsonb_array_length(page_entries) - 1);
    cursor_payload := jsonb_build_object(
      'v', 1,
      'query', query_fingerprint,
      'value', last_entry ->> 'cursor_value',
      'id', last_entry -> 'item' ->> 'id'
    );
    next_cursor := regexp_replace(
      encode(convert_to(cursor_payload::text, 'UTF8'), 'base64'),
      '[[:space:]]',
      '',
      'g'
    );
  end if;

  return jsonb_build_object(
    'data',
    jsonb_build_object(
      'items', page_items,
      'next_cursor', next_cursor,
      'total', total_count
    )
  );
end;
$$;

revoke all on function public.list_customers_cursor(
  text,
  integer,
  text,
  public.customer_grade,
  public.customer_status,
  text,
  text
) from public, anon, service_role;

grant execute on function public.list_customers_cursor(
  text,
  integer,
  text,
  public.customer_grade,
  public.customer_status,
  text,
  text
) to authenticated;
