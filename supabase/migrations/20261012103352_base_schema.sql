-- Botlog base schema: tables, constraints, indexes and triggers.
-- RLS policies and grants are in the next migration; the activity log in the one after.
--
-- Agent requests: the API verifies the agent's API key, then signs a short-lived token for the
-- agent's owner with two extra top-level claims, `agent_id` and `api_key_id`. auth.uid() is the
-- owner, so the owner's RLS applies; the claims identify the agent. Never read these from
-- user_metadata, which users can change themselves.

create schema if not exists private;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.task_status as enum ('backlog', 'todo', 'in_progress', 'done');
create type public.task_priority as enum ('none', 'low', 'medium', 'high', 'urgent');
create type public.task_type as enum ('feature', 'bug', 'improvement');
create type public.epic_status as enum ('planned', 'in_progress', 'done', 'canceled');

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Agent behind the current request, from the token signed by the API. Null for humans.
create function private.current_agent_id()
returns uuid
language sql
stable
set search_path = ''
as $$
  select nullif(auth.jwt() ->> 'agent_id', '')::uuid
$$;

-- API key behind the current request. Null for humans.
create function private.current_api_key_id()
returns uuid
language sql
stable
set search_path = ''
as $$
  select nullif(auth.jwt() ->> 'api_key_id', '')::uuid
$$;

-- ---------------------------------------------------------------------------
-- Workspace and profile
-- ---------------------------------------------------------------------------

