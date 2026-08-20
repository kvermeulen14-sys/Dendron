-- Dendron Planner - toetsvormen, rooster en uitgebreide kennisbank (RAG)
-- Voer dit uit in de Supabase SQL editor, na 0001_init.sql.

create extension if not exists "vector";

-- ---------------------------------------------------------------------------
-- Reistijd (fietstijd) per gezin, gebruikt om automatisch blokken voor/na
-- school in de agenda te tonen.
-- ---------------------------------------------------------------------------
alter table public.families
  add column if not exists reistijd_minuten integer not null default 15;

-- ---------------------------------------------------------------------------
-- Toetsvormen: SO / mondeling / toetsweek-toets etc, elk met eigen leeradvies
-- ---------------------------------------------------------------------------
create table public.test_types (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  name text not null,
  dagen_van_tevoren integer not null default 7,
  aantal_leermomenten integer not null default 3,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create index test_types_family_id_idx on public.test_types (family_id);

alter table public.planning_items
  add column if not exists test_type_id uuid references public.test_types (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Rooster: terugkerend wekelijks schema (schooltijden, eventueel losse
-- vaste activiteiten). Fietstijd wordt er automatisch omheen berekend.
-- ---------------------------------------------------------------------------
create table public.rooster_items (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  subject_id uuid references public.subjects (id) on delete set null,
  dag_van_week integer not null check (dag_van_week between 1 and 7), -- 1 = maandag ... 7 = zondag
  start_tijd time not null,
  eind_tijd time not null,
  titel text not null,
  type text not null check (type in ('school', 'anders')) default 'school',
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  constraint rooster_items_tijd_check check (eind_tijd > start_tijd)
);

create index rooster_items_family_id_idx on public.rooster_items (family_id);
create index rooster_items_dag_idx on public.rooster_items (family_id, dag_van_week);

-- ---------------------------------------------------------------------------
-- Kennisbank uitbreiden: hoofdstuk/opdracht-referenties en een afbeelding
-- die de AI-vakdocent later opnieuw kan tonen.
-- ---------------------------------------------------------------------------
alter table public.materials
  add column if not exists hoofdstuk text,
  add column if not exists opdrachten text,
  add column if not exists image_path text,
  add column if not exists bron_type text not null default 'tekst' check (bron_type in ('tekst', 'pdf', 'foto'));

-- ---------------------------------------------------------------------------
-- Kennisbank-chunks: elk materiaal wordt opgeknipt zodat de AI-vakdocent
-- per vraag alleen de relevante stukjes ophaalt (RAG), in plaats van alle
-- lesstof van een vak in elk gesprek mee te sturen. Zo blijft dit behapbaar
-- en betaalbaar ook als er veel materiaal per vak bijkomt.
-- ---------------------------------------------------------------------------
create table public.material_chunks (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  subject_id uuid not null references public.subjects (id) on delete cascade,
  material_id uuid not null references public.materials (id) on delete cascade,
  content text not null,
  embedding vector(768),
  created_at timestamptz not null default now()
);

create index material_chunks_subject_id_idx on public.material_chunks (subject_id);
create index material_chunks_embedding_idx on public.material_chunks
  using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- Zoekfunctie: geef de meest relevante chunks terug voor een vak, gegeven
-- de embedding van de vraag van de leerling.
create function public.match_material_chunks(
  query_embedding vector(768),
  match_subject_id uuid,
  match_count integer default 6
)
returns table (
  id uuid,
  material_id uuid,
  content text,
  similarity float
)
language sql
stable
security definer
set search_path = public
as $$
  select
    material_chunks.id,
    material_chunks.material_id,
    material_chunks.content,
    1 - (material_chunks.embedding <=> query_embedding) as similarity
  from public.material_chunks
  where material_chunks.subject_id = match_subject_id
    and material_chunks.family_id = public.current_family_id()
  order by material_chunks.embedding <=> query_embedding
  limit match_count;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security voor de nieuwe tabellen
-- ---------------------------------------------------------------------------
alter table public.test_types enable row level security;
alter table public.rooster_items enable row level security;
alter table public.material_chunks enable row level security;

-- families had tot nu toe geen update-policy; nodig om de reistijd aan te passen.
create policy "families: update by ouder" on public.families
  for update using (id = public.current_family_id() and public.current_role() = 'ouder');

create policy "test_types: select family" on public.test_types
  for select using (family_id = public.current_family_id());
create policy "test_types: insert by ouder" on public.test_types
  for insert with check (family_id = public.current_family_id() and public.current_role() = 'ouder');
create policy "test_types: update by ouder" on public.test_types
  for update using (family_id = public.current_family_id() and public.current_role() = 'ouder');
create policy "test_types: delete by ouder" on public.test_types
  for delete using (family_id = public.current_family_id() and public.current_role() = 'ouder');

create policy "rooster_items: select family" on public.rooster_items
  for select using (family_id = public.current_family_id());
create policy "rooster_items: insert by ouder" on public.rooster_items
  for insert with check (family_id = public.current_family_id() and public.current_role() = 'ouder');
create policy "rooster_items: update by ouder" on public.rooster_items
  for update using (family_id = public.current_family_id() and public.current_role() = 'ouder');
create policy "rooster_items: delete by ouder" on public.rooster_items
  for delete using (family_id = public.current_family_id() and public.current_role() = 'ouder');

create policy "material_chunks: select family" on public.material_chunks
  for select using (family_id = public.current_family_id());
create policy "material_chunks: insert family" on public.material_chunks
  for insert with check (family_id = public.current_family_id());
create policy "material_chunks: delete family" on public.material_chunks
  for delete using (family_id = public.current_family_id());
