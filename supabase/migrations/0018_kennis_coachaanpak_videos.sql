-- 0018: coachaanpak en video-aanbevelingen bij paragraafcontext.
--
-- De geuploade .md-bronnen bevatten ook een tabel met veelgemaakte fouten +
-- coachvraag/hint per fout, algemene diagnostische hints, en een lijst
-- aanbevolen uitlegvideo's per paragraaf. Beide werden tot nu toe genegeerd
-- bij het importeren. coachaanpak voedt straks (via de chat-route) de
-- AI-vakdocent met paragraafspecifieke coachtips; videos is een simpele
-- linklijst (titel/url/wanneer aanbieden) die de AI-vakdocent aan de
-- leerling kan voorstellen - Dendron host of embedt zelf geen video's.

alter table public.kennis_paragraaf_context
  add column if not exists coachaanpak text,
  add column if not exists videos jsonb not null default '[]'::jsonb;

comment on column public.kennis_paragraaf_context.coachaanpak is
  'Praktische coachaanpak voor de AI-vakdocent bij deze paragraaf (veelgemaakte fouten + coachvraag/hint, diagnostische hints), als lopende tekst.';
comment on column public.kennis_paragraaf_context.videos is
  'Array van aanbevolen uitlegvideo''s: [{"titel": "...", "url": "...", "aanbiedenBij": "..." | null}]. Alleen links, Dendron host geen video''s zelf.';
