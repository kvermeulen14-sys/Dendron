"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { Icon } from "@/components/icon";
import { Card } from "@/components/ui/card";
import { JAAR_EVENT_META, eventsOpDatum, maandNaam, maandRooster } from "@/lib/jaarkalender";
import type { JaarEvent } from "@/lib/types";

const DAGLETTERS = ["M", "D", "W", "D", "V", "Z", "Z"];

export function JaarOverzicht({ events }: { events: JaarEvent[] }) {
  const [jaar, setJaar] = useState(new Date().getFullYear());
  const vandaagIso = useMemo(() => new Date().toISOString().slice(0, 10), []);

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
          onClick={() => setJaar((j) => j - 1)}
          className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"
          aria-label="Vorig jaar"
        >
          <Icon name="chevron-left" size={18} />
        </button>
        <p className="text-base font-semibold text-slate-900">{jaar}</p>
        <button
          onClick={() => setJaar((j) => j + 1)}
          className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"
          aria-label="Volgend jaar"
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
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 12 }, (_, maandIndex) => (
          <Card key={maandIndex} className="p-3">
            <p className="mb-2 text-center text-sm font-semibold text-slate-800">
              {maandNaam(maandIndex)}
            </p>
            <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] text-slate-400">
              {DAGLETTERS.map((d, i) => (
                <div key={i}>{d}</div>
              ))}
            </div>
            <div className="mt-1 grid grid-cols-7 gap-0.5">
              {maandRooster(jaar, maandIndex).map((dag, i) => {
                if (!dag) return <div key={i} />;
                const dagEvents = eventsOpDatum(events, dag);
                const iso = dag.toISOString().slice(0, 10);
                const isVandaag = iso === vandaagIso;
                const eventType = dagEvents[0]?.type;
                return (
                  <div
                    key={i}
                    title={dagEvents.map((e) => e.titel).join(", ")}
                    className={clsx(
                      "flex aspect-square items-center justify-center rounded-md text-[10px]",
                      eventType
                        ? JAAR_EVENT_META[eventType].dotClass + " text-white font-medium"
                        : "text-slate-500",
                      isVandaag && !eventType && "bg-blue-100 font-semibold text-blue-700",
                      isVandaag && eventType && "ring-2 ring-blue-400"
                    )}
                  >
                    {dag.getDate()}
                  </div>
                );
              })}
            </div>
          </Card>
        ))}
      </div>

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
