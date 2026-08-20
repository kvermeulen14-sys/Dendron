"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { stelLeermomentenVoor } from "@/lib/planning";
import type { PlanningType } from "@/lib/types";

const AANTAL_MOMENTEN_PER_GEWICHT: Record<number, number> = { 1: 2, 2: 3, 3: 4 };
const DAGEN_VOORAF_PER_GEWICHT: Record<number, number> = { 1: 5, 2: 8, 3: 12 };

function revalidateAgendas() {
  revalidatePath("/ouder/agenda");
  revalidatePath("/kind/agenda");
  revalidatePath("/ouder");
  revalidatePath("/kind");
}

export async function plantToetsweek(
  items: { toetsId: string; gewicht: 1 | 2 | 3 }[]
): Promise<{ error: string; aantal?: undefined } | { error?: undefined; aantal: number }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Niet ingelogd." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("family_id")
    .eq("id", user.id)
    .single();
  if (!profile) return { error: "Profiel niet gevonden." };

  let totaalNieuw = 0;

  for (const { toetsId, gewicht } of items) {
    const { data: toets } = await supabase
      .from("planning_items")
      .select("id, family_id, subject_id, title, due_date, test_type_id")
      .eq("id", toetsId)
      .eq("family_id", profile.family_id)
      .eq("type", "toets")
      .single();
    if (!toets) continue;

    // Alleen nog niet-geaccepteerde voorstellen vervangen; al geaccepteerde
    // leermomenten (status 'open') laat je met rust.
    await supabase
      .from("planning_items")
      .delete()
      .eq("parent_item_id", toetsId)
      .eq("status", "voorstel");

    let toetsvormOpties: { dagenVanTevoren?: number; aantalMomenten?: number } | undefined;
    if (toets.test_type_id) {
      const { data: toetsvorm } = await supabase
        .from("test_types")
        .select("dagen_van_tevoren, aantal_leermomenten")
        .eq("id", toets.test_type_id)
        .single();
      if (toetsvorm) {
        toetsvormOpties = {
          dagenVanTevoren: toetsvorm.dagen_van_tevoren,
          aantalMomenten: toetsvorm.aantal_leermomenten,
        };
      }
    }
    if (!toetsvormOpties) {
      toetsvormOpties = {
        dagenVanTevoren: DAGEN_VOORAF_PER_GEWICHT[gewicht] ?? 8,
        aantalMomenten: AANTAL_MOMENTEN_PER_GEWICHT[gewicht] ?? 3,
      };
    }

    const voorstellen = stelLeermomentenVoor(new Date(), new Date(toets.due_date), toetsvormOpties);
    if (voorstellen.length > 0) {
      await supabase.from("planning_items").insert(
        voorstellen.map((v) => ({
          family_id: profile.family_id,
          subject_id: toets.subject_id,
          parent_item_id: toets.id,
          type: "leermoment" as PlanningType,
          title: `Leermoment ${v.volgnummer}/${v.totaal} - ${toets.title}`,
          description: "Voorstel vanuit toetsweekplanning: pas dit samen aan naar wat past.",
          due_date: v.due_date,
          status: "voorstel",
          created_by: user.id,
        }))
      );
      totaalNieuw += voorstellen.length;
    }
  }

  revalidateAgendas();
  return { aantal: totaalNieuw };
}
