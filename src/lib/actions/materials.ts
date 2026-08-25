"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";

export async function voegLesstofToe(formData: FormData) {
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
  if (!profile) return { error: "Profiel niet gevonden." };

  const subjectId = String(formData.get("subjectId") || "");
  const title = String(formData.get("title") || "").trim();
  const content = String(formData.get("content") || "").trim();

  if (!subjectId || !title || !content) {
    return { error: "Vul een titel en de inhoud van de lesstof in." };
  }

  const { error } = await supabase.from("materials").insert({
    family_id: profile.family_id,
    subject_id: subjectId,
    title,
    content,
    uploaded_by: user.id,
    uploaded_by_role: profile.role,
  });

  if (error) return { error: error.message };

  revalidatePath(`/ouder/vakken/${subjectId}`);
  revalidatePath(`/kind/vakken/${subjectId}`);
  return { success: true };
}

export async function bewerkLesstof(materialId: string, subjectId: string, formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Niet ingelogd." };

  const title = String(formData.get("title") || "").trim();
  const content = String(formData.get("content") || "").trim();
  const hoofdstuk = String(formData.get("hoofdstuk") || "").trim();
  const opdrachten = String(formData.get("opdrachten") || "").trim();

  if (!title || !content) {
    return { error: "Vul een titel en de inhoud van de lesstof in." };
  }

  const { error } = await supabase
    .from("materials")
    .update({ title, content, hoofdstuk: hoofdstuk || null, opdrachten: opdrachten || null })
    .eq("id", materialId);

  if (error) return { error: error.message };

  revalidatePath(`/ouder/vakken/${subjectId}`);
  revalidatePath(`/kind/vakken/${subjectId}`);
  return { success: true };
}

export async function verwijderLesstof(materialId: string, subjectId: string) {
  const supabase = await createClient();

  const { data: materiaal } = await supabase
    .from("materials")
    .select("file_url")
    .eq("id", materialId)
    .single();

  await supabase.from("materials").delete().eq("id", materialId);
  if (materiaal?.file_url) {
    await supabase.storage.from("lesstof").remove([materiaal.file_url]);
  }

  revalidatePath(`/ouder/vakken/${subjectId}`);
  revalidatePath(`/kind/vakken/${subjectId}`);
}

/**
 * Zoekt materials-rijen die overbodig zijn geworden omdat dezelfde paragraaf
 * al gepubliceerde kennisonderdelen/-context heeft (zie de chat-route: die
 * gebruikt dan sowieso alleen nog de kennisonderdelen als lesstof). Matcht
 * op de titelconventie "<paragraafnummer> - <titel>" die zowel de
 * ingebouwde Getal & Ruimte-import als de kennisbank-import gebruiken.
 */
async function overtolligeLesstof(supabase: Awaited<ReturnType<typeof createClient>>, subjectId: string) {
  const [{ data: onderdelen }, { data: contexten }, { data: materialsData }] = await Promise.all([
    supabase.from("kennis_onderdelen").select("paragraaf_id").eq("subject_id", subjectId).eq("status", "gepubliceerd"),
    supabase.from("kennis_paragraaf_context").select("paragraaf_id").eq("subject_id", subjectId).eq("status", "gepubliceerd"),
    supabase.from("materials").select("id, title, file_url").eq("subject_id", subjectId),
  ]);

  const gemigreerd = new Set([
    ...(onderdelen ?? []).map((o) => o.paragraaf_id),
    ...(contexten ?? []).map((c) => c.paragraaf_id),
  ]);
  if (gemigreerd.size === 0) return [];

  return (materialsData ?? []).filter((m) => {
    const match = m.title.match(/^(\d+(?:\.\d+)*)\s*-\s*/);
    return match && gemigreerd.has(match[1]);
  });
}

/** Alleen ter preview (voor een bevestigingsvraag) - verwijdert niets. */
export async function vindOvertolligeLesstof(subjectId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Niet ingelogd." };

  const overtollig = await overtolligeLesstof(supabase, subjectId);
  return { materialen: overtollig.map((m) => ({ id: m.id, title: m.title })) };
}

/**
 * Verwijdert de materials die overbodig zijn geworden (zie overtolligeLesstof
 * hierboven) - herberekent dit zelf op basis van de actuele database-status
 * i.p.v. te vertrouwen op wat de client eerder liet zien.
 */
export async function verwijderOvertolligeLesstof(subjectId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Niet ingelogd." };

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || profile.role !== "ouder") return { error: "Alleen ouders kunnen lesstof verwijderen." };

  const overtollig = await overtolligeLesstof(supabase, subjectId);
  if (overtollig.length === 0) return { verwijderd: 0, titels: [] as string[] };

  const { error } = await supabase.from("materials").delete().in("id", overtollig.map((m) => m.id));
  if (error) return { error: error.message };

  const bestandenOmTeVerwijderen = overtollig.map((m) => m.file_url).filter((f): f is string => Boolean(f));
  if (bestandenOmTeVerwijderen.length > 0) {
    await supabase.storage.from("lesstof").remove(bestandenOmTeVerwijderen);
  }

  revalidatePath(`/ouder/vakken/${subjectId}`);
  revalidatePath(`/kind/vakken/${subjectId}`);
  return { verwijderd: overtollig.length, titels: overtollig.map((m) => m.title) };
}

function fotoExtensieVan(pad: string) {
  const na_punt = pad.split(".").pop();
  return na_punt && na_punt.length <= 5 ? na_punt : "jpg";
}

/**
 * Bewaart een foto die tijdens een chat-gesprek is bijgevoegd alsnog als
 * permanente lesstof - voor een foto van THEORIE/uitleg (zie fotoType in
 * /api/chat) is dat handiger dan de foto bij elke vervolgvraag opnieuw mee
 * te sturen. De foto wordt gekopieerd naar een eigen opslagplek (niet
 * hergebruikt), zodat het verwijderen van dit lesstof-item nooit de foto in
 * de chatgeschiedenis kapotmaakt (en andersom).
 */
export async function bewaarChatFotoAlsLesstof(subjectId: string, chatImagePath: string, titel: string, samenvatting: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Niet ingelogd." };

  const { data: profile } = await supabase.from("profiles").select("family_id, role").eq("id", user.id).single();
  if (!profile) return { error: "Profiel niet gevonden." };

  const { data: subject } = await supabase.from("subjects").select("id, family_id").eq("id", subjectId).single();
  if (!subject || subject.family_id !== profile.family_id) return { error: "Vak niet gevonden." };

  const nieuwPad = `${profile.family_id}/${subjectId}/${randomUUID()}.${fotoExtensieVan(chatImagePath)}`;
  const { error: kopieerError } = await supabase.storage.from("lesstof").copy(chatImagePath, nieuwPad);
  if (kopieerError) return { error: `Foto kopiëren mislukt: ${kopieerError.message}` };

  const { error: insertError } = await supabase.from("materials").insert({
    family_id: profile.family_id,
    subject_id: subjectId,
    title: titel || "Foto uit de chat",
    content: samenvatting,
    file_url: nieuwPad,
    image_path: nieuwPad,
    bron_type: "foto",
    uploaded_by: user.id,
    uploaded_by_role: profile.role,
  });
  if (insertError) {
    await supabase.storage.from("lesstof").remove([nieuwPad]);
    return { error: insertError.message };
  }

  revalidatePath(`/ouder/vakken/${subjectId}`);
  revalidatePath(`/kind/vakken/${subjectId}`);
  return { success: true };
}
