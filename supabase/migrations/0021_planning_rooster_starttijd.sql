-- Onthoudt op welk specifiek rooster-lesuur een huiswerk/toets-deadline is
-- aangemaakt (via het klikken op een vak-blokje in het rooster). Nodig zodra
-- eenzelfde vak die dag 2x in het rooster staat: zonder dit werd de deadline
-- op BEIDE lesuren getoond (leek dubbel gepland) i.p.v. alleen op het lesuur
-- waar de leerling 'm daadwerkelijk op aanmaakte. Los van start_time (dat is
-- wanneer de leerling ERAAN GAAT WERKEN, dit is puur ter herkenning van het
-- bronlesuur) - blijft leeg voor items die niet via een rooster-blokje zijn
-- aangemaakt (bv. via "Nieuw item" of de Planningshulp-chat).
alter table public.planning_items
  add column if not exists rooster_start_tijd time;
