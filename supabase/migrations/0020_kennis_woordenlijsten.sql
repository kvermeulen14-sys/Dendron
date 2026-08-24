-- 0020: woordenlijsten voor taalvakken, naast kennis_onderdelen.
--
-- Een taalvak-kennisbank (bv. Engels) bestaat voor een groot deel uit
-- letterlijke Engels-Nederlands-woordparen met een officiële voorbeeldzin -
-- geen "regel" zoals bij wiskunde, maar een lijst die woord-voor-woord
-- overgenomen moet worden (niet parafraseren, dat zou de officiële
-- boekformulering stilzwijgend veranderen). Zo'n lijst past qua vorm niet in
-- kennis_onderdelen (regel + korte voorbeelden) en de rijkdom aan losse
-- lijsten in 1 hoofdstuk (soms 15-20+ per unit) past ook niet binnen de
-- 8-onderdelen-cap per AI-aanroep uit kennis-bron-import.ts. Woordenlijsten
-- worden daarom deterministisch (geen AI-parafrase) uit de brontabellen
-- geparst en hier apart opgeslagen - vak-onafhankelijk, net als
-- kennis_onderdelen, dus niet beperkt tot taalvakken in de database zelf.

create table public.kennis_woordenlijsten (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  subject_id uuid not null references public.subjects (id) on delete cascade,
  hoofdstuk text not null,
  paragraaf_id text not null,
  titel text not null,
  -- 'bron_naar_doel': vraag in brontaal, antwoord in doeltaal (bv. Engels -> Nederlands).
  -- 'doel_naar_bron': omgekeerd (bv. Nederlands -> Engels, of een prompt/antwoord-paar).
  -- 'gemengd': beide kanten door elkaar oefenen.
  richting text not null default 'gemengd' check (richting in ('bron_naar_doel', 'doel_naar_bron', 'gemengd')),
  -- [{ "bron": "...", "doel": "...", "voorbeeldzin": "..." | null }, ...] - letterlijk overgenomen uit de brontabel.
  woorden jsonb not null default '[]',
  volgorde integer not null default 0,
  status text not null check (status in ('concept', 'gepubliceerd')) default 'concept',
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index kennis_woordenlijsten_subject_idx on public.kennis_woordenlijsten (subject_id);
create index kennis_woordenlijsten_subject_paragraaf_idx on public.kennis_woordenlijsten (subject_id, paragraaf_id);

comment on table public.kennis_woordenlijsten is
  'Letterlijke woordparen-lijsten (bron/doel/voorbeeldzin) uit een geuploade kennisbank, bv. voor taalvakken. Deterministisch geparst uit de brontabel, geen AI-parafrase, zodat officiële formuleringen exact behouden blijven.';

alter table public.kennis_woordenlijsten enable row level security;

create policy "kennis_woordenlijsten: select family" on public.kennis_woordenlijsten
  for select using (family_id = public.current_family_id());
create policy "kennis_woordenlijsten: insert by ouder" on public.kennis_woordenlijsten
  for insert with check (family_id = public.current_family_id() and public.current_role() = 'ouder');
create policy "kennis_woordenlijsten: update by ouder" on public.kennis_woordenlijsten
  for update using (family_id = public.current_family_id() and public.current_role() = 'ouder');
create policy "kennis_woordenlijsten: delete by ouder" on public.kennis_woordenlijsten
  for delete using (family_id = public.current_family_id() and public.current_role() = 'ouder');
