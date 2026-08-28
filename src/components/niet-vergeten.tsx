"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/icon";
import { updateRoosterNotitieStatus, verwijderRoosterNotitie } from "@/lib/actions/rooster";
import type { RoosterNotitie, Subject } from "@/lib/types";

/**
 * "Niet vergeten" (voorheen "Niet vergeten mee te nemen") - losgetrokken uit
 * de agenda-pagina en verplaatst naar het kind-overzicht: dit hoort bij het
 * eerste wat je ziet als je de app opent, niet begraven in de weekagenda.
 */
export function NietVergeten({ notities, subjects, vandaagIso }: { notities: RoosterNotitie[]; subjects: Subject[]; vandaagIso: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function subjectNaam(id: string | null) {
    if (!id) return null;
    return subjects.find((s) => s.id === id)?.name ?? null;
  }

  if (notities.length === 0) return null;

  return (
    <Card className="flex flex-col gap-2 border-accent-200 bg-accent-50/60 py-3">
      <p className="text-sm font-semibold text-slate-900">Niet vergeten</p>
      <div className="flex flex-col gap-1.5">
        {notities.map((n) => (
          <div key={n.id} className="flex items-center gap-2.5">
            <button
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  await updateRoosterNotitieStatus(n.id, "klaar");
                  router.refresh();
                })
              }
              aria-label="Afgevinkt"
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-accent-300 text-accent-600 hover:bg-white disabled:opacity-50"
            >
              <Icon name="check" size={12} />
            </button>
            <span className="min-w-0 flex-1 text-sm text-slate-700">
              <span className="font-medium text-accent-700">{n.datum === vandaagIso ? "Vandaag" : "Morgen"}</span>{" "}
              - {n.tekst}
              {subjectNaam(n.subject_id) && <span className="text-slate-400"> ({subjectNaam(n.subject_id)})</span>}
            </span>
            <button
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  await verwijderRoosterNotitie(n.id);
                  router.refresh();
                })
              }
              aria-label="Verwijderen"
              className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-white hover:text-rose-600 disabled:opacity-50"
            >
              <Icon name="trash" size={12} />
            </button>
          </div>
        ))}
      </div>
    </Card>
  );
}
