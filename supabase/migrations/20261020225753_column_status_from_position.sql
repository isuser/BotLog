-- A custom column's status now follows where it sits instead of being picked: before In
-- progress it counts as To do, from In progress on (up to Done) as In progress. Hidden
-- columns keep their place, so this holds while In progress is hidden too. Moving a column
-- across In progress, or moving In progress itself, changes the status of the tasks in the
-- columns that crossed (board_column_after_update already does that for counts_as).

create or replace function private.board_column_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_first text;
  v_last text;
  v_in_progress text;
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

    -- Locked, so In progress can't move while a column is placed against it (a concurrent
    -- move's re-sort wouldn't see a column that isn't committed yet).
    select position into v_in_progress
    from public.board_column
    where project_id = new.project_id and kind = 'in_progress' and id <> new.id
    for share;
    if new.kind = 'in_progress' then
      if exists (
        select 1 from public.board_column
        where project_id = new.project_id and kind = 'custom' and position = new.position
      ) then
        raise exception 'Two columns can''t share a place.' using errcode = '22023';
      end if;
    elsif new.position = v_in_progress then
      raise exception 'Two columns can''t share a place.' using errcode = '22023';
    end if;

    if new.kind = 'custom' then
      new.counts_as := case when v_in_progress is not null and new.position < v_in_progress then 'todo' else 'in_progress' end;
    end if;
  end if;

  return new;
end;
$$;

-- When In progress moves, the custom columns it passed change status: rewriting their
-- position (to itself) runs the trigger above again, and board_column_after_update then
-- updates their tasks. Only those whose status changes are touched.
create or replace function private.board_column_after_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.counts_as is distinct from old.counts_as then
    update public.task set status = new.counts_as where column_id = new.id;
  end if;
  if new.kind = 'in_progress' and new.position is distinct from old.position then
    update public.board_column c
    set position = c.position
    where c.project_id = new.project_id
      and c.kind = 'custom'
      and c.counts_as is distinct from
        (case when c.position < new.position then 'todo' else 'in_progress' end)::public.task_status;
  end if;
  return null;
end;
$$;

-- Clients no longer choose it.
revoke insert (counts_as), update (counts_as) on public.board_column from authenticated;

-- Existing custom columns follow the new rule right away. Only those whose status changes
-- are rewritten (none on the shared database when this was written, Oct 21); their tasks'
-- status would follow, logged as moves by "system".
update public.board_column c
set position = c.position
from public.board_column ip
where c.kind = 'custom'
  and ip.project_id = c.project_id
  and ip.kind = 'in_progress'
  and c.counts_as is distinct from
    (case when c.position < ip.position then 'todo' else 'in_progress' end)::public.task_status;
