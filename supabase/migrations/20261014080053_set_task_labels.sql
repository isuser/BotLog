-- Replaces a task's labels in one transaction, behind the same version check as other task
-- writes: the task row is bumped only if p_version is still current, then the labels become
-- exactly p_label_ids. Runs as the caller (security invoker), so RLS and column grants apply,
-- and the task_label triggers log label_added / label_removed as usual.
--
-- Returns the task's new version, or null if p_version is stale (or the task isn't visible).

create function public.set_task_labels(p_task_id uuid, p_version integer, p_label_ids uuid[])
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_version integer;
begin
  -- Writing epic_id back to itself counts as an update, so the version trigger bumps it.
  update public.task
     set epic_id = epic_id
   where id = p_task_id and version = p_version
  returning version into v_version;

  if v_version is null then
    return null;
  end if;

  delete from public.task_label
   where task_id = p_task_id
     and not (label_id = any (coalesce(p_label_ids, '{}')));

  insert into public.task_label (task_id, label_id)
  select p_task_id, label_id
    from unnest(coalesce(p_label_ids, '{}')) as label_id
  on conflict (task_id, label_id) do nothing;

  return v_version;
end;
$$;

revoke all on function public.set_task_labels(uuid, integer, uuid[]) from public, anon;
grant execute on function public.set_task_labels(uuid, integer, uuid[]) to authenticated;
