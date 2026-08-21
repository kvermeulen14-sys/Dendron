-- Optionele tijdsinschatting (in minuten) per planning-item, zodat de agenda
-- kan tonen hoeveel tijd er vandaag realistisch voor nodig is.
alter table public.planning_items
  add column if not exists estimated_minutes integer check (estimated_minutes is null or estimated_minutes > 0);
