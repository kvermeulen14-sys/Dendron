-- Chatinhoud bewaren per (roosterperiode-gekoppelde) periode: de "opdracht
-- maken"- en planningshulp-chats werden nog niet bewaard, en overhoor-
-- sessies bewaarden alleen de score, niet het gesprek zelf. Dit voegt de
-- opslag toe en geeft de ouder een knop om alles ouder dan de huidige
-- roosterperiode op te schonen (zie wisOudeChatgeschiedenis-server action).
-- De aggregaat-scores in overhoor_sessies blijven staan (voortgang), alleen
-- het transcript (de inhoud) wordt geleegd.

create table if not exists public.opdracht_berichten (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  subject_id uuid not null references public.subjects (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('user', 'model')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists opdracht_berichten_subject_user_idx on public.opdracht_berichten (subject_id, user_id, created_at);

create table if not exists public.planningshulp_berichten (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('user', 'model')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists planningshulp_berichten_user_idx on public.planningshulp_berichten (user_id, created_at);

alter table public.overhoor_sessies add column if not exists transcript jsonb not null default '[]';

alter table public.opdracht_berichten enable row level security;
alter table public.planningshulp_berichten enable row level security;

-- opdracht_berichten: zelfde patroon als chat_messages (kind eigen, ouder meeleest)
create policy "opdracht: select own or ouder" on public.opdracht_berichten
  for select using (
    family_id = public.current_family_id()
    and (user_id = auth.uid() or public.current_role() = 'ouder')
  );
create policy "opdracht: insert own" on public.opdracht_berichten
  for insert with check (family_id = public.current_family_id() and user_id = auth.uid());
create policy "opdracht: delete by ouder" on public.opdracht_berichten
  for delete using (family_id = public.current_family_id() and public.current_role() = 'ouder');

-- planningshulp_berichten: zelfde patroon
create policy "planningshulp: select own or ouder" on public.planningshulp_berichten
  for select using (
    family_id = public.current_family_id()
    and (user_id = auth.uid() or public.current_role() = 'ouder')
  );
create policy "planningshulp: insert own" on public.planningshulp_berichten
  for insert with check (family_id = public.current_family_id() and user_id = auth.uid());
create policy "planningshulp: delete by ouder" on public.planningshulp_berichten
  for delete using (family_id = public.current_family_id() and public.current_role() = 'ouder');

-- Opschonen door de ouder vereist delete-rechten op chat_messages (bestond
-- nog niet - alleen select/insert) en update-rechten op overhoor_sessies
-- (om het transcript te legen, de score-kolommen blijven ongemoeid).
create policy "chat: delete by ouder" on public.chat_messages
  for delete using (family_id = public.current_family_id() and public.current_role() = 'ouder');
create policy "overhoor_sessies: update transcript by ouder" on public.overhoor_sessies
  for update using (family_id = public.current_family_id() and public.current_role() = 'ouder');
