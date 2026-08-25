"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function maakToetsvorm(formData: FormData) {
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
    return { error: "Alleen ouders kunnen toetsvormen beheren." };
  }

  const name = String(formData.get("name") || "").trim();
  const dagenVanTevoren = Number(formData.get("dagenVanTevoren") || 0);
  const aantalLeermomenten = Number(formData.get("aantalLeermomenten") || 0);

  if (!name || dagenVanTevoren < 1 || aantalLeermomenten < 1) {
    return { error: "Vul een naam, aantal dagen vooraf en aantal leermomenten in (minimaal 1)." };
  }

  const { error } = await supabase.from("test_types").insert({
    family_id: profile.family_id,
    name,
    dagen_van_tevoren: dagenVanTevoren,
    aantal_leermomenten: aantalLeermomenten,
    created_by: user.id,
  });

  if (error) return { error: error.message };

  revalidatePath("/ouder/toetsvormen");
  return { success: true };
}

export async function bewerkToetsvorm(id: string, formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Niet ingelogd." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile || profile.role !== "ouder") {
    return { error: "Alleen ouders kunnen toetsvormen beheren." };
  }

  const name = String(formData.get("name") || "").trim();
  const dagenVanTevoren = Number(formData.get("dagenVanTevoren") || 0);
  const aantalLeermomenten = Number(formData.get("aantalLeermomenten") || 0);

  if (!name || dagenVanTevoren < 1 || aantalLeermomenten < 1) {
    return { error: "Vul een naam, aantal dagen vooraf en aantal leermomenten in (minimaal 1)." };
  }

  const { error } = await supabase
    .from("test_types")
    .update({ name, dagen_van_tevoren: dagenVanTevoren, aantal_leermomenten: aantalLeermomenten })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/ouder/toetsvormen");
  return { success: true };
}

export async function verwijderToetsvorm(id: string) {
  const supabase = await createClient();
  await supabase.from("test_types").delete().eq("id", id);
  revalidatePath("/ouder/toetsvormen");
}
