-- 0015: herhaalde items linken via een gedeelde reeks-id.
--
-- Tot nu toe werd een herhalend item bij het aanmaken meteen helemaal
-- "uitgeschreven" tot losse, onafhankelijke rijen zonder onderlinge link -
-- handig om per keer af te vinken/te verplaatsen, maar onmogelijk om de hele
-- reeks in 1 keer aan te passen (bv. de titel of het tijdstip wijzigen voor
-- alle nog niet afgevinkte herhalingen tegelijk).

alter table public.planning_items
  add column if not exists herhaling_groep_id uuid;

create index if not exists planning_items_herhaling_groep_idx
  on public.planning_items (herhaling_groep_id)
  where herhaling_groep_id is not null;

comment on column public.planning_items.herhaling_groep_id is
  'Gedeeld tussen alle occurrences van 1 herhalend item, zodat de hele reeks in 1 keer aangepast kan worden; null voor een niet-herhalend item.';
