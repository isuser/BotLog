-- Images no text links to any more, for the daily cleanup job.
--
-- Images are linked from descriptions and comments, so removing one from the text, or
-- deleting a comment, leaves its file behind. An image is an orphan once no Markdown links
-- to it (task, epic and project descriptions and comments; archived ones count, as their
-- text is kept) and it is over a day old, so one that is still uploading or in an unsaved
-- draft is safe. The day counts from the upload, not from when the last link went. Files left
-- in the bucket without an attachment row (their task or project was deleted, or an earlier
-- cleanup removed the row but not the file) are orphans too.
--
-- The cleanup job calls this with the secret key, deletes the files through Storage, then
-- the rows. Only the service role can run it.

create function public.attachment_orphans(max_rows integer default 1000)
returns table (attachment_id uuid, path text)
language sql
stable
set search_path = ''
as $$
  with linked as (
    select lower((regexp_matches(t.description, '/api/v1/attachments/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})', 'gi'))[1]) as id
    from public.task t
    union
    select lower((regexp_matches(c.body, '/api/v1/attachments/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})', 'gi'))[1])
    from public.comment c
    union
    -- Images belong to a task, but their links can be pasted into any Markdown.
    select lower((regexp_matches(e.description, '/api/v1/attachments/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})', 'gi'))[1])
    from public.epic e
    union
    select lower((regexp_matches(p.description, '/api/v1/attachments/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})', 'gi'))[1])
    from public.project p
  )
  (
    select a.id, a.project_id::text || '/' || a.id::text
    from public.attachment a
    where a.created_at < now() - interval '1 day'
      and a.id::text not in (select id from linked)
    union all
    select null, o.name
    from storage.objects o
    where o.bucket_id = 'attachments'
      and o.created_at < now() - interval '1 day'
      and not exists (
        select 1 from public.attachment a where a.project_id::text || '/' || a.id::text = o.name
      )
  )
  limit max_rows
$$;

revoke all on function public.attachment_orphans(integer) from public, anon, authenticated;
grant execute on function public.attachment_orphans(integer) to service_role;

-- The cleanup deletes rows as the service role; clients still can't.
grant delete on public.attachment to service_role;