create table public.workspace (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profile (
  id uuid primary key references auth.users (id) on delete cascade,
  workspace_id uuid not null references public.workspace (id) on delete cascade,
  email text not null,
  name text not null default '' check (char_length(name) <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profile_workspace_id_idx on public.profile (workspace_id);

-- Workspace of the signed-in user (or of the agent's owner). Security definer so RLS
-- policies on other tables can call it without recursing into profile's own policies.
create function private.current_workspace_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select workspace_id from public.profile where id = (select auth.uid())
$$;

-- Each new auth user gets their own workspace and profile.
create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_workspace_id uuid;
begin
  insert into public.workspace (name)
  values ('My workspace')
  returning id into new_workspace_id;

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

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

create function private.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profile set email = new.email where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function private.handle_user_email_change();

-- ---------------------------------------------------------------------------
-- Agent
-- ---------------------------------------------------------------------------

-- Agents are archived instead of deleted, so their comments and activity stay traceable.
create table public.agent (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null default private.current_workspace_id()
    references public.workspace (id) on delete cascade,
  owner_user_id uuid not null default auth.uid()
    references public.profile (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  description text not null default '' check (char_length(description) <= 2000),
  avatar text check (char_length(avatar) <= 500),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, workspace_id)
);

create index agent_workspace_id_idx on public.agent (workspace_id);
create index agent_owner_user_id_idx on public.agent (owner_user_id);

-- ---------------------------------------------------------------------------
-- Project
-- ---------------------------------------------------------------------------

create table public.project (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null default private.current_workspace_id()
    references public.workspace (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  -- Short ID prefix, e.g. BOT in BOT-42. Set at creation and never changed.
  key text not null check (key ~ '^[A-Z][A-Z0-9]{1,9}$'),
  description text not null default '' check (char_length(description) <= 10000),
  -- Last task number handed out. Numbers are never reused.
  task_counter integer not null default 0 check (task_counter >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, key)
);

create function private.project_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.key is distinct from old.key then
    raise exception 'project key cannot be changed' using errcode = '22023';
  end if;
  if new.workspace_id is distinct from old.workspace_id then
    raise exception 'project workspace cannot be changed' using errcode = '22023';
  end if;
  if new.task_counter < old.task_counter then
    raise exception 'task_counter cannot go down' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger project_before_update
  before update on public.project
  for each row execute function private.project_before_update();

-- ---------------------------------------------------------------------------
-- Epic
-- ---------------------------------------------------------------------------

create table public.epic (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.project (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 500),
  description text not null default '' check (char_length(description) <= 100000),
  status public.epic_status not null default 'planned',
  target_date date,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Lets task reference (epic_id, project_id) so a task's epic is always in the same project.
  unique (id, project_id)
);

create index epic_project_id_idx on public.epic (project_id);

-- ---------------------------------------------------------------------------
-- Task
-- ---------------------------------------------------------------------------

create table public.task (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.project (id) on delete cascade,
  -- Set from project.task_counter on insert.
  number integer not null check (number > 0),
  epic_id uuid,
  title text not null check (char_length(title) between 1 and 500),
  description text not null default '' check (char_length(description) <= 100000),
  type public.task_type not null default 'feature',
  status public.task_status not null default 'backlog',
  -- Fractional index (base62 string) for order inside a column. "C" collation keeps
  -- byte order, so a move only rewrites the moved task.
  position text collate "C" not null check (position ~ '^[0-9A-Za-z]+$'),
  priority public.task_priority not null default 'none',
  assignee_user_id uuid references public.profile (id) on delete set null,
  assignee_agent_id uuid references public.agent (id) on delete set null,
  due_date date,
  -- Goes up on every change; updates must match the version they read (409 otherwise).
  version integer not null default 1,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, number),
  unique (id, project_id),
  foreign key (epic_id, project_id)
    references public.epic (id, project_id) on delete set null (epic_id),
  constraint task_single_assignee check (num_nonnulls(assignee_user_id, assignee_agent_id) <= 1)
);

create index task_board_idx on public.task (project_id, status, position) where archived_at is null;
create index task_epic_id_idx on public.task (epic_id);
create index task_assignee_user_id_idx on public.task (assignee_user_id) where archived_at is null;
create index task_assignee_agent_id_idx on public.task (assignee_agent_id) where archived_at is null;

-- Assignees must belong to the task's workspace; new agent assignees must not be archived.
-- Compares workspaces explicitly so it also holds for service-role writes, which bypass RLS.
create function private.check_task_assignee(task_row public.task, check_user boolean, check_agent boolean)
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  ws uuid;
begin
  select workspace_id into ws from public.project where id = task_row.project_id;

  if check_user and task_row.assignee_user_id is not null and not exists (
    select 1 from public.profile
    where id = task_row.assignee_user_id and workspace_id = ws
  ) then
    raise exception 'assignee user is not in this workspace' using errcode = '23503';
  end if;

  if check_agent and task_row.assignee_agent_id is not null and not exists (
    select 1 from public.agent
    where id = task_row.assignee_agent_id and workspace_id = ws and archived_at is null
  ) then
    raise exception 'assignee agent is not an active agent in this workspace' using errcode = '23503';
  end if;
end;
$$;

-- Hands out the next short ID number. Security definer because clients cannot write
-- project.task_counter; if RLS then rejects the task, the whole insert rolls back.
create function private.task_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.project
  set task_counter = task_counter + 1
  where id = new.project_id
  returning task_counter into new.number;

  if new.number is null then
    raise exception 'project not found' using errcode = '23503';
  end if;

  new.version := 1;
  perform private.check_task_assignee(new, true, true);
  return new;
end;
$$;

create trigger task_before_insert
  before insert on public.task
  for each row execute function private.task_before_insert();

create function private.task_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.project_id is distinct from old.project_id then
    raise exception 'tasks cannot move between projects' using errcode = '22023';
  end if;
  if new.number is distinct from old.number then
    raise exception 'task number cannot be changed' using errcode = '22023';
  end if;

  new.version := old.version + 1;
  perform private.check_task_assignee(
    new,
    new.assignee_user_id is distinct from old.assignee_user_id,
    new.assignee_agent_id is distinct from old.assignee_agent_id
  );
  return new;
end;
$$;

create trigger task_before_update
  before update on public.task
  for each row execute function private.task_before_update();

-- ---------------------------------------------------------------------------
-- Labels
-- ---------------------------------------------------------------------------

create table public.label (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.project (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 50),
  color text not null default '#6b7280' check (color ~ '^#[0-9a-fA-F]{6}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, project_id)
);

create unique index label_project_name_idx on public.label (project_id, lower(name));

-- project_id is filled from the task, and the composite keys make sure the label belongs
-- to the same project as the task.
create table public.task_label (
  task_id uuid not null,
  label_id uuid not null,
  project_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (task_id, label_id),
  foreign key (task_id, project_id) references public.task (id, project_id) on delete cascade,
  foreign key (label_id, project_id) references public.label (id, project_id) on delete cascade
);

create index task_label_label_id_idx on public.task_label (label_id);

create function private.task_label_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  select project_id into new.project_id from public.task where id = new.task_id;
  if new.project_id is null then
    raise exception 'task not found' using errcode = '23503';
  end if;
  return new;
end;
$$;

create trigger task_label_before_insert
  before insert on public.task_label
  for each row execute function private.task_label_before_insert();

-- ---------------------------------------------------------------------------
-- Comments
-- ---------------------------------------------------------------------------

create table public.comment (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.task (id) on delete cascade,
  author_user_id uuid references public.profile (id) on delete set null,
  author_agent_id uuid references public.agent (id) on delete set null,
  body text not null check (char_length(body) between 1 and 20000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- At most one author; can become zero if the author is deleted.
  constraint comment_single_author check (num_nonnulls(author_user_id, author_agent_id) <= 1)
);

create index comment_task_id_idx on public.comment (task_id, created_at);

-- The author always comes from the request's identity, never from the client.
create function private.comment_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.current_agent_id() is not null then
    new.author_agent_id := private.current_agent_id();
    new.author_user_id := null;
  elsif auth.uid() is not null then
    new.author_user_id := auth.uid();
    new.author_agent_id := null;
  end if;

  if num_nonnulls(new.author_user_id, new.author_agent_id) <> 1 then
    raise exception 'comment needs exactly one author' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger comment_before_insert
  before insert on public.comment
  for each row execute function private.comment_before_insert();

-- ---------------------------------------------------------------------------
-- API keys
-- ---------------------------------------------------------------------------

-- The key itself is shown once and only its SHA-256 hash is stored. prefix is the first
-- few characters, so users can tell keys apart.
create table public.api_key (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null default private.current_workspace_id(),
  agent_id uuid not null,
  name text not null check (char_length(name) between 1 and 100),
  prefix text not null check (char_length(prefix) between 4 and 32),
  hash text not null unique check (hash ~ '^[0-9a-f]{64}$'),
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (agent_id, workspace_id) references public.agent (id, workspace_id) on delete cascade
);

create index api_key_agent_id_idx on public.api_key (agent_id);

create function private.api_key_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at then
    raise exception 'a revoked key cannot be restored' using errcode = '22023';
  end if;
  if new.hash is distinct from old.hash or new.agent_id is distinct from old.agent_id then
    raise exception 'api key hash and agent cannot be changed' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger api_key_before_update
  before update on public.api_key
  for each row execute function private.api_key_before_update();

-- ---------------------------------------------------------------------------
-- updated_at on every table
-- ---------------------------------------------------------------------------

create trigger set_updated_at before update on public.workspace
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.profile
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.agent
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.project
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.epic
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.task
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.label
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.task_label
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.comment
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.api_key
  for each row execute function private.set_updated_at();
