-- 0017: paragraafcontext en oefenbank naast kennis_onderdelen.
--
-- De eerste versie van kennis_onderdelen (0016) ving alleen de "regels en
-- uitzonderingen" van een paragraaf. Bij het testen met rijkere, extern
-- opgestelde .md-bestanden per paragraaf (leerdoelen, voorkennis,
-- kernbegrippen, oplossingsroute, beheersingscriterium, en een kant-en-klare
-- oefenbank met vraag/antwoord/uitwerking per niveau) bleek dat al die
-- andere inhoud gewoon werd genegeerd. Deze migratie voegt de twee
-- ontbrekende stukken toe als eigen tabellen, zodat een geuploade
-- kennisbank straks volledig gebruikt kan worden:
--   - kennis_paragraaf_context: de paragraafbrede uitleg/eisen (1 rij per
--     paragraaf), voor de Samenvatting-weergave.
--   - kennis_oefenvragen: de kant-en-klare, al gecontroleerde oefenbank
--     (vraag+antwoord+uitwerking, eventueel per niveau of gekoppeld aan 1
--     kennisonderdeel), voor Oefenen/Toets - betrouwbaarder dan telkens
--     opnieuw AI-gegenereerde vragen, omdat het antwoord al vaststaat.
--
-- Beide tabellen zijn - net als kennis_onderdelen - vak-onafhankelijk
-- opgezet (geen afhankelijkheid van de ingebouwde Getal & Ruimte-dataset),
-- zodat dezelfde upload-flow ook voor andere vakken werkt.

create table public.kennis_paragraaf_context (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  subject_id uuid not null references public.subjects (id) on delete cascade,
  hoofdstuk text not null,
  paragraaf_id text not null,
  titel text not null,
  leerdoelen text,
  voorkennis text,
  kernbegrippen text,
  oplossingsroute text,
  beheersingscriterium text,
  status text not null check (status in ('concept', 'gepubliceerd')) default 'concept',
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (subject_id, paragraaf_id)
);

create index kennis_paragraaf_context_subject_idx on public.kennis_paragraaf_context (subject_id);

comment on table public.kennis_paragraaf_context is
  'Paragraafbrede context (leerdoelen/voorkennis/kernbegrippen/oplossingsroute/beheersingscriterium), 1 rij per paragraaf. Voedt de Samenvatting-weergave.';

create table public.kennis_oefenvragen (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  subject_id uuid not null references public.subjects (id) on delete cascade,
  hoofdstuk text not null,
  paragraaf_id text not null,
  kennis_onderdeel_id uuid references public.kennis_onderdelen (id) on delete set null,
  niveau text,
  vraag text not null,
  antwoord text not null,
  uitwerking text,
  volgorde integer not null default 0,
  status text not null check (status in ('concept', 'gepubliceerd')) default 'concept',
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index kennis_oefenvragen_subject_idx on public.kennis_oefenvragen (subject_id);
create index kennis_oefenvragen_subject_paragraaf_idx on public.kennis_oefenvragen (subject_id, paragraaf_id);
create index kennis_oefenvragen_onderdeel_idx on public.kennis_oefenvragen (kennis_onderdeel_id);

comment on table public.kennis_oefenvragen is
  'Kant-en-klare, al gecontroleerde oefenvragen uit een geuploade kennisbank (vraag+antwoord+uitwerking), optioneel gekoppeld aan 1 kennisonderdeel en/of niveau. Voedt Oefenen/Toets zonder dat de AI het antwoord zelf hoeft te verzinnen.';

alter table public.kennis_paragraaf_context enable row level security;
alter table public.kennis_oefenvragen enable row level security;

create policy "kennis_paragraaf_context: select family" on public.kennis_paragraaf_context
  for select using (family_id = public.current_family_id());
create policy "kennis_paragraaf_context: insert by ouder" on public.kennis_paragraaf_context
  for insert with check (family_id = public.current_family_id() and public.current_role() = 'ouder');
create policy "kennis_paragraaf_context: update by ouder" on public.kennis_paragraaf_context
  for update using (family_id = public.current_family_id() and public.current_role() = 'ouder');
create policy "kennis_paragraaf_context: delete by ouder" on public.kennis_paragraaf_context
  for delete using (family_id = public.current_family_id() and public.current_role() = 'ouder');

create policy "kennis_oefenvragen: select family" on public.kennis_oefenvragen
  for select using (family_id = public.current_family_id());
create policy "kennis_oefenvragen: insert by ouder" on public.kennis_oefenvragen
  for insert with check (family_id = public.current_family_id() and public.current_role() = 'ouder');
create policy "kennis_oefenvragen: update by ouder" on public.kennis_oefenvragen
  for update using (family_id = public.current_family_id() and public.current_role() = 'ouder');
create policy "kennis_oefenvragen: delete by ouder" on public.kennis_oefenvragen
  for delete using (family_id = public.current_family_id() and public.current_role() = 'ouder');
