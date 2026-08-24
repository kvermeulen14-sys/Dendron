"use server";

import "server-only";
import { z } from "zod";
import { createGeminiClient, genereerGestructureerd } from "@/lib/gemini";
import { GETAL_EN_RUIMTE_2HV13, hoofdstukLabel } from "@/lib/data/getal-en-ruimte-2hv13";
import { ouderProfiel, revalidateVak, slaGegenereerdeOnderdelenOp, OnderdeelSchema } from "@/lib/kennis-onderdelen-shared";
import type { KennisOnderdeelStatus, KennisWoord } from "@/lib/types";

const MAX_BRONTEKST_LENGTE = 60_000;

// Let op: schema's + beschrijvingen bewust klein/kort houden, en in 2 losse
// aanroepen gesplitst (meta+context+onderdelen, en apart de oefenbank).
// 1 groot gecombineerd schema (met o.a. een geneste array tot 40 items)
// bleek bij Gemini's structured output een harde 400-fout te geven:
// "The specified schema produces a constraint that has too many states for
// serving" - de constrained-decoding-engine compileert het schema naar een
// eindige automaat met een maximumgrootte, en te veel tekst/te lange
// geneste arrays laten die grens overschrijden. Kleinere, losse schema's
// blijven daar ruim onder.
const MetaSchema = z.object({
  isParagraafBestand: z.boolean().describe("True = bevat lesstof van 1 paragraaf. False = index/rapport zonder eigen lesstof."),
  paragraafId: z
    .string()
    .nullable()
    .describe("Paragraaf- of unitnummer zoals in de tekst genoemd (bv '1.2' of gewoon '4' bij units), of null."),
  paragraafTitel: z.string().nullable().describe("Titel van de paragraaf, of null."),
  hoofdstukLabel: z.string().nullable().describe("Leesbaar hoofdstuklabel, of null."),
  leerdoelen: z
    .string()
    .nullable()
    .describe("Leerdoelen, 1 per regel met een '- ' ervoor (opsomming met echte newlines, geen aaneengeschreven tekst), of null."),
  voorkennis: z
    .string()
    .nullable()
    .describe("Benodigde voorkennis, 1 per regel met een '- ' ervoor (opsomming met echte newlines), of null."),
  kernbegrippen: z
    .string()
    .nullable()
    .describe(
      "Belangrijkste begrippen + korte omschrijving, 1 begrip per regel als '- Begrip: omschrijving' (opsomming met echte newlines), of null."
    ),
  oplossingsroute: z
    .string()
    .nullable()
    .describe("Vaste oplossingsstappen, genummerd 1 stap per regel als '1. ...' (met echte newlines), of null."),
  beheersingscriterium: z.string().nullable().describe("Beheersingscriterium, of null."),
  coachaanpak: z
    .string()
    .nullable()
    .describe(
      "Coachtips voor een AI-tutor: fouten+coachvraag/hint, kort samengevat, 1 per regel met een '- ' ervoor (echte newlines), of null."
    ),
  videos: z.array(z.object({ titel: z.string(), url: z.string(), aanbiedenBij: z.string().nullable() })).max(5),
  onderdelen: z.array(OnderdeelSchema).max(8),
});

const OefenvraagSchema = z.object({
  niveau: z.string().nullable().describe("Niveau-label (bv 'A'), of null."),
  vraag: z.string().describe("De opgave, letterlijk overgenomen."),
  antwoord: z.string().describe("Het antwoord, letterlijk overgenomen."),
  uitwerking: z.string().nullable().describe("Kernuitwerking, of null."),
});

// Klein, goedkoop classificatie-schema voor de taalvak-import hieronder: de
// AI ziet hier ALLEEN de koppen, nooit de tabelinhoud zelf - de daadwerkelijke
// woordparen worden puur met stringmanipulatie geparst (zie parseWoordenTabel),
// zodat een officiële boekformulering nooit via een AI-parafrase kan
// veranderen.
const BlokClassificatieSchema = z.object({
  blokken: z
    .array(
      z.object({
        index: z.number(),
        type: z.enum(["woordenlijst", "overig"]).describe("'woordenlijst' = tabel met letterlijke woord-/uitdrukkingparen, anders 'overig'."),
      })
    )
    .max(80),
});

