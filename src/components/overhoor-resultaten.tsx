import clsx from "clsx";
import { Icon } from "@/components/icon";
import type { OverhoorSessie } from "@/lib/types";

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

      <div className="flex flex-col gap-2">
        {sessies.map((s) => {
          const t = s.aantal_goed + s.aantal_deels + s.aantal_fout;
          return (
            <div key={s.id} className="flex items-center gap-2.5">
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
              <span className="w-24 shrink-0 truncate text-[11px] text-slate-400">
                {LEERFASE_LABEL[s.leerfase] ?? s.leerfase}
              </span>
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
