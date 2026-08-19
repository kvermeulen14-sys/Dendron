"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { stelLeermomentenVoor } from "@/lib/planning";
import type { PlanningType } from "@/lib/types";

function revalidateAgendas() {
  revalidatePath("/ouder/agenda");
  revalidatePath("/kind/agenda");
  revalidatePath("/ouder");
  revalidatePath("/kind");
}

export async function maakPlanningItem(formData: FormData) {
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

  const type = String(formData.get("type") || "huiswerk") as PlanningType;
  const title = String(formData.get("title") || "").trim();
  const dueDate = String(formData.get("dueDate") || "");
  const subjectId = String(formData.get("subjectId") || "") || null;
  const description = String(formData.get("description") || "").trim();

  if (!title || !dueDate) return { error: "Vul een titel en datum in." };

  const { data: nieuwItem, error } = await supabase
    .from("planning_items")
    .insert({
      family_id: profile.family_id,
      subject_id: subjectId,
      type,
      title,
      description,
      due_date: dueDate,
      status: "open",
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  // Bij een toets: meteen gespreide leermomenten voorstellen, zodat leren
  // in delen gebeurt in plaats van pas op het laatste moment.
  if (type === "toets" && nieuwItem) {
    const voorstellen = stelLeermomentenVoor(new Date(), new Date(dueDate));
    if (voorstellen.length > 0) {
      await supabase.from("planning_items").insert(
        voorstellen.map((v) => ({
          family_id: profile.family_id,
          subject_id: subjectId,
          parent_item_id: nieuwItem.id,
          type: "leermoment" as PlanningType,
          title: `Leermoment ${v.volgnummer}/${v.totaal} - ${title}`,
          description: "Voorstel: pas dit samen aan naar wat past naast je andere huiswerk.",
          due_date: v.due_date,
          status: "voorstel",
          created_by: user.id,
        }))
      );
    }
  }

  revalidateAgendas();
  return { success: true };
}

export async function updatePlanningStatus(id: string, status: "open" | "klaar" | "voorstel") {
  const supabase = await createClient();
  await supabase.from("planning_items").update({ status }).eq("id", id);
  revalidateAgendas();
}

export async function verwijderPlanningItem(id: string) {
  const supabase = await createClient();
  await supabase.from("planning_items").delete().eq("id", id);
  revalidateAgendas();
}
