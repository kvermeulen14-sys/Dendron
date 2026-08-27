-- 0022: losse "herinneringen" bij het rooster (bv. "neem gymkleren mee").
--
-- Bewust GEEN nieuw planning_items-type: dit hoeft nooit ingepland te
-- worden (geen werkmoment, geen deadline die kan verschuiven) - het is
-- puur een korte notitie bij een lesuur/dag die je wilt zien voordat je
-- naar school gaat. Een aparte, lichte tabel houdt dit los van de hele
-- huiswerk/toets-machinerie (rooster_start_tijd-matching, aandacht-
-- detectie, de planningscoach) die daar niet op is gebouwd.

create table public.rooster_notities (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  subject_id uuid references public.subjects (id) on delete set null,
  rooster_item_id uuid references public.rooster_items (id) on delete set null,
  datum date not null,
  tekst text not null,
  status text not null check (status in ('open', 'klaar')) default 'open',
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create index rooster_notities_family_datum_idx on public.rooster_notities (family_id, datum);

comment on table public.rooster_notities is
  'Korte herinneringen bij het rooster (bv. "neem gymkleren mee") - geen planning_item, hoeft niet ingepland te worden.';
comment on column public.rooster_notities.rooster_item_id is 'Optioneel: het lesuur waar dit bij hoort, puur voor context - geen matching-logica zoals rooster_start_tijd bij planning_items.';

alter table public.rooster_notities enable row level security;

-- Zelfde patroon als planning_items: hele gezin leest en beheert samen.
create policy "rooster_notities: select family" on public.rooster_notities
  for select using (family_id = public.current_family_id());
create policy "rooster_notities: insert family" on public.rooster_notities
  for insert with check (family_id = public.current_family_id() and created_by = auth.uid());
create policy "rooster_notities: update family" on public.rooster_notities
  for update using (family_id = public.current_family_id());
create policy "rooster_notities: delete family" on public.rooster_notities
  for delete using (family_id = public.current_family_id());
