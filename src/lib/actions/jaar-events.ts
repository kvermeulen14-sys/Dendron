"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

function revalidateJaarkalender() {
  revalidatePath("/ouder/jaarkalender");
  revalidatePath("/kind/jaarkalender");
}

export async function maakJaarEvent(formData: FormData) {
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
    return { error: "Alleen ouders kunnen de jaarkalender beheren." };
  }

  const titel = String(formData.get("titel") || "").trim();
  const type = String(formData.get("type") || "anders");
  const startDatum = String(formData.get("startDatum") || "");
  const eindDatum = String(formData.get("eindDatum") || startDatum);

  if (!titel || !startDatum) return { error: "Vul een titel en startdatum in." };
  if (eindDatum < startDatum) return { error: "De einddatum kan niet voor de startdatum liggen." };

  const { error } = await supabase.from("jaar_events").insert({
    family_id: profile.family_id,
    titel,
    type,
    start_datum: startDatum,
    eind_datum: eindDatum,
    created_by: user.id,
  });

  if (error) return { error: error.message };
  revalidateJaarkalender();
  return { success: true };
}

export async function bewerkJaarEvent(id: string, formData: FormData) {
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
    return { error: "Alleen ouders kunnen de jaarkalender beheren." };
  }

  const titel = String(formData.get("titel") || "").trim();
  const type = String(formData.get("type") || "anders");
  const startDatum = String(formData.get("startDatum") || "");
  const eindDatum = String(formData.get("eindDatum") || startDatum);

  if (!titel || !startDatum) return { error: "Vul een titel en startdatum in." };
  if (eindDatum < startDatum) return { error: "De einddatum kan niet voor de startdatum liggen." };

  const { error } = await supabase
    .from("jaar_events")
    .update({ titel, type, start_datum: startDatum, eind_datum: eindDatum })
    .eq("id", id);

  if (error) return { error: error.message };
  revalidateJaarkalender();
  return { success: true };
}

export async function verwijderJaarEvent(id: string) {
  const supabase = await createClient();
  await supabase.from("jaar_events").delete().eq("id", id);
  revalidateJaarkalender();
}

export async function maakJaarEventsBulk(
  events: { titel: string; type: string; start: string; eind: string }[]
): Promise<{ error: string; aantal?: undefined } | { error?: undefined; aantal: number }> {
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
    return { error: "Alleen ouders kunnen de jaarkalender beheren." };
  }

  const geldigeTypes = new Set(["vakantie", "toetsweek", "anders"]);
  const geldig = events.filter(
    (e) => e.titel.trim() && e.start && e.eind && e.eind >= e.start && geldigeTypes.has(e.type)
  );
  if (geldig.length === 0) return { error: "Geen geldige periodes om op te slaan." };

  const { error } = await supabase.from("jaar_events").insert(
    geldig.map((e) => ({
      family_id: profile.family_id,
      titel: e.titel.trim(),
      type: e.type,
      start_datum: e.start,
      eind_datum: e.eind,
      created_by: user.id,
    }))
  );

  if (error) return { error: error.message };
  revalidateJaarkalender();
  return { aantal: geldig.length };
}
