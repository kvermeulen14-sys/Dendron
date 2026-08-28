"use server";

import "server-only";
import { z } from "zod";
import { createGeminiClient, genereerGestructureerd } from "@/lib/gemini";
import { GETAL_EN_RUIMTE_2HV13, hoofdstukLabel } from "@/lib/data/getal-en-ruimte-2hv13";
import { ouderProfiel, revalidateVak, slaGegenereerdeOnderdelenOp, OnderdeelSchema } from "@/lib/kennis-onderdelen-shared";
import { wisVakInhoud } from "@/lib/actions/vak-opschonen";
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
        type: z
          .enum(["woordenschat", "zinnen", "overig"])
          .describe(
            "'woordenschat' = tabel met losse woorden/korte termen (brontaal<->doeltaal, stampwerk). 'zinnen' = tabel met complete standaardzinnen/uitdrukkingen (letterlijk leren). Anders 'overig'."
          ),
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
    "Classificeer per kop of de bijbehorende sectie een LETTERLIJKE woorden-/zinnentabel is (brontaal <-> doeltaal, evt. met een voorbeeldzin):",
    "- 'woordenschat': losse woorden of korte termen (bv los zelfstandig naamwoord/werkwoord) - stampwerk.",
    "- 'zinnen': complete standaardzinnen of vaste uitdrukkingen (bv \"How do I get to the station?\") - letterlijk uit het hoofd leren.",
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
  verwachteParagraafId?: string,
  overrideHoofdstuk?: string
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
  const hoofdstuk = overrideHoofdstuk?.trim() || `Hoofdstuk ${paragraafId.split(".")[0]}`;

  const blokken = splitsInBlokken(tekst);
  const woordenlijstTypePerIndex = new Map<number, "woordenschat" | "zinnen">();
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
        if (b.type === "woordenschat" || b.type === "zinnen") woordenlijstTypePerIndex.set(b.index, b.type);
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
  for (const [idx, categorie] of woordenlijstTypePerIndex) {
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
      categorie,
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
  // pipeline op de kleinere, van woordenlijsten ontdane tekst. Zelfde
  // hoofdstuk-override meegeven als hierboven, anders kan de rest van de
  // paragraaf onder een ander hoofdstuk-label terechtkomen dan de
  // woordenlijsten net hierboven.
  const restResultaat = await verwerkKennisBrontekst(subjectId, strippedTekst, bestandsnaam, paragraafId, hoofdstuk);

  return { ...restResultaat, paragraafId, aantalWoordenlijsten, aantalWoorden };
}

