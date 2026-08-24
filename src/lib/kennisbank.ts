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

// ---------------------------------------------------------------------------
// Kennisonderdelen (regel-niveau kennisbank) als lesstof-bron - gedeeld door
// de vakdocent-chat (incl. opdrachten-maken-modus, zelfde route) en Oefenen,
// zodat een vak dat gemigreerd is naar kennis_onderdelen overal dezelfde,
// bijgewerkte bron gebruikt i.p.v. de oudere materials-tekst.
// ---------------------------------------------------------------------------

export interface KennisOnderdeelRij {
  paragraaf_id: string;
  naam: string;
  regel: string;
  voorbeelden: string[];
  gecombineerd_voorbeeld: string | null;
  tip: string | null;
  uitzondering: string | null;
  fout_voorbeeld: string | null;
}

export interface KennisParagraafContextRij {
  paragraaf_id: string;
  titel: string;
  leerdoelen?: string | null;
  voorkennis?: string | null;
  kernbegrippen?: string | null;
}

export interface KennisWoordenlijstRij {
  paragraaf_id: string;
  titel: string;
  woorden: { bron: string; doel: string; voorbeeldzin: string | null }[];
}

/** Bouwt leesbare lesstof-tekst uit de gepubliceerde kennisonderdelen + paragraafcontext (+ evt. woordenlijsten voor taalvakken). */
export function bouwKennisbankUitOnderdelen(
  onderdelen: KennisOnderdeelRij[],
  contexten: KennisParagraafContextRij[],
  woordenlijsten: KennisWoordenlijstRij[] = []
): string {
  const paragraafIds = Array.from(
    new Set([...onderdelen.map((o) => o.paragraaf_id), ...contexten.map((c) => c.paragraaf_id), ...woordenlijsten.map((w) => w.paragraaf_id)])
  ).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  return paragraafIds
    .map((pid) => {
      const context = contexten.find((c) => c.paragraaf_id === pid);
      const onderdelenVanParagraaf = onderdelen.filter((o) => o.paragraaf_id === pid);
      const woordenlijstenVanParagraaf = woordenlijsten.filter((w) => w.paragraaf_id === pid);
      const titel = context?.titel ?? onderdelenVanParagraaf[0]?.naam ?? woordenlijstenVanParagraaf[0]?.titel ?? pid;

      const regels = [`## ${pid} - ${titel}`];
      if (context?.leerdoelen) regels.push(`Leerdoelen: ${context.leerdoelen}`);
      if (context?.voorkennis) regels.push(`Voorkennis: ${context.voorkennis}`);
      if (context?.kernbegrippen) regels.push(`Kernbegrippen: ${context.kernbegrippen}`);

      for (const o of onderdelenVanParagraaf) {
        regels.push(`\n### ${o.naam}`);
        regels.push(o.regel);
        regels.push(`Voorbeelden: ${o.voorbeelden.join("; ")}`);
        if (o.gecombineerd_voorbeeld) regels.push(`Gecombineerd voorbeeld: ${o.gecombineerd_voorbeeld}`);
        if (o.tip) regels.push(`Tip: ${o.tip}`);
        if (o.uitzondering) regels.push(`Let op: ${o.uitzondering}`);
        if (o.fout_voorbeeld) regels.push(`Veelgemaakte fout: ${o.fout_voorbeeld}`);
      }

      // Woordenlijsten letterlijk als tabel meegeven - niet parafraseren, dit
      // zijn de exact overgenomen officiële woordparen uit de bron.
      for (const w of woordenlijstenVanParagraaf) {
        regels.push(`\n### Woordenlijst: ${w.titel}`);
        regels.push("| Bron | Doel | Voorbeeldzin |");
        regels.push("| --- | --- | --- |");
        for (const woord of w.woorden) {
          regels.push(`| ${woord.bron} | ${woord.doel} | ${woord.voorbeeldzin ?? ""} |`);
        }
      }
      return regels.join("\n");
    })
    .join("\n\n");
}

/**
 * Zet kennisonderdelen om naar het MateriaalRij-shape, zodat de bestaande
 * matching-helpers hierboven (kiesBesteMateriaal e.d.) hergebruikt kunnen
 * worden om het best passende onderdeel te vinden (bv. voor het
 * lesstof-fragment bij Oefenen-feedback).
 */
export function onderdelenAlsMateriaalRijen(onderdelen: KennisOnderdeelRij[]): MateriaalRij[] {
  return onderdelen.map((o, i) => ({
    id: `${o.paragraaf_id}-${i}`,
    title: o.naam,
    content: [o.regel, ...o.voorbeelden, o.gecombineerd_voorbeeld, o.tip, o.uitzondering, o.fout_voorbeeld]
      .filter((v): v is string => Boolean(v))
      .join("\n"),
    hoofdstuk: o.paragraaf_id,
  }));
}
