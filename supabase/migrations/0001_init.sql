-- Dendron Planner - initiele database schema
-- Voer dit uit in de Supabase SQL editor van je project (of via `supabase db push`).

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Gezinnen: elk gezin heeft precies 1 ouder-account (v1) en 1+ kind-accounts
-- ---------------------------------------------------------------------------
create table public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Ons gezin',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Profielen: 1-op-1 met auth.users, bepaalt rol (ouder/kind) en gezin
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  family_id uuid not null references public.families (id) on delete cascade,
  role text not null check (role in ('ouder', 'kind')),
  full_name text not null default '',
  created_at timestamptz not null default now()
);

create index profiles_family_id_idx on public.profiles (family_id);

-- Helperfuncties voor RLS-policies (security definer = negeert RLS zelf)
create function public.current_family_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select family_id from public.profiles where id = auth.uid()
$$;

create function public.current_role()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

-- ---------------------------------------------------------------------------
-- Nieuwe auth.users automatisch koppelen aan een profiel (+ gezin voor ouders)
-- Verwacht raw_user_meta_data:
--   ouder:  { "role": "ouder", "full_name": "...", "family_name": "..." }
--   kind:   { "role": "kind",  "full_name": "...", "family_id": "<uuid>" }
-- ---------------------------------------------------------------------------
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_family_id uuid;
  meta_role text := new.raw_user_meta_data ->> 'role';
begin
  if meta_role = 'ouder' then
    insert into public.families (name)
    values (coalesce(new.raw_user_meta_data ->> 'family_name', 'Ons gezin'))
    returning id into new_family_id;

    insert into public.profiles (id, family_id, role, full_name)
    values (new.id, new_family_id, 'ouder', coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  else
    insert into public.profiles (id, family_id, role, full_name)
    values (
      new.id,
      (new.raw_user_meta_data ->> 'family_id')::uuid,
      'kind',
      coalesce(new.raw_user_meta_data ->> 'full_name', '')
    );
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Vakken (v1: meestal 1 proefvak, maar tabel is al klaar voor meer)
-- ---------------------------------------------------------------------------
create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  name text not null,
  icon text not null default 'book-open',
  color text not null default 'blue',
  ai_instructions text not null default '',
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create index subjects_family_id_idx on public.subjects (family_id);

-- ---------------------------------------------------------------------------
-- Lesstof / kennisbank per vak (voedt de AI-vakdocent)
-- ---------------------------------------------------------------------------
create table public.materials (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  subject_id uuid not null references public.subjects (id) on delete cascade,
  title text not null,
  content text not null default '',
  file_url text,
  uploaded_by uuid not null references public.profiles (id),
  uploaded_by_role text not null check (uploaded_by_role in ('ouder', 'kind')),
  created_at timestamptz not null default now()
);

create index materials_subject_id_idx on public.materials (subject_id);

-- ---------------------------------------------------------------------------
-- Agenda / planning: huiswerk, toetsen, prive-activiteiten, leermomenten
-- ---------------------------------------------------------------------------
create table public.planning_items (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  subject_id uuid references public.subjects (id) on delete set null,
  parent_item_id uuid references public.planning_items (id) on delete cascade,
  type text not null check (type in ('huiswerk', 'toets', 'prive', 'leermoment')),
  title text not null,
  description text not null default '',
  start_date date,
  due_date date not null,
  status text not null check (status in ('voorstel', 'open', 'klaar')) default 'open',
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create index planning_items_family_id_idx on public.planning_items (family_id);
create index planning_items_due_date_idx on public.planning_items (due_date);
create index planning_items_parent_item_id_idx on public.planning_items (parent_item_id);

-- ---------------------------------------------------------------------------
-- Chatgeschiedenis met de AI-vakdocent (per kind, per vak)
-- ---------------------------------------------------------------------------
create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  subject_id uuid not null references public.subjects (id) on delete cascade,
  user_id uuid not null references public.profiles (id),
  role text not null check (role in ('user', 'model')),
  content text not null,
  created_at timestamptz not null default now()
);

create index chat_messages_subject_user_idx on public.chat_messages (subject_id, user_id, created_at);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.families enable row level security;
alter table public.profiles enable row level security;
alter table public.subjects enable row level security;
alter table public.materials enable row level security;
alter table public.planning_items enable row level security;
alter table public.chat_messages enable row level security;

-- families: leden mogen hun eigen gezin lezen; alleen via trigger aangemaakt
create policy "families: select own" on public.families
  for select using (id = public.current_family_id());

-- profiles: leden zien elkaars profiel binnen het gezin; ieder update alleen zichzelf
create policy "profiles: select family" on public.profiles
  for select using (family_id = public.current_family_id());
create policy "profiles: update self" on public.profiles
  for update using (id = auth.uid());

-- subjects: hele gezin leest; alleen ouder beheert
create policy "subjects: select family" on public.subjects
  for select using (family_id = public.current_family_id());
create policy "subjects: insert by ouder" on public.subjects
  for insert with check (family_id = public.current_family_id() and public.current_role() = 'ouder');
create policy "subjects: update by ouder" on public.subjects
  for update using (family_id = public.current_family_id() and public.current_role() = 'ouder');
create policy "subjects: delete by ouder" on public.subjects
  for delete using (family_id = public.current_family_id() and public.current_role() = 'ouder');

-- materials: hele gezin leest en voegt toe (ouder EN kind mogen uploaden), alleen uploader of ouder verwijdert
create policy "materials: select family" on public.materials
  for select using (family_id = public.current_family_id());
create policy "materials: insert family" on public.materials
  for insert with check (family_id = public.current_family_id() and uploaded_by = auth.uid());
create policy "materials: delete own or ouder" on public.materials
  for delete using (
    family_id = public.current_family_id()
    and (uploaded_by = auth.uid() or public.current_role() = 'ouder')
  );

-- planning_items: hele gezin leest en beheert samen (ouder plant mee, kind plant mee)
create policy "planning: select family" on public.planning_items
  for select using (family_id = public.current_family_id());
create policy "planning: insert family" on public.planning_items
  for insert with check (family_id = public.current_family_id() and created_by = auth.uid());
create policy "planning: update family" on public.planning_items
  for update using (family_id = public.current_family_id());
create policy "planning: delete family" on public.planning_items
  for delete using (family_id = public.current_family_id());

-- chat_messages: kind ziet en schrijft eigen gesprekken; ouder mag meelezen (transparantie/veiligheid)
create policy "chat: select own or ouder" on public.chat_messages
  for select using (
    family_id = public.current_family_id()
    and (user_id = auth.uid() or public.current_role() = 'ouder')
  );
create policy "chat: insert own" on public.chat_messages
  for insert with check (family_id = public.current_family_id() and user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Storage bucket voor geuploade lesstof-bestanden (originelen, niet de AI-tekst)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('lesstof', 'lesstof', false)
on conflict (id) do nothing;

create policy "lesstof: select own family folder" on storage.objects
  for select using (
    bucket_id = 'lesstof'
    and (storage.foldername(name))[1] = public.current_family_id()::text
  );
create policy "lesstof: insert own family folder" on storage.objects
  for insert with check (
    bucket_id = 'lesstof'
    and (storage.foldername(name))[1] = public.current_family_id()::text
  );
create policy "lesstof: delete own family folder" on storage.objects
  for delete using (
    bucket_id = 'lesstof'
    and (storage.foldername(name))[1] = public.current_family_id()::text
  );
