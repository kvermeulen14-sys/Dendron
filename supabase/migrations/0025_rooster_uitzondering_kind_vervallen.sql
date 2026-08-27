-- "Deze les valt uit" (maakRoosterUitzonderingSimpel in rooster.ts) is bewust
-- kind-toegankelijk: een leerling weet vaak het eerst dat een les uitvalt.
-- De bestaande "insert/delete by ouder"-policies op rooster_uitzonderingen
-- blokkeerden dat via RLS, waardoor de actie voor een kind-account altijd
-- mislukte. Deze policies staan alleen het smalle geval toe dat de simpele
-- actie ook echt gebruikt (1 bestaand lesuur voor 1 dag laten vervallen) -
-- een kind kan geen "gewijzigd"/"extra"-uitzonderingen aanmaken of het hele
-- rooster laten vervallen.
create policy "rooster_uitzonderingen: insert vervallen by kind" on public.rooster_uitzonderingen
  for insert
  with check (
    family_id = public.current_family_id()
    and public.current_role() = 'kind'
    and type = 'vervallen'
    and origineel_item_id is not null
  );

create policy "rooster_uitzonderingen: delete eigen vervallen by kind" on public.rooster_uitzonderingen
  for delete
  using (
    family_id = public.current_family_id()
    and public.current_role() = 'kind'
    and type = 'vervallen'
  );
