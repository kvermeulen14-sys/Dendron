import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { MethodeCategorie } from "@/lib/types";

/**
 * De inhoudsopgave van de methode van 1 vak (Hoofdstuk -> Categorie ->
 * Paragraaf, zie migratie 0027) is de ENIGE plek waar structuur vandaan komt
 * - kennis_*-rijen hangen eraan via methode_paragraaf_id. De bestaande
 * tekstvelden (hoofdstuk/paragraaf_id/titel) op die rijen blijven wel
 * bestaan en gesynchroniseerd, zodat bestaande leescode (tutor-prompt,
 * Oefenen) niet overal hoeft te weten van deze nieuwe tabellen.
 *
 * Alle schrijf-functies hier vereisen ouder-rechten via RLS op
 * methode_hoofdstukken/methode_paragrafen/kennis_* - een aanroep vanuit een
 * kind-sessie faalt dus stil (geen crash, gewoon geen wijziging), dat is
 * bewust zo (zie garandeerMethodeStructuur hieronder).
 */

type Client = Awaited<ReturnType<typeof createClient>>;

export async function getOfMaakHoofdstuk(supabase: Client, familyId: string, subjectId: string, naam: string): Promise<string> {
  const { data: bestaand } = await supabase
    .from("methode_hoofdstukken")
    .select("id")
    .eq("subject_id", subjectId)
    .eq("naam", naam)
    .maybeSingle();
  if (bestaand) return bestaand.id as string;

  const { data: laatste } = await supabase
    .from("methode_hoofdstukken")
    .select("volgorde")
    .eq("subject_id", subjectId)
    .order("volgorde", { ascending: false })
    .limit(1)
    .maybeSingle();
  const volgorde = (laatste?.volgorde ?? -1) + 1;

  const { data: nieuw, error } = await supabase
    .from("methode_hoofdstukken")
    .insert({ family_id: familyId, subject_id: subjectId, naam, volgorde })
    .select("id")
    .single();
  if (error) {
    // Race met een andere gelijktijdige aanroep die 'm net aanmaakte - de
    // unique-constraint (subject_id, naam) ving dat op, gewoon opnieuw ophalen.
    if (error.code === "23505") {
      const { data: herprobeer } = await supabase.from("methode_hoofdstukken").select("id").eq("subject_id", subjectId).eq("naam", naam).single();
      if (herprobeer) return herprobeer.id as string;
    }
    throw new Error(error.message);
  }
  return nieuw.id as string;
}

async function getOfMaakParagraaf(
  supabase: Client,
  familyId: string,
  hoofdstukId: string,
  categorie: MethodeCategorie,
  code: string,
  titel: string
): Promise<string> {
  const { data: bestaand } = await supabase
    .from("methode_paragrafen")
    .select("id")
    .eq("hoofdstuk_id", hoofdstukId)
    .eq("categorie", categorie)
    .eq("code", code)
    .maybeSingle();
  if (bestaand) return bestaand.id as string;

  const { data: laatste } = await supabase
    .from("methode_paragrafen")
    .select("volgorde")
    .eq("hoofdstuk_id", hoofdstukId)
    .eq("categorie", categorie)
    .order("volgorde", { ascending: false })
    .limit(1)
    .maybeSingle();
  const volgorde = (laatste?.volgorde ?? -1) + 1;

  const { data: nieuw, error } = await supabase
    .from("methode_paragrafen")
    .insert({ family_id: familyId, hoofdstuk_id: hoofdstukId, categorie, code, titel, volgorde })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") {
      const { data: herprobeer } = await supabase
        .from("methode_paragrafen")
        .select("id")
        .eq("hoofdstuk_id", hoofdstukId)
        .eq("categorie", categorie)
        .eq("code", code)
        .single();
      if (herprobeer) return herprobeer.id as string;
    }
    throw new Error(error.message);
  }
  return nieuw.id as string;
}

/** Zoekt (of maakt) de methode_paragraaf voor deze combinatie en geeft z'n id terug. */
export async function koppelAanMethodeParagraaf(
  supabase: Client,
  familyId: string,
  subjectId: string,
  hoofdstukNaam: string,
  categorie: MethodeCategorie,
  code: string,
  titel: string
): Promise<string> {
  const hoofdstukId = await getOfMaakHoofdstuk(supabase, familyId, subjectId, hoofdstukNaam);
  return getOfMaakParagraaf(supabase, familyId, hoofdstukId, categorie, code, titel);
}

