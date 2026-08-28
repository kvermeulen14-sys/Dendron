-- 0027: inhoudsopgave van de methode als eigen, gekoppelde structuur.
--
-- Tot nu toe stond "hoofdstuk" en "paragraaf_id" als losse tekst op elke
-- kennis_*-rij apart - geen echte structuur, alleen impliciete groepering
-- via stringgelijkheid. Dat maakte het onmogelijk om de inhoudsopgave van de
-- methode zelf te tonen/aan te passen (hernoemen, herordenen, verplaatsen)
-- zonder los elke rij te moeten bijwerken, en liet 2 methodes (materials +
-- kennisbank) naast elkaar bestaan.
--
-- Deze migratie voegt een echte, per-vak inhoudsopgave toe:
--   methode_hoofdstukken (Unit/Hoofdstuk, met volgorde)
--     -> methode_paragrafen (Categorie + Paragraaf/les, met volgorde)
-- en koppelt elke kennis_*-rij eraan via methode_paragraaf_id. De bestaande
-- tekstvelden (hoofdstuk/paragraaf_id/titel) blijven bestaan als
-- gesynchroniseerde kopie - alle bestaande leescode (tutor-prompt, Oefenen)
-- blijft daardoor werken; alleen het aanmaken/aanpassen van structuur gaat
-- voortaan via de nieuwe tabellen (zie garandeerMethodeStructuur in
-- lib/actions/methode-structuur.ts, die bestaande losse content 1x naar
-- deze structuur migreert).
--
-- Ook: de oudere, losse "materials"-kennisbank (en het nooit meer gebruikte
-- material_chunks/match_material_chunks - pgvector-RAG die is vervangen door
-- de kennis_*-tabellen) verdwijnt. Er is nu 1 methode: de kennisbank.

create table public.methode_hoofdstukken (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  subject_id uuid not null references public.subjects (id) on delete cascade,
  naam text not null,
  volgorde integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (subject_id, naam)
);

create index methode_hoofdstukken_subject_idx on public.methode_hoofdstukken (subject_id);

create table public.methode_paragrafen (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  hoofdstuk_id uuid not null references public.methode_hoofdstukken (id) on delete cascade,
  categorie text not null check (categorie in ('grammatica', 'woordenschat', 'zinnen', 'praktijk')),
  code text not null,
  titel text not null,
  volgorde integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (hoofdstuk_id, categorie, code)
);

create index methode_paragrafen_hoofdstuk_idx on public.methode_paragrafen (hoofdstuk_id);

comment on table public.methode_hoofdstukken is
  'Inhoudsopgave van de methode van 1 vak, niveau 1: Hoofdstuk/Unit. Door de ouder aan te passen (naam/volgorde), automatisch aangevuld bij nieuwe kennisbank-imports.';
comment on table public.methode_paragrafen is
  'Inhoudsopgave niveau 2+3: Categorie (grammatica/woordenschat/zinnen/praktijk) x Paragraaf/les binnen 1 hoofdstuk. Alle kennis_*-content hangt hieraan via methode_paragraaf_id.';

alter table public.kennis_onderdelen add column methode_paragraaf_id uuid references public.methode_paragrafen (id) on delete set null;
alter table public.kennis_paragraaf_context add column methode_paragraaf_id uuid references public.methode_paragrafen (id) on delete cascade;
alter table public.kennis_oefenvragen add column methode_paragraaf_id uuid references public.methode_paragrafen (id) on delete cascade;
alter table public.kennis_woordenlijsten add column methode_paragraaf_id uuid references public.methode_paragrafen (id) on delete cascade;

create index kennis_onderdelen_methode_paragraaf_idx on public.kennis_onderdelen (methode_paragraaf_id);
create index kennis_paragraaf_context_methode_paragraaf_idx on public.kennis_paragraaf_context (methode_paragraaf_id);
create index kennis_oefenvragen_methode_paragraaf_idx on public.kennis_oefenvragen (methode_paragraaf_id);
create index kennis_woordenlijsten_methode_paragraaf_idx on public.kennis_woordenlijsten (methode_paragraaf_id);

alter table public.methode_hoofdstukken enable row level security;
alter table public.methode_paragrafen enable row level security;

create policy "methode_hoofdstukken: select family" on public.methode_hoofdstukken
  for select using (family_id = public.current_family_id());
create policy "methode_hoofdstukken: insert by ouder" on public.methode_hoofdstukken
  for insert with check (family_id = public.current_family_id() and public.current_role() = 'ouder');
create policy "methode_hoofdstukken: update by ouder" on public.methode_hoofdstukken
  for update using (family_id = public.current_family_id() and public.current_role() = 'ouder');
create policy "methode_hoofdstukken: delete by ouder" on public.methode_hoofdstukken
  for delete using (family_id = public.current_family_id() and public.current_role() = 'ouder');

create policy "methode_paragrafen: select family" on public.methode_paragrafen
  for select using (family_id = public.current_family_id());
create policy "methode_paragrafen: insert by ouder" on public.methode_paragrafen
  for insert with check (family_id = public.current_family_id() and public.current_role() = 'ouder');
create policy "methode_paragrafen: update by ouder" on public.methode_paragrafen
  for update using (family_id = public.current_family_id() and public.current_role() = 'ouder');
create policy "methode_paragrafen: delete by ouder" on public.methode_paragrafen
  for delete using (family_id = public.current_family_id() and public.current_role() = 'ouder');

-- ---------------------------------------------------------------------------
-- Materials (oudere, losse kennisbank) + het nooit meer gebruikte
-- pgvector-RAG erbovenop verdwijnen - de kennisbank is nu de enige methode.
-- ---------------------------------------------------------------------------
drop function if exists public.match_material_chunks(vector(768), uuid, integer);
drop table if exists public.material_chunks;
drop table if exists public.materials;
