-- hit_rate_limit took the window length as an argument, so a signed-in user calling it
-- directly with a different window could delete their current count and reset their own
-- limit. The window is now fixed here (one minute) and the function takes no arguments.

drop function public.hit_rate_limit(integer);

create function public.hit_rate_limit()
returns table (hits integer, reset_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window_seconds constant integer := 60;
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

  v_window := to_timestamp(floor(extract(epoch from now()) / v_window_seconds) * v_window_seconds);

  -- Earlier windows of this bucket are done with; dropping them keeps the table tiny.
  delete from private.rate_limit r where r.bucket = v_bucket and r.window_start < v_window;

  return query
    insert into private.rate_limit as r (bucket, window_start, hits)
    values (v_bucket, v_window, 1)
    on conflict (bucket, window_start) do update set hits = r.hits + 1
    returning r.hits, v_window + make_interval(secs => v_window_seconds);
end;
$$;

revoke all on function public.hit_rate_limit() from public, anon;
grant execute on function public.hit_rate_limit() to authenticated;
