-- Shared projects: per-project membership, invites and roles.
--
-- Users keep their own workspace, and projects keep the workspace they were created in (the
-- owner's). Access to a project and everything in it now follows project_member instead of
-- "project in my workspace". Agents still act as their owner (see base_schema), so an agent
-- reaches exactly the projects its owner is a member of, and loses them when its owner leaves.
--
-- Roles:
--   owner  - everything; the only one who can change the project row (name, description,
--            settings). Exactly one per project, set when the project is created; the owner
--            row can't be changed or removed by clients (it goes when the project does).
--   admin  - member rights plus managing invites, removing members and switching others
--            between admin and member.
--   member - full work inside the project: tasks, epics, comments, labels, columns,
--            attachments (with the existing human-only limits, e.g. on columns).
-- Anyone but the owner can leave. Managing members and invites is for people, not agents.
--
-- Also adds workspace.handle (a unique, URL-safe name) generated from the email at sign-up.

-- ---------------------------------------------------------------------------
-- Membership
-- ---------------------------------------------------------------------------

create type public.project_role as enum ('owner', 'admin', 'member');

create table public.project_member (
  project_id uuid not null references public.project (id) on delete cascade,
  user_id uuid not null references public.profile (id) on delete cascade,
  role public.project_role not null default 'member',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

-- At most one owner per project; the guards below keep it at exactly one.
create unique index project_member_owner_idx on public.project_member (project_id) where role = 'owner';
-- "Which projects am I in?", used by every policy through accessible_project_ids().
create index project_member_user_idx on public.project_member (user_id, project_id);

create trigger set_updated_at before update on public.project_member
  for each row execute function private.set_updated_at();

-- Revokes the open invites someone created in a project, when they stop managing it (removed,
-- left or demoted), so a link they kept can't bring them or anyone else back in.
create function private.revoke_invites_by(p_project_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.project_invite
  set revoked_at = now()
  where project_id = p_project_id and created_by = p_user_id
    and used_at is null and revoked_at is null;
end;
$$;

-- Nobody becomes owner, and the owner row never changes, through an update.
create function private.project_member_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.project_id is distinct from old.project_id or new.user_id is distinct from old.user_id then
    raise exception 'A membership can''t move to another project or person.' using errcode = '22023';
  end if;
  if old.role = 'owner' or new.role = 'owner' then
    raise exception 'The project owner can''t be changed.' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger project_member_before_update
  before update on public.project_member
  for each row execute function private.project_member_before_update();

create function private.project_member_after_demote()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.revoke_invites_by(new.project_id, new.user_id);
  return null;
end;
$$;

create trigger project_member_after_demote
  after update of role on public.project_member
  for each row
  when (old.role in ('owner', 'admin') and new.role = 'member')
  execute function private.project_member_after_demote();

-- The owner row goes only with its project or with the owner's account. In both cases the
-- parent row is already gone when the cascade gets here.
create function private.project_member_before_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role = 'owner'
    and exists (select 1 from public.project where id = old.project_id)
    and exists (select 1 from public.profile where id = old.user_id)
  then
    raise exception 'The project owner can''t leave or be removed.' using errcode = '22023';
  end if;
  return old;
end;
$$;

create trigger project_member_before_delete
  before delete on public.project_member
  for each row execute function private.project_member_before_delete();

-- Someone who leaves or is removed is unassigned from the project's tasks, and so are their
-- agents. Security definer because a member who leaves can no longer write the project's
-- tasks; auth.uid() and the agent claims still come from the request, so the activity log
-- records the change as made by whoever removed them (or by themselves when they leave).
-- Skipped when the project or the person is being deleted: the cascades and the assignee
-- foreign keys (on delete set null) take care of that.
create function private.project_member_after_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.project where id = old.project_id)
    or not exists (select 1 from public.profile where id = old.user_id)
  then
    return null;
  end if;

  update public.task
  set assignee_user_id = null
  where project_id = old.project_id and assignee_user_id = old.user_id;

  update public.task
  set assignee_agent_id = null
  where project_id = old.project_id
    and assignee_agent_id in (select id from public.agent where owner_user_id = old.user_id);

  perform private.revoke_invites_by(old.project_id, old.user_id);

  return null;
end;
$$;

create trigger project_member_after_delete
  after delete on public.project_member
  for each row execute function private.project_member_after_delete();

-- Whoever creates a project owns it. auth.uid() is the person (or the agent's owner); a
-- service-role insert has none, so the workspace's earliest profile owns it then.
create function private.project_add_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
begin
  if v_owner is null then
    select id into v_owner from public.profile
    where workspace_id = new.workspace_id
    order by created_at, id
    limit 1;
  end if;
  if v_owner is not null then
    insert into public.project_member (project_id, user_id, role) values (new.id, v_owner, 'owner');
  end if;
  return null;
end;
$$;

create trigger project_add_owner
  after insert on public.project
  for each row execute function private.project_add_owner();

-- Backfill: each existing project is owned by its workspace's earliest profile; any other
-- profiles in that workspace (none today, one profile per workspace) become members.
insert into public.project_member (project_id, user_id, role, created_at)
select
  x.project_id,
  x.user_id,
  case when x.rn = 1 then 'owner'::public.project_role else 'member'::public.project_role end,
  x.project_created_at
from (
  select
    p.id as project_id,
    pr.id as user_id,
    p.created_at as project_created_at,
    row_number() over (partition by p.id order by pr.created_at, pr.id) as rn
  from public.project p
  join public.profile pr on pr.workspace_id = p.workspace_id
) x;

-- ---------------------------------------------------------------------------
-- Invites
-- ---------------------------------------------------------------------------

-- A single-use link. Like API keys, the token is shown once and only its SHA-256 hash is
-- stored; the hash isn't readable by clients.
create table public.project_invite (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.project (id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  role public.project_role not null default 'member' check (role <> 'owner'),
  -- Set by the trigger from the request.
  created_by uuid references public.profile (id) on delete set null,
  expires_at timestamptz not null default now() + interval '1 hour',
  used_at timestamptz,
  used_by uuid references public.profile (id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- At most a week: an invite is for joining soon, not a standing way back in.
  constraint project_invite_expiry check (expires_at > created_at and expires_at <= created_at + interval '7 days'),
  -- used_by can go back to null if that person is deleted; used_at stays.
  constraint project_invite_used check (used_by is null or used_at is not null)
);

create index project_invite_project_idx on public.project_invite (project_id, created_at);
create index project_invite_created_by_idx on public.project_invite (created_by);
create index project_invite_used_by_idx on public.project_invite (used_by);

create trigger set_updated_at before update on public.project_invite
  for each row execute function private.set_updated_at();

create function private.project_invite_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.used_at := null;
    new.used_by := null;
    new.revoked_at := null;
    new.created_at := now();
    return new;
  end if;

  -- created_by and used_by may only go to null (their profile was deleted).
  if new.project_id is distinct from old.project_id
    or new.token_hash is distinct from old.token_hash
    or new.role is distinct from old.role
    or new.expires_at is distinct from old.expires_at
    or (new.created_by is distinct from old.created_by and new.created_by is not null)
  then
    raise exception 'An invite can''t be changed, only revoked.' using errcode = '22023';
  end if;
  if old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at then
    raise exception 'A revoked invite can''t be restored.' using errcode = '22023';
  end if;
  if old.used_at is not null and (
    new.used_at is distinct from old.used_at
    or (new.used_by is distinct from old.used_by and new.used_by is not null)
  ) then
    raise exception 'This invite has already been used.' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger project_invite_before_write
  before insert or update on public.project_invite
  for each row execute function private.project_invite_before_write();

-- ---------------------------------------------------------------------------
-- Helpers used by policies. Security definer so they can read project_member without
-- recursing into its own policies; all scoped to auth.uid().
-- ---------------------------------------------------------------------------

-- The caller's role in a project, or null if they aren't a member.
create function private.project_role(p_project_id uuid)
returns public.project_role
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.project_member
  where project_id = p_project_id and user_id = (select auth.uid())
$$;

create function private.can_access_project(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.project_member
    where project_id = p_project_id and user_id = (select auth.uid())
  )
$$;

-- Projects the caller (or the agent's owner) is a member of. Replaces workspace_project_ids()
-- in every project-data policy.
create function private.accessible_project_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select project_id from public.project_member where user_id = (select auth.uid())
$$;

-- Projects the caller owns.
create function private.owned_project_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select project_id from public.project_member
  where user_id = (select auth.uid()) and role = 'owner'
$$;

-- Projects whose members and invites the caller manages (owner or admin).
create function private.managed_project_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select project_id from public.project_member
  where user_id = (select auth.uid()) and role in ('owner', 'admin')
$$;

-- Everyone who shares at least one project with the caller, the caller included.
create function private.co_member_user_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select distinct other.user_id
  from public.project_member mine
  join public.project_member other on other.project_id = mine.project_id
  where mine.user_id = (select auth.uid())
$$;

-- Workspaces that own a project the caller can access.
create function private.accessible_workspace_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select distinct p.workspace_id
  from public.project p
  join public.project_member m on m.project_id = p.id
  where m.user_id = (select auth.uid())
$$;

-- True while a project has no members, which is only the instant between its insert and
-- the project_add_owner trigger. RLS checks `insert ... returning` against the select
-- policy before after-insert triggers run, so the creator could not read back their new
-- project without this.
create function private.project_has_no_members(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (select 1 from public.project_member where project_id = p_project_id)
$$;

revoke all on function
  private.project_member_before_update(),
  private.project_member_before_delete(),
  private.project_member_after_delete(),
  private.project_add_owner(),
  private.project_invite_before_write(),
  private.revoke_invites_by(uuid, uuid),
  private.project_member_after_demote(),
  private.project_role(uuid),
  private.can_access_project(uuid),
  private.accessible_project_ids(),
  private.owned_project_ids(),
  private.managed_project_ids(),
  private.co_member_user_ids(),
  private.accessible_workspace_ids(),
  private.project_has_no_members(uuid)
from public;

grant execute on function
  private.project_role(uuid),
  private.can_access_project(uuid),
  private.accessible_project_ids(),
  private.owned_project_ids(),
  private.managed_project_ids(),
  private.co_member_user_ids(),
  private.accessible_workspace_ids(),
  private.project_has_no_members(uuid)
to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Accepting and previewing invites (the join page)
-- ---------------------------------------------------------------------------

-- The stored hash of an invite token. Callers send the token itself, so a leaked hash (a
-- backup, a log) can't be used to join. Anything that isn't a token hashes to no invite.
create function private.invite_token_hash(p_token text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_token ~ '^[A-Za-z0-9_-]{32,128}$' then encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
  end
$$;

revoke all on function private.invite_token_hash(text) from public;

-- Joins the project of an unused, unexpired, unrevoked invite and marks it used, in one
-- transaction with the invite row locked, so a link can't be used twice. People only.
-- Returns the project id. Errors the API maps (SQLSTATE):
--   BLI01 invite not found      BLI02 expired      BLI03 already used
--   BLI04 revoked               BLI05 already a member of the project
--   42501 not signed in, or an agent token
create function public.accept_project_invite(token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_invite public.project_invite;
begin
  if v_user_id is null then
    raise exception 'Not signed in.' using errcode = '42501';
  end if;
  if not private.is_human() then
    raise exception 'Agents can''t accept invites.' using errcode = '42501';
  end if;

  select * into v_invite
  from public.project_invite i
  where i.token_hash = private.invite_token_hash(accept_project_invite.token)
  for update;

  -- An invite only works while its creator still manages the project (removing or demoting
  -- them revokes their invites too; this also covers anything that slipped past that).
  if v_invite.id is not null and v_invite.revoked_at is null and not exists (
    select 1 from public.project_member
    where project_id = v_invite.project_id and user_id = v_invite.created_by and role in ('owner', 'admin')
  ) then
    v_invite.revoked_at := now();
  end if;

  if v_invite.id is null then
    raise exception 'This invite link isn''t valid.' using errcode = 'BLI01';
  end if;
  if exists (
    select 1 from public.project_member
    where project_id = v_invite.project_id and user_id = v_user_id
  ) then
    raise exception 'You''re already a member of this project.' using errcode = 'BLI05';
  end if;
  if v_invite.revoked_at is not null then
    raise exception 'This invite was revoked.' using errcode = 'BLI04';
  end if;
  if v_invite.used_at is not null then
    raise exception 'This invite has already been used.' using errcode = 'BLI03';
  end if;
  if v_invite.expires_at <= now() then
    raise exception 'This invite has expired.' using errcode = 'BLI02';
  end if;

  update public.project_invite
  set used_at = now(), used_by = v_user_id
  where id = v_invite.id;

  insert into public.project_member (project_id, user_id, role)
  values (v_invite.project_id, v_user_id, v_invite.role);

  return v_invite.project_id;
end;
$$;

-- What the join page shows before accepting. Holding the token is what grants this, as it
-- would grant joining. No row if the invite doesn't exist. People only. Project and inviter
-- details only while the invite can still be used; otherwise just its state.
create function public.preview_project_invite(token text)
returns table (
  project_id uuid,
  project_name text,
  project_key text,
  inviter_name text,
  role public.project_role,
  expires_at timestamptz,
  state text,
  is_member boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in.' using errcode = '42501';
  end if;
  if not private.is_human() then
    raise exception 'Agents can''t view invites.' using errcode = '42501';
  end if;

  return query
  with invite as (
    select
      i.*,
      case
        when i.revoked_at is not null or not exists (
          select 1 from public.project_member m
          where m.project_id = i.project_id and m.user_id = i.created_by and m.role in ('owner', 'admin')
        ) then 'revoked'
        when i.used_at is not null then 'used'
        when i.expires_at <= now() then 'expired'
        else 'valid'
      end as state,
      exists (
        select 1 from public.project_member m
        where m.project_id = i.project_id and m.user_id = auth.uid()
      ) as is_member
    from public.project_invite i
    where i.token_hash = private.invite_token_hash(preview_project_invite.token)
  )
  select
    case when v.state = 'valid' or v.is_member then p.id end,
    case when v.state = 'valid' or v.is_member then p.name end,
    case when v.state = 'valid' or v.is_member then p.key end,
    case when v.state = 'valid' then coalesce(nullif(inviter.name, ''), '') end,
    case when v.state = 'valid' then v.role end,
    case when v.state = 'valid' then v.expires_at end,
    v.state,
    v.is_member
  from invite v
  join public.project p on p.id = v.project_id
  left join public.profile inviter on inviter.id = v.created_by;
end;
$$;

revoke all on function public.accept_project_invite(text) from public, anon;
grant execute on function public.accept_project_invite(text) to authenticated;
revoke all on function public.preview_project_invite(text) from public, anon;
grant execute on function public.preview_project_invite(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Grants and RLS for the new tables
-- ---------------------------------------------------------------------------

-- Rows are only created by the project trigger and accept_project_invite.
grant select, update (role), delete on public.project_member to authenticated;

-- token_hash is never readable by clients; invites are revoked, never deleted.
grant select (id, project_id, role, created_by, expires_at, used_at, used_by, revoked_at, created_at, updated_at),
  insert (project_id, token_hash, role, expires_at),
  update (revoked_at)
  on public.project_invite to authenticated;

alter table public.project_member enable row level security;
alter table public.project_invite enable row level security;

-- Members, agents included, see who else is in their projects.
create policy project_member_select on public.project_member
  for select to authenticated
  using (project_id in (select private.accessible_project_ids()));

-- No insert policy: joining goes through accept_project_invite.

-- Owners and admins switch others between admin and member. The owner row is never a
-- target and nobody is made owner (the trigger enforces it too).
create policy project_member_update on public.project_member
  for update to authenticated
  using (
    project_id in (select private.managed_project_ids())
    and role <> 'owner'
    and (select private.is_human())
  )
  with check (
    project_id in (select private.managed_project_ids())
    and role <> 'owner'
  );

-- Anyone but the owner can leave; owners and admins can remove anyone but the owner.
create policy project_member_delete on public.project_member
  for delete to authenticated
  using (
    role <> 'owner'
    and (select private.is_human())
    and (
      user_id = (select auth.uid())
      or project_id in (select private.managed_project_ids())
    )
  );

create policy project_invite_select on public.project_invite
  for select to authenticated
  using (project_id in (select private.managed_project_ids()) and (select private.is_human()));

create policy project_invite_insert on public.project_invite
  for insert to authenticated
  with check (project_id in (select private.managed_project_ids()) and (select private.is_human()));

create policy project_invite_update on public.project_invite
  for update to authenticated
  using (project_id in (select private.managed_project_ids()) and (select private.is_human()))
  with check (project_id in (select private.managed_project_ids()));

-- ---------------------------------------------------------------------------
-- Assignees: members of the task's project, or active agents owned by one
-- ---------------------------------------------------------------------------

-- Runs as the caller (from the task update trigger), who can read the project's members and
-- their agents through RLS; the insert trigger runs it as definer. Service-role writes see
-- everything, so the explicit project match holds for them too.
create or replace function private.check_task_assignee(task_row public.task, check_user boolean, check_agent boolean)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if check_user and task_row.assignee_user_id is not null and not exists (
    select 1 from public.project_member
    where project_id = task_row.project_id and user_id = task_row.assignee_user_id
  ) then
    raise exception 'assignee user is not a member of this project' using errcode = '23503';
  end if;

  if check_agent and task_row.assignee_agent_id is not null and not exists (
    select 1
    from public.agent a
    join public.project_member m on m.user_id = a.owner_user_id and m.project_id = task_row.project_id
    where a.id = task_row.assignee_agent_id and a.archived_at is null
  ) then
    raise exception 'assignee agent is not an active agent of a member of this project' using errcode = '23503';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Policies: from "project in my workspace" to "project I'm a member of"
-- ---------------------------------------------------------------------------

-- Workspace: your own, plus the workspaces owning projects you're in (name and handle for
-- display). Only your own can be changed (workspace_update is unchanged).
drop policy workspace_select on public.workspace;
create policy workspace_select on public.workspace
  for select to authenticated
  using (
    id = (select private.current_workspace_id())
    or id in (select private.accessible_workspace_ids())
  );

-- Profiles: your workspace's, plus everyone you share a project with.
drop policy profile_select on public.profile;
create policy profile_select on public.profile
  for select to authenticated
  using (
    workspace_id = (select private.current_workspace_id())
    or id in (select private.co_member_user_ids())
  );

-- Agents: your workspace's, plus those owned by people you share a project with (they can
-- be assignees, and they show as authors and actors). Managing stays owner-only.
drop policy agent_select on public.agent;
create policy agent_select on public.agent
  for select to authenticated
  using (
    workspace_id = (select private.current_workspace_id())
    or owner_user_id in (select private.co_member_user_ids())
  );

-- Projects: members read them; only the owner changes them. Creating one stays in your own
-- workspace (project_insert is unchanged).
drop policy project_select on public.project;
create policy project_select on public.project
  for select to authenticated
  using (
    id in (select private.accessible_project_ids())
    or (
      workspace_id = (select private.current_workspace_id())
      and private.project_has_no_members(id)
    )
  );

-- Owners and admins change project settings; the trigger below keeps the name and
-- description the owner's (the key can't change at all).
drop policy project_update on public.project;
create policy project_update on public.project
  for update to authenticated
  using (id in (select private.managed_project_ids()))
  with check (id in (select private.managed_project_ids()));

create function private.project_owner_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.name is distinct from old.name or new.description is distinct from old.description)
    and private.project_role(new.id) is distinct from 'owner'
  then
    raise exception 'Only the project owner can change its name or description.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Runs as the caller. auth.uid() is null for the service role, which skips the check.
create trigger project_owner_fields
  before update on public.project
  for each row
  when (auth.uid() is not null)
  execute function private.project_owner_fields();

-- Projects can't be deleted or archived by clients today (no grant, no archived_at). If that
-- is ever granted, it's the owner's, in a human session.
create policy project_delete on public.project
  for delete to authenticated
  using (id in (select private.owned_project_ids()) and (select private.is_human()));

drop policy epic_select on public.epic;
drop policy epic_insert on public.epic;
drop policy epic_update on public.epic;

create policy epic_select on public.epic
  for select to authenticated
  using (project_id in (select private.accessible_project_ids()));

create policy epic_insert on public.epic
  for insert to authenticated
  with check (project_id in (select private.accessible_project_ids()));

create policy epic_update on public.epic
  for update to authenticated
  using (project_id in (select private.accessible_project_ids()))
  with check (project_id in (select private.accessible_project_ids()));

drop policy task_select on public.task;
drop policy task_insert on public.task;
drop policy task_update on public.task;

create policy task_select on public.task
  for select to authenticated
  using (project_id in (select private.accessible_project_ids()));

create policy task_insert on public.task
  for insert to authenticated
  with check (project_id in (select private.accessible_project_ids()));

create policy task_update on public.task
  for update to authenticated
  using (project_id in (select private.accessible_project_ids()))
  with check (project_id in (select private.accessible_project_ids()));

drop policy label_select on public.label;
drop policy label_insert on public.label;
drop policy label_update on public.label;
drop policy label_delete on public.label;

create policy label_select on public.label
  for select to authenticated
  using (project_id in (select private.accessible_project_ids()));

create policy label_insert on public.label
  for insert to authenticated
  with check (project_id in (select private.accessible_project_ids()));

create policy label_update on public.label
  for update to authenticated
  using (project_id in (select private.accessible_project_ids()))
  with check (project_id in (select private.accessible_project_ids()));

create policy label_delete on public.label
  for delete to authenticated
  using (project_id in (select private.accessible_project_ids()));

drop policy task_label_select on public.task_label;
drop policy task_label_insert on public.task_label;
drop policy task_label_delete on public.task_label;

create policy task_label_select on public.task_label
  for select to authenticated
  using (project_id in (select private.accessible_project_ids()));

create policy task_label_insert on public.task_label
  for insert to authenticated
  with check (project_id in (select private.accessible_project_ids()));

create policy task_label_delete on public.task_label
  for delete to authenticated
  using (project_id in (select private.accessible_project_ids()));

drop policy board_column_select on public.board_column;
drop policy board_column_insert on public.board_column;
drop policy board_column_update on public.board_column;
drop policy board_column_delete on public.board_column;

create policy board_column_select on public.board_column
  for select to authenticated
  using (project_id in (select private.accessible_project_ids()));

-- Managing columns is for people; agents move tasks between them.
create policy board_column_insert on public.board_column
  for insert to authenticated
  with check (project_id in (select private.accessible_project_ids()) and (select private.is_human()));

create policy board_column_update on public.board_column
  for update to authenticated
  using (project_id in (select private.accessible_project_ids()) and (select private.is_human()))
  with check (project_id in (select private.accessible_project_ids()));

create policy board_column_delete on public.board_column
  for delete to authenticated
  using (project_id in (select private.accessible_project_ids()) and (select private.is_human()) and kind = 'custom');

drop policy comment_select on public.comment;
drop policy comment_insert on public.comment;
drop policy comment_update on public.comment;
drop policy comment_delete on public.comment;

create policy comment_select on public.comment
  for select to authenticated
  using (
    task_id in (
      select id from public.task where project_id in (select private.accessible_project_ids())
    )
  );

create policy comment_insert on public.comment
  for insert to authenticated
  with check (
    task_id in (
      select id from public.task where project_id in (select private.accessible_project_ids())
    )
    and (
      (author_agent_id = (select private.current_agent_id()) and author_user_id is null)
      or (author_user_id = (select auth.uid()) and author_agent_id is null and (select private.is_human()))
    )
  );

create policy comment_update on public.comment
  for update to authenticated
  using (
    task_id in (
      select id from public.task where project_id in (select private.accessible_project_ids())
    )
    and (
      author_agent_id = (select private.current_agent_id())
      or (author_user_id = (select auth.uid()) and (select private.is_human()))
    )
  )
  with check (
    task_id in (
      select id from public.task where project_id in (select private.accessible_project_ids())
    )
  );

create policy comment_delete on public.comment
  for delete to authenticated
  using (
    task_id in (
      select id from public.task where project_id in (select private.accessible_project_ids())
    )
    and (select private.is_human())
    and (
      author_user_id = (select auth.uid())
      -- Your own agents' comments, not those of other members' agents.
      or author_agent_id in (select id from public.agent where owner_user_id = (select auth.uid()))
    )
  );

-- storage.objects policies for attachments check for an attachment row the caller can see,
-- so they follow these without changes.
drop policy attachment_select on public.attachment;
drop policy attachment_insert on public.attachment;

create policy attachment_select on public.attachment
  for select to authenticated
  using (project_id in (select private.accessible_project_ids()));

create policy attachment_insert on public.attachment
  for insert to authenticated
  with check (
    project_id in (select private.accessible_project_ids())
    and (
      (uploader_agent_id = (select private.current_agent_id()) and uploader_user_id is null)
      or (uploader_user_id = (select auth.uid()) and uploader_agent_id is null and (select private.is_human()))
    )
  );

-- Every entry type (project, epic, task, label, board_column) has a project; workspace_id
-- stays the project's workspace. An entry without a project (none are written today) keeps
-- the old workspace rule. Realtime applies this policy to activity_log events, so members
-- of a shared project hear about its changes.
drop policy activity_log_select on public.activity_log;
create policy activity_log_select on public.activity_log
  for select to authenticated
  using (
    project_id in (select private.accessible_project_ids())
    or (project_id is null and workspace_id = (select private.current_workspace_id()))
  );

-- ---------------------------------------------------------------------------
-- Workspace handle
-- ---------------------------------------------------------------------------

-- Names that would clash with app routes or look official.
create function private.is_reserved_handle(p_handle text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select lower(p_handle) = any (array[
    'about', 'account', 'admin', 'agents', 'api', 'app', 'assets', 'auth', 'billing', 'blog',
    'botlog', 'dashboard', 'docs', 'help', 'invite', 'invites', 'join', 'login', 'logout',
    'mail', 'mcp', 'me', 'new', 'null', 'projects', 'root', 'settings', 'sign-in', 'sign-up',
    'signin', 'signup', 'static', 'status', 'support', 'system', 'tasks', 'undefined', 'www'
  ])
$$;

-- A handle from an email's local part: lowercase, anything but a-z and 0-9 becomes '-',
-- runs of '-' collapse and none at either end, at most 30 characters, at least 2.
create function private.handle_from_email(p_email text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := lower(split_part(coalesce(p_email, ''), '@', 1));
begin
  v := regexp_replace(v, '[^a-z0-9]+', '-', 'g');
  v := btrim(v, '-');
  v := rtrim(left(v, 30), '-');
  if char_length(v) = 0 then
    v := 'user';
  elsif char_length(v) = 1 then
    v := v || '-user';
  end if;
  return v;
end;
$$;

-- The first free, unreserved handle: the base, then base2, base3, ... (shortened to fit).
create function private.unique_workspace_handle(p_base text)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_candidate text := p_base;
  v_n integer := 1;
  v_suffix text;
begin
  loop
    if not private.is_reserved_handle(v_candidate)
      and not exists (select 1 from public.workspace where lower(handle) = v_candidate)
    then
      return v_candidate;
    end if;
    v_n := v_n + 1;
    v_suffix := v_n::text;
    v_candidate := rtrim(left(p_base, 30 - char_length(v_suffix)), '-') || v_suffix;
  end loop;
end;
$$;

alter table public.workspace add column handle text;

-- Backfill, oldest workspace first, from its earliest profile's email.
do $$
declare
  r record;
begin
  for r in
    select w.id,
      (select p.email from public.profile p where p.workspace_id = w.id order by p.created_at, p.id limit 1) as email
    from public.workspace w
    order by w.created_at, w.id
  loop
    update public.workspace
    set handle = private.unique_workspace_handle(private.handle_from_email(r.email))
    where id = r.id;
  end loop;
end;
$$;

alter table public.workspace
  alter column handle set not null,
  add constraint workspace_handle_format check (handle ~ '^[a-z0-9][a-z0-9-]{0,28}[a-z0-9]$'),
  add constraint workspace_handle_not_reserved check (not private.is_reserved_handle(handle));

create unique index workspace_handle_idx on public.workspace (lower(handle));

-- The check constraint calls it as whoever writes the workspace.
revoke all on function
  private.is_reserved_handle(text),
  private.handle_from_email(text),
  private.unique_workspace_handle(text)
from public;
grant execute on function private.is_reserved_handle(text) to authenticated, service_role;

-- People rename their own workspace's handle (workspace_update is human-only).
grant update (handle) on public.workspace to authenticated;

-- New users: as before, plus a handle. A concurrent sign-up can take the same handle between
-- picking and inserting; then pick again.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_workspace_id uuid;
  v_base text := private.handle_from_email(new.email);
  v_attempt integer := 0;
begin
  loop
    v_attempt := v_attempt + 1;
    begin
      insert into public.workspace (name, handle)
      values ('My workspace', private.unique_workspace_handle(v_base))
      returning id into new_workspace_id;
      exit;
    exception when unique_violation then
      if v_attempt >= 5 then
        raise;
      end if;
    end;
  end loop;

  insert into public.profile (id, workspace_id, email, name)
  values (
    new.id,
    new_workspace_id,
    new.email,
    left(coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), split_part(new.email, '@', 1), ''), 100)
  );

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Profile columns: co-members read only each other's name and email
-- ---------------------------------------------------------------------------

-- profile_select now reaches people in other workspaces, and grants are per column, not per
-- row. So clients read only id, email, name and timestamps from the table; the caller's own
-- preferences come from my_profile().
revoke select on public.profile from authenticated;
grant select (id, email, name, created_at, updated_at) on public.profile to authenticated;

-- The caller's own profile, preferences included. People only (agents have no profile view).
create function public.my_profile()
returns table (
  id uuid,
  email text,
  name text,
  theme text,
  open_task_after_create boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.email, p.name, p.theme, p.open_task_after_create, p.created_at, p.updated_at
  from public.profile p
  where p.id = (select auth.uid()) and (select private.is_human())
$$;

revoke all on function public.my_profile() from public;
grant execute on function public.my_profile() to authenticated;