/**
 * Schrijft de (gesynchroniseerde) tekstvelden op alle kennis_*-rijen die aan
 * deze methode_paragraaf hangen - gebruikt wanneer de structuur zelf wijzigt
 * (hernoemen/herordenen/verplaatsen via de editor), zodat bestaande leescode
 * die nog op hoofdstuk/paragraaf_id/titel leest kloppend blijft.
 */
export async function syncKennisTekstVelden(supabase: Client, methodeParagraafId: string, hoofdstukNaam: string, code: string, titel: string) {
  await Promise.all([
    supabase.from("kennis_onderdelen").update({ hoofdstuk: hoofdstukNaam, paragraaf_id: code }).eq("methode_paragraaf_id", methodeParagraafId),
    supabase.from("kennis_paragraaf_context").update({ hoofdstuk: hoofdstukNaam, paragraaf_id: code, titel }).eq("methode_paragraaf_id", methodeParagraafId),
    supabase.from("kennis_oefenvragen").update({ hoofdstuk: hoofdstukNaam, paragraaf_id: code }).eq("methode_paragraaf_id", methodeParagraafId),
    supabase.from("kennis_woordenlijsten").update({ hoofdstuk: hoofdstukNaam, paragraaf_id: code }).eq("methode_paragraaf_id", methodeParagraafId),
  ]);
}

/**
 * Migreert 1x bestaande, nog niet gekoppelde kennisbank-content (van vóór de
 * inhoudsopgave) naar de nieuwe structuur - idempotent (query't alleen wat
 * nog methode_paragraaf_id null heeft), dus veilig om bij elk paginabezoek
 * aan te roepen. Best-effort: bij een kind-sessie (geen schrijfrechten via
 * RLS) faalt dit stil, de pagina blijft gewoon werken met wat er al is.
 */
