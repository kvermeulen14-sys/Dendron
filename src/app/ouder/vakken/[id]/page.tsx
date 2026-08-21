import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/icon";
import { VerwijderMateriaalKnop } from "@/components/verwijder-materiaal-knop";
import { MateriaalForm } from "@/components/materiaal-form";
import { KennisbankUploader } from "@/components/kennisbank-uploader";
import { VakBewerkForm } from "./vak-bewerk-form";
import type { Subject } from "@/lib/types";

const BRON_ICON: Record<string, string> = { tekst: "file", pdf: "file", foto: "image" };

export default async function VakDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: subject } = await supabase.from("subjects").select("*").eq("id", id).single();
  if (!subject) notFound();

  const { data: materials } = await supabase
    .from("materials")
    .select("*")
    .eq("subject_id", id)
    .order("created_at", { ascending: false });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
          <Icon name={subject.icon} size={22} />
        </span>
        <div className="flex-1">
          <h1 className="text-xl font-semibold text-slate-900">{subject.name}</h1>
          <p className="text-sm text-slate-500">
            Kennisbank voor de AI-vakdocent van dit vak.
          </p>
        </div>
        <VakBewerkForm subject={subject as Subject} />
      </div>

      {subject.ai_instructions && (
        <Card>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Instructies voor de AI-vakdocent
          </p>
          <p className="mt-1.5 text-sm text-slate-700">{subject.ai_instructions}</p>
        </Card>
      )}

      <div>
        <h2 className="mb-3 text-base font-semibold text-slate-900">Lesstof toevoegen</h2>
        <KennisbankUploader subjectId={id} />
        <div className="mt-3">
          <MateriaalForm subjectId={id} />
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-base font-semibold text-slate-900">Lesstof</h2>

        {(!materials || materials.length === 0) && (
          <Card>
            <p className="text-sm text-slate-500">
              Nog geen lesstof toegevoegd. Zonder lesstof kan de AI-vakdocent nog niet
              vakspecifiek helpen.
            </p>
          </Card>
        )}

        <div className="flex flex-col gap-3">
          {materials?.map((m) => (
            <Card key={m.id} className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Icon name={BRON_ICON[m.bron_type] ?? "file"} size={14} className="shrink-0 text-slate-400" />
                  <p className="text-sm font-semibold text-slate-900">{m.title}</p>
                  {m.uploaded_by_role === "kind" && (
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                      door kind toegevoegd
                    </span>
                  )}
                  {m.hoofdstuk && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                      H. {m.hoofdstuk}
                    </span>
                  )}
                  {m.opdrachten && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                      Opdr. {m.opdrachten}
                    </span>
                  )}
                </div>
                <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-xs text-slate-500">
                  {m.content}
                </p>
              </div>
              <VerwijderMateriaalKnop materialId={m.id} subjectId={id} />
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
