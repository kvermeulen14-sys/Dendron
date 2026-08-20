-- Dendron Planner - roosterperiodes, uitzonderingen en jaarkalender
-- Voer dit uit in de Supabase SQL editor, na 0001_init.sql en 0002.

-- ---------------------------------------------------------------------------
-- Roosterperiodes: een rooster geldt meestal niet het hele jaar (periode 1,
-- 2, 3, 4). Elke periode heeft een eigen geldigheidsbereik.
-- ---------------------------------------------------------------------------
create table public.rooster_periodes (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  naam text not null,
  start_datum date not null,
  eind_datum date not null,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  constraint rooster_periodes_datum_check check (eind_datum > start_datum)
);

create index rooster_periodes_family_id_idx on public.rooster_periodes (family_id);

-- Bestaande losse rooster_items (zonder periode) horen niet meer bij het
-- nieuwe model - opnieuw invoeren binnen een periode.
delete from public.rooster_items;

alter table public.rooster_items
  add column periode_id uuid references public.rooster_periodes (id) on delete cascade;
alter table public.rooster_items
  alter column periode_id set not null;

create index rooster_items_periode_id_idx on public.rooster_items (periode_id);

-- ---------------------------------------------------------------------------
-- Uitzonderingen op het rooster voor een specifieke datum (bijv. een les
-- vervalt, verschuift, of er komt een extra activiteit bij).
-- ---------------------------------------------------------------------------
create table public.rooster_uitzonderingen (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  datum date not null,
  origineel_item_id uuid references public.rooster_items (id) on delete set null,
  type text not null check (type in ('vervallen', 'gewijzigd', 'extra')),
  titel text,
  subject_id uuid references public.subjects (id) on delete set null,
  start_tijd time,
  eind_tijd time,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create index rooster_uitzonderingen_family_datum_idx on public.rooster_uitzonderingen (family_id, datum);

-- ---------------------------------------------------------------------------
-- Jaarkalender: belangrijke periodes die het hele jaar door zichtbaar zijn
-- (vakanties, toetsweken, etc), los van de dagelijkse planning.
-- ---------------------------------------------------------------------------
create table public.jaar_events (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  titel text not null,
  start_datum date not null,
  eind_datum date not null,
  type text not null check (type in ('vakantie', 'toetsweek', 'anders')) default 'anders',
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  constraint jaar_events_datum_check check (eind_datum >= start_datum)
);

create index jaar_events_family_id_idx on public.jaar_events (family_id);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.rooster_periodes enable row level security;
alter table public.rooster_uitzonderingen enable row level security;
alter table public.jaar_events enable row level security;

create policy "rooster_periodes: select family" on public.rooster_periodes
  for select using (family_id = public.current_family_id());
create policy "rooster_periodes: insert by ouder" on public.rooster_periodes
  for insert with check (family_id = public.current_family_id() and public.current_role() = 'ouder');
create policy "rooster_periodes: update by ouder" on public.rooster_periodes
  for update using (family_id = public.current_family_id() and public.current_role() = 'ouder');
create policy "rooster_periodes: delete by ouder" on public.rooster_periodes
  for delete using (family_id = public.current_family_id() and public.current_role() = 'ouder');

-- rooster_items had al policies uit 0002 (select/insert/update/delete by ouder) - die blijven gelden.

create policy "rooster_uitzonderingen: select family" on public.rooster_uitzonderingen
  for select using (family_id = public.current_family_id());
create policy "rooster_uitzonderingen: insert by ouder" on public.rooster_uitzonderingen
  for insert with check (family_id = public.current_family_id() and public.current_role() = 'ouder');
create policy "rooster_uitzonderingen: update by ouder" on public.rooster_uitzonderingen
  for update using (family_id = public.current_family_id() and public.current_role() = 'ouder');
create policy "rooster_uitzonderingen: delete by ouder" on public.rooster_uitzonderingen
  for delete using (family_id = public.current_family_id() and public.current_role() = 'ouder');

create policy "jaar_events: select family" on public.jaar_events
  for select using (family_id = public.current_family_id());
create policy "jaar_events: insert by ouder" on public.jaar_events
  for insert with check (family_id = public.current_family_id() and public.current_role() = 'ouder');
create policy "jaar_events: update by ouder" on public.jaar_events
  for update using (family_id = public.current_family_id() and public.current_role() = 'ouder');
create policy "jaar_events: delete by ouder" on public.jaar_events
  for delete using (family_id = public.current_family_id() and public.current_role() = 'ouder');
