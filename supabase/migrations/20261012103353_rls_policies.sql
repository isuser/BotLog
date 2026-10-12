-- Row-level security and grants.
--
-- Every row is scoped to the caller's workspace. Agents act through their owner's identity
-- (see base_schema), so they get exactly their owner's access, minus managing agents, API
-- keys, profiles and the workspace.
--
-- Grants are explicit and column-level: clients can only write the columns listed here.
-- Everything else (ids, workspace ids, short ID numbers, versions, timestamps, comment
-- authors) is set by defaults and triggers.

-- ---------------------------------------------------------------------------
-- Helpers used by policies
-- ---------------------------------------------------------------------------

-- Ids of the projects in the caller's workspace.
create function private.workspace_project_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.project where workspace_id = private.current_workspace_id()
$$;

-- True when the request comes from a human session, not an agent token.
create function private.is_human()
returns boolean
language sql
stable
set search_path = ''
as $$
  select private.current_agent_id() is null
$$;

revoke all on all functions in schema private from public;
grant usage on schema private to authenticated, service_role;
grant execute on function
  private.current_workspace_id(),
  private.current_agent_id(),
  private.current_api_key_id(),
  private.workspace_project_ids(),
  private.is_human()
to authenticated, service_role;

-- Called by the task update trigger, which runs as the caller. Read-only validation.
grant execute on function private.check_task_assignee(public.task, boolean, boolean)
to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Grants: start from nothing, then allow only what the API needs
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;

grant select, update (name) on public.workspace to authenticated;

grant select, update (name) on public.profile to authenticated;

grant select, insert (name, description, avatar),
  update (name, description, avatar, archived_at)
  on public.agent to authenticated;

grant select, insert (name, key, description),
  update (name, description)
  on public.project to authenticated;

grant select, insert (project_id, title, description, status, target_date),
  update (title, description, status, target_date, archived_at)
  on public.epic to authenticated;

grant select,
  insert (project_id, epic_id, title, description, type, status, position, priority,
          assignee_user_id, assignee_agent_id, due_date),
  update (epic_id, title, description, type, status, position, priority,
          assignee_user_id, assignee_agent_id, due_date, archived_at)
  on public.task to authenticated;

grant select, insert (project_id, name, color), update (name, color), delete
  on public.label to authenticated;

grant select, insert (task_id, label_id), delete on public.task_label to authenticated;

grant select, insert (task_id, body) on public.comment to authenticated;

-- hash is never readable by clients; key lookup uses the service role.
grant select (id, workspace_id, agent_id, name, prefix, last_used_at, revoked_at, created_at, updated_at),
  insert (agent_id, name, prefix, hash),
  update (name, revoked_at)
  on public.api_key to authenticated;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------------

alter table public.workspace enable row level security;
alter table public.profile enable row level security;
alter table public.agent enable row level security;
alter table public.project enable row level security;
alter table public.epic enable row level security;
alter table public.task enable row level security;
alter table public.label enable row level security;
alter table public.task_label enable row level security;
alter table public.comment enable row level security;
alter table public.api_key enable row level security;

-- ---------------------------------------------------------------------------
-- Workspace and profile
-- ---------------------------------------------------------------------------

create policy workspace_select on public.workspace
  for select to authenticated
  using (id = (select private.current_workspace_id()));

create policy workspace_update on public.workspace
  for update to authenticated
  using (id = (select private.current_workspace_id()) and (select private.is_human()))
  with check (id = (select private.current_workspace_id()));

create policy profile_select on public.profile
  for select to authenticated
  using (workspace_id = (select private.current_workspace_id()));

