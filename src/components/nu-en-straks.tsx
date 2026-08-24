"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Icon } from "@/components/icon";
import { PLANNING_TYPE_META, minutenNaarTijd } from "@/lib/planning";
import { tijdNaarMinuten } from "@/lib/capaciteit";
import type { PlanningItem } from "@/lib/types";

const ONBEKENDE_DUUR_MINUTEN = 30;

interface Blok {
  id: string | null;
  titel: string;
  icoon: string;
  startMinuten: number;
  duurMinuten: number;
  isSchool: boolean;
  /** Een prive-afspraak bezet wel tijd, maar is geen afvinkbare taak - geen Focus-knop hiervoor. */
  isPrive: boolean;
}

/**
 * "Nu" en "Straks", losgetrokken uit de rest van de dag.
 *
 * Het interne gevoel voor hoeveel tijd er nog is werkt niet betrouwbaar; tijd
 * moet van buitenaf zichtbaar gemaakt worden. Daarom staat hier niet alleen
 * wat je doet, maar ook hoeveel er nog van over is - als getal en als balk die
 * zichtbaar leegloopt. En maar twee dingen tegelijk, zodat er even niets
 * anders om aandacht vraagt.
 */
export function NuEnStraks({
  items,
  roosterBlokken,
  voorKind,
}: {
  /** Alleen de items van vandaag. */
  items: PlanningItem[];
  roosterBlokken: { titel: string; startMinuten: number; duurMinuten: number; isFietsen: boolean }[];
  voorKind: boolean;
}) {
  const [nuMinuten, setNuMinuten] = useState<number | null>(null);

  useEffect(() => {
    function tick() {
      const nu = new Date();
      setNuMinuten(nu.getHours() * 60 + nu.getMinutes());
    }
    tick();
    const interval = setInterval(tick, 30000);
    return () => clearInterval(interval);
  }, []);

  if (nuMinuten === null) return null;

  const blokken: Blok[] = [
    ...roosterBlokken.map((b) => ({
      id: null,
      titel: b.titel,
      icoon: b.isFietsen ? "bike" : "school",
      startMinuten: b.startMinuten,
      duurMinuten: b.duurMinuten,
      isSchool: true,
      isPrive: false,
    })),
    ...items
      .filter((i) => i.status === "open" && i.start_time)
      .map((i) => ({
        id: i.id,
        titel: i.title,
        icoon: PLANNING_TYPE_META[i.type].icon,
        startMinuten: tijdNaarMinuten(i.start_time!),
        duurMinuten: i.estimated_minutes ?? ONBEKENDE_DUUR_MINUTEN,
        isSchool: false,
        isPrive: i.type === "prive",
      })),
  ].sort((a, b) => a.startMinuten - b.startMinuten);

  // Een eigen taak wint van een schoolblok als ze overlappen: dat is wat je
  // zelf gepland hebt en waar je iets mee moet.
  const lopend = blokken.filter(
    (b) => b.startMinuten <= nuMinuten && nuMinuten < b.startMinuten + b.duurMinuten
  );
  const huidig = lopend.find((b) => !b.isSchool) ?? lopend[0] ?? null;
  const volgend = blokken.find((b) => b.startMinuten > nuMinuten) ?? null;

  if (!huidig && !volgend) return null;

  const restMinuten = huidig ? huidig.startMinuten + huidig.duurMinuten - nuMinuten : 0;
  const voortgang = huidig ? 1 - restMinuten / huidig.duurMinuten : 0;

  return (
    <div className="flex gap-2.5">
      <div className="flex flex-[1.6] flex-col gap-1.5 rounded-2xl border border-accent-200 bg-accent-50 px-3.5 py-3">
        <span className="text-[11px] font-bold uppercase tracking-wider text-accent-700">Nu</span>
        {huidig ? (
          <>
            <div className="flex items-center gap-2">
              <Icon name={huidig.icoon} size={16} className="shrink-0 text-accent-600" />
              <p className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">{huidig.titel}</p>
            </div>
            <div className="flex h-1.5 overflow-hidden rounded-full bg-white">
              <span
                className="h-full bg-accent-500 transition-[width] duration-500"
                style={{ width: `${Math.min(100, Math.max(0, voortgang * 100))}%` }}
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-500 tabular-nums">
                nog {restMinuten} van {huidig.duurMinuten} min
              </span>
              {voorKind && huidig.id && !huidig.isPrive && (
                <Link
                  href={`/kind/focus/${huidig.id}`}
                  className="flex shrink-0 items-center gap-1 rounded-lg bg-accent-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-accent-700"
                >
                  <Icon name="target" size={12} />
                  Focus
                </Link>
              )}
            </div>
          </>
        ) : (
          <p className="text-sm font-medium text-slate-500">
            Even vrij{volgend && ` tot ${minutenNaarTijd(volgend.startMinuten)}`}
          </p>
        )}
      </div>

      <div
        className={clsx(
          "flex flex-1 flex-col gap-1.5 rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-3",
          !volgend && "justify-center"
        )}
      >
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Straks</span>
        {volgend ? (
          <>
            <div className="flex items-center gap-2">
              <Icon name={volgend.icoon} size={16} className="shrink-0 text-slate-400" />
              <p className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-600">{volgend.titel}</p>
            </div>
            <span className="text-xs font-medium text-slate-400 tabular-nums">
              {minutenNaarTijd(volgend.startMinuten)}
              {volgend.startMinuten - nuMinuten <= 60 && ` - over ${volgend.startMinuten - nuMinuten} min`}
            </span>
          </>
        ) : (
          <p className="text-sm font-medium text-slate-400">Daarna niets meer gepland vandaag.</p>
        )}
      </div>
    </div>
  );
}
