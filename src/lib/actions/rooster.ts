"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { vindSubjectVoorTitel } from "@/lib/vak-matching";

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

export async function bewerkRoosterPeriode(id: string, formData: FormData) {
  const ctx = await vereistOuder();
  if ("error" in ctx) return ctx;
  const { supabase } = ctx;

  const naam = String(formData.get("naam") || "").trim();
  const startDatum = String(formData.get("startDatum") || "");
  const eindDatum = String(formData.get("eindDatum") || "");

  if (!naam || !startDatum || !eindDatum) {
    return { error: "Vul een naam en start- en einddatum in." };
  }
  if (eindDatum <= startDatum) {
    return { error: "De einddatum moet na de startdatum liggen." };
  }

  const { error } = await supabase
    .from("rooster_periodes")
    .update({ naam, start_datum: startDatum, eind_datum: eindDatum })
    .eq("id", id);

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
  let subjectId = String(formData.get("subjectId") || "") || null;
  const titel = String(formData.get("titel") || "").trim();

  if (!periodeId || !dagVanWeek || !startTijd || !eindTijd || !titel) {
    return { error: "Vul periode, dag, begin- en eindtijd en een vaknaam in." };
  }
  if (eindTijd <= startTijd) {
    return { error: "De eindtijd moet na de begintijd liggen." };
  }

  if (!subjectId) {
    const { data: subjects } = await supabase.from("subjects").select("id, name").eq("family_id", profile.family_id);
    if (subjects) subjectId = vindSubjectVoorTitel(titel, subjects);
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

// Koppelt bestaande lesuren zonder vak (subject_id null) alsnog aan het
// juiste vak, op basis van de titel - eenmalige opschoonactie voor lesuren
// die handmatig of via de screenshot-import zijn toegevoegd voordat er
// automatisch gekoppeld werd.
export async function koppelRoosterItemsAutomatisch(): Promise<
  { error: string; aantal?: undefined } | { error?: undefined; aantal: number }
> {
  const ctx = await vereistOuder();
  if ("error" in ctx) return { error: ctx.error ?? "Onbekende fout." };
  const { supabase, profile } = ctx;

  const [{ data: subjects }, { data: items }] = await Promise.all([
    supabase.from("subjects").select("id, name").eq("family_id", profile.family_id),
    supabase.from("rooster_items").select("id, titel").eq("family_id", profile.family_id).is("subject_id", null),
  ]);
  if (!subjects || subjects.length === 0 || !items || items.length === 0) return { aantal: 0 };

  let aantal = 0;
  for (const item of items) {
    const subjectId = vindSubjectVoorTitel(item.titel, subjects);
    if (!subjectId) continue;
    const { error } = await supabase.from("rooster_items").update({ subject_id: subjectId }).eq("id", item.id);
    if (error) return { error: error.message };
    aantal++;
  }

  revalidateRooster();
  return { aantal };
}

export async function maakRoosterItemsBulk(
  periodeId: string,
  items: { dagVanWeek: number; startTijd: string; eindTijd: string; titel: string; subjectId?: string | null }[]
): Promise<{ error: string; aantal?: undefined } | { error?: undefined; aantal: number }> {
  const ctx = await vereistOuder();
  if ("error" in ctx) return { error: ctx.error ?? "Onbekende fout." };
  const { supabase, profile, userId } = ctx;

  const geldig = items.filter(
    (i) => i.dagVanWeek >= 1 && i.dagVanWeek <= 7 && i.startTijd && i.eindTijd && i.titel.trim() && i.eindTijd > i.startTijd
  );
  if (geldig.length === 0) return { error: "Geen geldige lesuren om op te slaan." };

  const { data: subjects } = await supabase.from("subjects").select("id, name").eq("family_id", profile.family_id);

  const { error } = await supabase.from("rooster_items").insert(
    geldig.map((i) => ({
      family_id: profile.family_id,
      periode_id: periodeId,
      subject_id: i.subjectId || (subjects ? vindSubjectVoorTitel(i.titel, subjects) : null),
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
  return { aantal: geldig.length };
}

// -- Uitzonderingen -------------------------------------------------------

export async function maakRoosterUitzondering(formData: FormData) {
  const ctx = await vereistOuder();
  if ("error" in ctx) return ctx;
  const { supabase, profile, userId } = ctx;

  const datum = String(formData.get("datum") || "");
  const type = String(formData.get("type") || "") as "vervallen" | "gewijzigd" | "extra";
  const origineelItemIdRaw = String(formData.get("origineelItemId") || "") || null;
  // "HELE_DAG" is een sentinelwaarde uit het formulier (geen echt rooster-item-id)
  // - betekent dat het hele rooster die dag vervalt i.p.v. 1 los lesuur.
  const heleDag = origineelItemIdRaw === "HELE_DAG";
  const origineelItemId = heleDag ? null : origineelItemIdRaw;
  const titel = String(formData.get("titel") || "").trim() || null;
  const startTijd = String(formData.get("startTijd") || "") || null;
  const eindTijd = String(formData.get("eindTijd") || "") || null;

  if (!datum || !type) return { error: "Vul een datum en soort wijziging in." };
  if (type === "vervallen" && !origineelItemIdRaw) {
    return { error: "Kies welk lesuur vervalt, of 'Hele dag'." };
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

export async function bewerkRoosterUitzondering(id: string, formData: FormData) {
  const ctx = await vereistOuder();
  if ("error" in ctx) return ctx;
  const { supabase } = ctx;

  const datum = String(formData.get("datum") || "");
  const type = String(formData.get("type") || "") as "vervallen" | "gewijzigd" | "extra";
  const origineelItemIdRaw = String(formData.get("origineelItemId") || "") || null;
  const heleDag = origineelItemIdRaw === "HELE_DAG";
  const origineelItemId = heleDag ? null : origineelItemIdRaw;
  const titel = String(formData.get("titel") || "").trim() || null;
  const startTijd = String(formData.get("startTijd") || "") || null;
  const eindTijd = String(formData.get("eindTijd") || "") || null;

  if (!datum || !type) return { error: "Vul een datum en soort wijziging in." };
  if (type === "vervallen" && !origineelItemIdRaw) {
    return { error: "Kies welk lesuur vervalt, of 'Hele dag'." };
  }
  if (type !== "vervallen" && (!titel || !startTijd || !eindTijd)) {
    return { error: "Vul titel, begin- en eindtijd in." };
  }

  const { error } = await supabase
    .from("rooster_uitzonderingen")
    .update({
      datum,
      origineel_item_id: origineelItemId,
      type,
      titel,
      start_tijd: startTijd,
      eind_tijd: eindTijd,
    })
    .eq("id", id);

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

// -- Dagindeling: ochtend/avond/eten per weekdag ---------------------------

const TIJD_REGEX = /^\d{2}:\d{2}$/;
const DAGNAMEN_KORT = ["", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag", "zondag"];

// 1 formulier voor alle 7 dagen tegelijk, met per dag 3 velden (ochtend_N/
// avond_N/eten_N) - dat is duidelijker voor een ouder dan 7 losse popups, en
// voorkomt dat een half ingevulde week blijft hangen.
export async function bewerkDagInstellingen(formData: FormData) {
  const ctx = await vereistOuder();
  if ("error" in ctx) return ctx;
  const { supabase, profile, userId } = ctx;

  const rijen: { family_id: string; dag_van_week: number; ochtend_start: string; avond_grens: string; eten_minuten: number; created_by: string }[] = [];

  for (let dag = 1; dag <= 7; dag++) {
    const ochtendStart = String(formData.get(`ochtend_${dag}`) || "").slice(0, 5);
    const avondGrens = String(formData.get(`avond_${dag}`) || "").slice(0, 5);
    const etenMinuten = Number(formData.get(`eten_${dag}`) || 0);

    if (!TIJD_REGEX.test(ochtendStart) || !TIJD_REGEX.test(avondGrens)) {
      return { error: `Vul voor ${DAGNAMEN_KORT[dag]} een ochtend- en avondtijd in.` };
    }
    if (avondGrens <= ochtendStart) {
      return { error: `Op ${DAGNAMEN_KORT[dag]} moet de avondgrens na de ochtendstart liggen.` };
    }
    if (etenMinuten < 0 || etenMinuten > 180) {
      return { error: `Vul voor ${DAGNAMEN_KORT[dag]} een etenstijd tussen 0 en 180 minuten in.` };
    }

    rijen.push({
      family_id: profile.family_id,
      dag_van_week: dag,
      ochtend_start: ochtendStart,
      avond_grens: avondGrens,
      eten_minuten: etenMinuten,
      created_by: userId,
    });
  }

  const { error } = await supabase.from("dag_instellingen").upsert(rijen, { onConflict: "family_id,dag_van_week" });

  if (error) return { error: error.message };
  revalidateRooster();
  return { success: true };
}