export async function bewerkKennisWoordenlijst(id: string, subjectId: string, formData: FormData) {
  const ouder = await ouderProfiel();
  if ("error" in ouder) return { error: ouder.error };
  const { supabase } = ouder;

  const titel = String(formData.get("titel") || "").trim();
  const categorieRuw = String(formData.get("categorie") || "");
  const categorie = categorieRuw === "zinnen" ? "zinnen" : "woordenschat";
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
    .update({ titel, categorie, woorden, updated_at: new Date().toISOString() })
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
  verwachteParagraafId?: string,
  overrideHoofdstuk?: string
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
  const hoofdstuk =
    overrideHoofdstuk?.trim() ||
    meta.hoofdstukLabel ||
    (ingebouwd ? hoofdstukLabel(ingebouwd) : `Hoofdstuk ${paragraafId.split(".")[0]}`);

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

// ---------------------------------------------------------------------------
// Kennisbank-wizard: 1 laagdrempelig invoerpunt voor RUWE lesstof (foto, PDF,
// of losse geplakte tekst) - alles hierboven (verwerkKennisBrontekst,
// verwerkTaalvakBrontekst) verwacht namelijk al een kant-en-klaar
// geëxporteerd .md-bestand met '## koppen' en woordenlijsten als
// pipe-tabellen. In de praktijk heeft een ouder dat nooit klaarliggen - wel
// een foto van een boekpagina of zomaar geplakte tekst. Deze functie zet dat
// eerst om naar precies dat verwachte format (met dezelfde nadruk op
// LETTERLIJK overnemen van woorden/uitdrukkingen, nooit parafraseren) en
// hergebruikt daarna de bestaande, beproefde pipeline ongewijzigd.
// ---------------------------------------------------------------------------

const TranscriptieSchema = z.object({
  tekst: z
    .string()
    .describe(
      "De volledige inhoud, zo LETTERLIJK mogelijk overgetypt. Een tabel typ je over als tekst-tabel met | tussen de kolommen."
    ),
});

const HerformatteerSchema = z.object({
  markdown: z
    .string()
    .describe("De volledige lesstof, herstructureerd naar schone markdown volgens de gegeven regels."),
});

function bouwHerformatteerPrompt(bestandsnaam: string, ruweTekst: string): string {
  return [
    "Herstructureer de volgende ruwe lesstof (kwam uit een foto, PDF, of losse geplakte tekst) naar schone markdown, klaar voor een kennisbank-import. Dit is lesstof voor een leerling van 2 havo.",
    "",
    `Bestandsnaam: ${bestandsnaam}`,
    "",
    "Regels:",
    "- Geef elk apart onderdeel (paragraafinfo/leerdoelen, een woordenlijst, grammatica-uitleg, een oefenbank) een eigen '## kop' met een duidelijke titel.",
    "- Is er een LETTERLIJKE woorden-/uitdrukkingenlijst (brontaal <-> doeltaal, evt. met voorbeeldzin)? Zet die als markdown-tabel met | pipes | (headerrij + scheidingsregel + datarijen), en neem de woorden/zinnen LETTERLIJK over zoals ze al staan - nooit vertalen, aanvullen of parafraseren.",
    "- Overige inhoud (grammatica-uitleg, leerdoelen, voorkennis, kernbegrippen, oefenvragen MET antwoorden, coach-aanwijzingen) laat je als gewone doorlopende tekst onder de kop, zo compleet en getrouw mogelijk aan de bron.",
    "- Negeer opmaak-ruis (paginanummers, kopregels van het boek, watermerken) die geen leerinhoud is.",
    "- Verzin nooit iets dat niet in de bron staat.",
    "",
    "Ruwe inhoud:",
    ruweTekst,
  ].join("\n");
}

/** Haalt de ruwe tekst uit een geüpload bestand (tekst/markdown direct, foto/PDF via letterlijke AI-transcriptie) of geplakte tekst - gedeeld door alle onderstaande wizard-invoerpunten. */
async function haalRuweTekstOp(
  client: ReturnType<typeof createGeminiClient>,
  file: File | null,
  tekstInvoer: string
): Promise<{ tekst: string } | { error: string }> {
  let ruweTekst: string;
  if (file) {
    const isTekstBestand = file.type.startsWith("text/") || /\.(md|markdown|txt)$/i.test(file.name);
    if (isTekstBestand) {
      ruweTekst = Buffer.from(await file.arrayBuffer()).toString("utf-8");
    } else if (file.type === "application/pdf" || file.type.startsWith("image/")) {
      const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
      const transcriptie = await genereerGestructureerd(
        client,
        TranscriptieSchema,
        [
          {
            role: "user",
            parts: [
              { inlineData: { mimeType: file.type, data: base64 } },
              {
                text: "Typ de volledige inhoud van dit lesmateriaal (voor een leerling van 2 havo) zo LETTERLIJK mogelijk over, inclusief eventuele tabellen (als tekst-tabel met | tussen de kolommen). Verzin niets, laat niets weg, parafraseer niet.",
              },
            ],
          },
        ],
        8192
      );
      ruweTekst = transcriptie.tekst;
    } else {
      return { error: "Alleen tekst/markdown-bestanden, PDF's en foto's worden ondersteund." };
    }
  } else {
    ruweTekst = tekstInvoer;
  }

  ruweTekst = ruweTekst.trim();
  if (!ruweTekst) return { error: "Geen inhoud gevonden om te verwerken." };
  if (ruweTekst.length > MAX_BRONTEKST_LENGTE) ruweTekst = ruweTekst.slice(0, MAX_BRONTEKST_LENGTE);
  return { tekst: ruweTekst };
}

// ---------------------------------------------------------------------------
// Vakcoach-wizard: multi-bestand upload waarbij de AI eerst per
// bestand een indeling VOORSTELT (hoofdstuk/paragraafnummer/titel) - de
// ouder houdt zo de regie en kan dat voorstel aanpassen voor er iets wordt
// opgeslagen, i.p.v. blind te moeten vertrouwen op wat de AI raadt (of
// vooraf zelf een paragraafnummer te moeten invullen zonder dat de tool al
// heeft laten zien wat hij herkent). Fase 1 (analyseerKennisbankBestand)
// doet alleen transcriptie + een klein/goedkoop voorstel, schrijft niks weg.
// Fase 2 (bevestigKennisbankBestand) herformatteert en verwerkt daadwerkelijk,
// met het (evt. aangepaste) voorstel als sturing - hergebruikt verder
// dezelfde beproefde pipeline als hierboven.
// ---------------------------------------------------------------------------

const VoorstelSchema = z.object({
  hoofdstuk: z.string().describe("Leesbaar hoofdstuk-/unitlabel, bv 'Unit 1 - California' of 'Hoofdstuk 3'."),
  paragraafId: z
    .string()
    .describe("Paragraaf- of lesnummer binnen dat hoofdstuk, bv '1.3' of gewoon '3' bij units. Verzin een nummer als de tekst er geen geeft."),
  titel: z.string().describe("Korte titel van deze paragraaf/les, bv 'Speaking' of 'Breuken vereenvoudigen'."),
  isWoordenlijst: z
    .boolean()
    .describe("True als dit bestand HOOFDZAKELIJK uit letterlijke woorden-/uitdrukkingenlijsten bestaat, false bij grammatica/rekenstof/gemengd."),
});
export type KennisbankVoorstel = z.infer<typeof VoorstelSchema>;

function bouwVoorstelPrompt(bestandsnaam: string, tekst: string): string {
  return [
    "Dit is 1 kennisbank-bronbestand voor een leerling van 2 havo (mogelijk al voorzien van metadata/frontmatter zoals unit-/paragraafnummers - gebruik die als aanwezig).",
    "Stel een korte indeling voor: bij welk hoofdstuk/unit en paragraaf/les hoort dit, en wat is de titel.",
    "",
    `Bestandsnaam: ${bestandsnaam}`,
    "",
    "Inhoud (eventueel ingekort):",
    tekst.slice(0, 6000),
  ].join("\n");
}

/**
 * Fase 1: leest 1 bestand (of geplakte tekst) uit en stelt een indeling voor
 * - schrijft nog niets naar de database. Geeft ook de (ruwe, niet
 * herformatteerde) tekst terug zodat fase 2 het bestand niet opnieuw hoeft
 * te transcriberen.
 */
export async function analyseerKennisbankBestand(formData: FormData) {
  const ouder = await ouderProfiel();
  if ("error" in ouder) return { error: ouder.error };
  const { supabase, familyId } = ouder;

  const subjectId = String(formData.get("subjectId") || "");
  const file = formData.get("file");
  const tekstInvoer = String(formData.get("tekst") || "").trim();
  if (!subjectId) return { error: "Kies eerst een vak." };
  if (!(file instanceof File) && !tekstInvoer) return { error: "Upload een bestand of plak tekst." };

  const { data: subject } = await supabase.from("subjects").select("id, family_id").eq("id", subjectId).single();
  if (!subject || subject.family_id !== familyId) return { error: "Vak niet gevonden." };

  const bestandsnaam = file instanceof File && file.name ? file.name : "geplakte-tekst.txt";

  try {
    const client = createGeminiClient();
    const ruw = await haalRuweTekstOp(client, file instanceof File ? file : null, tekstInvoer);
    if ("error" in ruw) return ruw;

    const voorstel = await genereerGestructureerd(client, VoorstelSchema, bouwVoorstelPrompt(bestandsnaam, ruw.tekst), 1024);
    return { bestandsnaam, ruweTekst: ruw.tekst, voorstel };
  } catch (e) {
    return { error: e instanceof Error ? `AI-verwerking mislukt: ${e.message}` : "AI-verwerking mislukt." };
  }
}

/**
 * Fase 2: herformatteert de (in fase 1 opgehaalde) ruwe tekst naar het
 * verwachte format en verwerkt 'm daadwerkelijk, met het door de ouder
 * bevestigde/aangepaste hoofdstuk+paragraafId als sturing i.p.v. wat de AI
 * daarin zelf zou raden.
 */
export async function bevestigKennisbankBestand(
  subjectId: string,
  ruweTekst: string,
  bestandsnaam: string,
  hoofdstuk: string,
  paragraafId: string
) {
  if (!paragraafId.trim()) return { error: "Vul een paragraaf-/lesnummer in." };
  try {
    const client = createGeminiClient();
    const herformatteerd = await genereerGestructureerd(
      client,
      HerformatteerSchema,
      bouwHerformatteerPrompt(bestandsnaam, ruweTekst),
      8192
    );
    return await verwerkTaalvakBrontekst(subjectId, herformatteerd.markdown, bestandsnaam, paragraafId.trim(), hoofdstuk.trim());
  } catch (e) {
    return { error: e instanceof Error ? `AI-verwerking mislukt: ${e.message}` : "AI-verwerking mislukt." };
  }
}

// ---------------------------------------------------------------------------
// Structuur-overzicht bijsturen via chat: nadat alle bestanden een eigen
// voorstel hebben (fase 1 hierboven), praat de ouder met een chatbot die
// ECHT iets mag doen met de wachtrij - niet alleen tekst suggereren. Naast
// het hoofdstuk/paragraaf/titel per bestand herschikken, kan de ouder de bot
// ook opdracht geven een bestand meteen te importeren (zelfde bevestig-
// actie als de knop "Bevestigen en verwerken") of uit de wachtrij te halen.
// Bewust begrensde "rechten": de bot verwerkt bestanden altijd als concept
// (nooit publiceren) en raakt nooit al bevestigde/gepubliceerde inhoud aan -
// dat blijft bij de bestaande review-UI (KennisOnderdelenBeheer). Alle
// server-acties hier lopen sowieso achter ouderProfiel(), dus de "rechten"
// van de bot zijn hoe dan ook nooit ruimer dan die van de ingelogde ouder
// die het gesprek voert.
// ---------------------------------------------------------------------------

const StructuurAanpassingSchema = z.object({
  items: z
    .array(
      z.object({
        bestandsnaam: z.string(),
        hoofdstuk: z.string(),
        paragraafId: z.string(),
        titel: z.string(),
      })
    )
    .describe("VOLLEDIGE bijgewerkte lijst - elk bestand uit de huidige indeling, ook de ongewijzigde."),
  acties: z
    .array(
      z.object({
        bestandsnaam: z.string(),
        actie: z
          .enum(["importeren", "verwijderen"])
          .describe(
            "'importeren' = dit bestand nu definitief verwerken/opslaan (als concept, met de bijgewerkte indeling hierboven). 'verwijderen' = dit bestand uit de wachtrij halen zonder te verwerken."
          ),
      })
    )
    .describe("ALLEEN acties die de ouder expliciet vraagt (bv 'importeer deze', 'sla dit op', 'haal dit bestand weg') - leeg bij een gewone structuurwijziging."),
  tutorInstructies: z
    .string()
    .nullable()
    .describe(
      "VOLLEDIGE nieuwe instructietekst voor de AI-vakdocent van dit vak, ALLEEN als de ouder expliciet vraagt om de tutor/vakdocent aan te passen of af te stemmen op de kennisbank. Anders null - nooit ongevraagd wijzigen."
    ),
  paragrafen: z
    .array(
      z.object({
        paragraafId: z.string(),
        hoofdstuk: z.string(),
        titel: z.string(),
      })
    )
    .describe(
      "ALLEEN meesturen als de ouder vraagt om de structuur van AL BESTAANDE (eerder geïmporteerde) kennisbank-inhoud van dit vak aan te passen - bv. hoofdstukken/units hernoemen, paragrafen anders groeperen of retitelen, zodat 'Oefenen' bij het kind en de vakdocent weer bij de theorie aansluiten. Bij invullen: de VOLLEDIGE lijst van ALLE bestaande paragrafen hieronder, ook de ongewijzigde, met EXACT dezelfde paragraafId's (die mogen nooit wijzigen - alleen hoofdstuk/titel). Leeg als hier niet om gevraagd is."
    ),
  paragraafActies: z
    .array(
      z.object({
        paragraafId: z.string(),
        actie: z
          .enum(["publiceren", "verwijderen"])
          .describe(
            "'publiceren' = alle concept-inhoud van deze AL BESTAANDE paragraaf definitief publiceren (zichtbaar voor het kind in Oefenen/de vakdocent). 'verwijderen' = alle inhoud (concept EN gepubliceerd) van deze paragraaf permanent weghalen."
          ),
      })
    )
    .describe("ALLEEN als de ouder expliciet vraagt om een AL BESTAANDE paragraaf te publiceren of (helemaal) te verwijderen. Anders leeg."),
  leegmaken: z
    .object({
      kennisbank: z.boolean().describe("Alle kennisonderdelen/context/oefenvragen/woordenlijsten van dit vak wissen."),
      materialen: z.boolean().describe("De oudere, losse lesstof-bestanden (materials) van dit vak wissen."),
      voortgang: z.boolean().describe("De oefenresultaten/geschiedenis van dit vak wissen."),
    })
    .nullable()
    .describe(
      "ALLEEN invullen als de ouder EXPLICIET en ONMISKENBAAR vraagt om (een deel van) de inhoud van dit vak helemaal leeg te maken/wissen/opnieuw te beginnen (bv. 'gooi alle kennisbank van dit vak weg', 'begin dit vak opnieuw'). Dit is PERMANENT en onomkeerbaar - vraag bij twijfel eerst ter bevestiging in 'antwoord' en laat dit dan null. Anders altijd null."
    ),
  antwoord: z.string().describe("Kort, vriendelijk antwoord aan de ouder over wat je hebt aangepast/gedaan (of een vraag als de instructie onduidelijk is). Max 2 zinnen."),
});

interface VakParagraaf {
  paragraafId: string;
  hoofdstuk: string;
  titel: string;
  heeftContext: boolean;
  status: KennisOnderdeelStatus;
}

interface VakContext {
  naam: string;
  huidigeTutorInstructies: string;
  gepubliceerdeHoofdstukken: string[];
  heeftWoordenschat: boolean;
  heeftZinnen: boolean;
  paragrafen: VakParagraaf[];
}

function bouwStructuurAanpassingPrompt(
  vak: VakContext,
  items: { bestandsnaam: string; hoofdstuk: string; paragraafId: string; titel: string }[],
  berichten: { rol: "ouder" | "ai"; tekst: string }[],
  instructie: string
): string {
  return [
    `Vak: ${vak.naam} (2 havo, methode met units/hoofdstukken).`,
    `Huidige instructietekst voor de AI-vakdocent van dit vak: ${vak.huidigeTutorInstructies ? `"${vak.huidigeTutorInstructies}"` : "(nog geen)"}`,
    `Al gepubliceerde kennisbank: hoofdstukken ${vak.gepubliceerdeHoofdstukken.length > 0 ? vak.gepubliceerdeHoofdstukken.join(", ") : "(nog geen)"}${
      vak.heeftWoordenschat || vak.heeftZinnen
        ? `, bevat ${[vak.heeftWoordenschat && "woordenschat-lijsten", vak.heeftZinnen && "zinnen/uitdrukkingen-lijsten"].filter(Boolean).join(" en ")}`
        : ""
    }.`,
    vak.paragrafen.length > 0
      ? `Bestaande paragrafen van dit vak (dit bepaalt zowel de indeling in "Oefenen" bij het kind als de kopjes die de vakdocent gebruikt):\n${vak.paragrafen
          .map((p) => `- paragraafId "${p.paragraafId}": hoofdstuk "${p.hoofdstuk}", titel "${p.titel}", status ${p.status}`)
          .join("\n")}`
      : "Dit vak heeft nog geen eerder geïmporteerde paragrafen.",
    "",
    "Dit is de huidige voorgestelde indeling van nu geüploade kennisbank-bestanden, nog niet opgeslagen. Elk bestand krijgt een hoofdstuk/unit, een paragraaf-/lesnummer en een titel.",
    "Jij bent DE volledige assistent voor het beheer van de kennisbank en de AI-vakdocent van dit vak - er is geen andere manier meer om dit aan te passen dan via jou. Je mag zelf: bestanden importeren of uit de wachtrij halen, de tutor-instructies bijwerken, de hoofdstuk/titel-indeling van AL BESTAANDE paragrafen aanpassen, een bestaande paragraaf publiceren of volledig verwijderen, en (alleen op expliciet verzoek) de hele kennisbank/materialen/voortgang van dit vak wissen - niet alleen dingen voorstellen.",
    "",
    "Huidige indeling van nu geüploade bestanden:",
    items.length > 0 ? items.map((it) => `- "${it.bestandsnaam}": hoofdstuk "${it.hoofdstuk}", paragraaf/les "${it.paragraafId}", titel "${it.titel}"`).join("\n") : "(geen bestanden in de wachtrij)",
    berichten.length > 0 ? "\nEerder gesprek hierover:" : "",
    berichten.map((b) => `${b.rol === "ouder" ? "Ouder" : "Jij"}: ${b.tekst}`).join("\n"),
    "",
    `Nieuwe instructie van de ouder: "${instructie}"`,
    "",
    "Instructies:",
    "- Pas de indeling van de bestanden in de wachtrij aan volgens de instructie. Geef de VOLLEDIGE bijgewerkte lijst terug, met exact dezelfde bestandsnamen als hierboven (niets weglaten) - alleen hoofdstuk/paragraafId/titel mogen wijzigen. Leeg als er geen bestanden in de wachtrij staan.",
    "- Vraagt de ouder expliciet om een bestand te importeren/opslaan/verwerken, of te verwijderen/weghalen? Zet dat in 'acties'. Anders 'acties' leeg laten - een indeling aanpassen is geen actie.",
    "- Vraagt de ouder om de AI-vakdocent/tutor aan te passen of beter te laten aansluiten bij de kennisbank van dit vak? Schrijf dan in 'tutorInstructies' een VOLLEDIGE nieuwe instructietekst (geen diff) - kort en concreet, gericht op HOE de tutor moet coachen bij dit specifieke vak (bv. bij een taalvak: woordenschat/zinnen letterlijk laten overhoren, grammatica uitleggen), passend bij de hoofdstukken/categorieën/paragrafen hierboven en bij wat de ouder vraagt. Bouw voort op de huidige instructietekst i.p.v. 'm te negeren, tenzij de ouder vraagt om 'm te vervangen. Anders 'tutorInstructies': null.",
    "- Vraagt de ouder om de structuur/indeling van AL BESTAANDE paragrafen aan te passen (hoofdstukken hernoemen, anders groeperen, paragrafen retitelen), of om 'Oefenen'/de bestaande kennisbank beter te laten aansluiten bij de theorie? Vul dan 'paragrafen' met de VOLLEDIGE bijgewerkte lijst (alle paragrafen hierboven, ook ongewijzigde), met exact dezelfde paragraafId's - alleen hoofdstuk/titel mogen wijzigen. Anders 'paragrafen' leeg laten.",
    "- Vraagt de ouder om een AL BESTAANDE paragraaf te publiceren (klaar voor het kind) of volledig te verwijderen? Zet dat in 'paragraafActies' met het juiste paragraafId. Bedoelt de ouder 'alles publiceren'/'alles verwijderen'? Doe dat dan voor elke bestaande paragraaf die dat nog nodig heeft (concept -> publiceren; alles -> verwijderen). Anders leeg laten.",
    "- Vraagt de ouder ONMISKENBAAR om (een deel van) de inhoud van dit vak helemaal te wissen/leeg te maken/opnieuw te beginnen? Vul dan 'leegmaken' in met wat precies gewist moet worden. Twijfel je of dit echt bedoeld wordt (bv. een vage 'ruim het wat op')? Vraag dan EERST expliciete bevestiging in 'antwoord' en laat 'leegmaken' op null - pas invullen zodra de ouder dat bevestigt.",
    "- Twijfel je welk bestand/paragraaf bedoeld wordt (bv. bij 'doe ze allemaal' terwijl dat niet duidelijk is)? Vraag in 'antwoord' om verduidelijking en laat 'acties'/'paragrafen'/'paragraafActies'/'leegmaken' dan leeg.",
  ].join("\n");
}

/**
 * Past het voorgestelde hoofdstuk/paragraaf/titel van meerdere nog-niet-
 * bevestigde bestanden in 1 keer aan op basis van een vrije instructie van de
 * ouder, voert direct een importeer-/verwijderactie uit die de ouder
 * expliciet vraagt, stelt nieuwe instructietekst voor de AI-vakdocent van dit
 * vak voor, en/of herstructureert de hoofdstuk/titel-indeling van AL
 * BESTAANDE (eerder geïmporteerde) paragrafen - zodat "Oefenen" bij het kind
 * en de vakdocent weer bij de theorie aansluiten. paragraaf_id zelf wordt
 * nooit gewijzigd (voorkomt botsingen met de unique-constraint) - alleen
 * hoofdstuk/titel, wat voor beide precies is wat hun indeling bepaalt.
 */
export async function pasKennisbankStructuurAan(
  subjectId: string,
  items: { bestandsnaam: string; hoofdstuk: string; paragraafId: string; titel: string }[],
  berichten: { rol: "ouder" | "ai"; tekst: string }[],
  instructie: string
) {
  const ouder = await ouderProfiel();
  if ("error" in ouder) return { error: ouder.error };
  const { supabase, familyId } = ouder;
  if (!instructie.trim()) return { error: "Typ een instructie." };

  const { data: subject } = await supabase.from("subjects").select("name, ai_instructions, family_id").eq("id", subjectId).single();
  if (!subject || subject.family_id !== familyId) return { error: "Vak niet gevonden." };

  const [{ data: hoofdstukRijen }, { data: woordenlijstRijen }, { data: contextRijen }, { data: onderdelenRijen }] = await Promise.all([
    supabase.from("kennis_paragraaf_context").select("hoofdstuk").eq("subject_id", subjectId).eq("status", "gepubliceerd"),
    supabase.from("kennis_woordenlijsten").select("categorie").eq("subject_id", subjectId).eq("status", "gepubliceerd"),
    supabase.from("kennis_paragraaf_context").select("paragraaf_id, hoofdstuk, titel, status").eq("subject_id", subjectId),
    supabase.from("kennis_onderdelen").select("paragraaf_id, hoofdstuk, status").eq("subject_id", subjectId).not("paragraaf_id", "is", null),
  ]);

  // Alle bestaande paragrafen van dit vak, met context als leidende bron
  // (rijkst) en onderdelen als terugval voor een paragraaf die alleen
  // losse regels heeft (nog) zonder eigen context-rij.
  const paragraafMap = new Map<string, VakParagraaf>();
  for (const c of contextRijen ?? []) {
    paragraafMap.set(c.paragraaf_id, {
      paragraafId: c.paragraaf_id,
      hoofdstuk: c.hoofdstuk,
      titel: c.titel,
      heeftContext: true,
      status: c.status as KennisOnderdeelStatus,
    });
  }
  for (const o of onderdelenRijen ?? []) {
    const pid = o.paragraaf_id as string;
    if (paragraafMap.has(pid)) continue;
    paragraafMap.set(pid, {
      paragraafId: pid,
      hoofdstuk: o.hoofdstuk,
      titel: `Paragraaf ${pid}`,
      heeftContext: false,
      status: o.status as KennisOnderdeelStatus,
    });
  }

  const vak: VakContext = {
    naam: subject.name,
    huidigeTutorInstructies: subject.ai_instructions ?? "",
    gepubliceerdeHoofdstukken: Array.from(new Set((hoofdstukRijen ?? []).map((r) => r.hoofdstuk))).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true })
    ),
    heeftWoordenschat: (woordenlijstRijen ?? []).some((r) => r.categorie === "woordenschat"),
    heeftZinnen: (woordenlijstRijen ?? []).some((r) => r.categorie === "zinnen"),
    paragrafen: Array.from(paragraafMap.values()).sort((a, b) => a.paragraafId.localeCompare(b.paragraafId, undefined, { numeric: true })),
  };

  if (items.length === 0 && vak.paragrafen.length === 0) {
    return { error: "Nog geen bestanden of eerder geïmporteerde inhoud om iets aan te passen." };
  }

  let res: z.infer<typeof StructuurAanpassingSchema>;
  try {
    const client = createGeminiClient();
    res = await genereerGestructureerd(client, StructuurAanpassingSchema, bouwStructuurAanpassingPrompt(vak, items, berichten, instructie), 4096);
  } catch (e) {
    return { error: e instanceof Error ? `AI-verwerking mislukt: ${e.message}` : "AI-verwerking mislukt." };
  }

  // Herstructurering van bestaande paragrafen meteen toepassen (niet aan de
  // client overlaten) - paragraaf_id zelf blijft altijd hetzelfde, dus dit
  // kan nooit botsen met de unique-constraint op (subject_id, paragraaf_id).
  let paragrafenBijgewerkt = 0;
  for (const p of res.paragrafen) {
    const huidig = paragraafMap.get(p.paragraafId);
    if (!huidig) continue; // AI kan geen nieuwe paragraaf verzinnen via dit pad
    const hoofdstukGewijzigd = p.hoofdstuk.trim() && p.hoofdstuk !== huidig.hoofdstuk;
    const titelGewijzigd = huidig.heeftContext && p.titel.trim() && p.titel !== huidig.titel;
    if (!hoofdstukGewijzigd && !titelGewijzigd) continue;

    if (hoofdstukGewijzigd) {
      await Promise.all([
        supabase.from("kennis_onderdelen").update({ hoofdstuk: p.hoofdstuk }).eq("subject_id", subjectId).eq("paragraaf_id", p.paragraafId),
        supabase.from("kennis_oefenvragen").update({ hoofdstuk: p.hoofdstuk }).eq("subject_id", subjectId).eq("paragraaf_id", p.paragraafId),
        supabase.from("kennis_woordenlijsten").update({ hoofdstuk: p.hoofdstuk }).eq("subject_id", subjectId).eq("paragraaf_id", p.paragraafId),
      ]);
    }
    if (huidig.heeftContext) {
      const patch: { hoofdstuk?: string; titel?: string } = {};
      if (hoofdstukGewijzigd) patch.hoofdstuk = p.hoofdstuk;
      if (titelGewijzigd) patch.titel = p.titel;
      if (Object.keys(patch).length > 0) {
        await supabase.from("kennis_paragraaf_context").update(patch).eq("subject_id", subjectId).eq("paragraaf_id", p.paragraafId);
      }
    } else if (hoofdstukGewijzigd) {
      // Geen context-rij (paragraaf bestaat alleen uit losse onderdelen) -
      // hoofdstuk stond dan alleen op kennis_onderdelen, hierboven al gezet.
    }
    paragrafenBijgewerkt++;
  }
  // Publiceren/verwijderen van AL BESTAANDE paragrafen - hergebruikt dezelfde
  // beproefde acties als de oude beheer-knoppen.
  for (const pa of res.paragraafActies) {
    if (!paragraafMap.has(pa.paragraafId)) continue;
    if (pa.actie === "publiceren") await publiceerParagraaf(subjectId, pa.paragraafId);
    else await verwijderParagraaf(subjectId, pa.paragraafId);
    paragrafenBijgewerkt++;
  }

  // Vak (deels) leegmaken - alleen als de AI dit expliciet aangevraagd zag
  // (zie prompt: bij twijfel vraagt de AI eerst bevestiging i.p.v. dit te vullen).
  if (res.leegmaken && (res.leegmaken.kennisbank || res.leegmaken.materialen || res.leegmaken.voortgang)) {
    const wisResultaat = await wisVakInhoud(subjectId, {
      kennisbank: res.leegmaken.kennisbank,
      materials: res.leegmaken.materialen,
      voortgang: res.leegmaken.voortgang,
    });
    if ("error" in wisResultaat && wisResultaat.error) {
      return { ...res, paragrafenBijgewerkt, leegmaakFout: wisResultaat.error };
    }
  }

  if (paragrafenBijgewerkt > 0) revalidateVak(subjectId);

  return { ...res, paragrafenBijgewerkt };
}
