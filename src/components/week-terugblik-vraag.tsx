"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/icon";
import { zetWeekTerugblik } from "@/lib/actions/week-terugblik";
import type { Stemming } from "@/lib/types";

const OPTIES: { waarde: Stemming; label: string; icon: string; hoverKlasse: string }[] = [
  { waarde: "goed", label: "Goede week", icon: "thumbs-up", hoverKlasse: "hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700" },
  { waarde: "neutraal", label: "Gewoontjes", icon: "meh", hoverKlasse: "hover:border-amber-300 hover:bg-amber-50 hover:text-amber-700" },
  { waarde: "moeilijk", label: "Zware week", icon: "thumbs-down", hoverKlasse: "hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700" },
];

export function WeekTerugblikVraag() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [beantwoord, setBeantwoord] = useState(false);

  function kies(stemming: Stemming) {
    startTransition(async () => {
      await zetWeekTerugblik(stemming);
      setBeantwoord(true);
      router.refresh();
    });
  }

  if (beantwoord) {
    return (
      <Card className="flex items-center gap-3 border-emerald-100 bg-emerald-50/60 py-3">
        <Icon name="check" size={18} className="text-emerald-600" />
        <p className="text-sm text-emerald-700">Bedankt! Tot volgende week.</p>
      </Card>
    );
  }

  return (
    <Card className="flex flex-wrap items-center justify-between gap-3 py-3">
      <p className="text-sm font-medium text-slate-800">Hoe ging deze week voor jou?</p>
      <div className="flex gap-2">
        {OPTIES.map((opt) => (
          <button
            key={opt.waarde}
            disabled={pending}
            onClick={() => kies(opt.waarde)}
            aria-label={opt.label}
            title={opt.label}
            className={`flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition-colors disabled:opacity-50 ${opt.hoverKlasse}`}
          >
            <Icon name={opt.icon} size={20} />
          </button>
        ))}
      </div>
    </Card>
  );
}
