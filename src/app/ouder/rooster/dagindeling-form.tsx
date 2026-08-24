"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SubmitButton } from "@/components/ui/submit-button";
import { TijdSelect } from "@/components/ui/tijd-select";
import { bewerkDagInstellingen } from "@/lib/actions/rooster";
import { standaardDagRitme } from "@/lib/capaciteit";
import type { DagInstelling } from "@/lib/types";

const DAGEN = [
  { nr: 1, label: "Maandag" },
  { nr: 2, label: "Dinsdag" },
  { nr: 3, label: "Woensdag" },
  { nr: 4, label: "Donderdag" },
  { nr: 5, label: "Vrijdag" },
  { nr: 6, label: "Zaterdag" },
  { nr: 7, label: "Zondag" },
] as const;

function minutenNaarTijd(minuten: number) {
  const h = Math.floor(minuten / 60)
    .toString()
    .padStart(2, "0");
  const m = (minuten % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

export function DagindelingForm({ instellingen }: { instellingen: DagInstelling[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const perDag = new Map(instellingen.map((i) => [i.dag_van_week, i]));

  return (
    <form
      action={async (formData) => {
        setError(null);
        const res = await bewerkDagInstellingen(formData);
        if (res?.error) setError(res.error);
        else router.refresh();
      }}
      className="flex flex-col gap-4"
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-separate border-spacing-y-1.5 text-sm">
          <thead>
            <tr className="text-left text-xs font-medium text-slate-500">
              <th className="pb-1 pr-2 font-medium">Dag</th>
              <th className="pb-1 pr-2 font-medium">Vanaf hoe laat 's ochtends</th>
              <th className="pb-1 pr-2 font-medium">Tot hoe laat 's avonds</th>
              <th className="pb-1 font-medium">Eten (min)</th>
            </tr>
          </thead>
          <tbody>
            {DAGEN.map(({ nr, label }) => {
              const bestaand = perDag.get(nr);
              const standaard = standaardDagRitme(nr);
              return (
                <tr key={nr}>
                  <td className="whitespace-nowrap py-1 pr-2 font-medium text-slate-700">{label}</td>
                  <td className="py-1 pr-2">
                    <TijdSelect
                      name={`ochtend_${nr}`}
                      required
                      defaultValue={bestaand?.ochtend_start.slice(0, 5) ?? minutenNaarTijd(standaard.ochtendStartMinuten)}
                    />
                  </td>
                  <td className="py-1 pr-2">
                    <TijdSelect
                      name={`avond_${nr}`}
                      required
                      defaultValue={bestaand?.avond_grens.slice(0, 5) ?? minutenNaarTijd(standaard.avondGrensMinuten)}
                    />
                  </td>
                  <td className="py-1">
                    <input
                      type="number"
                      name={`eten_${nr}`}
                      min={0}
                      max={180}
                      defaultValue={bestaand?.eten_minuten ?? standaard.etenMinuten}
                      className="w-20 rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-500">
        Bepaalt samen met het rooster hoeveel tijd de agenda per dag als "beschikbaar" telt: van de
        ochtendstart tot vertrek naar school (als die er is), en van thuiskomst tot de avondgrens - min
        de etenstijd. Zo telt bijvoorbeeld een vrije ochtend vóór een latere schooldag ook mee.
      </p>

      {error && <p className="text-sm text-rose-600">{error}</p>}
      <div>
        <SubmitButton variant="secondary">Dagindeling opslaan</SubmitButton>
      </div>
    </form>
  );
}
