-- Images in task descriptions and comments.
--
-- Files live in a private Storage bucket at <project_id>/<attachment_id>; each has an
-- attachment row that records it and decides who can see it: people (and their agents) in
-- the task's workspace, through the same RLS as everything else. The web app converts
-- images to JPEG and compresses them before uploading, so the bucket takes JPEG (and GIF,
-- kept as is so animations survive), up to 2 MB. Not logged in the activity log: the
-- description or comment edit that adds an image already is.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('attachments', 'attachments', false, 2097152, array['image/jpeg', 'image/gif']);

create table public.attachment (
  id uuid primary key default gen_random_uuid(),
  -- Set from the task on insert.
  project_id uuid not null,
  task_id uuid not null,
  uploader_user_id uuid references public.profile (id) on delete set null,
  uploader_agent_id uuid references public.agent (id) on delete set null,
  file_name text not null check (char_length(file_name) between 1 and 255),
  content_type text not null check (content_type in ('image/jpeg', 'image/gif')),
  size integer not null check (size between 1 and 2097152),
  created_at timestamptz not null default now(),
  foreign key (task_id, project_id) references public.task (id, project_id) on delete cascade,
  -- At most one uploader; can become zero if the uploader is deleted.
  constraint attachment_single_uploader check (num_nonnulls(uploader_user_id, uploader_agent_id) <= 1)
);

create index attachment_task_id_idx on public.attachment (task_id);
create index attachment_project_id_idx on public.attachment (project_id);

-- The project comes from the task and the uploader from the request's identity, never from
-- the client.
create function private.attachment_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  select project_id into new.project_id from public.task where id = new.task_id;
  if new.project_id is null then
    raise exception 'task not found' using errcode = '23503';
  end if;

  if private.current_agent_id() is not null then
    new.uploader_agent_id := private.current_agent_id();
    new.uploader_user_id := null;
  elsif auth.uid() is not null then
    new.uploader_user_id := auth.uid();
    new.uploader_agent_id := null;
  end if;

  if num_nonnulls(new.uploader_user_id, new.uploader_agent_id) <> 1 then
    raise exception 'attachment needs exactly one uploader' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger attachment_before_insert
  before insert on public.attachment
  for each row execute function private.attachment_before_insert();

-- Rows are written once and never changed; removing them is the orphan cleanup's job.
grant select, insert (task_id, file_name, content_type, size) on public.attachment to authenticated;

alter table public.attachment enable row level security;

create policy attachment_select on public.attachment
  for select to authenticated
  using (project_id in (select private.workspace_project_ids()));

create policy attachment_insert on public.attachment
  for insert to authenticated
  with check (
    project_id in (select private.workspace_project_ids())
    and (
      (uploader_agent_id = (select private.current_agent_id()) and uploader_user_id is null)
      or (uploader_user_id = (select auth.uid()) and uploader_agent_id is null and (select private.is_human()))
    )
  );

-- A file can be read only at the path of an attachment row the caller can see, and
-- uploaded once, only by the row's uploader within an hour of creating it (Storage checks
-- this when it signs the upload URL). No update or delete: files are never replaced, and
-- cleanup uses the service role.
create policy attachment_object_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'attachments'
    and exists (
      select 1 from public.attachment a where a.project_id::text || '/' || a.id::text = name
    )
  );

create policy attachment_object_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'attachments'
    and exists (
      select 1 from public.attachment a
      where a.project_id::text || '/' || a.id::text = name
        and a.created_at > now() - interval '1 hour'
        and (
          a.uploader_agent_id = (select private.current_agent_id())
          or (a.uploader_user_id = (select auth.uid()) and (select private.is_human()))
        )
    )
  );
