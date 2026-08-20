"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

function revalidateRooster() {
  revalidatePath("/ouder/rooster");
  revalidatePath("/ouder/agenda");
  revalidatePath("/kind/agenda");
  revalidatePath("/ouder");
  revalidatePath("/kind");
}

export async function maakRoosterItem(formData: FormData) {
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
    return { error: "Alleen ouders kunnen het rooster beheren." };
  }

  const dagVanWeek = Number(formData.get("dagVanWeek") || 0);
  const startTijd = String(formData.get("startTijd") || "");
  const eindTijd = String(formData.get("eindTijd") || "");
  const titel = String(formData.get("titel") || "").trim();

  if (!dagVanWeek || !startTijd || !eindTijd || !titel) {
    return { error: "Vul dag, begin- en eindtijd en een titel in." };
  }
  if (eindTijd <= startTijd) {
    return { error: "De eindtijd moet na de begintijd liggen." };
  }

  const { error } = await supabase.from("rooster_items").insert({
    family_id: profile.family_id,
    dag_van_week: dagVanWeek,
    start_tijd: startTijd,
    eind_tijd: eindTijd,
    titel,
    type: "school",
    created_by: user.id,
  });

  if (error) return { error: error.message };

  revalidateRooster();
  return { success: true };
}

export async function verwijderRoosterItem(id: string) {
  const supabase = await createClient();
  await supabase.from("rooster_items").delete().eq("id", id);
  revalidateRooster();
}

export async function updateReistijd(formData: FormData) {
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
    return { error: "Alleen ouders kunnen dit aanpassen." };
  }

  const reistijd = Number(formData.get("reistijdMinuten") || 0);
  if (reistijd < 0 || reistijd > 120) {
    return { error: "Vul een reistijd tussen 0 en 120 minuten in." };
  }

  const { error } = await supabase
    .from("families")
    .update({ reistijd_minuten: reistijd })
    .eq("id", profile.family_id);

  if (error) return { error: error.message };

  revalidateRooster();
  return { success: true };
}
