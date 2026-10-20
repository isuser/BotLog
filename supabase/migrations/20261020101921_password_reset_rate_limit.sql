-- Rate limit for the "Forgot password?" form, which anyone can use without signing in, so
-- hit_rate_limit (which counts against the caller's own token) can't cover it. The server
-- counts per email and per client IP with the service role; clients can't call this.
-- Fixed one-hour windows, in the same table as the API limits.

create function public.hit_password_reset_limit(p_bucket text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window_seconds constant integer := 3600;
  v_bucket text;
  v_window timestamptz;
  v_hits integer;
begin
  if p_bucket is null or length(p_bucket) = 0 or length(p_bucket) > 200 then
    raise exception 'bucket must be 1 to 200 characters' using errcode = '22023';
  end if;
  -- Own prefix, so these buckets never collide with the API's key:/user: ones.
  v_bucket := 'reset:' || p_bucket;
  v_window := to_timestamp(floor(extract(epoch from now()) / v_window_seconds) * v_window_seconds);

  delete from private.rate_limit r where r.bucket = v_bucket and r.window_start < v_window;

  insert into private.rate_limit as r (bucket, window_start, hits)
  values (v_bucket, v_window, 1)
  on conflict (bucket, window_start) do update set hits = r.hits + 1
  returning r.hits into v_hits;

  return v_hits;
end;
$$;

revoke all on function public.hit_password_reset_limit(text) from public, anon, authenticated;
grant execute on function public.hit_password_reset_limit(text) to service_role;