export async function garandeerMethodeStructuur(subjectId: string) {
  try {
    const supabase = await createClient();
    const { data: subject } = await supabase.from("subjects").select("family_id").eq("id", subjectId).single();
    if (!subject) return;
    const familyId = subject.family_id as string;

    const [{ data: onderdelen }, { data: contexten }, { data: oefenvragen }, { data: woordenlijsten }] = await Promise.all([
      supabase
        .from("kennis_onderdelen")
        .select("id, hoofdstuk, paragraaf_id")
        .eq("subject_id", subjectId)
        .is("methode_paragraaf_id", null)
        .not("paragraaf_id", "is", null),
      supabase.from("kennis_paragraaf_context").select("id, hoofdstuk, paragraaf_id, titel").eq("subject_id", subjectId).is("methode_paragraaf_id", null),
      supabase.from("kennis_oefenvragen").select("id, hoofdstuk, paragraaf_id").eq("subject_id", subjectId).is("methode_paragraaf_id", null),
      supabase
        .from("kennis_woordenlijsten")
        .select("id, hoofdstuk, paragraaf_id, titel, categorie")
        .eq("subject_id", subjectId)
        .is("methode_paragraaf_id", null),
    ]);

    const heeftWerk =
      (onderdelen?.length ?? 0) > 0 || (contexten?.length ?? 0) > 0 || (oefenvragen?.length ?? 0) > 0 || (woordenlijsten?.length ?? 0) > 0;
    if (!heeftWerk) return;

    // Grammatica/praktijk-groepen: (hoofdstuk, paragraaf_id) uit onderdelen +
    // context + oefenvragen samen - horen inhoudelijk bij elkaar (dezelfde
    // bron-upload), categorie hangt af van of er losse regels (onderdelen)
    // bij zitten.
    const groepSleutel = (hoofdstuk: string, paragraafId: string) => `${hoofdstuk}␟${paragraafId}`;
    const groepen = new Map<string, { hoofdstuk: string; paragraafId: string; heeftOnderdelen: boolean; titel: string | null }>();
    for (const o of onderdelen ?? []) {
      const key = groepSleutel(o.hoofdstuk, o.paragraaf_id as string);
      const g = groepen.get(key) ?? { hoofdstuk: o.hoofdstuk, paragraafId: o.paragraaf_id as string, heeftOnderdelen: false, titel: null };
      g.heeftOnderdelen = true;
      groepen.set(key, g);
    }
    for (const c of contexten ?? []) {
      const key = groepSleutel(c.hoofdstuk, c.paragraaf_id);
      const g = groepen.get(key) ?? { hoofdstuk: c.hoofdstuk, paragraafId: c.paragraaf_id, heeftOnderdelen: false, titel: null };
      g.titel = c.titel;
      groepen.set(key, g);
    }
    for (const v of oefenvragen ?? []) {
      const key = groepSleutel(v.hoofdstuk, v.paragraaf_id);
      if (!groepen.has(key)) groepen.set(key, { hoofdstuk: v.hoofdstuk, paragraafId: v.paragraaf_id, heeftOnderdelen: false, titel: null });
    }

    for (const g of groepen.values()) {
      const categorie: MethodeCategorie = g.heeftOnderdelen ? "grammatica" : "praktijk";
      const titel = g.titel || `Paragraaf ${g.paragraafId}`;
      const methodeParagraafId = await koppelAanMethodeParagraaf(supabase, familyId, subjectId, g.hoofdstuk, categorie, g.paragraafId, titel);
      await Promise.all([
        supabase
          .from("kennis_onderdelen")
          .update({ methode_paragraaf_id: methodeParagraafId })
          .eq("subject_id", subjectId)
          .eq("hoofdstuk", g.hoofdstuk)
          .eq("paragraaf_id", g.paragraafId)
          .is("methode_paragraaf_id", null),
        supabase
          .from("kennis_paragraaf_context")
          .update({ methode_paragraaf_id: methodeParagraafId })
          .eq("subject_id", subjectId)
          .eq("hoofdstuk", g.hoofdstuk)
          .eq("paragraaf_id", g.paragraafId)
          .is("methode_paragraaf_id", null),
        supabase
          .from("kennis_oefenvragen")
          .update({ methode_paragraaf_id: methodeParagraafId })
          .eq("subject_id", subjectId)
          .eq("hoofdstuk", g.hoofdstuk)
          .eq("paragraaf_id", g.paragraafId)
          .is("methode_paragraaf_id", null),
      ]);
    }

    // Woordenlijsten: eigen groep per (hoofdstuk, paragraaf_id, categorie) -
    // woordenschat en zinnen zijn altijd aparte paragrafen, ook al delen ze
    // hetzelfde legacy paragraafnummer.
    const woordSleutel = (hoofdstuk: string, paragraafId: string, categorie: string) => `${hoofdstuk}␟${paragraafId}␟${categorie}`;
    const woordGroepen = new Map<string, { hoofdstuk: string; paragraafId: string; categorie: MethodeCategorie; titel: string }>();
    for (const w of woordenlijsten ?? []) {
      const key = woordSleutel(w.hoofdstuk, w.paragraaf_id, w.categorie);
      if (!woordGroepen.has(key)) {
        woordGroepen.set(key, { hoofdstuk: w.hoofdstuk, paragraafId: w.paragraaf_id, categorie: w.categorie as MethodeCategorie, titel: w.titel });
      }
    }
    for (const g of woordGroepen.values()) {
      const methodeParagraafId = await koppelAanMethodeParagraaf(supabase, familyId, subjectId, g.hoofdstuk, g.categorie, g.paragraafId, g.titel);
      await supabase
        .from("kennis_woordenlijsten")
        .update({ methode_paragraaf_id: methodeParagraafId })
        .eq("subject_id", subjectId)
        .eq("hoofdstuk", g.hoofdstuk)
        .eq("paragraaf_id", g.paragraafId)
        .eq("categorie", g.categorie)
        .is("methode_paragraaf_id", null);
    }
  } catch {
    // Best-effort - een kind-sessie (geen schrijfrechten) of een tijdelijke
    // DB-hik mag de pagina nooit breken, alleen betekent het dat de
    // migratie nog een keer probeert bij een volgend bezoek.
  }
}
