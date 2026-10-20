-- Custom board columns, per project.
--
-- Every project has four built-in columns, one per status: Backlog (first, on its own tab),
-- To do, In progress and Done (always last). To do and In progress can be hidden while
-- they're empty, never deleted. People add their own columns between Backlog and Done; each
-- counts as To do or In progress.
--
-- A task's column (column_id) is where it sits; its status is always the status its column
-- counts as, set by a trigger. So everything built on status (the Done window, epic progress,
-- counts, My tasks, agents moving tasks by status) keeps working. Writing only a status moves
-- the task to that status's column (see column_for_status).

create type public.board_column_kind as enum ('backlog', 'todo', 'in_progress', 'done', 'custom');

create table public.board_column (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.project (id) on delete cascade,
  kind public.board_column_kind not null default 'custom',
  name text not null check (char_length(name) between 1 and 50),
  -- The status of the tasks in this column.
  counts_as public.task_status not null default 'in_progress',
  -- Fractional index (base62), like task.position: the column's place on the board.
  position text collate "C" not null check (position ~ '^[0-9A-Za-z]+$'),
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Lets task reference (column_id, project_id) so a task's column is always in its project.
  unique (id, project_id),
  constraint board_column_counts_as check (
    (kind = 'custom' and counts_as in ('todo', 'in_progress'))
    or (kind <> 'custom' and counts_as::text = kind::text)
  ),
  constraint board_column_hidden check (not hidden or kind in ('todo', 'in_progress'))
);

create unique index board_column_builtin_idx on public.board_column (project_id, kind) where kind <> 'custom';
create unique index board_column_name_idx on public.board_column (project_id, lower(name));
create index board_column_project_idx on public.board_column (project_id, position);

create trigger set_updated_at before update on public.board_column
  for each row execute function private.set_updated_at();

-- Keeps the built-ins fixed and every other column between Backlog and Done.
create function private.board_column_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_first text;
  v_last text;
begin
  if tg_op = 'UPDATE' then
    if new.project_id is distinct from old.project_id or new.kind is distinct from old.kind then
      raise exception 'A column can''t change project or kind.' using errcode = '22023';
    end if;
    if old.kind <> 'custom' and (new.name is distinct from old.name or new.counts_as is distinct from old.counts_as) then
      raise exception 'Built-in columns keep their name and status.' using errcode = '22023';
    end if;
    if old.kind in ('backlog', 'done') and new.position is distinct from old.position then
      raise exception 'Backlog and Done stay first and last.' using errcode = '22023';
    end if;
    if new.hidden and not old.hidden and exists (
      select 1 from public.task where column_id = new.id and archived_at is null
    ) then
      raise exception 'Only an empty column can be hidden. Move its tasks first.' using errcode = '22023';
    end if;
  end if;

  if new.kind not in ('backlog', 'done') then
    select
      min(position) filter (where kind = 'backlog'),
      min(position) filter (where kind = 'done')
    into v_first, v_last
    from public.board_column
    where project_id = new.project_id;
    -- Null while a project's built-ins are being created.
    if (v_first is not null and new.position <= v_first) or (v_last is not null and new.position >= v_last) then
      raise exception 'Columns go between Backlog and Done.' using errcode = '22023';
    end if;
  end if;

  return new;
end;
$$;

create trigger board_column_before_write
  before insert or update on public.board_column
  for each row execute function private.board_column_before_write();

-- Changing what a custom column counts as changes its tasks' status too.
create function private.board_column_after_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.counts_as is distinct from old.counts_as then
    update public.task set status = new.counts_as where column_id = new.id;
  end if;
  return null;
end;
$$;

create trigger board_column_after_update
  after update on public.board_column
  for each row execute function private.board_column_after_update();

