-- The Done window: the board shows Done tasks only for a few days after they were finished,
-- so the Done column doesn't grow forever. Older ones stay Done and show everywhere else.

-- When the task last moved to Done; null while it isn't Done. Set by the trigger below,
-- never by clients (not granted).
alter table public.task add column done_at timestamptz;

-- How many days a finished task stays on the board.
alter table public.project
  add column done_window_days smallint not null default 14 check (done_window_days between 1 and 365);

grant update (done_window_days) on public.project to authenticated;

create function private.task_set_done_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status <> 'done' then
    new.done_at := null;
  elsif tg_op = 'INSERT' or old.status <> 'done' then
    new.done_at := now();
  else
    new.done_at := old.done_at;
  end if;
  return new;
end;
$$;

revoke all on function private.task_set_done_at() from public;

create trigger task_set_done_at
  before insert or update on public.task
  for each row execute function private.task_set_done_at();

-- done_at follows status, which is already logged; leaving it out keeps a move a "moved" entry.
create or replace function private.activity_noise_fields()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['id', 'created_at', 'updated_at', 'version', 'task_counter', 'number', 'workspace_id',
               'project_id', 'done_at']
$$;

-- Backfill tasks already in Done: when they were last moved there, or their last change.
-- Without the update triggers, so versions don't change and nothing is logged.
-- `supabase db push` runs this file in one transaction, so a failure can't leave them disabled;
-- apply it the same way (e.g. psql --single-transaction) if applying by hand.
alter table public.task disable trigger task_before_update;
alter table public.task disable trigger set_updated_at;
alter table public.task disable trigger log_activity;
alter table public.task disable trigger task_set_done_at;

update public.task t
set done_at = coalesce(
  (select max(a.created_at)
   from public.activity_log a
   where a.entity_type = 'task' and a.entity_id = t.id and a.changes -> 'status' ->> 'to' = 'done'),
  t.updated_at
)
where t.status = 'done';

alter table public.task enable trigger task_before_update;
alter table public.task enable trigger set_updated_at;
alter table public.task enable trigger log_activity;
alter table public.task enable trigger task_set_done_at;
