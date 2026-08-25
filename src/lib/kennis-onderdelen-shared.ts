import "server-only";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

/**
 * Gedeelde helpers voor de kennisbank-acties (kennis-onderdelen.ts en
 * kennis-bron-import.ts). Geen "use server" hier - dit bestand exporteert
 * ook niet-async waarden (schemas), wat niet mag in een bestand met
 * "use server" (daar moet elke export een async server action zijn).
 */

export function revalidateVak(subjectId: string) {
  revalidatePath(`/ouder/vakken/${subjectId}`);
  revalidatePath(`/kind/vakken/${subjectId}`);
}

export async function ouderProfiel() {
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

// Let op: beschrijvingen bewust kort houden. Gemini's structured output
// compileert het schema naar een eindige-automaat voor constrained decoding
// en geeft een 400 ("te veel states voor serving") bij een schema met te
// veel tekst en/of te veel/lange geneste arrays - zie kennis-bron-import.ts.
export const OnderdeelSchema = z.object({
  naam: z.string().describe("Naam van de regel, bv 'De regel a(b+c) = ab + ac'."),
  regel: z.string().describe("De regel zelf, kort (1-2 zinnen)."),
  voorbeelden: z.array(z.string()).min(1).max(3).describe("1-3 korte rekenvoorbeelden."),
  gecombineerdVoorbeeld: z.string().nullable().describe("1 meerstaps-voorbeeld, of null."),
  tip: z.string().nullable().describe("Kort ezelsbruggetje, of null."),
  uitzondering: z.string().nullable().describe("Uitzondering/valkuil, of null."),
  foutVoorbeeld: z.string().nullable().describe("Voorbeeld van een veelgemaakte fout, of null."),
});

export const GenereerSchema = z.object({
  onderdelen: z.array(OnderdeelSchema).min(1).max(6),
});

/**
 * Slaat AI-gegenereerde onderdelen op als 'concept', met een doorlopende
 * volgorde per paragraaf. Gedeeld door de ingebouwde generator
 * (kennis-onderdelen.ts) en de brontekst-import (kennis-bron-import.ts).
 */
export async function slaGegenereerdeOnderdelenOp(
  supabase: Awaited<ReturnType<typeof createClient>>,
  familyId: string,
  userId: string,
  subjectId: string,
  hoofdstuk: string,
  paragraafId: string,
  onderdelen: z.infer<typeof GenereerSchema>["onderdelen"],
  opties: { vervang?: boolean } = {}
) {
  if (opties.vervang) {
    await supabase.from("kennis_onderdelen").delete().eq("subject_id", subjectId).eq("paragraaf_id", paragraafId);
  }
  if (onderdelen.length === 0) return { aantal: 0 };

  let volgende = 0;
  if (!opties.vervang) {
    const { data: bestaand } = await supabase
      .from("kennis_onderdelen")
      .select("volgorde")
      .eq("subject_id", subjectId)
      .eq("paragraaf_id", paragraafId)
      .order("volgorde", { ascending: false })
      .limit(1);
    volgende = (bestaand?.[0]?.volgorde ?? -1) + 1;
  }

  const rijen = onderdelen.map((o) => ({
    family_id: familyId,
    subject_id: subjectId,
    hoofdstuk,
    paragraaf_id: paragraafId,
    naam: o.naam,
    volgorde: volgende++,
    regel: o.regel,
    voorbeelden: o.voorbeelden,
    gecombineerd_voorbeeld: o.gecombineerdVoorbeeld,
    tip: o.tip,
    uitzondering: o.uitzondering,
    fout_voorbeeld: o.foutVoorbeeld,
    status: "concept" as const,
    created_by: userId,
  }));

  const { error } = await supabase.from("kennis_onderdelen").insert(rijen);
  if (error) return { error: error.message };

  revalidateVak(subjectId);
  return { aantal: rijen.length };
}