-- The built-in columns of a project. Security definer: clients can't set kind.
create function private.create_builtin_columns(p_project_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.board_column (project_id, kind, name, counts_as, position)
  values
    (p_project_id, 'backlog', 'Backlog', 'backlog', 'a0'),
    (p_project_id, 'todo', 'To do', 'todo', 'a1'),
    (p_project_id, 'in_progress', 'In progress', 'in_progress', 'a2'),
    (p_project_id, 'done', 'Done', 'done', 'a3')
$$;

-- Security definer too: it runs as whoever creates the project, who can't call the above.
create function private.project_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.create_builtin_columns(new.id);
  return null;
end;
$$;

create trigger project_after_insert
  after insert on public.project
  for each row execute function private.project_after_insert();

select private.create_builtin_columns(id) from public.project;

-- ---------------------------------------------------------------------------
-- Tasks live in a column
-- ---------------------------------------------------------------------------

alter table public.task add column column_id uuid;

-- Existing tasks go to their status's built-in column. Without the update triggers, so
-- versions don't change and nothing is logged. `supabase db push` runs this file in one
-- transaction, so a failure can't leave them disabled; apply it the same way (e.g. psql
-- --single-transaction) if applying by hand. Open boards get one realtime task update per
-- task when it commits; they batch refetches, so that's harmless.
alter table public.task disable trigger task_before_update;
alter table public.task disable trigger set_updated_at;
alter table public.task disable trigger log_activity;

update public.task t
set column_id = c.id
from public.board_column c
where c.project_id = t.project_id and c.kind::text = t.status::text;

alter table public.task enable trigger task_before_update;
alter table public.task enable trigger set_updated_at;
alter table public.task enable trigger log_activity;

alter table public.task
  alter column column_id set not null,
  add constraint task_column_fkey foreign key (column_id, project_id)
    references public.board_column (id, project_id);

create index task_column_idx on public.task (column_id, position) where archived_at is null;

-- The column a task with this status goes to when no column is given: the status's
-- built-in column, or if that's hidden, the first visible custom column counting as that
-- status, or else the hidden built-in after all (which then shows while it has tasks).
create function public.column_for_status(p_project_id uuid, p_status public.task_status)
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select id
  from public.board_column
  where project_id = p_project_id and counts_as = p_status
  order by (kind::text = p_status::text and not hidden) desc, hidden, position
  limit 1
$$;

-- Keeps status and column in step. A new column sets the status; a new status alone (from
-- a client that only knows statuses) picks that status's column. Named to run before
-- task_set_done_at, which reads the status.
create function private.task_apply_column()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_counts_as public.task_status;
begin
  if tg_op = 'INSERT' then
    if new.column_id is null then
      new.column_id := public.column_for_status(new.project_id, new.status);
    end if;
  elsif new.column_id is not distinct from old.column_id and new.status is distinct from old.status then
    select counts_as into v_counts_as from public.board_column where id = new.column_id;
    -- Unless the column itself now counts as the new status (its counts_as changed).
    if v_counts_as is distinct from new.status then
      new.column_id := public.column_for_status(new.project_id, new.status);
    end if;
  end if;

  select counts_as into v_counts_as
  from public.board_column
  where id = new.column_id and project_id = new.project_id;
  if v_counts_as is null then
    raise exception 'column not found' using errcode = '23503';
  end if;
  new.status := v_counts_as;
  return new;
end;
$$;

create trigger task_apply_column
  before insert or update on public.task
  for each row execute function private.task_apply_column();

-- Moving to another column is a move, like changing status; reordering inside one isn't logged.
create or replace function private.log_entity_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project_id uuid;
  v_changes jsonb;
  v_fields text[];
  v_action text;
begin
  if tg_table_name = 'project' then
    v_project_id := new.id;
  else
    v_project_id := new.project_id;
  end if;

  if tg_op = 'INSERT' then
    perform private.write_activity(
      v_project_id, tg_table_name, new.id, 'created',
      to_jsonb(new) - private.activity_noise_fields()
    );
    return null;
  end if;

  select
    coalesce(jsonb_object_agg(n.key, jsonb_build_object('from', o.value, 'to', n.value)), '{}'),
    coalesce(array_agg(n.key), '{}')
  into v_changes, v_fields
  from jsonb_each(to_jsonb(new)) n
  join jsonb_each(to_jsonb(old)) o using (key)
  where n.value is distinct from o.value
    and not (n.key = any (private.activity_noise_fields()));

  -- Nothing worth logging, e.g. only task_counter or updated_at changed.
  if v_fields = '{}' then
    return null;
  end if;

  if 'archived_at' = any (v_fields) then
    v_action := case when new.archived_at is null then 'restored' else 'archived' end;
  elsif tg_table_name = 'task' and v_fields <@ array['status', 'position', 'column_id'] then
    -- Reordering inside a column is not worth an entry; changing column is a move.
    if not ('status' = any (v_fields) or 'column_id' = any (v_fields)) then
      return null;
    end if;
    v_action := 'moved';
  else
    v_action := 'updated';
  end if;

  perform private.write_activity(v_project_id, tg_table_name, new.id, v_action, v_changes);
  return null;