create policy profile_update on public.profile
  for update to authenticated
  using (id = (select auth.uid()) and (select private.is_human()))
  with check (id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Agents: visible to the workspace, managed only by their owner in a human session
-- ---------------------------------------------------------------------------

create policy agent_select on public.agent
  for select to authenticated
  using (workspace_id = (select private.current_workspace_id()));

create policy agent_insert on public.agent
  for insert to authenticated
  with check (
    workspace_id = (select private.current_workspace_id())
    and owner_user_id = (select auth.uid())
    and (select private.is_human())
  );

create policy agent_update on public.agent
  for update to authenticated
  using (
    workspace_id = (select private.current_workspace_id())
    and owner_user_id = (select auth.uid())
    and (select private.is_human())
  )
  with check (
    workspace_id = (select private.current_workspace_id())
    and owner_user_id = (select auth.uid())
  );

-- ---------------------------------------------------------------------------
-- Projects
-- ---------------------------------------------------------------------------

create policy project_select on public.project
  for select to authenticated
  using (workspace_id = (select private.current_workspace_id()));

create policy project_insert on public.project
  for insert to authenticated
  with check (workspace_id = (select private.current_workspace_id()));

create policy project_update on public.project
  for update to authenticated
  using (workspace_id = (select private.current_workspace_id()))
  with check (workspace_id = (select private.current_workspace_id()));

-- ---------------------------------------------------------------------------
-- Project data: epics, tasks, labels, task labels
-- ---------------------------------------------------------------------------

create policy epic_select on public.epic
  for select to authenticated
  using (project_id in (select private.workspace_project_ids()));

create policy epic_insert on public.epic
  for insert to authenticated
  with check (project_id in (select private.workspace_project_ids()));

create policy epic_update on public.epic
  for update to authenticated
  using (project_id in (select private.workspace_project_ids()))
  with check (project_id in (select private.workspace_project_ids()));

create policy task_select on public.task
  for select to authenticated
  using (project_id in (select private.workspace_project_ids()));

create policy task_insert on public.task
  for insert to authenticated
  with check (project_id in (select private.workspace_project_ids()));

create policy task_update on public.task
  for update to authenticated
  using (project_id in (select private.workspace_project_ids()))
  with check (project_id in (select private.workspace_project_ids()));

create policy label_select on public.label
  for select to authenticated
  using (project_id in (select private.workspace_project_ids()));

create policy label_insert on public.label
  for insert to authenticated
  with check (project_id in (select private.workspace_project_ids()));

create policy label_update on public.label
  for update to authenticated
  using (project_id in (select private.workspace_project_ids()))
  with check (project_id in (select private.workspace_project_ids()));

create policy label_delete on public.label
  for delete to authenticated
  using (project_id in (select private.workspace_project_ids()));

create policy task_label_select on public.task_label
  for select to authenticated
  using (project_id in (select private.workspace_project_ids()));

create policy task_label_insert on public.task_label
  for insert to authenticated
  with check (project_id in (select private.workspace_project_ids()));

create policy task_label_delete on public.task_label
  for delete to authenticated
  using (project_id in (select private.workspace_project_ids()));

-- ---------------------------------------------------------------------------
-- Comments
-- ---------------------------------------------------------------------------

create policy comment_select on public.comment
  for select to authenticated
  using (
    task_id in (
      select id from public.task where project_id in (select private.workspace_project_ids())
    )
  );

create policy comment_insert on public.comment
  for insert to authenticated
  with check (
    task_id in (
      select id from public.task where project_id in (select private.workspace_project_ids())
    )
    and (
      (author_agent_id = (select private.current_agent_id()) and author_user_id is null)
      or (author_user_id = (select auth.uid()) and author_agent_id is null and (select private.is_human()))
    )
  );

-- ---------------------------------------------------------------------------
-- API keys: human sessions only, for agents the caller owns
-- ---------------------------------------------------------------------------

create policy api_key_select on public.api_key
  for select to authenticated
  using (
    workspace_id = (select private.current_workspace_id())
    and (select private.is_human())
  );

create policy api_key_insert on public.api_key
  for insert to authenticated
  with check (
    workspace_id = (select private.current_workspace_id())
    and (select private.is_human())
    and agent_id in (
      select id from public.agent
      where owner_user_id = (select auth.uid()) and archived_at is null
    )
  );

create policy api_key_update on public.api_key
  for update to authenticated
  using (
    workspace_id = (select private.current_workspace_id())
    and (select private.is_human())
    and agent_id in (select id from public.agent where owner_user_id = (select auth.uid()))
  )
  with check (workspace_id = (select private.current_workspace_id()));
