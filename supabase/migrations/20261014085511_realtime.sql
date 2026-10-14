-- Realtime signals for the web app. The board subscribes to Postgres changes on these two
-- tables for the open project, and only uses an event to know *that* something changed: it
-- then refetches through the API (it never reads the event's row).
--
-- activity_log gets a row (with project_id) for every change to tasks, comments, labels
-- and epics, so its inserts cover almost everything. task updates are added for reordering
-- inside a column, the one change the activity log leaves out.
--
-- Supabase Realtime applies the subscriber's RLS select policies to each event, so people
-- only hear about rows in their own workspace. Both tables already have such policies.

alter publication supabase_realtime add table public.activity_log, public.task;
