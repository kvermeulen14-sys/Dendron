-- Overhoor-resultaten bewaren: elke afgeronde overhoor-/oefensessie wordt als
-- 1 regel gelogd (score per beoordeling, geen losse vragen/antwoorden), zodat
-- het kind zijn eigen voortgang per vak ziet en de ouder inzicht krijgt
-- zonder dat het aanvoelt als een cijferlijst.

create table if not exists public.overhoor_sessies (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  subject_id uuid not null references public.subjects (id) on delete cascade,
  leerfase text not null check (leerfase in ('eerste', 'tussentijds', 'laatste')),
  aantal_goed integer not null default 0,
  aantal_deels integer not null default 0,
  aantal_fout integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists overhoor_sessies_subject_idx on public.overhoor_sessies (subject_id, created_at);
create index if not exists overhoor_sessies_family_idx on public.overhoor_sessies (family_id, created_at);

alter table public.overhoor_sessies enable row level security;

-- select: kind ziet eigen resultaten, ouder ziet die van het hele gezin (inzicht)
create policy "overhoor_sessies: select own or ouder" on public.overhoor_sessies
  for select using (
    family_id = public.current_family_id()
    and (user_id = auth.uid() or public.current_role() = 'ouder')
  );

-- insert: alleen de leerling zelf, en alleen voor zichzelf
create policy "overhoor_sessies: insert own" on public.overhoor_sessies
  for insert with check (family_id = public.current_family_id() and user_id = auth.uid());
