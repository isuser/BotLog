-- Rate limits, counted in Postgres so self-hosters need no extra service. The API calls
-- public.hit_rate_limit() once per request; it counts against the caller's own bucket,
-- derived from their token (the API key for agents, the user otherwise), so nobody can
-- spend someone else's allowance. Fixed one-minute windows.

create table private.rate_limit (
  bucket text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (bucket, window_start)
);

-- Only reachable through hit_rate_limit (security definer); clients have no grants.
alter table private.rate_limit enable row level security;

create function public.hit_rate_limit(p_window_seconds integer default 60)
returns table (hits integer, reset_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bucket text;
  v_window timestamptz;
begin
  v_bucket := case
    when private.current_api_key_id() is not null then 'key:' || private.current_api_key_id()
    when auth.uid() is not null then 'user:' || auth.uid()
  end;
  if v_bucket is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_window_seconds is null or p_window_seconds < 1 or p_window_seconds > 3600 then
    raise exception 'window must be 1 to 3600 seconds' using errcode = '22023';
  end if;

  v_window := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  -- Earlier windows of this bucket are done with; dropping them keeps the table tiny.
  delete from private.rate_limit r where r.bucket = v_bucket and r.window_start < v_window;

  return query
    insert into private.rate_limit as r (bucket, window_start, hits)
    values (v_bucket, v_window, 1)
    on conflict (bucket, window_start) do update set hits = r.hits + 1
    returning r.hits, v_window + make_interval(secs => p_window_seconds);
end;
$$;

revoke all on function public.hit_rate_limit(integer) from public, anon;
grant execute on function public.hit_rate_limit(integer) to authenticated;

-- Title search (?q=) uses ILIKE '%…%', which a btree index can't serve; trigrams can.
create extension if not exists pg_trgm with schema extensions;
create index task_title_trgm_idx on public.task using gin (title extensions.gin_trgm_ops);
