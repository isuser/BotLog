-- Each person's colour theme for the web app, so it follows them across devices.
-- 'lime' (dark, the default) or 'sandpaper' (light). Only the person can change it, in a
-- human session (profile_update already requires that); agents never can.

alter table public.profile
  add column theme text not null default 'lime' check (theme in ('lime', 'sandpaper'));

grant update (theme) on public.profile to authenticated;
