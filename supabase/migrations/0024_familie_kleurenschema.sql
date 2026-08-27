-- Aanpasbaar kleurenschema per gezin: de ouder kan de hue/verzadiging per
-- categorie (accent/toets/huiswerk/leermoment/prive) zelf instellen i.p.v.
-- dat de kleuren van heel Dendron vastliggen in theme.css. Null = gebruik de
-- standaardkleuren uit theme.css (zie layout.tsx voor hoe dit wordt toegepast
-- als inline CSS-variabelen op <html>, die theme.css's :root overschrijven).
alter table public.families
  add column if not exists theme_kleuren jsonb;

comment on column public.families.theme_kleuren is
  'Optioneel: {"accent": {"hue": 296, "sat": 55}, "toets": {...}, "huiswerk": {...}, "leermoment": {...}, "prive": {...}}. Null = standaardkleuren uit theme.css.';

-- Hergebruikt de bestaande "families: update by ouder"-policy (0002) - geen
-- nieuwe policy nodig.
