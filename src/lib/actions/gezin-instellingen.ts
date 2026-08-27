"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ThemeKleuren } from "@/lib/types";

/**
 * Kleurenschema van het hele gezin aanpassen (of terugzetten naar de
 * standaardkleuren met null) - werkt overal door omdat layout.tsx dit als
 * inline CSS-variabelen op <html> zet, wat theme.css's standaardwaarden
 * overschrijft.
 */
export async function updateThemeKleuren(kleuren: ThemeKleuren | null) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Niet ingelogd." };

  const { data: profile } = await supabase.from("profiles").select("family_id, role").eq("id", user.id).single();
  if (!profile) return { error: "Profiel niet gevonden." };
  if (profile.role !== "ouder") return { error: "Alleen een ouder kan het kleurenschema aanpassen." };

  const { error } = await supabase.from("families").update({ theme_kleuren: kleuren }).eq("id", profile.family_id);
  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  return { success: true };
}
