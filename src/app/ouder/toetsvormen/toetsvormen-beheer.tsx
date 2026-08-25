"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Modal } from "@/components/ui/modal";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/icon";
import { bewerkToetsvorm, maakToetsvorm, verwijderToetsvorm } from "@/lib/actions/test-types";
import type { TestType } from "@/lib/types";

export function ToetsvormenBeheer({ toetsvormen }: { toetsvormen: TestType[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [bewerkId, setBewerkId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [verwijderPending, startVerwijderTransition] = useTransition();

  const bewerkToetsvormRij = bewerkId ? (toetsvormen.find((t) => t.id === bewerkId) ?? null) : null;
  const modalOpen = open || bewerkToetsvormRij !== null;

  function sluitModal() {
    setOpen(false);
    setBewerkId(null);
    setError(null);
  }

  function verwijder(id: string) {
    startVerwijderTransition(async () => {
      await verwijderToetsvorm(id);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Toetsvormen</h1>
          <p className="mt-1 text-sm text-slate-500">
            Elke toetsvorm heeft een eigen leeradvies. Bij het inplannen van een toets kies
            je de vorm en worden de leermomenten daarop afgestemd.
          </p>
        </div>
        <Button icon={<Icon name="plus" size={18} />} onClick={() => setOpen(true)}>
          Nieuwe toetsvorm
        </Button>
      </div>

      <Modal open={modalOpen} onClose={sluitModal} title={bewerkToetsvormRij ? "Toetsvorm bewerken" : "Nieuwe toetsvorm"}>
        <form
          action={async (formData) => {
            setError(null);
            const res = bewerkToetsvormRij
              ? await bewerkToetsvorm(bewerkToetsvormRij.id, formData)
              : await maakToetsvorm(formData);
            if (res?.error) {
              setError(res.error);
              return;
            }
            sluitModal();
            router.refresh();
          }}
          className="flex flex-col gap-4"
        >
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Naam</label>
            <input
              name="name"
              required
              defaultValue={bewerkToetsvormRij?.name ?? ""}
              placeholder="bijv. SO, Mondeling, Toetsweek-toets"
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Dagen van tevoren beginnen
              </label>
              <input
                type="number"
                name="dagenVanTevoren"
                min={1}
                max={60}
                required
                defaultValue={bewerkToetsvormRij?.dagen_van_tevoren ?? 7}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Aantal leermomenten
              </label>
              <input
                type="number"
                name="aantalLeermomenten"
                min={1}
                max={8}
                required
                defaultValue={bewerkToetsvormRij?.aantal_leermomenten ?? 3}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100"
              />
            </div>
          </div>
          <p className="text-xs text-slate-500">
            Bijvoorbeeld: een SO leer je misschien 3 dagen van tevoren in 1 keer, een
            toetsweek-toets begin je 2 weken van tevoren in 4 stukken.
          </p>

          {error && <p className="text-sm text-rose-600">{error}</p>}

          <div className="flex gap-2">
            <SubmitButton>{bewerkToetsvormRij ? "Wijzigingen opslaan" : "Opslaan"}</SubmitButton>
            <Button type="button" variant="secondary" onClick={sluitModal}>
              Annuleren
            </Button>
          </div>
        </form>
      </Modal>

      {toetsvormen.length === 0 && (
        <Card>
          <p className="text-sm text-slate-500">
            Nog geen toetsvormen. Zonder toetsvorm gebruikt de agenda een standaard vuistregel.
          </p>
        </Card>
      )}

      <div className="flex flex-col gap-3">
        {toetsvormen.map((t) => (
          <Card key={t.id} className="flex items-center gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
              <Icon name="target" size={20} />
            </span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-slate-900">{t.name}</p>
              <p className="text-xs text-slate-500">
                {t.dagen_van_tevoren} dagen van tevoren beginnen - {t.aantal_leermomenten}{" "}
                leermomenten
              </p>
            </div>
            <button
              onClick={() => setBewerkId(t.id)}
              className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              aria-label="Bewerken"
            >
              <Icon name="pencil-line" size={16} />
            </button>
            <button
              disabled={verwijderPending}
              onClick={() => verwijder(t.id)}
              className="rounded-xl p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
              aria-label="Verwijderen"
            >
              <Icon name={verwijderPending ? "loader" : "trash"} size={16} className={verwijderPending ? "animate-spin" : undefined} />
            </button>
          </Card>
        ))}
      </div>
    </div>
  );
}
