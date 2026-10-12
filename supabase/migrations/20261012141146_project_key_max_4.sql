-- Keep project keys short: 2 to 4 letters or digits, starting with a letter (BOT, WEB2).
-- Short IDs like BOT-42 stay compact. Fails if an existing project has a longer key.

alter table public.project drop constraint project_key_check;

alter table public.project
  add constraint project_key_check check (key ~ '^[A-Z][A-Z0-9]{1,3}$');
