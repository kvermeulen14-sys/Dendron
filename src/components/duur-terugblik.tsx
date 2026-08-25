"use client";

import clsx from "clsx";
import { Icon } from "@/components/icon";

const KEUZES = [10, 15, 30, 45, 60, 90];

/**
 * Korte terugblik na het afvinken: hoe lang duurde het echt?
 *
 * Dit is de enige manier om tijdsinschattingen realistisch te krijgen - we
 * onderschatten structureel hoe lang iets duurt, en dat leren we niet vanzelf
 * af. Bewust een keer tikken en klaar, met een duidelijke "weet ik niet":
 * een verplichte vraag bij elk vinkje maakt afvinken juist minder leuk.
 */
export function DuurTerugblik({
  geschatteMinuten,
  voorstelMinuten,
  bezig,
  onKies,
  onOverslaan,
}: {
  geschatteMinuten: number | null;
  /** Bv. de gemeten focustijd - staat vooraan als extra knop. */
  voorstelMinuten?: number | null;
  bezig?: boolean;
  onKies: (minuten: number) => void;
  onOverslaan: () => void;
}) {
  const extra = voorstelMinuten && !KEUZES.includes(voorstelMinuten) ? voorstelMinuten : null;

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-accent-100 bg-accent-50/70 p-3">
      <p className="text-sm font-medium text-slate-700">
        Hoe lang deed je erover?
        {geschatteMinuten && (
          <span className="ml-1 font-normal text-slate-500">Je had {geschatteMinuten} min geschat.</span>
        )}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {extra && (
          <button
            disabled={bezig}
            onClick={() => onKies(extra)}
            className="rounded-lg border border-accent-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-accent-700 hover:bg-accent-50 disabled:opacity-50"
          >
            {extra} min
          </button>
        )}
        {KEUZES.map((minuten) => (
          <button
            key={minuten}
            disabled={bezig}
            onClick={() => onKies(minuten)}
            className={clsx(
              "rounded-lg border bg-white px-2.5 py-1.5 text-xs font-medium hover:bg-slate-50 disabled:opacity-50",
              minuten === voorstelMinuten
                ? "border-accent-300 font-semibold text-accent-700"
                : "border-slate-200 text-slate-600"
            )}
          >
            {minuten} min
          </button>
        ))}
        <button
          disabled={bezig}
          onClick={onOverslaan}
          className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-400 hover:text-slate-600 disabled:opacity-50"
        >
          {bezig && <Icon name="loader" size={12} className="animate-spin" />}
          Weet ik niet
        </button>
      </div>
    </div>
  );
}
