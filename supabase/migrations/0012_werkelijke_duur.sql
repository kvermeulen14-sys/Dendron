-- 0012: werkelijke duur per taak, voor het bijstellen van tijdsinschattingen.
--
-- We onderschatten stelselmatig hoe lang iets duurt (de planning fallacy), ook
-- als we weten dat het de vorige keer uitliep. Door bij het afvinken kort te
-- vragen hoe lang het echt duurde, kan Dendron na een paar weken bij een nieuwe
-- taak zeggen: "wiskunde duurt bij jou meestal 45 minuten, niet 30" - en dan
-- klopt de capaciteitsmeter in de agenda vanzelf beter.
--
-- Blijft leeg als de vraag wordt overgeslagen; dat is expliciet toegestaan.

alter table planning_items
  add column if not exists actual_minutes int;

comment on column planning_items.actual_minutes is
  'Hoe lang de taak volgens de leerling echt duurde; null als de vraag is overgeslagen.';
