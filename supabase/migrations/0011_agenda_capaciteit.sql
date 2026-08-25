-- 0011: avondgrens per gezin, voor het capaciteitsmodel van de agenda.
--
-- De agenda rekent per dag uit hoeveel tijd er echt beschikbaar is: vanaf het
-- moment dat het kind thuis is (einde rooster + fietstijd + een pauze) tot deze
-- avondgrens. Dat maakt zichtbaar wanneer er meer gepland staat dan er past,
-- in plaats van dat een overvolle dag er net zo uitziet als een rustige.

alter table families
  add column if not exists avond_grens time not null default '20:30';

comment on column families.avond_grens is
  'Tot hoe laat er ''s avonds gepland mag worden; bepaalt samen met het rooster en de fietstijd de beschikbare tijd per dag.';
