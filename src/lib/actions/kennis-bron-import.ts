"use server";

import "server-only";
import { z } from "zod";
import { createGeminiClient, genereerGestructureerd } from "@/lib/gemini";
import { GETAL_EN_RUIMTE_2HV13, hoofdstukLabel } from "@/lib/data/getal-en-ruimte-2hv13";
import { ouderProfiel, revalidateVak, slaGegenereerdeOnderdelenOp, OnderdeelSchema } from "@/lib/kennis-onderdelen-shared";
import type { KennisOnderdeelStatus } from "@/lib/types";

const MAX_BRONTEKST_LENGTE = 60_000;

const OefenvraagSchema = z.object({
  niveau: z
    .string()
    .nullable()
    .describe("Niveau-/groepslabel zoals in de bron gebruikt (bv 'A', 'B', 'Niveau 2'), of null als de bron geen niveaus onderscheidt."),
  vraag: z.string().describe("De opgave, letterlijk of vrijwel letterlijk overgenomen uit de bron."),
  antwoord: z.string().describe("Het (eind)antwoord, letterlijk overgenomen uit de bron - verzin of wijzig niets."),
  uitwerking: z.string().nullable().describe("De tussenstappen/kernuitwerking uit de bron, indien aanwezig, anders null."),
});

const BrontekstExtractieSchema = z.object({
  isParagraafBestand: z
    .boolean()
    .describe(
      "True als dit bestand de lesstof van 1 specifieke paragraaf bevat; false als het een hoofdstukindex, dekkings-/controlerapport of ander overzichtsbestand is zonder eigen lesstof voor 1 paragraaf."
    ),
  paragraafId: z.string().nullable().describe("Het paragraafnummer dat dit bestand behandelt (bv '1.2'), of null als dat niet te herkennen is."),
  paragraafTitel: z.string().nullable().describe("De titel van de paragraaf (bv 'Breuken optellen'), of null als niet te herkennen."),
  hoofdstukLabel: z
    .string()
    .nullable()
    .describe("Een leesbaar hoofdstuklabel zoals in de bron gebruikt (bv 'Hoofdstuk 1 - Rekenen met letters'), of null."),
  context: z
    .object({
      leerdoelen: z.string().nullable().describe("Leerdoelen als lopende tekst of met regeleinden tussen punten, zonder markdown-koppen."),
      voorkennis: z.string().nullable(),
      kernbegrippen: z.string().nullable().describe("De belangrijkste begrippen met een korte omschrijving, als platte tekst."),
      oplossingsroute: z.string().nullable().describe("De vaste stappen/aanpak om dit type opgave op te lossen, als platte tekst."),
      beheersingscriterium: z
        .string()
        .nullable()
        .describe("Het criterium waaraan te zien is dat de leerling deze paragraaf beheerst, indien in de bron aanwezig."),
    })
    .nullable()
    .describe("Null als het bestand geen van deze paragraafbrede informatie bevat."),
  onderdelen: z
    .array(OnderdeelSchema)
    .max(8)
    .describe("Losse, benoemde regels/deelvaardigheden uit de paragraaf, zelfde aanpak als bij de ingebouwde generator."),
  oefenvragen: z
    .array(OefenvraagSchema)
    .max(40)
    .describe("Kant-en-klare oefenvragen met antwoord uit de bron (oefenbank), indien aanwezig. Neem er bij meer dan 40 de eerste 40."),
});