const OefenvragenSchema = z.object({
  oefenvragen: z.array(OefenvraagSchema).max(24),
});

function bouwMetaPrompt(bestandsnaam: string, brontekst: string): string {
  return [
    "Dit is 1 geëxporteerd kennisbank-bestand (.md) uit een extern hulpmiddel, lesstof voor een leerling van 2 havo.",
    "De structuur/koppen kunnen per bestand verschillen - herken zelf welk stuk tekst bij welk veld hoort.",
    "",
    `Bestandsnaam: ${bestandsnaam}`,
    "",
    "Inhoud van het bestand:",
    brontekst,
    "",
    "Instructies:",
    "- Bepaal eerst of dit bestand de lesstof van 1 paragraaf bevat (isParagraafBestand=true), of een index/rapport zonder eigen paragraaflesstof (false, dan overige velden leeg/leeg array).",
    "- Negeer bronvermeldingen, video-links en interne labels zoals [N-structuur]/[Schooldoel].",
    "- Voor 'onderdelen': splits de regels/theorie op in losse, benoemde deelvaardigheden met voorbeelden/tip/uitzondering/foutvoorbeeld, gebaseerd op de tekst. Gebruik alleen de wiskundige inhoud uit de tekst zelf.",
    "- Voor 'coachaanpak': vat een eventuele fouten-tabel en coach-/diagnostische instructies samen als korte lopende tekst, geen tabel/markdown.",
    "- Voor 'videos': alleen bestaande links uit de tekst met titel en (indien aangegeven) wanneer aan te bieden.",
    "- Gebruik ECHTE Unicode-machttekens voor machten (² ³ ⁴ ⁵ ⁶ ⁷ ⁸ ⁹, dus \"x²\" en \"(2x²)³\"), NOOIT een ^ (dat is een programmeerteken, geen wiskundenotatie, en wordt letterlijk als ^ getoond). Schrijf een breuk als platte tekst \"teller/noemer\" (bv. \"2/3\"). Geen LaTeX, geen markdown-koppen in tekstvelden.",
  ].join("\n");
}

function bouwOefenvragenPrompt(bestandsnaam: string, brontekst: string): string {
  return [
    "Dit is 1 geëxporteerd kennisbank-bestand (.md), lesstof voor een leerling van 2 havo.",
    "Zoek alleen de oefenbank/opgavenlijst met antwoorden op (indien aanwezig) - negeer de rest van het bestand.",
    "",
    `Bestandsnaam: ${bestandsnaam}`,
    "",
    "Inhoud van het bestand:",
    brontekst,
    "",
    "Instructies:",
    "- Neem vraag/antwoord/uitwerking zo veel mogelijk LETTERLIJK over - dit zijn al gecontroleerde antwoorden, verzin niets nieuws en wijzig geen getallen.",
    "- Geen oefenbank gevonden? Geef een lege array terug.",
    "- Meer dan 24 vragen? Neem de eerste 24.",
    "- Gebruik ECHTE Unicode-machttekens voor machten (² ³ ⁴ ⁵ ⁶ ⁷ ⁸ ⁹), NOOIT een ^. Schrijf een breuk als platte tekst \"teller/noemer\". Geen LaTeX.",
  ].join("\n");
}

function afgeleideTitelVanBestandsnaam(bestandsnaam: string): string {
  return bestandsnaam
    .replace(/\.(md|markdown|txt)$/i, "")
    .replace(/^\d+(\.\d+)*[_\s-]*/, "")
    .replace(/[_-]+/g, " ")
    .trim() || bestandsnaam;
}

