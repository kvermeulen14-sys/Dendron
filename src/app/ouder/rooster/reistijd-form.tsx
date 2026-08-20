"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { updateReistijd } from "@/lib/actions/rooster";

export function ReistijdForm({ huidig }: { huidig: number }) {
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
          className="w-32 rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
        />
      </div>
      <Button type="submit" variant="secondary">
        Opslaan
      </Button>
      {error && <p className="w-full text-sm text-rose-600">{error}</p>}
    </form>
  );
}
