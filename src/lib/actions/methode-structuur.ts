"use server";

import "server-only";
import { ouderProfiel, revalidateVak } from "@/lib/kennis-onderdelen-shared";
import { syncKennisTekstVelden } from "@/lib/methode-structuur";
import type { MethodeCategorie } from "@/lib/types";

/**
 * Losse, visuele beheeracties voor de inhoudsopgave-editor (hernoemen/
 * herordenen/verplaatsen/verwijderen) - los van de chat, zie
 * inhoudsopgave-editor.tsx. Elke actie werkt op de methode_hoofdstukken/
 * methode_paragrafen-tabellen (migratie 0027) en synchroniseert daarna de
 * tekstvelden op de gekoppelde kennis_*-rijen, zodat bestaande leescode
 * (tutor-prompt, Oefenen) kloppend blijft.
 */

export async function maakHoofdstuk(subjectId: string, naam: string) {
  const ouder = await ouderProfiel();
  if ("error" in ouder) return { error: ouder.error };
  const { supabase, familyId } = ouder;
  const schoneNaam = naam.trim();
  if (!schoneNaam) return { error: "Geef het hoofdstuk een naam." };

  const { data: laatste } = await supabase
    .from("methode_hoofdstukken")
    .select("volgorde")
    .eq("subject_id", subjectId)
    .order("volgorde", { ascending: false })
    .limit(1)
    .maybeSingle();
  const volgorde = (laatste?.volgorde ?? -1) + 1;

  const { error } = await supabase.from("methode_hoofdstukken").insert({ family_id: familyId, subject_id: subjectId, naam: schoneNaam, volgorde });
  if (error) return { error: error.code === "23505" ? "Er bestaat al een hoofdstuk met deze naam." : error.message };

  revalidateVak(subjectId);
  return { success: true };
}

export async function hernoemHoofdstuk(subjectId: string, hoofdstukId: string, naam: string) {
  const ouder = await ouderProfiel();
  if ("error" in ouder) return { error: ouder.error };
  const { supabase } = ouder;
  const schoneNaam = naam.trim();
  if (!schoneNaam) return { error: "Geef het hoofdstuk een naam." };

  const { error } = await supabase.from("methode_hoofdstukken").update({ naam: schoneNaam, updated_at: new Date().toISOString() }).eq("id", hoofdstukId);
  if (error) return { error: error.code === "23505" ? "Er bestaat al een hoofdstuk met deze naam." : error.message };

  // Elke gekoppelde paragraaf (en daarmee alle kennis_*-content eronder)
  // moet de nieuwe hoofdstuknaam laten zien.
  const { data: paragrafen } = await supabase.from("methode_paragrafen").select("id, categorie, code, titel").eq("hoofdstuk_id", hoofdstukId);
  for (const p of paragrafen ?? []) {
    await syncKennisTekstVelden(supabase, p.id, schoneNaam, p.code, p.titel);
  }

  revalidateVak(subjectId);
  return { success: true };
}

export async function herordenHoofdstukken(subjectId: string, hoofdstukIdsInVolgorde: string[]) {
  const ouder = await ouderProfiel();
  if ("error" in ouder) return { error: ouder.error };
  const { supabase } = ouder;

  const resultaten = await Promise.all(
    hoofdstukIdsInVolgorde.map((id, volgorde) => supabase.from("methode_hoofdstukken").update({ volgorde }).eq("id", id))
  );
  const fout = resultaten.find((r) => r.error)?.error;
  if (fout) return { error: fout.message };

  revalidateVak(subjectId);
  return { success: true };
}

export async function verwijderHoofdstuk(subjectId: string, hoofdstukId: string) {
  const ouder = await ouderProfiel();
  if ("error" in ouder) return { error: ouder.error };
  const { supabase } = ouder;

  const { data: paragrafen } = await supabase.from("methode_paragrafen").select("id").eq("hoofdstuk_id", hoofdstukId);
  const paragraafIds = (paragrafen ?? []).map((p) => p.id);
  if (paragraafIds.length > 0) {
    await supabase.from("kennis_onderdelen").delete().in("methode_paragraaf_id", paragraafIds);
  }
  // kennis_paragraaf_context/kennis_oefenvragen/kennis_woordenlijsten +
  // methode_paragrafen zelf gaan automatisch mee via ON DELETE CASCADE.
  const { error } = await supabase.from("methode_hoofdstukken").delete().eq("id", hoofdstukId);
  if (error) return { error: error.message };

  revalidateVak(subjectId);
  return { success: true };
}

