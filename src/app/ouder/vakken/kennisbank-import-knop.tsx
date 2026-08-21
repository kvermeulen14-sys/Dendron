"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icon";
import { importGetalRuimteKennisbank } from "@/lib/actions/kennisbank-import";

export function KennisbankImportKnop() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [melding, setMelding] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function importeer() {
    setError(null);
    setMelding(null);
    startTransition(async () => {
      const res = await importGetalRuimteKennisbank();
      if (res.error || res.aantal === undefined) {
        setError(res.error ?? "Importeren mislukt.");
        return;
      }
      setMelding(
        res.aantal > 0
          ? `${res.aantal} paragrafen toegevoegd aan Wiskunde.`
          : "Deze kennisbank stond al volledig in Wiskunde."
      );
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Button
        variant="secondary"
        size="md"
        icon={<Icon name={pending ? "loader" : "sparkles"} size={16} className={pending ? "animate-spin" : undefined} />}
        onClick={importeer}
        disabled={pending}
      >
        {pending ? "Bezig..." : "Getal & Ruimte 2HV13 (Wiskunde) importeren"}
      </Button>
      {melding && <p className="text-xs text-emerald-600">{melding}</p>}
      {error && <p className="text-xs text-rose-600">{error}</p>}
    </div>
  );
}
