import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { VakWerkruimte } from "@/components/vak-werkruimte";
import { Icon } from "@/components/icon";
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

  const { data: materialsHoofdstukken } = await supabase
    .from("materials")
    .select("hoofdstuk")
    .eq("subject_id", id)
    .not("hoofdstuk", "is", null);
  const hoofdstukken = Array.from(new Set((materialsHoofdstukken ?? []).map((m) => m.hoofdstuk).filter(Boolean))) as string[];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
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
        hoofdstukken={hoofdstukken}
        overhoorSessies={(overhoorSessies ?? []) as OverhoorSessie[]}
      />
    </div>
  );
}