export async function hernoemParagraaf(subjectId: string, methodeParagraafId: string, titel: string, code: string) {
  const ouder = await ouderProfiel();
  if ("error" in ouder) return { error: ouder.error };
  const { supabase } = ouder;
  const schoneTitel = titel.trim();
  const schoneCode = code.trim();
  if (!schoneTitel || !schoneCode) return { error: "Vul een titel en een paragraafnummer in." };

  const { data: paragraaf } = await supabase
    .from("methode_paragrafen")
    .select("hoofdstuk_id, methode_hoofdstukken(naam)")
    .eq("id", methodeParagraafId)
    .single();
  if (!paragraaf) return { error: "Paragraaf niet gevonden." };

  const { error } = await supabase
    .from("methode_paragrafen")
    .update({ titel: schoneTitel, code: schoneCode, updated_at: new Date().toISOString() })
    .eq("id", methodeParagraafId);
  if (error) return { error: error.code === "23505" ? "Er bestaat al een paragraaf met dit nummer in deze categorie." : error.message };

  const hoofdstukNaam = (paragraaf as unknown as { methode_hoofdstukken: { naam: string } }).methode_hoofdstukken.naam;
  await syncKennisTekstVelden(supabase, methodeParagraafId, hoofdstukNaam, schoneCode, schoneTitel);

  revalidateVak(subjectId);
  return { success: true };
}

export async function verplaatsParagraaf(subjectId: string, methodeParagraafId: string, nieuweHoofdstukId: string, nieuweCategorie: MethodeCategorie) {
  const ouder = await ouderProfiel();
  if ("error" in ouder) return { error: ouder.error };
  const { supabase } = ouder;

  const { data: hoofdstuk } = await supabase.from("methode_hoofdstukken").select("naam").eq("id", nieuweHoofdstukId).single();
  if (!hoofdstuk) return { error: "Hoofdstuk niet gevonden." };

  const { error } = await supabase
    .from("methode_paragrafen")
    .update({ hoofdstuk_id: nieuweHoofdstukId, categorie: nieuweCategorie, updated_at: new Date().toISOString() })
    .eq("id", methodeParagraafId);
  if (error) return { error: error.code === "23505" ? "Deze paragraaf bestaat al onder dat hoofdstuk/die categorie." : error.message };

  const { data: paragraaf } = await supabase.from("methode_paragrafen").select("code, titel").eq("id", methodeParagraafId).single();
  if (paragraaf) await syncKennisTekstVelden(supabase, methodeParagraafId, hoofdstuk.naam, paragraaf.code, paragraaf.titel);

  revalidateVak(subjectId);
  return { success: true };
}

export async function herordenParagrafen(subjectId: string, methodeParagraafIdsInVolgorde: string[]) {
  const ouder = await ouderProfiel();
  if ("error" in ouder) return { error: ouder.error };
  const { supabase } = ouder;

  const resultaten = await Promise.all(
    methodeParagraafIdsInVolgorde.map((id, volgorde) => supabase.from("methode_paragrafen").update({ volgorde }).eq("id", id))
  );
  const fout = resultaten.find((r) => r.error)?.error;
  if (fout) return { error: fout.message };

  revalidateVak(subjectId);
  return { success: true };
}

/** Publiceert in 1 keer alle 'concept'-inhoud (onderdelen/context/oefenvragen/woordenlijsten) van 1 paragraaf. */
export async function publiceerMethodeParagraaf(subjectId: string, methodeParagraafId: string) {
  const ouder = await ouderProfiel();
  if ("error" in ouder) return { error: ouder.error };
  const { supabase } = ouder;

  const nu = new Date().toISOString();
  const resultaten = await Promise.all([
    supabase.from("kennis_onderdelen").update({ status: "gepubliceerd", updated_at: nu }).eq("methode_paragraaf_id", methodeParagraafId).eq("status", "concept"),
    supabase.from("kennis_paragraaf_context").update({ status: "gepubliceerd", updated_at: nu }).eq("methode_paragraaf_id", methodeParagraafId).eq("status", "concept"),
    supabase.from("kennis_oefenvragen").update({ status: "gepubliceerd", updated_at: nu }).eq("methode_paragraaf_id", methodeParagraafId).eq("status", "concept"),
    supabase.from("kennis_woordenlijsten").update({ status: "gepubliceerd", updated_at: nu }).eq("methode_paragraaf_id", methodeParagraafId).eq("status", "concept"),
  ]);
  const fout = resultaten.find((r) => r.error)?.error;
  if (fout) return { error: fout.message };

  revalidateVak(subjectId);
  return { success: true };
}

export async function verwijderMethodeParagraaf(subjectId: string, methodeParagraafId: string) {
  const ouder = await ouderProfiel();
  if ("error" in ouder) return { error: ouder.error };
  const { supabase } = ouder;

  await supabase.from("kennis_onderdelen").delete().eq("methode_paragraaf_id", methodeParagraafId);
  // kennis_paragraaf_context/kennis_oefenvragen/kennis_woordenlijsten gaan
  // automatisch mee via ON DELETE CASCADE.
  const { error } = await supabase.from("methode_paragrafen").delete().eq("id", methodeParagraafId);
  if (error) return { error: error.message };

  revalidateVak(subjectId);
  return { success: true };
}
