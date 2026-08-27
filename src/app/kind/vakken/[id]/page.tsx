import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { VakWerkruimte } from "@/components/vak-werkruimte";
import { Icon } from "@/components/icon";
import { vakKleur } from "@/lib/vak-kleur";
import type { ChatMessage, OverhoorSessie } from "@/lib/types";

// Foto's die de leerling zelf in de chat heeft bijgevoegd (niet de
// AI-vakdocent-illustraties, dat gaat via `images` in de API-respons) -
// getekende URL erbij zodat ze na een refresh nog zichtbaar zijn.
async function metFotoUrls(supabase: Awaited<ReturnType<typeof createClient>>, berichten: ChatMessage[]) {
  return Promise.all(
    berichten.map(async (m) => {
      if (!m.image_path) return m;
      const { data: signed } = await supabase.storage.from("lesstof").createSignedUrl(m.image_path, 3600);
      return signed?.signedUrl ? { ...m, imageUrl: signed.signedUrl } : m;
    })
  );
}

export default async function KindVakDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ modus?: string }>;
}) {
  const { id } = await params;
  const { modus } = await searchParams;
  const initialModus = modus === "opdracht" || modus === "overhoren" ? modus : "chat";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: subject } = await supabase.from("subjects").select("*").eq("id", id).single();
  if (!subject) notFound();

  const [{ data: messages }, { data: opdrachtMessages }] = await Promise.all([
    supabase
      .from("chat_messages")
      .select("*")
      .eq("subject_id", id)
      .eq("user_id", user!.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("opdracht_berichten")
      .select("*")
      .eq("subject_id", id)
      .eq("user_id", user!.id)
      .order("created_at", { ascending: true }),
  ]);

  const [messagesMetFoto, opdrachtMessagesMetFoto] = await Promise.all([
    metFotoUrls(supabase, (messages ?? []) as ChatMessage[]),
    metFotoUrls(supabase, (opdrachtMessages ?? []) as ChatMessage[]),
  ]);

  const { data: overhoorSessies } = await supabase
    .from("overhoor_sessies")
    .select("*")
    .eq("subject_id", id)
    .order("created_at", { ascending: false })
    .limit(10);

  // Voor het automatische leerfase-advies bij Oefenen: hoe dichter bij een
  // toets voor dit vak, hoe strenger (zonder hints) er het beste geoefend
  // wordt - zie bepaalLeerfaseAdvies in lib/oefen-advies.ts.
  const vandaagIso = new Date().toISOString().slice(0, 10);
  const { data: eerstvolgendeToets } = await supabase
    .from("planning_items")
    .select("due_date")
    .eq("subject_id", id)
    .eq("type", "toets")
    .gte("due_date", vandaagIso)
    .order("due_date", { ascending: true })
    .limit(1)
    .maybeSingle();
  const dagenTotToets = eerstvolgendeToets
    ? Math.round(
        (new Date(eerstvolgendeToets.due_date + "T00:00:00").getTime() - new Date(vandaagIso + "T00:00:00").getTime()) /
          86400000
      )
    : null;

  // Voor Oefenen: hoofdstuk -> onderwerpen (paragrafen), zodat een leerling
  // precies kan kiezen WAT geoefend wordt i.p.v. alleen "heel hoofdstuk" of
  // "alle lesstof" - zelfde structuur als de kennisbank-beheerpagina. Een
  // paragraaf krijgt alleen een kennis_paragraaf_context-rij als er
  // grammatica/leerdoelen/video's zijn (zie verwerkKennisBrontekst) - een
  // paragraaf die ALLEEN een woordenlijst is (heel gewoon bij taalvakken)
  // heeft dus geen context-rij, maar moet wel gewoon kiesbaar zijn. Daarom
  // hier ook kennis_onderdelen en kennis_woordenlijsten meenemen i.p.v.
  // alleen kennis_paragraaf_context.
  const [{ data: kennisContexten }, { data: kennisOnderdelenPar }, { data: kennisWoordenlijstenPar }] = await Promise.all([
    supabase
      .from("kennis_paragraaf_context")
      .select("paragraaf_id, hoofdstuk, titel")
      .eq("subject_id", id)
      .eq("status", "gepubliceerd"),
    supabase
      .from("kennis_onderdelen")
      .select("paragraaf_id, hoofdstuk")
      .eq("subject_id", id)
      .eq("status", "gepubliceerd")
      .not("paragraaf_id", "is", null),
    supabase
      .from("kennis_woordenlijsten")
      .select("paragraaf_id, hoofdstuk, titel")
      .eq("subject_id", id)
      .eq("status", "gepubliceerd"),
  ]);

  let hoofdstukStructuur: { hoofdstuk: string; onderwerpen: { paragraafId: string; titel: string }[] }[] = [];
  const heeftKennisbankData =
    (kennisContexten?.length ?? 0) > 0 || (kennisOnderdelenPar?.length ?? 0) > 0 || (kennisWoordenlijstenPar?.length ?? 0) > 0;
  if (heeftKennisbankData) {
    // paragraaf_id -> beste titel: context-titel wint (rijkst), anders de
    // eerste woordenlijst-titel, anders gewoon het paragraafnummer.
    const perParagraaf = new Map<string, { hoofdstuk: string; titel: string | null }>();
    for (const c of kennisContexten ?? []) {
      perParagraaf.set(c.paragraaf_id, { hoofdstuk: c.hoofdstuk, titel: c.titel });
    }
    for (const w of kennisWoordenlijstenPar ?? []) {
      if (!w.paragraaf_id || perParagraaf.has(w.paragraaf_id)) continue;
      perParagraaf.set(w.paragraaf_id, { hoofdstuk: w.hoofdstuk, titel: w.titel });
    }
    for (const o of kennisOnderdelenPar ?? []) {
      if (!o.paragraaf_id || perParagraaf.has(o.paragraaf_id)) continue;
      perParagraaf.set(o.paragraaf_id, { hoofdstuk: o.hoofdstuk, titel: null });
    }

    const perHoofdstuk = new Map<string, { paragraafId: string; titel: string }[]>();
    for (const [paragraafId, info] of perParagraaf) {
      const lijst = perHoofdstuk.get(info.hoofdstuk) ?? [];
      lijst.push({ paragraafId, titel: info.titel || `Paragraaf ${paragraafId}` });
      perHoofdstuk.set(info.hoofdstuk, lijst);
    }
    hoofdstukStructuur = Array.from(perHoofdstuk.entries())
      .map(([hoofdstuk, onderwerpen]) => ({
        hoofdstuk,
        onderwerpen: onderwerpen.sort((a, b) => a.paragraafId.localeCompare(b.paragraafId, undefined, { numeric: true })),
      }))
      .sort((a, b) => a.hoofdstuk.localeCompare(b.hoofdstuk, undefined, { numeric: true }));
  } else {
    // Vak nog niet gemigreerd naar de kennisbank - terugvallen op de oudere,
    // platte hoofdstuk-lijst uit materials (geen onderwerp-niveau daarbinnen).
    const { data: materialsHoofdstukken } = await supabase
      .from("materials")
      .select("hoofdstuk")
      .eq("subject_id", id)
      .not("hoofdstuk", "is", null);
    const hoofdstukken = Array.from(new Set((materialsHoofdstukken ?? []).map((m) => m.hoofdstuk).filter(Boolean))) as string[];
    hoofdstukStructuur = hoofdstukken.map((h) => ({ hoofdstuk: h, onderwerpen: [] }));
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <span className={`flex h-12 w-12 items-center justify-center rounded-xl ${vakKleur(subject.id).bg} ${vakKleur(subject.id).text}`}>
          <Icon name={subject.icon} size={22} />
        </span>
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{subject.name}</h1>
          <p className="text-sm text-slate-500">Chat met je vakdocent, of ga oefenen.</p>
        </div>
      </div>

      <VakWerkruimte
        subjectId={id}
        subjectName={subject.name}
        initialMessages={messagesMetFoto}
        initialOpdrachtMessages={opdrachtMessagesMetFoto}
        initialModus={initialModus}
        hoofdstukStructuur={hoofdstukStructuur}
        overhoorSessies={(overhoorSessies ?? []) as OverhoorSessie[]}
        dagenTotToets={dagenTotToets}
      />
    </div>
  );
}
