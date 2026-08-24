import clsx from "clsx";

/**
 * Rond voortgangsringetje voor "X van Y gepland" bij een dag - compacter en
 * duidelijker als pil dan een dunne balk, en herkenbaar als "hoeveel past
 * er nog"-indicator.
 */
export function CapaciteitRing({
  percentage,
  tekst,
  toonKleur,
  className,
}: {
  /** 0-1 */
  percentage: number;
  tekst: string;
  toonKleur: "leeg" | "rustig" | "vol" | "over";
  className?: string;
}) {
  const R = 8;
  const OMTREK = 2 * Math.PI * R;
  const gevuld = Math.max(0, Math.min(1, percentage)) * OMTREK;

  const kleur =
    toonKleur === "over"
      ? "stroke-rose-500"
      : toonKleur === "vol"
        ? "stroke-amber-500"
        : "stroke-emerald-500";

  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 shadow-sm ring-1 ring-slate-900/5",
        className
      )}
    >
      <svg width="20" height="20" viewBox="0 0 20 20" className="shrink-0 -rotate-90">
        <circle cx="10" cy="10" r={R} fill="none" strokeWidth="2.5" className="stroke-slate-100" />
        <circle
          cx="10"
          cy="10"
          r={R}
          fill="none"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={`${gevuld} ${OMTREK}`}
          className={clsx("transition-[stroke-dasharray]", kleur)}
        />
      </svg>
      {tekst}
    </span>
  );
}
