"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  GETAL_EN_RUIMTE_2HV13,
  bouwMateriaalContent,
  hoofdstukLabel,
  materiaalTitel,
} from "@/lib/data/getal-en-ruimte-2hv13";

function revalidateVakken(subjectId: string) {
  revalidatePath("/ouder/vakken");
  revalidatePath(`/ouder/vakken/${subjectId}`);
  revalidatePath("/kind/vakken");
  revalidatePath(`/kind/vakken/${subjectId}`);
}

/**
 * Importeert de kant-en-klare kennisbank "Getal & Ruimte 2 havo/vwo,
 * editie 13" als lesstof onder het vak Wiskunde (wordt aangemaakt als het
 * nog niet bestaat). Slaat paragrafen over die al eerder zijn geimporteerd
 * (op titel), zodat nogmaals klikken geen dubbele materialen aanmaakt.
 */
export async function importGetalRuimteKennisbank(): Promise<
  { error: string; aantal?: undefined } | { error?: undefined; aantal: number }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Niet ingelogd." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("family_id, role")
    .eq("id", user.id)
    .single();
  if (!profile || profile.role !== "ouder") {
    return { error: "Alleen ouders kunnen een kennisbank importeren." };
  }

  let { data: vak } = await supabase
    .from("subjects")
    .select("id")
    .eq("family_id", profile.family_id)
    .ilike("name", "wiskunde")
    .maybeSingle();

  if (!vak) {
    const { data: nieuwVak, error: vakError } = await supabase
      .from("subjects")
      .insert({
        family_id: profile.family_id,
        name: "Wiskunde",
        code: "WI",
        icon: "calculator",
        ai_instructions: "",
        created_by: user.id,
      })
      .select("id")
      .single();

    if (vakError && vakError.code === "23505") {
      // De code "WI" is al in gebruik bij een ander vak - probeer opnieuw zonder code.
      const { data: nieuwVakZonderCode, error: tweedeVakError } = await supabase
        .from("subjects")
        .insert({
          family_id: profile.family_id,
          name: "Wiskunde",
          code: null,
          icon: "calculator",
          ai_instructions: "",
          created_by: user.id,
        })
        .select("id")
        .single();
      if (tweedeVakError) return { error: tweedeVakError.message };
      vak = nieuwVakZonderCode;
    } else if (vakError) {
      return { error: vakError.message };
    } else {
      vak = nieuwVak;
    }
  }

  const { data: bestaand } = await supabase
    .from("materials")
    .select("title")
    .eq("subject_id", vak!.id);
  const bestaandeTitels = new Set((bestaand ?? []).map((m) => m.title));

  const nieuw = GETAL_EN_RUIMTE_2HV13.filter((par) => !bestaandeTitels.has(materiaalTitel(par))).map((par) => ({
    family_id: profile.family_id,
    subject_id: vak!.id,
    title: materiaalTitel(par),
    content: bouwMateriaalContent(par),
    hoofdstuk: hoofdstukLabel(par),
    opdrachten: par.opdrachten,
    bron_type: "tekst" as const,
    uploaded_by: user.id,
    uploaded_by_role: profile.role,
  }));

  if (nieuw.length === 0) {
    revalidateVakken(vak!.id);
    return { aantal: 0 };
  }

  const { error } = await supabase.from("materials").insert(nieuw);
  if (error) return { error: error.message };

  revalidateVakken(vak!.id);
  return { aantal: nieuw.length };
}
