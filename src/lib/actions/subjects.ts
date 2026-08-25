"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { vindSubjectVoorTitel } from "@/lib/vak-matching";

export async function maakVak(formData: FormData) {
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
  if (!profile) return { error: "Profiel niet gevonden." };

  const name = String(formData.get("name") || "").trim();
  const code = String(formData.get("code") || "").trim().toUpperCase() || null;
  const icon = String(formData.get("icon") || "book-open");
  const aiInstructions = String(formData.get("aiInstructions") || "").trim();

  if (!name) return { error: "Geef het vak een naam." };

  const { data: nieuwVak, error } = await supabase
    .from("subjects")
    .insert({
      family_id: profile.family_id,
      name,
      code,
      icon,
      ai_instructions: aiInstructions,
      created_by: user.id,
    })
    .select("id, name")
    .single();

  if (error) {
    if (error.code === "23505") return { error: "Deze code is al in gebruik bij een ander vak." };
    return { error: error.message };
  }

  // Roosterregels die al bestonden maar nog aan geen enkel vak gekoppeld
  // waren (bv. omdat dit vak toen nog niet bestond) meteen proberen te
  // koppelen - anders blijft zo'n koppeling onzichtbaar totdat er
  // handmatig naar "Koppel automatisch" bij het rooster gegaan wordt.
  const { data: ongekoppeldeItems } = await supabase
    .from("rooster_items")
    .select("id, titel")
    .eq("family_id", profile.family_id)
    .is("subject_id", null);
  for (const item of ongekoppeldeItems ?? []) {
    if (vindSubjectVoorTitel(item.titel, [nieuwVak])) {
      await supabase.from("rooster_items").update({ subject_id: nieuwVak.id }).eq("id", item.id);
    }
  }

  revalidatePath("/ouder/vakken");
  revalidatePath("/kind/vakken");
  revalidatePath("/ouder/rooster");
  revalidatePath("/ouder/agenda");
  revalidatePath("/kind/agenda");
  return { success: true };
}

export async function bewerkVak(subjectId: string, formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Niet ingelogd." };

  const name = String(formData.get("name") || "").trim();
  const code = String(formData.get("code") || "").trim().toUpperCase() || null;
  const icon = String(formData.get("icon") || "book-open");
  const aiInstructions = String(formData.get("aiInstructions") || "").trim();

  if (!name) return { error: "Geef het vak een naam." };

  const { error } = await supabase
    .from("subjects")
    .update({ name, code, icon, ai_instructions: aiInstructions })
    .eq("id", subjectId);

  if (error) {
    if (error.code === "23505") return { error: "Deze code is al in gebruik bij een ander vak." };
    return { error: error.message };
  }

  revalidatePath("/ouder/vakken");
  revalidatePath(`/ouder/vakken/${subjectId}`);
  revalidatePath("/kind/vakken");
  revalidatePath(`/kind/vakken/${subjectId}`);
  return { success: true };
}

export async function verwijderVak(subjectId: string) {
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
    return { error: "Alleen ouders kunnen een vak verwijderen." };
  }

  const { data: materials } = await supabase
    .from("materials")
    .select("file_url")
    .eq("subject_id", subjectId)
    .not("file_url", "is", null);

  const { error } = await supabase
    .from("subjects")
    .delete()
    .eq("id", subjectId)
    .eq("family_id", profile.family_id);
  if (error) return { error: error.message };

  const bestandsPaden = (materials ?? []).map((m) => m.file_url).filter((p): p is string => Boolean(p));
  if (bestandsPaden.length > 0) {
    await supabase.storage.from("lesstof").remove(bestandsPaden);
  }

  revalidatePath("/ouder/vakken");
  revalidatePath("/kind/vakken");
  redirect("/ouder/vakken");
}
