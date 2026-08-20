"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/icon";
import { maakToetsvorm } from "@/lib/actions/test-types";

export function ToetsvormForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <Button icon={<Icon name="plus" size={18} />} onClick={() => setOpen(true)}>
        Nieuwe toetsvorm
      </Button>
    );
  }

  return (
    <Card>
      <form
        action={async (formData) => {
          setError(null);
          const res = await maakToetsvorm(formData);
          if (res?.error) {
            setError(res.error);
            return;
          }
          setOpen(false);
          router.refresh();
        }}
        className="flex flex-col gap-4"
      >
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Naam</label>
          <input
            name="name"
            required
            placeholder="bijv. SO, Mondeling, Toetsweek-toets"
            className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
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
              defaultValue={7}
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
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
              defaultValue={3}
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </div>
        </div>
        <p className="text-xs text-slate-500">
          Bijvoorbeeld: een SO leer je misschien 3 dagen van tevoren in 1 keer, een
          toetsweek-toets begin je 2 weken van tevoren in 4 stukken.
        </p>

        {error && <p className="text-sm text-rose-600">{error}</p>}

        <div className="flex gap-2">
          <Button type="submit">Opslaan</Button>
          <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
            Annuleren
          </Button>
        </div>
      </form>
    </Card>
  );
}
