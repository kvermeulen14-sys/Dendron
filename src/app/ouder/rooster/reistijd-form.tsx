"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SubmitButton } from "@/components/ui/submit-button";
import { TijdSelect } from "@/components/ui/tijd-select";
import { updateReistijd } from "@/lib/actions/rooster";

export function ReistijdForm({ huidig, avondGrens }: { huidig: number; avondGrens: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      action={async (formData) => {
        setError(null);
        const res = await updateReistijd(formData);
        if (res?.error) setError(res.error);
        else router.refresh();
      }}
      className="flex flex-wrap items-end gap-3"
    >
      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-700">
          Fietstijd (enkele reis, in minuten)
        </label>
        <input
          type="number"
          name="reistijdMinuten"
          min={0}
          max={120}
          defaultValue={huidig}
          className="w-32 rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100"
        />
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-700">
          Tot hoe laat plannen we &apos;s avonds?
        </label>
        <TijdSelect name="avondGrens" required defaultValue={avondGrens.slice(0, 5)} placeholder="Kies een tijd" />
      </div>
      <SubmitButton variant="secondary">Opslaan</SubmitButton>
      <p className="w-full text-xs text-slate-500">
        Hiermee rekent de agenda per dag uit hoeveel tijd er echt is: vanaf het moment dat je thuis
        bent (einde rooster + fietstijd + een half uur pauze) tot deze tijd, min een uur voor eten en
        min alles wat als prive in de agenda staat. Zo zie je meteen wanneer er meer gepland staat
        dan er past.
      </p>
      {error && <p className="w-full text-sm text-rose-600">{error}</p>}
    </form>
  );
}