// ---------------------------------------------------------------------------
// Taalvak-import: aparte pipeline voor kennisbestanden van taalvakken
// (Engels e.d.). Zulke bestanden bevatten naast grammatica-uitleg en een
// oefenbank (die prima passen in de bestaande verwerkKennisBrontekst-pipeline
// hierboven) ook grote, letterlijke woorden-/uitdrukkingentabellen. Die
// tabellen (a) horen qua vorm niet bij het "regel + voorbeelden"-model van
// kennis_onderdelen, (b) zijn vaak met 15-20+ losse lijsten per unit te veel
// voor de 8-onderdelen-cap per AI-aanroep, en (c) moeten LETTERLIJK
// (niet-geparafraseerd) bewaard blijven. Daarom: de AI classificeert alleen
// WELKE koppen een woordenlijst zijn (ziet de tabelinhoud niet inhoudelijk
// hoeven te herschrijven), en de tabellen zelf worden met gewone
// stringmanipulatie geparst - geen AI-parafrase mogelijk. Wat overblijft na
// het wegknippen van de woordenlijst-secties gaat als (veel kleinere) tekst
// alsnog door de bestaande verwerkKennisBrontekst-pipeline voor grammatica +
// oefenbank.
// ---------------------------------------------------------------------------

interface Taalvakblok {
  heading: string;
  body: string;
  raw: string;
}

function splitsInBlokken(tekst: string): Taalvakblok[] {
  const koppenRegex = /^##\s+(.+)$/gm;
  const matches = [...tekst.matchAll(koppenRegex)];
  if (matches.length === 0) return [];

  return matches.map((match, i) => {
    const start = match.index ?? 0;
    const eind = i + 1 < matches.length ? (matches[i + 1].index ?? tekst.length) : tekst.length;
    const raw = tekst.slice(start, eind);
    return { heading: match[1].trim(), body: raw.slice(match[0].length), raw };
  });
}

/** Zoekt de eerste markdown-tabel in een blok en geeft de datarijen terug (header + scheidingsregel eruit gefilterd). */
function parseWoordenTabel(body: string): string[][] | null {
  const regels = body.split("\n").map((r) => r.trim());
  const tabelRegels: string[] = [];
  let inTabel = false;
  for (const regel of regels) {
    const isTabelRegel = regel.startsWith("|") && regel.endsWith("|") && regel.length > 1;
    if (isTabelRegel) {
      inTabel = true;
      tabelRegels.push(regel);
    } else if (inTabel) {
      break;
    }
  }
  if (tabelRegels.length < 2) return null;

  const isScheidingsregel = (r: string) => /^\|[\s:-]+(\|[\s:-]+)*\|$/.test(r.replace(/[^\S\n]/g, ""));
  const cellsVan = (regel: string) => regel.slice(1, -1).split("|").map((c) => c.trim());

  return tabelRegels
    .slice(1) // header eruit
    .filter((r) => !isScheidingsregel(r))
    .map(cellsVan);
}

function bouwClassificatiePrompt(koppen: { index: number; heading: string }[]): string {
  return [
    "Dit zijn de koppen (headings) van 1 kennisbank-bestand voor een taalvak (bv Engels/Frans/Duits), lesstof voor een leerling van 2 havo.",
    "Classificeer per kop of de bijbehorende sectie een LETTERLIJKE woorden-/uitdrukkingenlijst is: een tabel met woordparen brontaal <-> doeltaal (evt. met een voorbeeldzin) - type 'woordenlijst'.",
    "Alle andere secties (grammatica-uitleg, oefenbank/opgaven met antwoorden, leesteksten, inleidingen, coachregels e.d.) zijn 'overig'.",
    "",
    koppen.map((k) => `${k.index}. ${k.heading}`).join("\n"),
  ].join("\n");
}

