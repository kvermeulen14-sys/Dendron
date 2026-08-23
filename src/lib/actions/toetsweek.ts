"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { stelLeermomentenVoor } from "@/lib/planning";
import type { PlanningType } from "@/lib/types";

const AANTAL_MOMENTEN_PER_GEWICHT: Record<number, number> = { 1: 2, 2: 3, 3: 4 };
const DAGEN_VOORAF_PER_GEWICHT: Record<number, number> = { 1: 5, 2: 8, 3: 12 };
// Vanaf hoeveel aaneengesloten dagen met leermomenten van uitsluitend 1 vak
// geven we de interleaving-tip (afwisselen werkt beter voor het geheugen dan
// alles voor 1 vak achter elkaar doen - "blocked" vs "interleaved practice").
const CLUSTER_DREMPEL = 3;

function revalidateAgendas() {
  revalidatePath("/ouder/agenda");
  revalidatePath("/kind/agenda");
  revalidatePath("/ouder");
  revalidatePath("/kind");
}

function isVolgendeKalenderdag(a: string, b: string) {
  const da = new Date(a + "T00:00:00").getTime();
  const db = new Date(b + "T00:00:00").getTime();
  return db - da === 86400000;
}

/**
 * Zoekt de langste reeks aaneengesloten kalenderdagen waarop uitsluitend
 * leermomenten van 1 en hetzelfde vak gepland staan (een "blok"). Geeft het
 * subject_id van dat vak terug als de reeks lang genoeg is om interleaving
 * (vakken afwisselen) de moeite waard te maken, anders null.
 */
function vindGeclusterdVak(items: { due_date: string; subject_id: string | null }[]): string | null {
  const vakkenPerDag = new Map<string, Set<string>>();
  for (const item of items) {
    if (!item.subject_id) continue;
    if (!vakkenPerDag.has(item.due_date)) vakkenPerDag.set(item.due_date, new Set());
    vakkenPerDag.get(item.due_date)!.add(item.subject_id);
  }

  const datums = Array.from(vakkenPerDag.keys()).sort();
  let langsteVak: string | null = null;
  let langsteLengte = 0;
  let huidigVak: string | null = null;
  let huidigLengte = 0;
  let vorigeDatum: string | null = null;

  for (const datum of datums) {
    const vakken = vakkenPerDag.get(datum)!;
    const enkelVak = vakken.size === 1 ? Array.from(vakken)[0] : null;
    const aaneengesloten = vorigeDatum ? isVolgendeKalenderdag(vorigeDatum, datum) : false;

    if (enkelVak && enkelVak === huidigVak && aaneengesloten) {
      huidigLengte += 1;
    } else {
      huidigVak = enkelVak;
      huidigLengte = enkelVak ? 1 : 0;
    }
    if (huidigLengte > langsteLengte) {
      langsteLengte = huidigLengte;
      langsteVak = huidigVak;
    }
    vorigeDatum = datum;
  }

  return langsteLengte >= CLUSTER_DREMPEL ? langsteVak : null;
}

export async function plantToetsweek(
  items: { toetsId: string; gewicht: 1 | 2 | 3 }[]
): Promise<
  | { error: string; aantal?: undefined; clusterSubjectId?: undefined }
  | { error?: undefined; aantal: number; clusterSubjectId: string | null }
> {
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
  const alleVoorstellen: { due_date: string; subject_id: string | null }[] = [];

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
      for (const v of voorstellen) alleVoorstellen.push({ due_date: v.due_date, subject_id: toets.subject_id });
    }
  }

  revalidateAgendas();
  return { aantal: totaalNieuw, clusterSubjectId: items.length >= 2 ? vindGeclusterdVak(alleVoorstellen) : null };
}
