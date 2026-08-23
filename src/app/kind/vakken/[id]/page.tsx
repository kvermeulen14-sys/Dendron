import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { VakWerkruimte } from "@/components/vak-werkruimte";
import { MateriaalForm } from "@/components/materiaal-form";
import { KennisbankUploader } from "@/components/kennisbank-uploader";
import { OverhoorResultaten } from "@/components/overhoor-resultaten";
import { Icon } from "@/components/icon";
import { Card } from "@/components/ui/card";
import type { OverhoorSessie } from "@/lib/types";

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

  const { data: messages } = await supabase
    .from("chat_messages")
    .select("*")
    .eq("subject_id", id)
    .eq("user_id", user!.id)
    .order("created_at", { ascending: true });

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
          <p className="text-sm text-slate-500">Chat met je vakdocent, of laat je overhoren.</p>
        </div>
      </div>

      {(overhoorSessies?.length ?? 0) > 0 && (
        <Card>
          <h2 className="mb-3 text-base font-semibold text-slate-900">Mijn voortgang</h2>
          <OverhoorResultaten sessies={(overhoorSessies ?? []) as OverhoorSessie[]} />
        </Card>
      )}

      <VakWerkruimte
        subjectId={id}
        subjectName={subject.name}
        initialMessages={messages ?? []}
        initialModus={initialModus}
        hoofdstukken={hoofdstukken}
      />

      <div className="flex flex-col gap-3">
        <p className="text-sm text-slate-500">
          Heb je een foto van je boek of aantekeningen die kunnen helpen? Voeg ze toe.
        </p>
        <KennisbankUploader subjectId={id} />
        <div>
          <MateriaalForm subjectId={id} />
        </div>
      </div>
    </div>
  );
}
