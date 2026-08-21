-- Optionele starttijd (klokstip) per planning-item, zodat huiswerk/leren
-- net als het rooster op een tijdlijn in de agenda gezet kan worden.
alter table public.planning_items
  add column if not exists start_time time;
