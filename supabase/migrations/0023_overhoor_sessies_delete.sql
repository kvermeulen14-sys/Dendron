-- Voortgang (overhoor_sessies) kunnen opschonen: nodig omdat testsessies
-- (bv. door een ouder die het oefenen uitprobeert) anders permanent de
-- score-geschiedenis vervuilen - er was tot nu toe alleen een update-policy
-- om het transcript te legen (zie 0010_chat_retentie.sql), geen delete.
-- Zelfde toegang als de bestaande select-policy: een leerling kan alleen
-- eigen sessies opschonen, een ouder kan die van het hele gezin opschonen.
create policy "overhoor_sessies: delete own or ouder" on public.overhoor_sessies
  for delete using (
    family_id = public.current_family_id()
    and (user_id = auth.uid() or public.current_role() = 'ouder')
  );
