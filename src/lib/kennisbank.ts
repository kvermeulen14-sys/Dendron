// Gedeelde helpers om lesstof (materials) te selecteren voor de AI-routes
// (vakdocent-chat, overhoren). Bij een kleine kennisbank geven we gewoon
// alles mee - simpel en werkt prima voor de meeste vakken. Bij een grote
// kennisbank (bv. een volledig geimporteerde methode) is dat te veel voor
// de tokenlimiet, dus kiezen we gericht.

// Boven dit aantal materialen dumpen we niet alles in de prompt.
export const GROTE_KENNISBANK_DREMPEL = 8;
const MAX_GESELECTEERDE_MATERIALEN = 6;

export type MateriaalRij = {
  id: string;
  title: string;
  content: string;
  hoofdstuk: string | null;
  image_path?: string | null;
};

const NEGEER_WOORDEN = new Set([
  "de",
  "het",
  "een",
  "en",
  "van",
  "in",
  "op",
  "is",
  "ik",
  "je",
  "dat",
  "wat",
  "hoe",
  "snap",
  "niet",
  "met",
  "voor",
  "over",
  "vraag",
  "hulp",
]);

function woordenVan(tekst: string) {
  return tekst
    .toLowerCase()
    .split(/[^a-z0-9.,]+/i)
    .map((w) => w.trim())
    .filter((w) => w.length > 2 && !NEGEER_WOORDEN.has(w));
}

function scoorMaterialen<T extends MateriaalRij>(materials: T[], zoekTekst: string) {
  const paragraafMatch = zoekTekst.match(/\b\d{1,2}\.\d{1,2}\b/g) ?? [];
  const woorden = woordenVan(zoekTekst);

  return materials
    .map((m) => {
      let score = 0;
      const titelLower = m.title.toLowerCase();
      for (const par of paragraafMatch) {
        if (titelLower.startsWith(par.toLowerCase())) score += 10;
      }
      for (const w of woorden) {
        if (titelLower.includes(w)) score += 3;
        if (m.hoofdstuk?.toLowerCase().includes(w)) score += 2;
        if (m.content.toLowerCase().includes(w)) score += 1;
      }
      return { materiaal: m, score };
    })
    .sort((a, b) => b.score - a.score);
}

/**
 * Kiest welke materialen relevant genoeg zijn om in de prompt mee te geven,
 * op basis van paragraafnummers/trefwoorden in `zoekTekst`. Geeft "index"
 * terug (geen volledige lesstof, alleen titels) als niets duidelijk matcht,
 * zodat de tutor om verduidelijking kan vragen in plaats van te gokken.
 */
export function kiesRelevanteMaterialen<T extends MateriaalRij>(materials: T[], zoekTekst: string) {
  if (materials.length <= GROTE_KENNISBANK_DREMPEL) {
    return { modus: "alles" as const, gekozen: materials };
  }

  const gekozen = scoorMaterialen(materials, zoekTekst)
    .filter((g) => g.score > 0)
    .slice(0, MAX_GESELECTEERDE_MATERIALEN)
    .map((g) => g.materiaal);

  if (gekozen.length === 0) {
    return { modus: "index" as const, gekozen: [] as T[] };
  }
  return { modus: "selectie" as const, gekozen };
}

/**
 * Kiest het ENE best-passende materiaal (of null als niets echt matcht) -
 * i.t.t. kiesRelevanteMaterialen valt dit NOOIT terug op "geef alles maar"
 * bij een kleine kennisbank. Bedoeld voor plekken waar maar 1 concreet,
 * relevant stukje getoond moet worden (bv. een lesstof-fragment bij
 * feedback) - een willekeurig eerste materiaal tonen zou daar juist
 * verwarrend/irrelevant zijn.
 */
export function kiesBesteMateriaal<T extends MateriaalRij>(materials: T[], zoekTekst: string): T | null {
  const beste = scoorMaterialen(materials, zoekTekst)[0];
  return beste && beste.score > 0 ? beste.materiaal : null;
}

/** Kiest een willekeurige subset materialen - voor overhoren, waar geen vrije-tekstvraag is om op te matchen. */
export function kiesWillekeurigeSelectie<T>(materials: T[], aantal: number): T[] {
  if (materials.length <= aantal) return materials;
  const kopie = [...materials];
  for (let i = kopie.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [kopie[i], kopie[j]] = [kopie[j], kopie[i]];
  }
  return kopie.slice(0, aantal);
}
