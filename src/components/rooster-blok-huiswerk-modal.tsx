"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Modal } from "@/components/ui/modal";
import { PlanningHulpChat } from "@/components/planning-hulp-chat";
import { maakPlanningItem } from "@/lib/actions/planning";
import type { PlanningItem } from "@/lib/types";

/**
 * Klik-op-een-rooster-blokje-flow (agenda, ouder en kind): snel huiswerk
 * toevoegen voor het vak van dat lesuur, met een verplichte deadline - het
 * rooster (rooster_items) zelf blijft altijd ongewijzigd, dit maakt gewoon
 * een los planning_item aan (zelfde actie als "Nieuw item"/de
 * rooster-beheerpagina). Na het opslaan opent meteen de Planningshulp-chat,
 * zodat er direct (rekening houdend met de rest van de week/werkdruk)
 * besproken wordt wanneer er echt aan gewerkt gaat worden - een deadline
 * alleen is nog geen planning.
 */
export function RoosterBlokHuiswerkModal({
  open,
  onClose,
  titel,
  subjectId,
  standaardDatum,
  items,
}: {
  open: boolean;
  onClose: () => void;
  titel: string;
  subjectId: string;
  standaardDatum: string;
  items: PlanningItem[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [planningshulpOpen, setPlanningshulpOpen] = useState(false);

  function sluit() {
    onClose();
    setError(null);
  }

  return (
    <>
      <Modal open={open} onClose={sluit} title={`Huiswerk toevoegen - ${titel}`}>
        <form
          action={async (formData) => {
            setError(null);
            const res = await maakPlanningItem(formData);
            if (res?.error) {
              setError(res.error);
              return;
            }
            sluit();
            router.refresh();
            setPlanningshulpOpen(true);
          }}
          className="flex flex-col gap-4"
        >
          <input type="hidden" name="type" value="huiswerk" />
          <input type="hidden" name="subjectId" value={subjectId} />
          <p className="text-xs text-slate-500">
            Voegt los huiswerk toe voor {titel} - het rooster zelf blijft ongewijzigd. Zet hieronder duidelijk wanneer
            het af moet zijn; daarna helpt de Planningshulp meteen mee bepalen wanneer er echt aan gewerkt kan
            worden.
          </p>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Titel</label>
            <input
              name="title"
              required
              defaultValue={`Huiswerk ${titel}`}
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Moet af zijn op</label>
            <input
              type="date"
              name="dueDate"
              required
              defaultValue={standaardDatum}
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Omschrijving (optioneel)</label>
            <textarea
              name="description"
              rows={2}
              placeholder="bijv. paragraaf 3.2, opgave 5 t/m 10"
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Geschatte tijd in minuten (optioneel)</label>
            <input
              type="number"
              name="estimatedMinutes"
              min={0}
              placeholder="bijv. 30"
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100"
            />
          </div>

          {error && <p className="text-sm text-rose-600">{error}</p>}

          <div className="flex gap-2">
            <SubmitButton>Toevoegen &amp; plan met hulp</SubmitButton>
            <Button type="button" variant="secondary" onClick={sluit}>
              Annuleren
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={planningshulpOpen} onClose={() => setPlanningshulpOpen(false)} title="Planningshulp" maxWidthClass="max-w-xl">
        <PlanningHulpChat items={items} />
      </Modal>
    </>
  );
}
