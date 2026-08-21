"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { Icon } from "@/components/icon";
import { Card } from "@/components/ui/card";
import {
  JAAR_EVENT_META,
  dagenInMaand,
  isWeekend,
  maandNaam,
  naarIsoDatum,
  schooljaarMaanden,
  segmentenMetBanen,
  segmentenVoorMaand,
} from "@/lib/jaarkalender";
import type { JaarEvent } from "@/lib/types";

const DAG_HEADER_HOOGTE = 18; // px - hoogte van de rij met dagnummers
const BAAN_HOOGTE = 17; // px - hoogte van elke balk met een periode-titel

export function JaarOverzicht({ events }: { events: JaarEvent[] }) {
  const nu = useMemo(() => new Date(), []);
  const defaultStartJaar = nu.getMonth() >= 7 ? nu.getFullYear() : nu.getFullYear() - 1;
  const [startJaar, setStartJaar] = useState(defaultStartJaar);
  const vandaagIso = useMemo(() => naarIsoDatum(nu), [nu]);

  const maanden = useMemo(() => schooljaarMaanden(startJaar), [startJaar]);

  const aankomend = useMemo(
    () =>
      events
        .filter((e) => e.eind_datum >= vandaagIso)
        .sort((a, b) => a.start_datum.localeCompare(b.start_datum))
        .slice(0, 8),
    [events, vandaagIso]
  );

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex items-center justify-between py-3">
        <button
          onClick={() => setStartJaar((j) => j - 1)}
          className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"
          aria-label="Vorig schooljaar"
        >
          <Icon name="chevron-left" size={18} />
        </button>
        <p className="text-base font-semibold text-slate-900">
          Schooljaar {startJaar} - {startJaar + 1}
        </p>
        <button
          onClick={() => setStartJaar((j) => j + 1)}
          className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"
          aria-label="Volgend schooljaar"
        >
          <Icon name="chevron-right" size={18} />
        </button>
      </Card>

      <div className="flex flex-wrap gap-3 text-xs text-slate-600">
        {(Object.keys(JAAR_EVENT_META) as (keyof typeof JAAR_EVENT_META)[]).map((key) => (
          <div key={key} className="flex items-center gap-1.5">
            <span className={clsx("h-2.5 w-2.5 rounded-full", JAAR_EVENT_META[key].dotClass)} />
            {JAAR_EVENT_META[key].label}
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-slate-200" />
          Weekend
        </div>
      </div>

      <Card className="overflow-x-auto">
        <div className="flex min-w-[760px] flex-col gap-3">
          {maanden.map(({ jaar, maandIndex }) => {
            const aantalDagen = dagenInMaand(jaar, maandIndex);
            const segmenten = segmentenMetBanen(segmentenVoorMaand(events, jaar, maandIndex));
            const aantalBanen = Math.max(1, ...segmenten.map((s) => s.baan + 1));
            const kolommen = `repeat(${aantalDagen}, minmax(0, 1fr))`;
            const rijHoogte = DAG_HEADER_HOOGTE + aantalBanen * BAAN_HOOGTE;

            return (
              <div key={`${jaar}-${maandIndex}`} className="grid grid-cols-[64px_1fr] items-start gap-2">
                <p className="pt-1 text-xs font-semibold text-slate-500">
                  {maandNaam(maandIndex).slice(0, 3)} &apos;{String(jaar).slice(-2)}
                </p>
                <div
                  className="relative grid overflow-hidden rounded-lg border border-slate-100"
                  style={{ gridTemplateColumns: kolommen, height: rijHoogte }}
                >
                  {Array.from({ length: aantalDagen }, (_, i) => {
                    const dagNr = i + 1;
                    const datum = new Date(jaar, maandIndex, dagNr);
                    const iso = naarIsoDatum(datum);
                    return (
                      <div
                        key={dagNr}
                        className={clsx(
                          "relative border-r border-slate-100 last:border-r-0",
                          isWeekend(datum) ? "bg-slate-100" : "bg-white",
                          iso === vandaagIso && "ring-1 ring-inset ring-blue-400"
                        )}
                      >
                        <span className="absolute left-1 top-0.5 text-[9px] leading-[11px] text-slate-400">
                          {dagNr}
                        </span>
                      </div>
                    );
                  })}

                  {segmenten.map((seg, i) => (
                    <div
                      key={i}
                      title={seg.event.titel}
                      style={{
                        gridColumn: `${seg.startDag} / ${seg.eindDag + 1}`,
                        gridRow: 1,
                        marginTop: DAG_HEADER_HOOGTE + seg.baan * BAAN_HOOGTE,
                        height: BAAN_HOOGTE - 3,
                      }}
                      className={clsx(
                        "z-10 mx-0.5 self-start truncate rounded px-1.5 text-[10px] font-medium leading-4",
                        JAAR_EVENT_META[seg.event.type].barClass
                      )}
                    >
                      {seg.event.titel}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <div>
        <h2 className="mb-3 text-base font-semibold text-slate-900">Eerstvolgende belangrijke periodes</h2>
        {aankomend.length === 0 ? (
          <Card>
            <p className="text-sm text-slate-500">Nog niets ingepland op de jaarkalender.</p>
          </Card>
        ) : (
          <div className="flex flex-col gap-2">
            {aankomend.map((e) => (
              <Card key={e.id} className={clsx("flex items-center gap-3 border py-3", JAAR_EVENT_META[e.type].badgeClass)}>
                <span className={clsx("h-2.5 w-2.5 shrink-0 rounded-full", JAAR_EVENT_META[e.type].dotClass)} />
                <div className="flex-1">
                  <p className="text-sm font-medium">{e.titel}</p>
                  <p className="text-xs opacity-80">
                    {new Date(e.start_datum + "T00:00:00").toLocaleDateString("nl-NL", { day: "numeric", month: "short" })}
                    {e.eind_datum !== e.start_datum &&
                      ` - ${new Date(e.eind_datum + "T00:00:00").toLocaleDateString("nl-NL", { day: "numeric", month: "short" })}`}
                  </p>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
