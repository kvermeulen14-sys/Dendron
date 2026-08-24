-- 0014: welk hoofdstuk er geoefend is, per overhoor-sessie.
--
-- Nodig zodat "2 minuten oefenen" niet zomaar uit de hele lesstof van een vak
-- put (dan krijg je vragen over stof die nog lang niet behandeld is), maar
-- aansluit bij wat er bij "Oefenen" het laatst gekozen is.

alter table public.overhoor_sessies
  add column if not exists hoofdstuk text;

comment on column public.overhoor_sessies.hoofdstuk is
  'Het hoofdstuk dat gekozen werd bij het starten van de sessie (via de wizard); null bij "alle lesstof".';
