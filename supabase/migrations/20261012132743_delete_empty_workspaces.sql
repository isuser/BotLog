-- Deleting an auth user deletes their profile, but left their workspace behind. A workspace
-- nobody belongs to can't be reached, so delete it (and its data) with its last profile.

create function private.delete_empty_workspace()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.workspace w
  where w.id = old.workspace_id
    and not exists (select 1 from public.profile p where p.workspace_id = w.id);
  return null;
end;
$$;

revoke all on function private.delete_empty_workspace() from public;

create trigger delete_empty_workspace
  after delete on public.profile
  for each row execute function private.delete_empty_workspace();

-- Clean up workspaces already left behind.
delete from public.workspace w
where not exists (select 1 from public.profile p where p.workspace_id = w.id);
