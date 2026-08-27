-- Onderscheid tussen "Woordenschat" (losse woorden/korte termen, stampwerk)
-- en "Zinnen & Uitdrukkingen" (complete standaardzinnen, letterlijk leren) -
-- beide waren tot nu toe niet te onderscheiden kennis_woordenlijsten-rijen.
alter table public.kennis_woordenlijsten
  add column if not exists categorie text not null default 'woordenschat'
    check (categorie in ('woordenschat', 'zinnen'));
