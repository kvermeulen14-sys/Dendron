import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/icon";
import { vakKleur } from "@/lib/vak-kleur";
import { VakInhoudWizard } from "@/components/vak-inhoud-wizard";
import { VakKennisbankOverzicht } from "@/components/vak-kennisbank-overzicht";
import { InhoudsopgaveEditor } from "@/components/inhoudsopgave-editor";
import { OverhoorResultaten } from "@/components/overhoor-resultaten";
import { OverhoorGeschiedenisOpschonenKnop } from "@/components/overhoor-geschiedenis-opschonen-knop";
import { garandeerMethodeStructuur } from "@/lib/methode-structuur";
import { VakBewerkForm } from "./vak-bewerk-form";
import { VerwijderVakKnop } from "./verwijder-vak-knop";
import type {
  KennisOefenvraag,
  KennisOnderdeel,
  KennisParagraafContext,
  KennisWoordenlijst,
  MethodeHoofdstuk,
  MethodeParagraaf,
  OverhoorSessie,
  Subject,
} from "@/lib/types";

export default async function VakDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: subject } = await supabase.from("subjects").select("*").eq("id", id).single();
  if (!subject) notFound();

  // Best-effort, idempotent: linkt eerder geïmporteerde (nog losse) content
  // 1x aan de inhoudsopgave-structuur - moet vóór de queries hieronder,
  // anders mist deze paginalading net-gelinkte rijen.
  await garandeerMethodeStructuur(id);

  const [
    { data: overhoorSessies },
    { data: kennisOnderdelen },
    { data: kennisContexten },
    { data: kennisOefenvragen },
    { data: kennisWoordenlijsten },
    { data: hoofdstukken },
    { data: paragrafen },
  ] = await Promise.all([
    supabase.from("overhoor_sessies").select("*").eq("subject_id", id).order("created_at", { ascending: false }).limit(10),
    supabase.from("kennis_onderdelen").select("*").eq("subject_id", id),
    supabase.from("kennis_paragraaf_context").select("*").eq("subject_id", id),
    supabase.from("kennis_oefenvragen").select("*").eq("subject_id", id),
    supabase.from("kennis_woordenlijsten").select("*").eq("subject_id", id),
    supabase.from("methode_hoofdstukken").select("*").eq("subject_id", id).order("volgorde", { ascending: true }),
    supabase.from("methode_paragrafen").select("*, methode_hoofdstukken!inner(subject_id)").eq("methode_hoofdstukken.subject_id", id).order("volgorde", { ascending: true }),
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
          <p className="text-sm text-slate-500">Kennisbank en AI-vakdocent voor dit vak.</p>
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
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-slate-900">Overhoor-resultaten</h2>
          {(overhoorSessies?.length ?? 0) > 0 && <OverhoorGeschiedenisOpschonenKnop subjectId={id} />}
        </div>
        <OverhoorResultaten sessies={(overhoorSessies ?? []) as OverhoorSessie[]} />
      </Card>

      <VakInhoudWizard subjectId={id} subject={subject as Subject} heeftKennisbank={heeftKennisbank} />

      <div>
        <h2 className="mb-1 text-base font-semibold text-slate-900">Inhoudsopgave</h2>
        <p className="mb-3 text-sm text-slate-500">
          Zo is de methode ingedeeld - hoofdstuk, categorie en paragraaf. Dit bepaalt wat het kind bij &quot;Oefenen&quot;
          te kiezen krijgt. Wordt automatisch aangevuld bij een nieuwe upload; hernoem/herorden/verplaats hier zelf.
        </p>
        <InhoudsopgaveEditor
          subjectId={id}
          hoofdstukken={(hoofdstukken ?? []) as MethodeHoofdstuk[]}
          paragrafen={(paragrafen ?? []) as unknown as MethodeParagraaf[]}
        />
      </div>

      <div>
        <h2 className="mb-3 text-base font-semibold text-slate-900">Wat er nu in de kennisbank staat</h2>
        <VakKennisbankOverzicht
          onderdelen={(kennisOnderdelen ?? []) as KennisOnderdeel[]}
          contexten={(kennisContexten ?? []) as KennisParagraafContext[]}
          oefenvragen={(kennisOefenvragen ?? []) as KennisOefenvraag[]}
          woordenlijsten={(kennisWoordenlijsten ?? []) as KennisWoordenlijst[]}
        />
      </div>
    </div>
  );
}