/**
 * Verwerkt 1 geuploade .md-bron van een taalvak. Splitst het bestand op
 * koppen, laat de AI alleen classificeren welke koppen een letterlijke
 * woordenlijst-tabel zijn (nooit de tabelinhoud), parst die tabellen
 * deterministisch naar `kennis_woordenlijsten`, en stuurt de resterende
 * (veel kleinere) tekst - grammatica + oefenbank - alsnog door de bestaande
 * verwerkKennisBrontekst-pipeline.
 *
 * Zelfde vervang-bij-herhaalde-upload-gedrag als verwerkKennisBrontekst: de
 * woordenlijsten van deze paragraaf worden eerst gewist voor er nieuwe
 * worden opgeslagen.
 */
export async function verwerkTaalvakBrontekst(
  subjectId: string,
  brontekst: string,
  bestandsnaam: string,
  verwachteParagraafId?: string
) {
  const ouder = await ouderProfiel();
  if ("error" in ouder) return { error: ouder.error };
  const { supabase, user, familyId } = ouder;

  const tekst = brontekst.trim();
  if (!tekst) return { error: "Het bestand lijkt leeg te zijn." };
  if (tekst.length > MAX_BRONTEKST_LENGTE) {
    return { error: `Het bestand is te lang (max ${MAX_BRONTEKST_LENGTE.toLocaleString("nl-NL")} tekens per bestand).` };
  }

  const { data: subject } = await supabase.from("subjects").select("id, family_id").eq("id", subjectId).single();
  if (!subject || subject.family_id !== familyId) return { error: "Vak niet gevonden." };

  const bestandsnaamMatch = bestandsnaam.match(/^(\d+(?:\.\d+)?)/);
  const paragraafId = verwachteParagraafId || bestandsnaamMatch?.[1];
  if (!paragraafId) {
    return {
      error: `Kon geen unit-/paragraafnummer herkennen in "${bestandsnaam}". Hernoem het bestand zodat het begint met een nummer (bv "1_..." of "1.2_...") of upload het via de knop bij de juiste paragraaf.`,
    };
  }
  const hoofdstuk = `Hoofdstuk ${paragraafId.split(".")[0]}`;

  const blokken = splitsInBlokken(tekst);
  const woordenlijstIndices = new Set<number>();
  if (blokken.length > 0) {
    try {
      const client = createGeminiClient();
      const classificatie = await genereerGestructureerd(
        client,
        BlokClassificatieSchema,
        bouwClassificatiePrompt(blokken.map((b, i) => ({ index: i, heading: b.heading }))),
        4096
      );
      for (const b of classificatie.blokken) {
        if (b.type === "woordenlijst") woordenlijstIndices.add(b.index);
      }
    } catch {
      // Classificatie mislukt: geen blokken als woordenlijst behandelen, de
      // hele tekst gaat dan gewoon door de gewone grammatica/oefenbank-pipeline.
    }
  }

  await supabase.from("kennis_woordenlijsten").delete().eq("subject_id", subjectId).eq("paragraaf_id", paragraafId);

  let strippedTekst = tekst;
  let aantalWoordenlijsten = 0;
  let aantalWoorden = 0;
  let volgorde = 0;
  for (const idx of woordenlijstIndices) {
    const blok = blokken[idx];
    const rijen = parseWoordenTabel(blok.body);
    if (!rijen || rijen.length === 0) continue;

    const woorden: KennisWoord[] = rijen
      .map((r) => ({ bron: r[0]?.trim() ?? "", doel: r[1]?.trim() ?? "", voorbeeldzin: r[2]?.trim() || null }))
      .filter((w) => w.bron && w.doel);
    if (woorden.length === 0) continue;

    const { error: woordenError } = await supabase.from("kennis_woordenlijsten").insert({
      family_id: familyId,
      subject_id: subjectId,
      hoofdstuk,
      paragraaf_id: paragraafId,
      titel: blok.heading,
      richting: "gemengd" as const,
      woorden,
      volgorde: volgorde++,
      status: "concept" as const,
      created_by: user.id,
    });
    if (woordenError) return { error: woordenError.message };

    aantalWoordenlijsten++;
    aantalWoorden += woorden.length;
    strippedTekst = strippedTekst.replace(blok.raw, `## ${blok.heading}\n[Woordenlijst apart opgeslagen - ${woorden.length} woorden]\n`);
  }

  revalidateVak(subjectId);

  // Grammatica-uitleg en oefenbank: hergebruik de bestaande, beproefde
  // pipeline op de kleinere, van woordenlijsten ontdane tekst.
  const restResultaat = await verwerkKennisBrontekst(subjectId, strippedTekst, bestandsnaam, paragraafId);

  return { ...restResultaat, paragraafId, aantalWoordenlijsten, aantalWoorden };
}

