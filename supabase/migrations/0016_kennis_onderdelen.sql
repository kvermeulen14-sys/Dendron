-- 0016: kennisbank op regel-niveau ("kennis_onderdelen").
--
-- Tot nu toe zat de kennisbank op hoofdstuk-/paragraafniveau (materials):
-- goed genoeg voor de vrije tutor-chat (RAG over material_chunks), maar te
-- grof om per losse regel bij te houden wat een kind al beheerst en waar
-- nog gericht op geoefend moet worden (zie het StudyGo-onderzoek: regels als
-- "De regel a(b+c) = ab + ac" met eigen voortgang, i.p.v. een heel
-- hoofdstuk als 1 blok).
--
-- Dit is een aparte, gecureerde laag naast material_chunks: chunks blijven
-- voor het vrije chat-zoeken, kennis_onderdelen is de vaste regel/
-- voorbeeld/tip-structuur die Samenvatting, Oefenen en Toets gaan gebruiken.
-- AI stelt onderdelen voor (status 'concept'), de ouder controleert en
-- publiceert (status 'gepubliceerd') - zelfde patroon als de andere
-- AI-invoer met controle (huiswerk/rooster/jaarkalender).

create table public.kennis_onderdelen (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  subject_id uuid not null references public.subjects (id) on delete cascade,
  hoofdstuk text not null,
  paragraaf_id text,
  naam text not null,
  volgorde integer not null default 0,
  regel text not null,
  voorbeelden jsonb not null default '[]'::jsonb,
  gecombineerd_voorbeeld text,
  tip text,
  uitzondering text,
  fout_voorbeeld text,
  status text not null check (status in ('concept', 'gepubliceerd')) default 'concept',
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index kennis_onderdelen_subject_idx on public.kennis_onderdelen (subject_id);
create index kennis_onderdelen_subject_hoofdstuk_idx on public.kennis_onderdelen (subject_id, hoofdstuk);

comment on table public.kennis_onderdelen is
  'Kennisbank op regel-niveau: 1 rij per losse, benoemde deelvaardigheid binnen een hoofdstuk, met vaste regel/voorbeelden/tip/uitzondering-structuur. Voedt straks Samenvatting, Oefenen en Toets.';
comment on column public.kennis_onderdelen.voorbeelden is 'Array van losse rekenvoorbeelden (strings), bv ["3(a+b) = 3a+3b", "5(4a+3b) = 20a+15b"].';
comment on column public.kennis_onderdelen.status is
  'concept = AI-voorstel, nog niet gecontroleerd; gepubliceerd = door de ouder goedgekeurd en zichtbaar/bruikbaar in Oefenen/Toets.';

alter table public.kennis_onderdelen enable row level security;

-- Zelfde patroon als test_types/rooster_items: hele gezin leest, alleen
-- ouder beheert (curatie/goedkeuring van de kennisbank blijft bij de ouder).
create policy "kennis_onderdelen: select family" on public.kennis_onderdelen
  for select using (family_id = public.current_family_id());
create policy "kennis_onderdelen: insert by ouder" on public.kennis_onderdelen
  for insert with check (family_id = public.current_family_id() and public.current_role() = 'ouder');
create policy "kennis_onderdelen: update by ouder" on public.kennis_onderdelen
  for update using (family_id = public.current_family_id() and public.current_role() = 'ouder');
create policy "kennis_onderdelen: delete by ouder" on public.kennis_onderdelen
  for delete using (family_id = public.current_family_id() and public.current_role() = 'ouder');
