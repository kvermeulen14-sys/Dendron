import clsx from "clsx";
import { Icon } from "@/components/icon";
import { classificeerWerkdruk, WERKDRUK_META } from "@/lib/planning";
import type { PlanningItem } from "@/lib/types";

const DAG_LABELS = ["ma", "di", "wo", "do", "vr", "za", "zo"];
const MAX_SCHAAL_MINUTEN = 240;
const BALK_MAX_HOOGTE = 64;

function isoPlusDagen(iso: string, dagen: number) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + dagen);
  const jaar = d.getFullYear();
  const maand = String(d.getMonth() + 1).padStart(2, "0");
  const dag = String(d.getDate()).padStart(2, "0");
  return `${jaar}-${maand}-${dag}`;
}

function formatMinuten(minuten: number) {
  const uren = Math.floor(minuten / 60);
  const rest = minuten % 60;
  if (uren === 0) return `${rest} min`;
  if (rest === 0) return `${uren} u`;
  return `${uren}u ${rest}m`;
}

/**
 * Geeft in 1 oogopslag de werkdruk per dag van de week weer (open,
 * nog-niet-afgeronde taken), zodat een te volle dag op tijd opvalt en
 * verplaatst kan worden - in plaats van er woensdagavond achter te komen.
 */
export function WerkdrukWeek({
  items,
  weekMaandagIso,
  vandaagIso,
}: {
  items: PlanningItem[];
  weekMaandagIso: string;
  vandaagIso: string;
}) {
  const dagen = Array.from({ length: 7 }, (_, i) => isoPlusDagen(weekMaandagIso, i));

  const perDag = dagen.map((iso) => {
    const dagItems = items.filter((item) => item.due_date === iso && item.status !== "voorstel");
    const openItems = dagItems.filter((item) => item.status === "open");
    const minuten = openItems.reduce((som, i) => som + (i.estimated_minutes ?? 0), 0);
    const zonderInschatting = openItems.filter((i) => !i.estimated_minutes).length;
    return {
      iso,
      minuten,
      aantalOpen: openItems.length,
      aantalKlaar: dagItems.length - openItems.length,
      zonderInschatting,
      niveau: classificeerWerkdruk(minuten),
    };
  });

  const weekMinuten = perDag.reduce((som, d) => som + d.minuten, 0);
  const drukkeDagen = perDag.filter((d) => d.niveau === "druk" || d.niveau === "overvol");
  const zonderInschattingTotaal = perDag.reduce((som, d) => som + d.zonderInschatting, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between gap-3">
        <div className="flex items-end gap-1.5">
          {perDag.map((d) => {
            const isVandaag = d.iso === vandaagIso;
            const hoogte = Math.max(6, Math.min(1, d.minuten / MAX_SCHAAL_MINUTEN) * BALK_MAX_HOOGTE);
            const meta = WERKDRUK_META[d.niveau];
            return (
              <div key={d.iso} className="flex w-9 flex-col items-center gap-1.5">
                <div className="flex items-end" style={{ height: BALK_MAX_HOOGTE }}>
                  <div
                    title={`${formatMinuten(d.minuten)} gepland`}
                    style={{ height: hoogte }}
                    className={clsx("w-5 rounded-t-md transition-all", meta.barClass)}
                  />
                </div>
                <span
                  className={clsx(
                    "flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold uppercase",
                    isVandaag ? "bg-slate-900 text-white" : "text-slate-400"
                  )}
                >
                  {DAG_LABELS[dagen.indexOf(d.iso)]}
                </span>
              </div>
            );
          })}
        </div>

        <div className="text-right">
          <p className="text-lg font-semibold text-slate-900">{formatMinuten(weekMinuten)}</p>
          <p className="text-xs text-slate-500">deze week gepland</p>
        </div>
      </div>

      {drukkeDagen.length > 0 ? (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
          <Icon name="alert-circle" size={15} className="mt-0.5 shrink-0" />
          <span>
            {drukkeDagen.length === 1 ? "1 dag ziet er druk uit" : `${drukkeDagen.length} dagen zien er druk uit`}{" "}
            ({drukkeDagen
              .map((d) => new Date(d.iso + "T00:00:00").toLocaleDateString("nl-NL", { weekday: "long" }))
              .join(", ")}
            ). Kijk samen of iets verplaatst kan worden naar een rustigere dag.
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs text-emerald-800">
          <Icon name="check" size={15} className="shrink-0" />
          <span>Deze week ziet er behapbaar uit - geen enkele dag is overvol.</span>
        </div>
      )}

      {zonderInschattingTotaal > 0 && (
        <p className="text-xs text-slate-400">
          {zonderInschattingTotaal} {zonderInschattingTotaal === 1 ? "taak heeft" : "taken hebben"} nog geen
          tijdsinschatting - dit overzicht klopt beter als je die erbij zet.
        </p>
      )}
    </div>
  );
}
