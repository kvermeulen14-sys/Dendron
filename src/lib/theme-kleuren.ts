import type { KleurCategorie, ThemeKleuren } from "@/lib/types";

/** Zelfde waarden als de :root-defaults in theme.css - hier ook nodig om
 * een startpunt te hebben voor de instelschermen en om ontbrekende
 * categorieën in een opgeslagen ThemeKleuren aan te vullen. */
export const STANDAARD_KLEUREN: Record<KleurCategorie, { hue: number; sat: number }> = {
  accent: { hue: 296, sat: 55 },
  toets: { hue: 13, sat: 80 },
  huiswerk: { hue: 35, sat: 85 },
  leermoment: { hue: 185, sat: 45 },
  prive: { hue: 331, sat: 55 },
};

export const KLEUR_CATEGORIE_LABELS: Record<KleurCategorie, { naam: string; uitleg: string }> = {
  accent: { naam: "Hoofdaccent", uitleg: "knoppen, links, actieve status" },
  toets: { naam: "Toets", uitleg: "bewust geen alarm-rood" },
  huiswerk: { naam: "Huiswerk", uitleg: "moet opvallen naast toets" },
  leermoment: { naam: "Leermoment", uitleg: "leren voor een toets" },
  prive: { naam: "Privé", uitleg: "sport, afspraken, klusjes" },
};

export const KLEUR_PRESETS: Record<string, ThemeKleuren> = {
  Pastel: {
    accent: { hue: 296, sat: 55 },
    toets: { hue: 13, sat: 80 },
    huiswerk: { hue: 35, sat: 85 },
    leermoment: { hue: 185, sat: 45 },
    prive: { hue: 331, sat: 55 },
  },
  Rustig: {
    accent: { hue: 252, sat: 82 },
    toets: { hue: 16, sat: 88 },
    huiswerk: { hue: 40, sat: 90 },
    leermoment: { hue: 225, sat: 65 },
    prive: { hue: 335, sat: 60 },
  },
  Warm: {
    accent: { hue: 22, sat: 70 },
    toets: { hue: 12, sat: 82 },
    huiswerk: { hue: 36, sat: 88 },
    leermoment: { hue: 205, sat: 50 },
    prive: { hue: 318, sat: 55 },
  },
  Fris: {
    accent: { hue: 198, sat: 70 },
    toets: { hue: 14, sat: 85 },
    huiswerk: { hue: 46, sat: 85 },
    leermoment: { hue: 188, sat: 62 },
    prive: { hue: 340, sat: 55 },
  },
};

/** Vult de opgeslagen (mogelijk deels lege) kleuren aan met de standaardwaarden. */
export function volledigeKleuren(kleuren: ThemeKleuren | null | undefined): Record<KleurCategorie, { hue: number; sat: number }> {
  return {
    accent: kleuren?.accent ?? STANDAARD_KLEUREN.accent,
    toets: kleuren?.toets ?? STANDAARD_KLEUREN.toets,
    huiswerk: kleuren?.huiswerk ?? STANDAARD_KLEUREN.huiswerk,
    leermoment: kleuren?.leermoment ?? STANDAARD_KLEUREN.leermoment,
    prive: kleuren?.prive ?? STANDAARD_KLEUREN.prive,
  };
}

/** Zet hue (0-360) + saturation (0-100%) + lightness (0-100%) om naar een
 * hex-kleur - voor een live voorbeeld dat niet kan wachten op een CSS-
 * herberekening (bv. terwijl een schuifje nog wordt versleept). */
export function hslNaarHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (x: number) =>
    Math.round(x * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

/** Bouwt de inline CSS-variabelen voor op <html style="...">, zodat een
 * per-gezin kleurenschema theme.css's :root-defaults overschrijft zonder
 * dat theme.css zelf hoeft te weten dat dit bestaat. Inline stijl wint
 * altijd van een stylesheet-regel, dus geen cascade-volgorde-gedoe. */
export function themeKleurenCssVars(kleuren: ThemeKleuren | null | undefined): Record<string, string> {
  if (!kleuren) return {};
  const vars: Record<string, string> = {};
  for (const [categorie, waarde] of Object.entries(kleuren)) {
    if (!waarde) continue;
    vars[`--hue-${categorie}`] = String(waarde.hue);
    vars[`--sat-${categorie}`] = `${waarde.sat}%`;
  }
  return vars;
}
