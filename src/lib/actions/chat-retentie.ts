"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Wist de inhoud van alle chats (vakdocent, opdracht maken, planningshulp)
 * en het transcript van overhoor-sessies die ouder zijn dan de huidige
 * roosterperiode - de score/voortgang van overhoor-sessies blijft altijd
 * staan, alleen de gespreksinhoud zelf wordt geleegd. Alleen mogelijk als er
 * op dit moment een actieve roosterperiode is (anders is niet duidelijk
 * waar de grens moet liggen).
 */
export async function wisOudeChatgeschiedenis(): Promise<
  { error: string; success?: undefined } | { error?: undefined; success: true; cutoffDatum: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Niet ingelogd." };

  const { data: profile } = await supabase.from("profiles").select("family_id, role").eq("id", user.id).single();
  if (!profile) return { error: "Profiel niet gevonden." };
  if (profile.role !== "ouder") return { error: "Alleen een ouder kan chatgeschiedenis opschonen." };

  const vandaag = new Date();
  const vandaagIso = `${vandaag.getFullYear()}-${String(vandaag.getMonth() + 1).padStart(2, "0")}-${String(vandaag.getDate()).padStart(2, "0")}`;

  const { data: actievePeriode } = await supabase
    .from("rooster_periodes")
    .select("start_datum")
    .eq("family_id", profile.family_id)
    .lte("start_datum", vandaagIso)
    .gte("eind_datum", vandaagIso)
    .order("start_datum", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!actievePeriode) {
    return {
      error: "Geen actieve roosterperiode gevonden voor vandaag - opschonen is daardoor niet mogelijk (onduidelijk waar de grens moet liggen).",
    };
  }

  const cutoff = `${actievePeriode.start_datum}T00:00:00.000Z`;

  await Promise.all([
    supabase.from("chat_messages").delete().eq("family_id", profile.family_id).lt("created_at", cutoff),
    supabase.from("opdracht_berichten").delete().eq("family_id", profile.family_id).lt("created_at", cutoff),
    supabase.from("planningshulp_berichten").delete().eq("family_id", profile.family_id).lt("created_at", cutoff),
    supabase
      .from("overhoor_sessies")
      .update({ transcript: [] })
      .eq("family_id", profile.family_id)
      .lt("created_at", cutoff),
  ]);

  revalidatePath("/ouder/account");
  return { success: true, cutoffDatum: actievePeriode.start_datum };
}

/**
 * Wist ALLE chatinhoud (vakdocent, opdracht maken, planningshulp, overhoor-
 * transcripts) van het hele gezin, ongeacht periode - voor een volledig
 * schone lei i.p.v. alleen alles vóór de huidige roosterperiode. De
 * score/voortgang van overhoor-sessies blijft staan, alleen het transcript
 * wordt geleegd (net als bij wisOudeChatgeschiedenis).
 */
export async function wisAlleChatgeschiedenis(): Promise<
  { error: string; success?: undefined } | { error?: undefined; success: true }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Niet ingelogd." };

  const { data: profile } = await supabase.from("profiles").select("family_id, role").eq("id", user.id).single();
  if (!profile) return { error: "Profiel niet gevonden." };
  if (profile.role !== "ouder") return { error: "Alleen een ouder kan chatgeschiedenis opschonen." };

  await Promise.all([
    supabase.from("chat_messages").delete().eq("family_id", profile.family_id),
    supabase.from("opdracht_berichten").delete().eq("family_id", profile.family_id),
    supabase.from("planningshulp_berichten").delete().eq("family_id", profile.family_id),
    supabase.from("overhoor_sessies").update({ transcript: [] }).eq("family_id", profile.family_id),
  ]);

  revalidatePath("/ouder/account");
  return { success: true };
}
