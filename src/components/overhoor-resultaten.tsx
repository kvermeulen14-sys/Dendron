"use client";

import { useState } from "react";
import clsx from "clsx";
import { Icon } from "@/components/icon";
import { MarkdownTekst } from "@/components/markdown-tekst";
import type { OverhoorSessie } from "@/lib/types";

const BEOORDELING_KLEUR: Record<string, string> = {
  goed: "border-emerald-200 bg-emerald-50 text-emerald-700",
  deels: "border-amber-200 bg-amber-50 text-amber-700",
  fout: "border-rose-200 bg-rose-50 text-rose-700",
  geen: "border-slate-200 bg-slate-50 text-slate-500",
};

const LEERFASE_LABEL: Record<string, string> = {
  eerste: "eerste keer",
  tussentijds: "tussentijds",
  laatste: "vlak voor de toets",
};

function relatieveDatum(iso: string) {
  const datum = new Date(iso);
  const vandaag = new Date();
  const dagVerschil = Math.round(
    (new Date(datum.getFullYear(), datum.getMonth(), datum.getDate()).getTime() -
      new Date(vandaag.getFullYear(), vandaag.getMonth(), vandaag.getDate()).getTime()) /
      86400000
  );
  if (dagVerschil === 0) return "vandaag";
  if (dagVerschil === -1) return "gisteren";
  return datum.toLocaleDateString("nl-NL", { day: "numeric", month: "short" });
}

/**
 * Toont overhoor-/oefengeschiedenis als eenvoudige gekleurde balkjes per
 * sessie (goed/deels/nog niet) - bewust geen cijfers of percentages, dit is
 * bedoeld als groei-inzicht, niet als beoordeling.
 */
export function OverhoorResultaten({ sessies }: { sessies: OverhoorSessie[] }) {
  const [opengeklapt, setOpengeklapt] = useState<string | null>(null);

  if (sessies.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        Nog geen overhoor-resultaten. Die verschijnen hier zodra er een keer geoefend is.
      </p>
    );
  }

  const totaalGoed = sessies.reduce((s, x) => s + x.aantal_goed, 0);
  const totaalDeels = sessies.reduce((s, x) => s + x.aantal_deels, 0);
  const totaalFout = sessies.reduce((s, x) => s + x.aantal_fout, 0);
  const totaal = totaalGoed + totaalDeels + totaalFout;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <Icon name="target" size={14} className="text-accent-500" />
        <span>
          Laatste {sessies.length} {sessies.length === 1 ? "sessie" : "sessies"} - {totaal} vragen, waarvan{" "}
          <span className="font-medium text-emerald-700">{totaalGoed} goed</span>
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        {sessies.map((s) => {
          const t = s.aantal_goed + s.aantal_deels + s.aantal_fout;
          const heeftTranscript = s.transcript && s.transcript.length > 0;
          const open = opengeklapt === s.id;
          return (
            <div key={s.id} className="rounded-lg">
              <button
                type="button"
                onClick={() => heeftTranscript && setOpengeklapt(open ? null : s.id)}
                className={clsx(
                  "flex w-full items-center gap-2.5 rounded-lg py-0.5 text-left",
                  heeftTranscript && "cursor-pointer hover:bg-slate-50"
                )}
              >
                <span className="w-14 shrink-0 text-[11px] text-slate-400">{relatieveDatum(s.created_at)}</span>
                <div className="flex h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                  {s.aantal_goed > 0 && (
                    <div className="bg-emerald-400" style={{ width: `${(s.aantal_goed / t) * 100}%` }} />
                  )}
                  {s.aantal_deels > 0 && (
                    <div className="bg-amber-400" style={{ width: `${(s.aantal_deels / t) * 100}%` }} />
                  )}
                  {s.aantal_fout > 0 && (
                    <div className="bg-rose-400" style={{ width: `${(s.aantal_fout / t) * 100}%` }} />
                  )}
                </div>
                <span className="w-28 shrink-0 truncate text-[11px] text-slate-500" title={s.hoofdstuk ?? undefined}>
                  {s.hoofdstuk ?? (LEERFASE_LABEL[s.leerfase] ?? s.leerfase)}
                </span>
                {heeftTranscript && (
                  <Icon
                    name="chevron-right"
                    size={13}
                    className={clsx("shrink-0 text-slate-300 transition-transform", open && "rotate-90")}
                  />
                )}
              </button>
              {open && heeftTranscript && (
                <div className="ml-14 mt-1.5 flex flex-col gap-2 border-l-2 border-slate-100 py-1 pl-3">
                  {s.transcript.map((r, i) => (
                    <div key={i} className={clsx("rounded-lg border p-2 text-xs", BEOORDELING_KLEUR[r.beoordeling])}>
                      <p className="font-medium text-slate-700">{r.vraag}</p>
                      <p className="mt-0.5 text-slate-600">
                        <span className="font-medium">Antwoord: </span>
                        {r.antwoord}
                      </p>
                      {r.feedback && (
                        <div className="mt-1">
                          <MarkdownTekst>{r.feedback}</MarkdownTekst>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className={clsx("flex flex-wrap gap-3 text-[11px] text-slate-500")}>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-emerald-400" /> goed
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-amber-400" /> deels
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-rose-400" /> nog niet
        </span>
      </div>
    </div>
  );
}
