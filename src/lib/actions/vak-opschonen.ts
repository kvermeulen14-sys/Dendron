"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { ouderProfiel } from "@/lib/kennis-onderdelen-shared";

/**
 * Maakt de inhoud van 1 vak leeg, per onderdeel te kiezen - bedoeld om een
 * rommelige/dubbele import (bv. meerdere losse experimenten met verschillende
 * hoofdstuk-labels voor dezelfde stof) in 1 keer weg te halen voor een
 * schone herstart via de kennisbank-wizard, i.p.v. elk kaartje los te
 * moeten verwijderen. Wist ook de inhoudsopgave (methode_hoofdstukken,
 * cascadeert naar methode_paragrafen en de gekoppelde kennis_*-content) -
 * de kennisbank IS de methode, dus "kennisbank leegmaken" betekent ook
 * "opnieuw beginnen met de inhoudsopgave".
 */
export async function wisVakInhoud(subjectId: string, opties: { kennisbank: boolean; voortgang: boolean }) {
  const ouder = await ouderProfiel();
  if ("error" in ouder) return { error: ouder.error };
  const { supabase, familyId } = ouder;

  const { data: subject } = await supabase.from("subjects").select("id, family_id").eq("id", subjectId).single();
  if (!subject || subject.family_id !== familyId) return { error: "Vak niet gevonden." };

  const acties = [];
  if (opties.kennisbank) {
    acties.push(
      supabase.from("kennis_onderdelen").delete().eq("subject_id", subjectId),
      supabase.from("kennis_paragraaf_context").delete().eq("subject_id", subjectId),
      supabase.from("kennis_oefenvragen").delete().eq("subject_id", subjectId),
      supabase.from("kennis_woordenlijsten").delete().eq("subject_id", subjectId),
      supabase.from("methode_hoofdstukken").delete().eq("subject_id", subjectId)
    );
  }
  if (opties.voortgang) {
    acties.push(supabase.from("overhoor_sessies").delete().eq("subject_id", subjectId));
  }

  const resultaten = await Promise.all(acties);
  const fout = resultaten.find((r) => r.error)?.error;
  if (fout) return { error: fout.message };

  revalidatePath(`/ouder/vakken/${subjectId}`);
  revalidatePath(`/kind/vakken/${subjectId}`);
  return { success: true };
}
