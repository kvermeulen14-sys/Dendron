import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/icon";
import { vakKleur } from "@/lib/vak-kleur";
import { VerwijderMateriaalKnop } from "@/components/verwijder-materiaal-knop";
import { MateriaalForm } from "@/components/materiaal-form";
import { LesstofOpschonenKnop } from "@/components/lesstof-opschonen-knop";
import { MateriaalBewerkForm } from "@/components/materiaal-bewerk-form";
import { KennisbankUploader } from "@/components/kennisbank-uploader";
import { OverhoorResultaten } from "@/components/overhoor-resultaten";
import { KennisOnderdelenBeheer } from "@/components/kennis-onderdelen-beheer";
import { VakBewerkForm } from "./vak-bewerk-form";
import { VerwijderVakKnop } from "./verwijder-vak-knop";
import type {
  KennisOefenvraag,
  KennisOnderdeel,
  KennisParagraafContext,
  KennisWoordenlijst,
  Material,
  OverhoorSessie,
  Subject,
} from "@/lib/types";

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

  const { data: overhoorSessies } = await supabase
    .from("overhoor_sessies")
    .select("*")
    .eq("subject_id", id)
    .order("created_at", { ascending: false })
    .limit(10);

  const isWiskunde = subject.name.toLowerCase().includes("wiskunde");
  const [{ data: kennisOnderdelen }, { data: kennisContexten }, { data: kennisOefenvragen }, { data: kennisWoordenlijsten }] =
    await Promise.all([
      supabase.from("kennis_onderdelen").select("*").eq("subject_id", id),
      supabase.from("kennis_paragraaf_context").select("*").eq("subject_id", id),
      supabase.from("kennis_oefenvragen").select("*").eq("subject_id", id),
      supabase.from("kennis_woordenlijsten").select("*").eq("subject_id", id),
    ]);
  const heeftKennisbank =
    (kennisOnderdelen?.length ?? 0) > 0 ||
    (kennisContexten?.length ?? 0) > 0 ||
    (kennisOefenvragen?.length ?? 0) > 0 ||
    (kennisWoordenlijsten?.length ?? 0) > 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <span className={`flex h-12 w-12 items-center justify-center rounded-xl ${vakKleur(subject.id).bg} ${vakKleur(subject.id).text}`}>
          <Icon name={subject.icon} size={22} />
        </span>
        <div className="flex-1">
          <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-900">
            {subject.name}
            {subject.code && (
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-bold tracking-wide text-slate-500">
                {subject.code}
              </span>
            )}
          </h1>
          <p className="text-sm text-slate-500">
            Kennisbank voor de AI-vakdocent van dit vak.
          </p>
        </div>
        <VakBewerkForm subject={subject as Subject} />
        <VerwijderVakKnop subjectId={id} subjectName={subject.name} />
      </div>

      {subject.ai_instructions && (
        <Card>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Instructies voor de AI-vakdocent
          </p>
          <p className="mt-1.5 text-sm text-slate-700">{subject.ai_instructions}</p>
        </Card>
      )}

      <Card>
        <h2 className="mb-3 text-base font-semibold text-slate-900">Overhoor-resultaten</h2>
        <OverhoorResultaten sessies={(overhoorSessies ?? []) as OverhoorSessie[]} />
      </Card>

      <div>
        <h2 className="mb-3 text-base font-semibold text-slate-900">Kennisonderdelen (regel-niveau)</h2>
        <KennisOnderdelenBeheer
          subjectId={id}
          onderdelen={(kennisOnderdelen ?? []) as KennisOnderdeel[]}
          contexten={(kennisContexten ?? []) as KennisParagraafContext[]}
          oefenvragen={(kennisOefenvragen ?? []) as KennisOefenvraag[]}
          woordenlijsten={(kennisWoordenlijsten ?? []) as KennisWoordenlijst[]}
          toonIngebouwdePilot={isWiskunde}
        />
      </div>

      {/* Zodra dit vak kennisonderdelen heeft, is dat de ene bron van waarheid
          (zie ook chat/oefenen) - lesstof los toevoegen zou dan weer 2
          plekken geven om bij te houden, dus dan niet meer tonen. Voor een
          vak zonder kennisonderdelen blijft dit de manier om lesstof toe te
          voegen. */}
      {!heeftKennisbank && (
        <div>
          <h2 className="mb-3 text-base font-semibold text-slate-900">Lesstof toevoegen</h2>
          <KennisbankUploader subjectId={id} />
          <div className="mt-3">
            <MateriaalForm subjectId={id} />
          </div>
        </div>
      )}

      <div>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-slate-900">Lesstof</h2>
          {heeftKennisbank && <LesstofOpschonenKnop subjectId={id} />}
        </div>

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
              <div className="flex shrink-0 items-center gap-1">
                <MateriaalBewerkForm material={m as Material} subjectId={id} />
                <VerwijderMateriaalKnop materialId={m.id} subjectId={id} />
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
