"use server";

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
  const icon = String(formData.get("icon") || "book-open");
  const aiInstructions = String(formData.get("aiInstructions") || "").trim();

  if (!name) return { error: "Geef het vak een naam." };

  const { error } = await supabase.from("subjects").insert({
    family_id: profile.family_id,
    name,
    icon,
    ai_instructions: aiInstructions,
    created_by: user.id,
  });

  if (error) return { error: error.message };

  revalidatePath("/ouder/vakken");
  revalidatePath("/kind/vakken");
  return { success: true };
}
