-- Korte code per vak (bijv. 'WI' voor Wiskunde), gebruikt als compact label
-- in de agenda zodat kaartjes leesbaar blijven zonder de volledige vaknaam.
alter table public.subjects
  add column if not exists code text;

alter table public.subjects
  add constraint subjects_family_code_unique unique (family_id, code);