export async function bewerkKennisWoordenlijst(id: string, subjectId: string, formData: FormData) {
  const ouder = await ouderProfiel();
  if ("error" in ouder) return { error: ouder.error };
  const { supabase } = ouder;

  const titel = String(formData.get("titel") || "").trim();
  const woordenRuw = String(formData.get("woorden") || "");
  const woorden: KennisWoord[] = woordenRuw
    .split("\n")
    .map((r) => r.trim())
    .filter(Boolean)
    .map((regel) => {
      const [bron, doel, voorbeeldzin] = regel.split("|").map((d) => d.trim());
      return { bron: bron ?? "", doel: doel ?? "", voorbeeldzin: voorbeeldzin || null };
    })
    .filter((w) => w.bron && w.doel);

  if (!titel || woorden.length === 0) return { error: "Vul in elk geval een titel en minstens 1 woordpaar in." };

  const { error } = await supabase
    .from("kennis_woordenlijsten")
    .update({ titel, woorden, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidateVak(subjectId);
  return { success: true };
}

export async function zetKennisWoordenlijstStatus(id: string, subjectId: string, status: KennisOnderdeelStatus) {
  const ouder = await ouderProfiel();
  if ("error" in ouder) return { error: ouder.error };
  const { supabase } = ouder;

  const { error } = await supabase
    .from("kennis_woordenlijsten")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidateVak(subjectId);
  return { success: true };
}

export async function verwijderKennisWoordenlijst(id: string, subjectId: string) {
  const ouder = await ouderProfiel();
  if ("error" in ouder) return { error: ouder.error };
  const { supabase } = ouder;

  const { error } = await supabase.from("kennis_woordenlijsten").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidateVak(subjectId);
  return { success: true };
}

/**
 * Verwerkt 1 geuploade .md-bron (of vergelijkbare tekst) tot een complete
 * paragraaf-kennisbank: losse kennisonderdelen, paragraafcontext (leerdoelen/
 * voorkennis/kernbegrippen/oplossingsroute/beheersingscriterium) en een
 * kant-en-klare oefenbank (vraag/antwoord/uitwerking). Alles komt binnen als
 * 'concept', ter controle/publicatie door de ouder.
 *
 * `verwachteParagraafId` (optioneel) pint het resultaat op 1 bekende
 * paragraaf - gebruikt bij het uploaden vanuit 1 specifieke paragraafrij, zodat
 * een eventuele foutieve AI-herkenning niet op de verkeerde plek belandt.
 * Zonder dat argument (bulk-upload van meerdere bestanden) herkent de AI zelf
 * welke paragraaf het is, met de bestandsnaam als terugvaloptie.
 *
 * Bij een herhaalde upload voor dezelfde paragraaf worden de vorige
 * onderdelen/oefenvragen/context van die paragraaf vervangen (niet
 * opgeteld), zodat itereren op het bronbestand geen duplicaten oplevert.
 */
export async function verwerkKennisBrontekst(
  subjectId: string,
  brontekst: string,
  bestandsnaam: string,
  verwachteParagraafId?: string
) {
  const ouder = await ouderProfiel();
  if ("error" in ouder) return { error: ouder.error };
  const { supabase, user, familyId } = ouder;

  const tekst = brontekst.trim();
  if (!tekst) return { error: "Het bestand lijkt leeg te zijn." };
  if (tekst.length > MAX_BRONTEKST_LENGTE) {
    return { error: `Het bestand is te lang (max ${MAX_BRONTEKST_LENGTE.toLocaleString("nl-NL")} tekens per bestand).` };
  }

  const { data: subject } = await supabase.from("subjects").select("id, family_id").eq("id", subjectId).single();
  if (!subject || subject.family_id !== familyId) return { error: "Vak niet gevonden." };

  const client = createGeminiClient();

  let meta: z.infer<typeof MetaSchema>;
  try {
    meta = await genereerGestructureerd(client, MetaSchema, bouwMetaPrompt(bestandsnaam, tekst), 16_384, {
      debugFouten: true,
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "AI-verwerking mislukt." };
  }

  if (!meta.isParagraafBestand) {
    return { overgeslagen: true, reden: "Geen paragraaf-lesstof herkend (waarschijnlijk een index-/overzichtsbestand)." };
  }

  // Niet elke methode werkt met een hoofdstuk.paragraaf-decimaal (bv "1.2") -
  // een op units gestructureerde methode (Engels e.d.) heeft vaak alleen een
  // los volgnummer per bestand (bv "04_Unit_4_..."). Beide accepteren als
  // fallback wanneer de AI zelf niks in de tekst kon vinden.
  const bestandsnaamMatch = bestandsnaam.match(/^(\d+(?:\.\d+)?)/);
  const paragraafId = verwachteParagraafId || meta.paragraafId || bestandsnaamMatch?.[1];
  if (!paragraafId) {
    return {
      error: `Kon geen paragraafnummer herkennen in "${bestandsnaam}". Hernoem het bestand zodat het begint met een nummer (bv "1.2_..." of gewoon "4_...") of upload het via de knop bij de juiste paragraaf.`,
    };
  }

  const ingebouwd = GETAL_EN_RUIMTE_2HV13.find((p) => p.id === paragraafId);
  const titel = meta.paragraafTitel || ingebouwd?.titel || afgeleideTitelVanBestandsnaam(bestandsnaam);
  const hoofdstuk = meta.hoofdstukLabel || (ingebouwd ? hoofdstukLabel(ingebouwd) : `Hoofdstuk ${paragraafId.split(".")[0]}`);

  const onderdelenRes = await slaGegenereerdeOnderdelenOp(
    supabase,
    familyId,
    user.id,
    subjectId,
    hoofdstuk,
    paragraafId,
    meta.onderdelen,
    { vervang: true }
  );
  if ("error" in onderdelenRes) return { error: onderdelenRes.error };

  const contextVelden = [
    meta.leerdoelen,
    meta.voorkennis,
    meta.kernbegrippen,
    meta.oplossingsroute,
    meta.beheersingscriterium,
    meta.coachaanpak,
  ];
  let contextOpgeslagen = false;
  if (contextVelden.some(Boolean) || meta.videos.length > 0) {
    const { error: contextError } = await supabase.from("kennis_paragraaf_context").upsert(
      {
        family_id: familyId,
        subject_id: subjectId,
        hoofdstuk,
        paragraaf_id: paragraafId,
        titel,
        leerdoelen: meta.leerdoelen,
        voorkennis: meta.voorkennis,
        kernbegrippen: meta.kernbegrippen,
        oplossingsroute: meta.oplossingsroute,
        beheersingscriterium: meta.beheersingscriterium,
        coachaanpak: meta.coachaanpak,
        videos: meta.videos,
        status: "concept" as const,
        created_by: user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "subject_id,paragraaf_id" }
    );
    if (contextError) return { error: contextError.message };
    contextOpgeslagen = true;
  }

  // Oefenbank in een aparte, kleinere aanroep (zie schema-opmerking hierboven).
  // Als deze losse aanroep faalt, laten we de rest van het resultaat
  // (onderdelen + context, hierboven al opgeslagen) gewoon staan - de ouder
  // kan de oefenbank dan alsnog los proberen door het bestand opnieuw te
  // uploaden, in plaats van dat de hele import verloren gaat.
  let aantalOefenvragen = 0;
  let oefenvragenFout: string | null = null;
  try {
    const oefenResultaat = await genereerGestructureerd(
      client,
      OefenvragenSchema,
      bouwOefenvragenPrompt(bestandsnaam, tekst),
      16_384,
      { debugFouten: true }
    );

    await supabase.from("kennis_oefenvragen").delete().eq("subject_id", subjectId).eq("paragraaf_id", paragraafId);
    if (oefenResultaat.oefenvragen.length > 0) {
      const oefenrijen = oefenResultaat.oefenvragen.map((v, i) => ({
        family_id: familyId,
        subject_id: subjectId,
        hoofdstuk,
        paragraaf_id: paragraafId,
        niveau: v.niveau,
        vraag: v.vraag,
        antwoord: v.antwoord,
        uitwerking: v.uitwerking,
        volgorde: i,
        status: "concept" as const,
        created_by: user.id,
      }));
      const { error: oefenError } = await supabase.from("kennis_oefenvragen").insert(oefenrijen);
      if (oefenError) throw new Error(oefenError.message);
    }
    aantalOefenvragen = oefenResultaat.oefenvragen.length;
  } catch (e) {
    oefenvragenFout = e instanceof Error ? e.message : "Oefenbank ophalen mislukt.";
  }

  revalidateVak(subjectId);
  return {
    paragraafId,
    titel,
    aantalOnderdelen: onderdelenRes.aantal ?? 0,
    aantalOefenvragen,
    oefenvragenFout,
    contextOpgeslagen,
  };
}

export async function bewerkKennisParagraafContext(id: string, subjectId: string, formData: FormData) {
  const ouder = await ouderProfiel();
  if ("error" in ouder) return { error: ouder.error };
  const { supabase } = ouder;

  const veld = (naam: string) => String(formData.get(naam) || "").trim() || null;

  const videos = String(formData.get("videos") || "")
    .split("\n")
    .map((regel) => regel.trim())
    .filter(Boolean)
    .map((regel) => {
      const [titel, url, aanbiedenBij] = regel.split("|").map((deel) => deel.trim());
      return { titel: titel || url, url, aanbiedenBij: aanbiedenBij || null };
    })
    .filter((v) => v.url);

  const { error } = await supabase
    .from("kennis_paragraaf_context")
    .update({
      leerdoelen: veld("leerdoelen"),
      voorkennis: veld("voorkennis"),
      kernbegrippen: veld("kernbegrippen"),
      oplossingsroute: veld("oplossingsroute"),
      beheersingscriterium: veld("beheersingscriterium"),
      coachaanpak: veld("coachaanpak"),
      videos,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidateVak(subjectId);
  return { success: true };
}

export async function zetKennisParagraafContextStatus(id: string, subjectId: string, status: KennisOnderdeelStatus) {
  const ouder = await ouderProfiel();
  if ("error" in ouder) return { error: ouder.error };
  const { supabase } = ouder;

  const { error } = await supabase
    .from("kennis_paragraaf_context")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidateVak(subjectId);
  return { success: true };
}

export async function bewerkKennisOefenvraag(id: string, subjectId: string, formData: FormData) {
  const ouder = await ouderProfiel();
  if ("error" in ouder) return { error: ouder.error };
  const { supabase } = ouder;

  const vraag = String(formData.get("vraag") || "").trim();
  const antwoord = String(formData.get("antwoord") || "").trim();
  const uitwerking = String(formData.get("uitwerking") || "").trim();
  const niveau = String(formData.get("niveau") || "").trim();

  if (!vraag || !antwoord) return { error: "Vul in elk geval de vraag en het antwoord in." };

  const { error } = await supabase
    .from("kennis_oefenvragen")
    .update({
      vraag,
      antwoord,
      uitwerking: uitwerking || null,
      niveau: niveau || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidateVak(subjectId);
  return { success: true };
}

export async function zetKennisOefenvraagStatus(id: string, subjectId: string, status: KennisOnderdeelStatus) {
  const ouder = await ouderProfiel();
  if ("error" in ouder) return { error: ouder.error };
  const { supabase } = ouder;

  const { error } = await supabase
    .from("kennis_oefenvragen")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidateVak(subjectId);
  return { success: true };
}

export async function verwijderKennisOefenvraag(id: string, subjectId: string) {
  const ouder = await ouderProfiel();
  if ("error" in ouder) return { error: ouder.error };
  const { supabase } = ouder;

  const { error } = await supabase.from("kennis_oefenvragen").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidateVak(subjectId);
  return { success: true };
}

/**
 * Publiceert in 1 keer alle 'concept'-onderdelen, de paragraafcontext en
 * alle 'concept'-oefenvragen van 1 paragraaf - scheelt los doorklikken per
 * kaartje na een controle-ronde.
 */
export async function publiceerParagraaf(subjectId: string, paragraafId: string) {
  const ouder = await ouderProfiel();
  if ("error" in ouder) return { error: ouder.error };
  const { supabase } = ouder;

  const nu = new Date().toISOString();
  const [onderdelenRes, contextRes, oefenvragenRes, woordenlijstenRes] = await Promise.all([
    supabase
      .from("kennis_onderdelen")
      .update({ status: "gepubliceerd", updated_at: nu })
      .eq("subject_id", subjectId)
      .eq("paragraaf_id", paragraafId)
      .eq("status", "concept"),
    supabase
      .from("kennis_paragraaf_context")
      .update({ status: "gepubliceerd", updated_at: nu })
      .eq("subject_id", subjectId)
      .eq("paragraaf_id", paragraafId)
      .eq("status", "concept"),
    supabase
      .from("kennis_oefenvragen")
      .update({ status: "gepubliceerd", updated_at: nu })
      .eq("subject_id", subjectId)
      .eq("paragraaf_id", paragraafId)
      .eq("status", "concept"),
    supabase
      .from("kennis_woordenlijsten")
      .update({ status: "gepubliceerd", updated_at: nu })
      .eq("subject_id", subjectId)
      .eq("paragraaf_id", paragraafId)
      .eq("status", "concept"),
  ]);
  const fout = onderdelenRes.error || contextRes.error || oefenvragenRes.error || woordenlijstenRes.error;
  if (fout) return { error: fout.message };

  revalidateVak(subjectId);
  return { success: true };
}

/**
 * Verwijdert in 1 keer alle kennisonderdelen, de paragraafcontext en alle
 * oefenvragen van 1 paragraaf (concept EN gepubliceerd) - handig om een
 * mislukte/rommelige upload in 1 keer weg te halen i.p.v. elk kaartje apart
 * te moeten verwijderen.
 */
export async function verwijderParagraaf(subjectId: string, paragraafId: string) {
  const ouder = await ouderProfiel();
  if ("error" in ouder) return { error: ouder.error };
  const { supabase } = ouder;

  const [onderdelenRes, contextRes, oefenvragenRes, woordenlijstenRes] = await Promise.all([
    supabase.from("kennis_onderdelen").delete().eq("subject_id", subjectId).eq("paragraaf_id", paragraafId),
    supabase.from("kennis_paragraaf_context").delete().eq("subject_id", subjectId).eq("paragraaf_id", paragraafId),
    supabase.from("kennis_oefenvragen").delete().eq("subject_id", subjectId).eq("paragraaf_id", paragraafId),
    supabase.from("kennis_woordenlijsten").delete().eq("subject_id", subjectId).eq("paragraaf_id", paragraafId),
  ]);
  const fout = onderdelenRes.error || contextRes.error || oefenvragenRes.error || woordenlijstenRes.error;
  if (fout) return { error: fout.message };

  revalidateVak(subjectId);
  return { success: true };
}
