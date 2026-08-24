"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Modal } from "@/components/ui/modal";
import { Icon } from "@/components/icon";
import { maakPlanningItem } from "@/lib/actions/planning";

// Eerste datum na vandaag die op deze weekdag valt (1=maandag...7=zondag,
// zelfde telling als RoosterItem.dag_van_week) - een handig standaardvoorstel
// voor "moet af zijn tegen de volgende les", los aan te passen in het formulier.
function volgendeDatumVoorDag(dagVanWeek: number): string {
  const datum = new Date();
  datum.setDate(datum.getDate() + 1);
  while (((datum.getDay() + 6) % 7) + 1 !== dagVanWeek) {
    datum.setDate(datum.getDate() + 1);
  }
  return `${datum.getFullYear()}-${String(datum.getMonth() + 1).padStart(2, "0")}-${String(datum.getDate()).padStart(2, "0")}`;
}

/**
 * Snelkoppeling vanaf een lesuur in het rooster naar "nieuw huiswerk voor dit
 * vak" - maakt een gewoon planning_items-record aan (net als "Nieuw item" in
 * de agenda), het rooster (rooster_items) zelf blijft altijd ongewijzigd.
 */
export function HuiswerkKoppelenKnop({
  titel,
  subjectId,
  dagVanWeek,
}: {
  titel: string;
  subjectId: string | null;
  dagVanWeek: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function sluit() {
    setOpen(false);
    setError(null);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-xl p-2 text-slate-400 hover:bg-accent-50 hover:text-accent-600"
        aria-label={`Huiswerk koppelen aan ${titel}`}
      >
        <Icon name="book-open" size={16} />
      </button>

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
          }}
          className="flex flex-col gap-4"
        >
          <input type="hidden" name="type" value="huiswerk" />
          {subjectId && <input type="hidden" name="subjectId" value={subjectId} />}
          <p className="text-xs text-slate-500">
            Dit voegt los huiswerk toe voor {titel} in de agenda - het rooster zelf blijft ongewijzigd.
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
              defaultValue={volgendeDatumVoorDag(dagVanWeek)}
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100"
            />
            <p className="mt-1 text-xs text-slate-400">Standaard: de eerstvolgende les op dit rooster-uur.</p>
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
            <SubmitButton>Toevoegen</SubmitButton>
            <Button type="button" variant="secondary" onClick={sluit}>
              Annuleren
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
