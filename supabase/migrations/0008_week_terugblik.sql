-- Wekelijkse terugblik: 1 korte duimpjes-vraag per week ("hoe ging je week?"),
-- zodat het kind in 1 tik kan reflecteren en de ouder een trend over tijd ziet.

create table if not exists public.week_terugblikken (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  week_start date not null,
  stemming text not null check (stemming in ('goed', 'neutraal', 'moeilijk')),
  created_at timestamptz not null default now(),
  unique (user_id, week_start)
);

create index if not exists week_terugblikken_family_idx on public.week_terugblikken (family_id, week_start);

alter table public.week_terugblikken enable row level security;

-- select: kind ziet eigen terugblikken, ouder ziet die van het hele gezin (inzicht)
create policy "week_terugblik: select own or ouder" on public.week_terugblikken
  for select using (
    family_id = public.current_family_id()
    and (user_id = auth.uid() or public.current_role() = 'ouder')
  );

-- insert/update: alleen de leerling zelf, en alleen voor zichzelf
create policy "week_terugblik: insert own" on public.week_terugblikken
  for insert with check (family_id = public.current_family_id() and user_id = auth.uid());
create policy "week_terugblik: update own" on public.week_terugblikken
  for update using (family_id = public.current_family_id() and user_id = auth.uid());
