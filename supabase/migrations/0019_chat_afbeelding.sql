-- 0019: foto rechtstreeks in de chat, i.p.v. alleen via "lesstof toevoegen".
--
-- Tot nu toe was de enige manier om een foto van een opgave/opdracht te
-- laten zien de "lesstof toevoegen"-flow (materiaal-upload) - die slaat de
-- foto blijvend op in de kennisbank van het vak, wat niet de bedoeling is
-- voor een losse vraag over 1 opdracht. Dit voegt een plek toe om een foto
-- rechtstreeks aan 1 chatbericht te hangen (zichtbaar voor de AI-vakdocent
-- in dat gesprek, niet opgenomen in materials/kennisbank).

alter table public.chat_messages
  add column if not exists image_path text;
alter table public.opdracht_berichten
  add column if not exists image_path text;

comment on column public.chat_messages.image_path is
  'Pad in de "lesstof"-storage-bucket van een foto die de leerling bij dit bericht heeft gestuurd (bv. een opgave) - alleen voor dit gesprek, geen onderdeel van de kennisbank.';
comment on column public.opdracht_berichten.image_path is
  'Zelfde als chat_messages.image_path.';
