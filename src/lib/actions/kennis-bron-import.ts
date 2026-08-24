"use server";

import "server-only";
import { z } from "zod";
import { createGeminiClient, genereerGestructureerd } from "@/lib/gemini";
import { GETAL_EN_RUIMTE_2HV13, hoofdstukLabel } from "@/lib/data/getal-en-ruimte-2hv13";
import { ouderProfiel, revalidateVak, slaGegenereerdeOnderdelenOp, OnderdeelSchema } from "@/lib/kennis-onderdelen-shared";
import type { KennisOnderdeelStatus } from "@/lib/types";

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
  paragraafId: z.string().nullable().describe("Paragraafnummer, bv '1.2', of null."),
  paragraafTitel: z.string().nullable().describe("Titel van de paragraaf, of null."),
  hoofdstukLabel: z.string().nullable().describe("Leesbaar hoofdstuklabel, of null."),
  leerdoelen: z.string().nullable().describe("Leerdoelen als platte tekst, of null."),
  voorkennis: z.string().nullable().describe("Benodigde voorkennis, platte tekst, of null."),
  kernbegrippen: z.string().nullable().describe("Belangrijkste begrippen + korte omschrijving, platte tekst, of null."),
  oplossingsroute: z.string().nullable().describe("Vaste oplossingsstappen, platte tekst, of null."),
  beheersingscriterium: z.string().nullable().describe("Beheersingscriterium, of null."),
  coachaanpak: z.string().nullable().describe("Coachtips voor een AI-tutor: fouten+coachvraag/hint, kort samengevat, of null."),
  videos: z.array(z.object({ titel: z.string(), url: z.string(), aanbiedenBij: z.string().nullable() })).max(5),
  onderdelen: z.array(OnderdeelSchema).max(8),
});

const OefenvraagSchema = z.object({
  niveau: z.string().nullable().describe("Niveau-label (bv 'A'), of null."),
  vraag: z.string().describe("De opgave, letterlijk overgenomen."),
  antwoord: z.string().describe("Het antwoord, letterlijk overgenomen."),
  uitwerking: z.string().nullable().describe("Kernuitwerking, of null."),
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
    "- Gebruik ^ voor machten en / voor breuken in platte tekst, geen LaTeX, geen markdown-koppen in tekstvelden.",
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
    "- Gebruik ^ voor machten en / voor breuken in platte tekst, geen LaTeX.",
  ].join("\n");
}

function afgeleideTitelVanBestandsnaam(bestandsnaam: string): string {
  return bestandsnaam
    .replace(/\.(md|markdown|txt)$/i, "")
    .replace(/^\d+(\.\d+)*[_\s-]*/, "")
    .replace(/[_-]+/g, " ")
    .trim() || bestandsnaam;
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

  const bestandsnaamMatch = bestandsnaam.match(/^(\d+\.\d+)/);
  const paragraafId = verwachteParagraafId || meta.paragraafId || bestandsnaamMatch?.[1];
  if (!paragraafId) {
    return {
      error: `Kon geen paragraafnummer herkennen in "${bestandsnaam}". Hernoem het bestand zodat het begint met het paragraafnummer (bv "1.2_...") of upload het via de knop bij de juiste paragraaf.`,
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
  const [onderdelenRes, contextRes, oefenvragenRes] = await Promise.all([
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
  ]);
  const fout = onderdelenRes.error || contextRes.error || oefenvragenRes.error;
  if (fout) return { error: fout.message };

  revalidateVak(subjectId);
  return { success: true };
}
