"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createGeminiClient, genereerGestructureerd } from "@/lib/gemini";
import { GETAL_EN_RUIMTE_2HV13, hoofdstukLabel, type ParagraafRecord } from "@/lib/data/getal-en-ruimte-2hv13";
import type { KennisOnderdeelStatus } from "@/lib/types";

function revalidateVak(subjectId: string) {
  revalidatePath(`/ouder/vakken/${subjectId}`);
  revalidatePath(`/kind/vakken/${subjectId}`);
}

async function ouderProfiel() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Niet ingelogd." } as const;

  const { data: profile } = await supabase
    .from("profiles")
    .select("family_id, role")
    .eq("id", user.id)
    .single();
  if (!profile) return { error: "Profiel niet gevonden." } as const;
  if (profile.role !== "ouder") return { error: "Alleen ouders kunnen de kennisbank beheren." } as const;

  return { supabase, user, familyId: profile.family_id } as const;
}

const OnderdeelSchema = z.object({
  naam: z
    .string()
    .describe(
      "Korte naam van 1 losse, apart te oefenen regel/deelvaardigheid, in de stijl 'De regel a(b+c) = ab + ac' of 'Breuken vereenvoudigen'."
    ),
  regel: z.string().describe("De regel zelf, kort en scherp (1-2 zinnen), zoals een leerling die zou opschrijven."),
  voorbeelden: z
    .array(z.string())
    .min(2)
    .max(3)
    .describe("2 of 3 losse, eenvoudige rekenvoorbeelden die de regel toepassen, elk als 1 regel tekst."),
  gecombineerdVoorbeeld: z
    .string()
    .nullable()
    .describe("1 voorbeeld waarin deze regel in een iets grotere, meerstaps-opgave gebruikt wordt, of null."),
  tip: z.string().nullable().describe("Een kort ezelsbruggetje/praktische tip, of null als er geen goede is."),
  uitzondering: z
    .string()
    .nullable()
    .describe("Een uitzondering of valkuil bij deze regel, gebaseerd op de meegegeven veelgemaakte fouten, of null."),
  foutVoorbeeld: z
    .string()
    .nullable()
    .describe("Een kort voorbeeld van een foute toepassing zoals leerlingen die vaak maken, of null."),
});

const GenereerSchema = z.object({
  onderdelen: z.array(OnderdeelSchema).min(1).max(6),
});

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
    "Gebruik ^ voor machten (bv a^2) en / voor breuken in platte tekst; gebruik geen LaTeX.",
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

  const { data: bestaand } = await supabase
    .from("kennis_onderdelen")
    .select("volgorde")
    .eq("subject_id", subjectId)
    .eq("paragraaf_id", paragraafId)
    .order("volgorde", { ascending: false })
    .limit(1);
  let volgende = (bestaand?.[0]?.volgorde ?? -1) + 1;

  const rijen = resultaat.onderdelen.map((o) => ({
    family_id: familyId,
    subject_id: subjectId,
    hoofdstuk: hoofdstukLabel(paragraaf),
    paragraaf_id: paragraaf.id,
    naam: o.naam,
    volgorde: volgende++,
    regel: o.regel,
    voorbeelden: o.voorbeelden,
    gecombineerd_voorbeeld: o.gecombineerdVoorbeeld,
    tip: o.tip,
    uitzondering: o.uitzondering,
    fout_voorbeeld: o.foutVoorbeeld,
    status: "concept" as const,
    created_by: user.id,
  }));

  const { error } = await supabase.from("kennis_onderdelen").insert(rijen);
  if (error) return { error: error.message };

  revalidateVak(subjectId);
  return { aantal: rijen.length };
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
