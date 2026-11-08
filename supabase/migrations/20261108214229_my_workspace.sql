-- The caller's own workspace, for Settings ("Your handle").
--
-- With shared projects, `select` on workspace also returns the workspaces owning projects
-- you're in, and profile.workspace_id isn't readable, so clients can't tell which row is
-- theirs. This returns just that one.
--
-- Security invoker: RLS and grants apply as usual. Changing the handle stays a plain update
-- of workspace.handle, which workspace_update already limits to your own workspace in a
-- human session (agents can't manage the workspace).

create function public.my_workspace()
returns table (
  id uuid,
  name text,
  handle text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select w.id, w.name, w.handle, w.created_at, w.updated_at
  from public.workspace w
  where w.id = (select private.current_workspace_id())
$$;

revoke all on function public.my_workspace() from public;
grant execute on function public.my_workspace() to authenticated;
