"use server";

import "server-only";
import { z } from "zod";
import { createGeminiClient, genereerGestructureerd } from "@/lib/gemini";
import { GETAL_EN_RUIMTE_2HV13, hoofdstukLabel, type ParagraafRecord } from "@/lib/data/getal-en-ruimte-2hv13";
import { ouderProfiel, revalidateVak, slaGegenereerdeOnderdelenOp, GenereerSchema } from "@/lib/kennis-onderdelen-shared";
import type { KennisOnderdeelStatus } from "@/lib/types";

function bouwPrompt(paragraaf: ParagraafRecord): string {
  return [
    "Je splitst een wiskundeparagraaf op in losse, apart te oefenen deelregels voor een leerling van 2 havo.",
    "",
    `Paragraaf ${paragraaf.id} - ${paragraaf.titel}`,
    `Leerdoelen: ${paragraaf.leerdoelen}`,
    `Begrippen/regels: ${paragraaf.begrippenRegels}`,
    `Stappen: ${paragraaf.stappen}`,
    `Veelgemaakte fouten: ${paragraaf.fouten}`,
    `Tutor-tip: ${paragraaf.tutorTip}`,
    paragraaf.opmerking ? `Opmerking: ${paragraaf.opmerking}` : "",
    "",
    "Maak per losse regel in 'Begrippen/regels' 1 onderdeel (meestal 1-4 onderdelen per paragraaf, bij een korte paragraaf soms maar 1).",
    "Gebruik uitsluitend de wiskundige inhoud die hierboven gegeven is - verzin geen nieuwe wiskundige feiten of regels die niet uit deze gegevens volgen.",
    "Je mag wel zelf simpele, eigen rekenvoorbeelden verzinnen om de regel te illustreren (dat zijn geen boekopgaven, dus dat mag).",
    "Gebruik ECHTE Unicode-machttekens voor machten (² ³ ⁴ ⁵ ⁶ ⁷ ⁸ ⁹, bv \"a²\"), NOOIT een ^. Schrijf een breuk als platte tekst \"teller/noemer\". Geen LaTeX.",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Genereert kandidaat-kennisonderdelen (status 'concept') voor 1 paragraaf uit
 * de Getal & Ruimte-kennisbank. De ouder controleert en publiceert ze
 * daarna - zelfde "AI stelt voor, mens controleert"-patroon als de andere
 * AI-invoer in Dendron.
 */
export async function genereerKennisOnderdelenVoorParagraaf(subjectId: string, paragraafId: string) {
  const ouder = await ouderProfiel();
  if ("error" in ouder) return { error: ouder.error };
  const { supabase, user, familyId } = ouder;

  const paragraaf = GETAL_EN_RUIMTE_2HV13.find((p) => p.id === paragraafId);
  if (!paragraaf) return { error: "Onbekende paragraaf." };

  const { data: subject } = await supabase.from("subjects").select("id, family_id").eq("id", subjectId).single();
  if (!subject || subject.family_id !== familyId) return { error: "Vak niet gevonden." };

  let resultaat: z.infer<typeof GenereerSchema>;
  try {
    const client = createGeminiClient();
    resultaat = await genereerGestructureerd(client, GenereerSchema, bouwPrompt(paragraaf));
  } catch (e) {
    return { error: e instanceof Error ? e.message : "AI-generatie mislukt." };
  }

  return slaGegenereerdeOnderdelenOp(
    supabase,
    familyId,
    user.id,
    subjectId,
    hoofdstukLabel(paragraaf),
    paragraaf.id,
    resultaat.onderdelen
  );
}

export async function bewerkKennisOnderdeel(id: string, subjectId: string, formData: FormData) {
  const ouder = await ouderProfiel();
  if ("error" in ouder) return { error: ouder.error };
  const { supabase } = ouder;

  const naam = String(formData.get("naam") || "").trim();
  const regel = String(formData.get("regel") || "").trim();
  const voorbeelden = String(formData.get("voorbeelden") || "")
    .split("\n")
    .map((r) => r.trim())
    .filter(Boolean);
  const gecombineerdVoorbeeld = String(formData.get("gecombineerdVoorbeeld") || "").trim();
  const tip = String(formData.get("tip") || "").trim();
  const uitzondering = String(formData.get("uitzondering") || "").trim();
  const foutVoorbeeld = String(formData.get("foutVoorbeeld") || "").trim();

  if (!naam || !regel || voorbeelden.length === 0) {
    return { error: "Vul in elk geval een naam, de regel en minstens 1 voorbeeld in." };
  }

  const { error } = await supabase
    .from("kennis_onderdelen")
    .update({
      naam,
      regel,
      voorbeelden,
      gecombineerd_voorbeeld: gecombineerdVoorbeeld || null,
      tip: tip || null,
      uitzondering: uitzondering || null,
      fout_voorbeeld: foutVoorbeeld || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidateVak(subjectId);
  return { success: true };
}

export async function zetKennisOnderdeelStatus(id: string, subjectId: string, status: KennisOnderdeelStatus) {
  const ouder = await ouderProfiel();
  if ("error" in ouder) return { error: ouder.error };
  const { supabase } = ouder;

  const { error } = await supabase
    .from("kennis_onderdelen")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidateVak(subjectId);
  return { success: true };
}

export async function verwijderKennisOnderdeel(id: string, subjectId: string) {
  const ouder = await ouderProfiel();
  if ("error" in ouder) return { error: ouder.error };
  const { supabase } = ouder;

  const { error } = await supabase.from("kennis_onderdelen").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidateVak(subjectId);
  return { success: true };
}
