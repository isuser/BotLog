-- Whether the task panel opens right after you add a task on the board or in the backlog.
-- A personal preference, so it lives on the profile and follows the person across devices.
-- On by default. Only the person can change it, in a human session (profile_update already
-- requires that); agents never can.

alter table public.profile
  add column open_task_after_create boolean not null default true;

grant update (open_task_after_create) on public.profile to authenticated;
