-- Editing and deleting comments.
--
-- Only a comment's author can edit it: a person their own comments, an agent its own (never
-- its owner's). People can delete their own comments and anyone else's that isn't another
-- person's (agents' comments, and ones whose author was deleted); agents can't delete any.
-- Each edit and deletion is logged on the task, without the text, so a deleted comment's
-- text is really gone. updated_at (bumped only by edits, body being the one updatable
-- column) is how a comment shows as edited.

grant update (body), delete on public.comment to authenticated;

create policy comment_update on public.comment
  for update to authenticated
  using (
    task_id in (
      select id from public.task where project_id in (select private.workspace_project_ids())
    )
    and (
      author_agent_id = (select private.current_agent_id())
      or (author_user_id = (select auth.uid()) and (select private.is_human()))
    )
  )
  with check (
    task_id in (
      select id from public.task where project_id in (select private.workspace_project_ids())
    )
  );

create policy comment_delete on public.comment
  for delete to authenticated
  using (
    task_id in (
      select id from public.task where project_id in (select private.workspace_project_ids())
    )
    and (select private.is_human())
    and (author_user_id is null or author_user_id = (select auth.uid()))
  );

-- Logs comments on their task: commented, comment_edited and comment_deleted, each with the
-- comment's id.
create or replace function private.log_comment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.comment;
  v_project_id uuid;
begin
  if tg_op = 'DELETE' then
    v_row := old;
  else
    v_row := new;
  end if;

  if tg_op = 'UPDATE' and new.body is not distinct from old.body then
    return null;
  end if;

  -- Skips deletes cascading from the task itself.
  select project_id into v_project_id from public.task where id = v_row.task_id;
  if v_project_id is null then
    return null;
  end if;

  perform private.write_activity(
    v_project_id, 'task', v_row.task_id,
    case tg_op when 'INSERT' then 'commented' when 'UPDATE' then 'comment_edited' else 'comment_deleted' end,
    jsonb_build_object('comment_id', v_row.id)
  );
  return null;
end;
$$;

revoke all on function private.log_comment() from public;

create trigger log_activity_change after update or delete on public.comment
  for each row execute function private.log_comment();
