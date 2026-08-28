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
  // "alle lesstof" - rechtstreeks vanuit de inhoudsopgave (methode_hoofdstukken/
  // methode_paragrafen, migratie 0027), dus altijd de actuele structuur, ook
  // over categorieën heen (een paragraafcode kan nu binnen 1 hoofdstuk in
  // meerdere categorieën voorkomen - de paragraaf-UUID is de echte sleutel,
  // niet de code). Alleen paragrafen met minstens 1 gepubliceerd stukje
  // content zijn kiesbaar - een lege inhoudsopgave-tak toont niets.
  const [{ data: hoofdstukkenRijen }, { data: paragrafenRijen }] = await Promise.all([
    supabase.from("methode_hoofdstukken").select("id, naam, volgorde").eq("subject_id", id).order("volgorde"),
    supabase
      .from("methode_paragrafen")
      .select("id, hoofdstuk_id, code, titel, volgorde, methode_hoofdstukken!inner(subject_id)")
      .eq("methode_hoofdstukken.subject_id", id)
      .order("volgorde"),
  ]);

  const [{ data: onderdelenPar }, { data: contextenPar }, { data: woordenlijstenPar }] = await Promise.all([
    supabase
      .from("kennis_onderdelen")
      .select("methode_paragraaf_id")
      .eq("subject_id", id)
      .eq("status", "gepubliceerd")
      .not("methode_paragraaf_id", "is", null),
    supabase
      .from("kennis_paragraaf_context")
      .select("methode_paragraaf_id")
      .eq("subject_id", id)
      .eq("status", "gepubliceerd")
      .not("methode_paragraaf_id", "is", null),
    supabase
      .from("kennis_woordenlijsten")
      .select("methode_paragraaf_id")
      .eq("subject_id", id)
      .eq("status", "gepubliceerd")
      .not("methode_paragraaf_id", "is", null),
  ]);
  const paragrafenMetContent = new Set([
    ...(onderdelenPar ?? []).map((o) => o.methode_paragraaf_id),
    ...(contextenPar ?? []).map((c) => c.methode_paragraaf_id),
    ...(woordenlijstenPar ?? []).map((w) => w.methode_paragraaf_id),
  ]);

  const hoofdstukVolgorde = (hoofdstukkenRijen ?? []) as { id: string; naam: string; volgorde: number }[];
  const perHoofdstuk = new Map<string, { id: string; code: string; titel: string }[]>();
  for (const p of (paragrafenRijen ?? []) as unknown as { id: string; hoofdstuk_id: string; code: string; titel: string }[]) {
    if (!paragrafenMetContent.has(p.id)) continue;
    const lijst = perHoofdstuk.get(p.hoofdstuk_id) ?? [];
    lijst.push({ id: p.id, code: p.code, titel: p.titel });
    perHoofdstuk.set(p.hoofdstuk_id, lijst);
  }
  const hoofdstukStructuur: { hoofdstuk: string; onderwerpen: { id: string; code: string; titel: string }[] }[] = hoofdstukVolgorde
    .map((h) => ({ hoofdstuk: h.naam, onderwerpen: perHoofdstuk.get(h.id) ?? [] }))
    .filter((h) => h.onderwerpen.length > 0);

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
