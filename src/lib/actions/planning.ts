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

function naarLokaleIso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type HerhalingType = "geen" | "dagelijks" | "wekelijks" | "maandelijks";
const MAX_HERHALINGEN = 200;

// Geen achtergrond-cron beschikbaar in deze omgeving, dus een herhalend item
// wordt meteen bij het aanmaken helemaal "uitgeschreven" tot en met de
// stopdatum (met een bovengrens tegen een per-ongeluk oneindige reeks) -
// elke losse taak kan daarna gewoon apart afgevinkt/verplaatst worden.
function genereerHerhaaldeData(startDatum: string, herhaling: HerhalingType, totDatum: string): string[] {
  const stop = new Date(totDatum + "T00:00:00");
  const data: string[] = [];
  let huidig = new Date(startDatum + "T00:00:00");
  for (let i = 0; i < MAX_HERHALINGEN; i++) {
    const volgende = new Date(huidig);
    if (herhaling === "dagelijks") volgende.setDate(volgende.getDate() + 1);
    else if (herhaling === "wekelijks") volgende.setDate(volgende.getDate() + 7);
    else volgende.setMonth(volgende.getMonth() + 1);
    if (volgende > stop) break;
    data.push(naarLokaleIso(volgende));
    huidig = volgende;
  }
  return data;
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
  const testTypeId = String(formData.get("testTypeId") || "") || null;
  const description = String(formData.get("description") || "").trim();
  const estimatedMinutesRaw = String(formData.get("estimatedMinutes") || "");
  const estimatedMinutes = estimatedMinutesRaw ? Number(estimatedMinutesRaw) : null;
  const startTime = String(formData.get("startTime") || "") || null;
  const herhaling = String(formData.get("herhaling") || "geen") as HerhalingType;
  const herhaalTot = String(formData.get("herhaalTot") || "") || null;

  if (!title || !dueDate) return { error: "Vul een titel en datum in." };
  if (herhaling !== "geen" && !herhaalTot) return { error: "Kies tot wanneer het item moet herhalen." };

  const { data: nieuwItem, error } = await supabase
    .from("planning_items")
    .insert({
      family_id: profile.family_id,
      subject_id: subjectId,
      test_type_id: type === "toets" ? testTypeId : null,
      type,
      title,
      description,
      due_date: dueDate,
      start_time: startTime,
      status: "open",
      estimated_minutes: estimatedMinutes,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  if (herhaling !== "geen" && herhaalTot) {
    const herhaaldeData = genereerHerhaaldeData(dueDate, herhaling, herhaalTot);
    if (herhaaldeData.length > 0) {
      await supabase.from("planning_items").insert(
        herhaaldeData.map((datum) => ({
          family_id: profile.family_id,
          subject_id: subjectId,
          test_type_id: type === "toets" ? testTypeId : null,
          type,
          title,
          description,
          due_date: datum,
          start_time: startTime,
          status: "open",
          estimated_minutes: estimatedMinutes,
          created_by: user.id,
        }))
      );
    }
  }

  // Bij een toets: meteen gespreide leermomenten voorstellen, zodat leren
  // in delen gebeurt in plaats van pas op het laatste moment. Met een
  // gekozen toetsvorm volgen we het leeradvies daarvan.
  if (type === "toets" && nieuwItem) {
    let toetsvormOpties: { dagenVanTevoren?: number; aantalMomenten?: number } | undefined;
    if (testTypeId) {
      const { data: toetsvorm } = await supabase
        .from("test_types")
        .select("dagen_van_tevoren, aantal_leermomenten")
        .eq("id", testTypeId)
        .single();
      if (toetsvorm) {
        toetsvormOpties = {
          dagenVanTevoren: toetsvorm.dagen_van_tevoren,
          aantalMomenten: toetsvorm.aantal_leermomenten,
        };
      }
    }

    const voorstellen = stelLeermomentenVoor(new Date(), new Date(dueDate), toetsvormOpties);
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

export async function bewerkPlanningItem(id: string, formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Niet ingelogd." };

  const title = String(formData.get("title") || "").trim();
  const dueDate = String(formData.get("dueDate") || "");
  const subjectId = String(formData.get("subjectId") || "") || null;
  const description = String(formData.get("description") || "").trim();
  const estimatedMinutesRaw = String(formData.get("estimatedMinutes") || "");
  const estimatedMinutes = estimatedMinutesRaw ? Number(estimatedMinutesRaw) : null;
  const startTime = String(formData.get("startTime") || "") || null;

  if (!title || !dueDate) return { error: "Vul een titel en datum in." };

  const { error } = await supabase
    .from("planning_items")
    .update({
      title,
      subject_id: subjectId,
      due_date: dueDate,
      start_time: startTime,
      description,
      estimated_minutes: estimatedMinutes,
    })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidateAgendas();
  return { success: true };
}

// Hoe lang het echt duurde. Los van het afvinken zelf, zodat het overslaan van
// de vraag nooit het afvinken zelf in de weg zit.
export async function updatePlanningWerkelijkeDuur(id: string, minuten: number) {
  const supabase = await createClient();
  const veilig = Math.max(1, Math.min(12 * 60, Math.round(minuten)));
  await supabase.from("planning_items").update({ actual_minutes: veilig }).eq("id", id);
  revalidateAgendas();
}

export async function updatePlanningStatus(id: string, status: "open" | "klaar" | "voorstel") {
  const supabase = await createClient();
  await supabase.from("planning_items").update({ status }).eq("id", id);
  revalidateAgendas();
}

// Accepteert een voorstel (bv. een automatisch voorgesteld leermoment) en
// geeft het meteen een concrete tijd in de dagplanning, zodat het niet als
// los kaartje boven de agenda blijft "zweven" - zie vindEersteVrijeSlot.
export async function accepteerPlanningItem(id: string, startTime: string | null) {
  const supabase = await createClient();
  await supabase.from("planning_items").update({ status: "open", start_time: startTime }).eq("id", id);
  revalidateAgendas();
}

export async function verwijderPlanningItem(id: string) {
  const supabase = await createClient();
  await supabase.from("planning_items").delete().eq("id", id);
  revalidateAgendas();
}

export async function verplaatsPlanningItem(id: string, nieuweDatum: string) {
  const supabase = await createClient();
  await supabase.from("planning_items").update({ due_date: nieuweDatum }).eq("id", id);
  revalidateAgendas();
}

// Slepen binnen de weektijdlijn: de plek waar je loslaat bepaalt zowel de dag
// als het tijdstip. Directe manipulatie kost minder denkwerk dan een formulier
// openen, een tijd kiezen en opslaan - en dat is precies het verschil tussen
// "ik schuif het even" en "laat maar zitten".
export async function verplaatsPlanningItemNaarTijd(
  id: string,
  nieuweDatum: string,
  nieuweStartTijd: string
) {
  const supabase = await createClient();
  await supabase
    .from("planning_items")
    .update({ due_date: nieuweDatum, start_time: nieuweStartTijd })
    .eq("id", id);
  revalidateAgendas();
}

// De onderrand van een kaartje slepen past de tijdsinschatting aan. Die voedt
// meteen de capaciteitsmeter, dus langer maken laat direct zien of het nog past.
export async function updatePlanningDuur(id: string, minuten: number) {
  const supabase = await createClient();
  const veilig = Math.max(15, Math.min(8 * 60, Math.round(minuten)));
  await supabase.from("planning_items").update({ estimated_minutes: veilig }).eq("id", id);
  revalidateAgendas();
}

export async function maakHuiswerkItemsBulk(
  items: { titel: string; datum: string; subjectId?: string | null; beschrijving?: string }[]
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

  const geldig = items.filter((i) => i.titel.trim() && i.datum);
  if (geldig.length === 0) return { error: "Geen geldige huiswerk-items om op te slaan." };

  const { error } = await supabase.from("planning_items").insert(
    geldig.map((i) => ({
      family_id: profile.family_id,
      subject_id: i.subjectId || null,
      type: "huiswerk" as const,
      title: i.titel.trim(),
      description: i.beschrijving?.trim() || "",
      due_date: i.datum,
      status: "open" as const,
      created_by: user.id,
    }))
  );

  if (error) return { error: error.message };
  revalidateAgendas();
  return { aantal: geldig.length };
}