end;
$$;

-- Deletes a custom column, moving its tasks (archived ones too) to another column of the
-- project first, in one transaction. Runs as the caller, so RLS applies.
create function public.delete_board_column(p_column_id uuid, p_move_to uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_column public.board_column;
begin
  select * into v_column from public.board_column where id = p_column_id;
  if v_column.id is null then
    raise exception 'column not found' using errcode = '23503';
  end if;
  if v_column.kind <> 'custom' then
    raise exception 'Built-in columns can''t be deleted. To do and In progress can be hidden.' using errcode = '22023';
  end if;
  if p_move_to is null or p_move_to = p_column_id or not exists (
    select 1 from public.board_column where id = p_move_to and project_id = v_column.project_id
  ) then
    raise exception 'move_to must be another column in this project.' using errcode = '22023';
  end if;
  if exists (select 1 from public.board_column where id = p_move_to and hidden) then
    raise exception 'move_to is hidden. Show it first, or move the tasks to a visible column.' using errcode = '22023';
  end if;

  update public.task set column_id = p_move_to where column_id = p_column_id;
  delete from public.board_column where id = p_column_id;
  if not found then
    raise exception 'You don''t have access to do this.' using errcode = '42501';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------

revoke all on function
  private.board_column_before_write(),
  private.board_column_after_update(),
  private.create_builtin_columns(uuid),
  private.project_after_insert(),
  private.task_apply_column()
from public;

revoke all on function public.column_for_status(uuid, public.task_status) from public, anon;
grant execute on function public.column_for_status(uuid, public.task_status) to authenticated, service_role;
revoke all on function public.delete_board_column(uuid, uuid) from public, anon;
grant execute on function public.delete_board_column(uuid, uuid) to authenticated;

-- kind is never granted: only built-ins have one, and the trigger creates them.
grant select, insert (project_id, name, counts_as, position), update (name, counts_as, position, hidden), delete
  on public.board_column to authenticated;
grant insert (column_id), update (column_id) on public.task to authenticated;

alter table public.board_column enable row level security;

create policy board_column_select on public.board_column
  for select to authenticated
  using (project_id in (select private.workspace_project_ids()));

-- Managing columns is for people; agents move tasks between them.
create policy board_column_insert on public.board_column
  for insert to authenticated
  with check (project_id in (select private.workspace_project_ids()) and (select private.is_human()));

create policy board_column_update on public.board_column
  for update to authenticated
  using (project_id in (select private.workspace_project_ids()) and (select private.is_human()))
  with check (project_id in (select private.workspace_project_ids()));

create policy board_column_delete on public.board_column
  for delete to authenticated
  using (project_id in (select private.workspace_project_ids()) and (select private.is_human()) and kind = 'custom');

-- ---------------------------------------------------------------------------
-- Activity: column changes are logged on the project's activity, which also tells open
-- boards about them through realtime. board_column itself isn't published: Realtime
-- doesn't apply RLS to delete events, which would leak column ids to other workspaces.
-- ---------------------------------------------------------------------------

alter table public.activity_log drop constraint activity_log_entity_type_check;
alter table public.activity_log add constraint activity_log_entity_type_check
  check (entity_type in ('project', 'epic', 'task', 'label', 'board_column'));

create trigger log_activity after insert or update on public.board_column
  for each row execute function private.log_entity_change();

-- Deleting a column is logged too. When a whole project is deleted, write_activity finds no
-- project and writes nothing.
create function private.log_board_column_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.write_activity(
    old.project_id, 'board_column', old.id, 'deleted', jsonb_build_object('name', old.name)
  );
  return null;
end;
$$;

revoke all on function private.log_board_column_delete() from public;

create trigger log_activity_delete after delete on public.board_column
  for each row execute function private.log_board_column_delete();
