"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

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

  const { error } = await supabase.from("subjects").insert({
    family_id: profile.family_id,
    name,
    code,
    icon,
    ai_instructions: aiInstructions,
    created_by: user.id,
  });

  if (error) {
    if (error.code === "23505") return { error: "Deze code is al in gebruik bij een ander vak." };
    return { error: error.message };
  }

  revalidatePath("/ouder/vakken");
  revalidatePath("/kind/vakken");
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