function bouwExtractiePrompt(bestandsnaam: string, brontekst: string): string {
  return [
    "Dit is 1 geëxporteerd kennisbank-bestand (.md) uit een extern hulpmiddel, bedoeld als lesstof voor een leerling van 2 havo.",
    "De structuur/koppen kunnen per vak en per bestand verschillen - herken zelf welk stuk tekst bij welk veld hoort, in plaats van op exacte kopnamen te zoeken.",
    "",
    `Bestandsnaam: ${bestandsnaam}`,
    "",
    "Inhoud van het bestand:",
    brontekst,
    "",
    "Instructies:",
    "- Bepaal eerst of dit bestand de lesstof van 1 specifieke paragraaf bevat (isParagraafBestand=true), of een hoofdstukindex/dekkingsrapport/ander overzicht zonder eigen paragraaflesstof (isParagraafBestand=false, laat dan de overige velden leeg/leeg array).",
    "- Negeer bronvermeldingen, links naar video's, en interne kwaliteitslabels zoals [N-structuur]/[Schooldoel]/[Didactische synthese] - die zijn niet relevant voor de leerling.",
    "- Voor 'onderdelen': splits de regels/theorie op in losse, benoemde deelvaardigheden met voorbeelden, tip, uitzondering en foutvoorbeeld, gebaseerd op wat in de tekst staat (regels/uitzonderingen, uitgewerkte voorbeelden, veelgemaakte fouten). Gebruik uitsluitend de wiskundige inhoud uit de tekst.",
    "- Voor 'oefenvragen': neem vraag/antwoord/uitwerking zo veel mogelijk LETTERLIJK over uit een eventuele oefenbank/opgavenlijst met antwoorden - dit zijn al gecontroleerde antwoorden, verzin niets nieuws en wijzig geen getallen.",
    "- Gebruik ^ voor machten (bv a^2) en / voor breuken in platte tekst; gebruik geen LaTeX en geen markdown-koppen (#, ##) in de tekstvelden.",
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

  let resultaat: z.infer<typeof BrontekstExtractieSchema>;
  try {
    const client = createGeminiClient();
    resultaat = await genereerGestructureerd(client, BrontekstExtractieSchema, bouwExtractiePrompt(bestandsnaam, tekst));
  } catch (e) {
    return { error: e instanceof Error ? e.message : "AI-verwerking mislukt." };
  }

  if (!resultaat.isParagraafBestand) {
    return { overgeslagen: true, reden: "Geen paragraaf-lesstof herkend (waarschijnlijk een index-/overzichtsbestand)." };
  }

  const bestandsnaamMatch = bestandsnaam.match(/^(\d+\.\d+)/);
  const paragraafId = verwachteParagraafId || resultaat.paragraafId || bestandsnaamMatch?.[1];
  if (!paragraafId) {
    return {
      error: `Kon geen paragraafnummer herkennen in "${bestandsnaam}". Hernoem het bestand zodat het begint met het paragraafnummer (bv "1.2_...") of upload het via de knop bij de juiste paragraaf.`,
    };
  }

  const ingebouwd = GETAL_EN_RUIMTE_2HV13.find((p) => p.id === paragraafId);
  const titel = resultaat.paragraafTitel || ingebouwd?.titel || afgeleideTitelVanBestandsnaam(bestandsnaam);
  const hoofdstuk =
    resultaat.hoofdstukLabel || (ingebouwd ? hoofdstukLabel(ingebouwd) : `Hoofdstuk ${paragraafId.split(".")[0]}`);

  const onderdelenRes = await slaGegenereerdeOnderdelenOp(
    supabase,
    familyId,
    user.id,
    subjectId,
    hoofdstuk,
    paragraafId,
    resultaat.onderdelen,
    { vervang: true }
  );
  if ("error" in onderdelenRes) return { error: onderdelenRes.error };

  let contextOpgeslagen = false;
  if (resultaat.context && Object.values(resultaat.context).some((v) => v)) {
    const { error: contextError } = await supabase.from("kennis_paragraaf_context").upsert(
      {
        family_id: familyId,
        subject_id: subjectId,
        hoofdstuk,
        paragraaf_id: paragraafId,
        titel,
        leerdoelen: resultaat.context.leerdoelen,
        voorkennis: resultaat.context.voorkennis,
        kernbegrippen: resultaat.context.kernbegrippen,
        oplossingsroute: resultaat.context.oplossingsroute,
        beheersingscriterium: resultaat.context.beheersingscriterium,
        status: "concept" as const,
        created_by: user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "subject_id,paragraaf_id" }
    );
    if (contextError) return { error: contextError.message };
    contextOpgeslagen = true;
  }

  await supabase.from("kennis_oefenvragen").delete().eq("subject_id", subjectId).eq("paragraaf_id", paragraafId);
  if (resultaat.oefenvragen.length > 0) {
    const oefenrijen = resultaat.oefenvragen.map((v, i) => ({
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
    if (oefenError) return { error: oefenError.message };
  }

  revalidateVak(subjectId);
  return {
    paragraafId,
    titel,
    aantalOnderdelen: onderdelenRes.aantal ?? 0,
    aantalOefenvragen: resultaat.oefenvragen.length,
    contextOpgeslagen,
  };
}

export async function bewerkKennisParagraafContext(id: string, subjectId: string, formData: FormData) {
  const ouder = await ouderProfiel();
  if ("error" in ouder) return { error: ouder.error };
  const { supabase } = ouder;

  const veld = (naam: string) => String(formData.get(naam) || "").trim() || null;

  const { error } = await supabase
    .from("kennis_paragraaf_context")
    .update({
      leerdoelen: veld("leerdoelen"),
      voorkennis: veld("voorkennis"),
      kernbegrippen: veld("kernbegrippen"),
      oplossingsroute: veld("oplossingsroute"),
      beheersingscriterium: veld("beheersingscriterium"),
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
