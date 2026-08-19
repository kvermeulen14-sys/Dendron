"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function voegLesstofToe(formData: FormData) {
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

  const subjectId = String(formData.get("subjectId") || "");
  const title = String(formData.get("title") || "").trim();
  const content = String(formData.get("content") || "").trim();

  if (!subjectId || !title || !content) {
    return { error: "Vul een titel en de inhoud van de lesstof in." };
  }

  const { error } = await supabase.from("materials").insert({
    family_id: profile.family_id,
    subject_id: subjectId,
    title,
    content,
    uploaded_by: user.id,
    uploaded_by_role: profile.role,
  });

  if (error) return { error: error.message };

  revalidatePath(`/ouder/vakken/${subjectId}`);
  revalidatePath(`/kind/vakken/${subjectId}`);
  return { success: true };
}

export async function verwijderLesstof(materialId: string, subjectId: string) {
  const supabase = await createClient();
  await supabase.from("materials").delete().eq("id", materialId);
  revalidatePath(`/ouder/vakken/${subjectId}`);
  revalidatePath(`/kind/vakken/${subjectId}`);
}
