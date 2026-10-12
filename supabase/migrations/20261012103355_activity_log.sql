-- Activity log, written by triggers so every change is recorded no matter which client
-- made it. AI changes also store the agent and API key from the request token.

create type public.actor_type as enum ('human', 'ai', 'system');

create table public.activity_log (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id) on delete cascade,
  project_id uuid references public.project (id) on delete cascade,
  entity_type text not null check (entity_type in ('project', 'epic', 'task', 'label')),
  entity_id uuid not null,
  actor_type public.actor_type not null,
  -- For AI changes this is the agent's owner.
  user_id uuid references public.profile (id) on delete set null,
  agent_id uuid references public.agent (id) on delete set null,
  api_key_id uuid references public.api_key (id) on delete set null,
  -- created, updated, moved, archived, restored, commented, label_added, label_removed
  action text not null,
  -- created: the new values. updated/moved/archived/restored: { field: { from, to } }.
  -- commented / label_*: the comment or label id.
  changes jsonb not null default '{}',
  -- clock_timestamp keeps entries from one transaction in order (now() is fixed per transaction).
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default now()
);

create index activity_log_entity_idx on public.activity_log (entity_type, entity_id, created_at desc);
create index activity_log_project_idx on public.activity_log (project_id, created_at desc);

create trigger set_updated_at before update on public.activity_log
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Writing entries
-- ---------------------------------------------------------------------------

create function private.write_activity(
  p_project_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_action text,
  p_changes jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_agent_id uuid := private.current_agent_id();
  v_user_id uuid := auth.uid();
begin
  insert into public.activity_log (
    workspace_id, project_id, entity_type, entity_id, actor_type,
    user_id, agent_id, api_key_id, action, changes
  )
  select
    p.workspace_id, p.id, p_entity_type, p_entity_id,
    case
      when v_agent_id is not null then 'ai'::public.actor_type
      when v_user_id is not null then 'human'::public.actor_type
      else 'system'::public.actor_type
    end,
    v_user_id, v_agent_id, private.current_api_key_id(), p_action, p_changes
  from public.project p
  where p.id = p_project_id;
end;
$$;

-- Fields that change on their own and would only add noise.
create function private.activity_noise_fields()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['id', 'created_at', 'updated_at', 'version', 'task_counter', 'number', 'workspace_id', 'project_id']
$$;

-- Logs inserts and updates of project, epic, task and label.
create function private.log_entity_change()
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
  elsif tg_table_name = 'task' and v_fields <@ array['status', 'position'] then
    -- Reordering inside a column is not worth an entry; changing column is a move.
    if not ('status' = any (v_fields)) then
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

create trigger log_activity after insert or update on public.project
  for each row execute function private.log_entity_change();
create trigger log_activity after insert or update on public.epic
  for each row execute function private.log_entity_change();
create trigger log_activity after insert or update on public.task
  for each row execute function private.log_entity_change();
create trigger log_activity after insert or update on public.label
  for each row execute function private.log_entity_change();

-- Comments are logged on their task.
create function private.log_comment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project_id uuid;
begin
  select project_id into v_project_id from public.task where id = new.task_id;
  perform private.write_activity(
    v_project_id, 'task', new.task_id, 'commented', jsonb_build_object('comment_id', new.id)
  );
  return null;
end;
$$;

create trigger log_activity after insert on public.comment
  for each row execute function private.log_comment();

-- Label changes are logged on their task.
create function private.log_task_label()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.task_label;
begin
  if tg_op = 'INSERT' then
    v_row := new;
  else
    v_row := old;
  end if;

  -- Skip when the task itself is being deleted (cascade).
  if not exists (select 1 from public.task where id = v_row.task_id) then
    return null;
  end if;

  perform private.write_activity(
    v_row.project_id, 'task', v_row.task_id,
    case when tg_op = 'INSERT' then 'label_added' else 'label_removed' end,
    jsonb_build_object('label_id', v_row.label_id)
  );
  return null;
end;
$$;

create trigger log_activity after insert or delete on public.task_label
  for each row execute function private.log_task_label();

-- ---------------------------------------------------------------------------
-- Access: read-only for clients, scoped to the workspace
-- ---------------------------------------------------------------------------

revoke all on function
  private.write_activity(uuid, text, uuid, text, jsonb),
  private.activity_noise_fields(),
  private.log_entity_change(),
  private.log_comment(),
  private.log_task_label()
from public;

revoke all on public.activity_log from anon, authenticated;
grant select on public.activity_log to authenticated;

alter table public.activity_log enable row level security;

create policy activity_log_select on public.activity_log
  for select to authenticated
  using (workspace_id = (select private.current_workspace_id()));
