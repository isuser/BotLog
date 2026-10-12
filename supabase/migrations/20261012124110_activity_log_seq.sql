-- Timestamps alone can tie (several entries in the same instant), so give activity entries
-- a sequence number for a stable order. Order by seq, not created_at.

alter table public.activity_log
  add column seq bigint generated always as identity;

drop index public.activity_log_entity_idx;
drop index public.activity_log_project_idx;

create index activity_log_entity_idx on public.activity_log (entity_type, entity_id, seq desc);
create index activity_log_project_idx on public.activity_log (project_id, seq desc);
