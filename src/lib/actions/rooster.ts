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

async function vereistOuder() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Niet ingelogd." } as const;

  const { data: profile } = await supabase
    .from("profiles")
    .select("family_id, role")
    .eq("id", user.id)
    .single();
  if (!profile || profile.role !== "ouder") {
    return { error: "Alleen ouders kunnen het rooster beheren." } as const;
  }

  return { supabase, profile, userId: user.id } as const;
}

// -- Periodes -----------------------------------------------------------

export async function maakRoosterPeriode(formData: FormData) {
  const ctx = await vereistOuder();
  if ("error" in ctx) return ctx;
  const { supabase, profile, userId } = ctx;

  const naam = String(formData.get("naam") || "").trim();
  const startDatum = String(formData.get("startDatum") || "");
  const eindDatum = String(formData.get("eindDatum") || "");

  if (!naam || !startDatum || !eindDatum) {
    return { error: "Vul een naam en start- en einddatum in." };
  }
  if (eindDatum <= startDatum) {
    return { error: "De einddatum moet na de startdatum liggen." };
  }

  const { error } = await supabase.from("rooster_periodes").insert({
    family_id: profile.family_id,
    naam,
    start_datum: startDatum,
    eind_datum: eindDatum,
    created_by: userId,
  });

  if (error) return { error: error.message };
  revalidateRooster();
  return { success: true };
}

export async function verwijderRoosterPeriode(id: string) {
  const supabase = await createClient();
  await supabase.from("rooster_periodes").delete().eq("id", id);
  revalidateRooster();
}

// -- Lesuren binnen een periode -----------------------------------------

export async function maakRoosterItem(formData: FormData) {
  const ctx = await vereistOuder();
  if ("error" in ctx) return ctx;
  const { supabase, profile, userId } = ctx;

  const periodeId = String(formData.get("periodeId") || "");
  const dagVanWeek = Number(formData.get("dagVanWeek") || 0);
  const startTijd = String(formData.get("startTijd") || "");
  const eindTijd = String(formData.get("eindTijd") || "");
  const subjectId = String(formData.get("subjectId") || "") || null;
  const titel = String(formData.get("titel") || "").trim();

  if (!periodeId || !dagVanWeek || !startTijd || !eindTijd || !titel) {
    return { error: "Vul periode, dag, begin- en eindtijd en een vaknaam in." };
  }
  if (eindTijd <= startTijd) {
    return { error: "De eindtijd moet na de begintijd liggen." };
  }

  const { error } = await supabase.from("rooster_items").insert({
    family_id: profile.family_id,
    periode_id: periodeId,
    subject_id: subjectId,
    dag_van_week: dagVanWeek,
    start_tijd: startTijd,
    eind_tijd: eindTijd,
    titel,
    type: "school",
    created_by: userId,
  });

  if (error) return { error: error.message };
  revalidateRooster();
  return { success: true };
}

export async function bewerkRoosterItem(id: string, formData: FormData) {
  const ctx = await vereistOuder();
  if ("error" in ctx) return ctx;
  const { supabase } = ctx;

  const dagVanWeek = Number(formData.get("dagVanWeek") || 0);
  const startTijd = String(formData.get("startTijd") || "");
  const eindTijd = String(formData.get("eindTijd") || "");
  const subjectId = String(formData.get("subjectId") || "") || null;
  const titel = String(formData.get("titel") || "").trim();

  if (!dagVanWeek || !startTijd || !eindTijd || !titel) {
    return { error: "Vul dag, begin- en eindtijd en een vaknaam in." };
  }
  if (eindTijd <= startTijd) {
    return { error: "De eindtijd moet na de begintijd liggen." };
  }

  const { error } = await supabase
    .from("rooster_items")
    .update({
      dag_van_week: dagVanWeek,
      start_tijd: startTijd,
      eind_tijd: eindTijd,
      subject_id: subjectId,
      titel,
    })
    .eq("id", id);

  if (error) return { error: error.message };
  revalidateRooster();
  return { success: true };
}

export async function verwijderRoosterItem(id: string) {
  const supabase = await createClient();
  await supabase.from("rooster_items").delete().eq("id", id);
  revalidateRooster();
}

export async function maakRoosterItemsBulk(
  periodeId: string,
  items: { dagVanWeek: number; startTijd: string; eindTijd: string; titel: string; subjectId?: string | null }[]
) {
  const ctx = await vereistOuder();
  if ("error" in ctx) return ctx;
  const { supabase, profile, userId } = ctx;

  const geldig = items.filter(
    (i) => i.dagVanWeek >= 1 && i.dagVanWeek <= 7 && i.startTijd && i.eindTijd && i.titel.trim() && i.eindTijd > i.startTijd
  );
  if (geldig.length === 0) return { error: "Geen geldige lesuren om op te slaan." };

  const { error } = await supabase.from("rooster_items").insert(
    geldig.map((i) => ({
      family_id: profile.family_id,
      periode_id: periodeId,
      subject_id: i.subjectId || null,
      dag_van_week: i.dagVanWeek,
      start_tijd: i.startTijd,
      eind_tijd: i.eindTijd,
      titel: i.titel.trim(),
      type: "school" as const,
      created_by: userId,
    }))
  );

  if (error) return { error: error.message };
  revalidateRooster();
  return { success: true, aantal: geldig.length };
}

// -- Uitzonderingen -------------------------------------------------------

export async function maakRoosterUitzondering(formData: FormData) {
  const ctx = await vereistOuder();
  if ("error" in ctx) return ctx;
  const { supabase, profile, userId } = ctx;

  const datum = String(formData.get("datum") || "");
  const type = String(formData.get("type") || "") as "vervallen" | "gewijzigd" | "extra";
  const origineelItemId = String(formData.get("origineelItemId") || "") || null;
  const titel = String(formData.get("titel") || "").trim() || null;
  const startTijd = String(formData.get("startTijd") || "") || null;
  const eindTijd = String(formData.get("eindTijd") || "") || null;

  if (!datum || !type) return { error: "Vul een datum en soort wijziging in." };
  if (type === "vervallen" && !origineelItemId) {
    return { error: "Kies welk lesuur vervalt." };
  }
  if (type !== "vervallen" && (!titel || !startTijd || !eindTijd)) {
    return { error: "Vul titel, begin- en eindtijd in." };
  }

  const { error } = await supabase.from("rooster_uitzonderingen").insert({
    family_id: profile.family_id,
    datum,
    origineel_item_id: origineelItemId,
    type,
    titel,
    start_tijd: startTijd,
    eind_tijd: eindTijd,
    created_by: userId,
  });

  if (error) return { error: error.message };
  revalidateRooster();
  return { success: true };
}

export async function verwijderRoosterUitzondering(id: string) {
  const supabase = await createClient();
  await supabase.from("rooster_uitzonderingen").delete().eq("id", id);
  revalidateRooster();
}

// -- Reistijd (fietstijd) --------------------------------------------------

export async function updateReistijd(formData: FormData) {
  const ctx = await vereistOuder();
  if ("error" in ctx) return ctx;
  const { supabase, profile } = ctx;

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
