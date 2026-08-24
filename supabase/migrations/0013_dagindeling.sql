-- 0013: dagindeling per weekdag - vervangt de ene vaste avondgrens door een
-- instelbaar ochtend/avond/eten-ritme per dag van de week.
--
-- Nodig omdat een vaste avondgrens niet klopt op elke dag: op vrijdagochtend
-- is er bijvoorbeeld pas vanaf 12u school, dus die ochtend is ook planbare
-- tijd. En het avondeten valt niet elke dag op hetzelfde moment. Ontbrekende
-- rijen vallen in de applicatie terug op een redelijke standaard (schooldag
-- vs. weekend), dus deze tabel hoeft niet voor elke dag gevuld te zijn.

create table if not exists public.dag_instellingen (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  dag_van_week int not null check (dag_van_week between 1 and 7),
  ochtend_start time not null default '07:00',
  avond_grens time not null default '20:30',
  eten_minuten int not null default 60 check (eten_minuten >= 0 and eten_minuten <= 180),
  created_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (family_id, dag_van_week)
);

alter table public.dag_instellingen enable row level security;

create policy "dag_instellingen: select binnen gezin" on public.dag_instellingen
  for select using (family_id = public.current_family_id());

create policy "dag_instellingen: ouder beheert" on public.dag_instellingen
  for all using (family_id = public.current_family_id() and public.current_role() = 'ouder')
  with check (family_id = public.current_family_id() and public.current_role() = 'ouder');

-- families.avond_grens (migratie 0011) is hiermee vervangen door de
-- per-dag-instelling en wordt niet meer gebruikt; blijft ongebruikt in de
-- tabel staan om geen destructieve kolomwijziging te hoeven doen.
