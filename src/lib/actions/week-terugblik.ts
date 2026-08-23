"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { huidigeWeekMaandag } from "@/lib/week";
import type { Stemming } from "@/lib/types";

export async function zetWeekTerugblik(stemming: Stemming) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Niet ingelogd." };

  const { data: profile } = await supabase.from("profiles").select("family_id").eq("id", user.id).single();
  if (!profile) return { error: "Profiel niet gevonden." };

  const { error } = await supabase.from("week_terugblikken").upsert(
    {
      family_id: profile.family_id,
      user_id: user.id,
      week_start: huidigeWeekMaandag(),
      stemming,
    },
    { onConflict: "user_id,week_start" }
  );
  if (error) return { error: error.message };

  revalidatePath("/kind");
  revalidatePath("/ouder");
  return { success: true };
}
