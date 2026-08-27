"use client";

import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Icon } from "@/components/icon";
import { PLANNING_TYPE_META } from "@/lib/planning";
import { updatePlanningStatus, updatePlanningWerkelijkeDuur } from "@/lib/actions/planning";
import { kiesKlaarLabel, kiesVierTekst } from "@/lib/motiverend";
import { useKlaarBevestiging } from "@/lib/use-klaar-bevestiging";
import { DuurTerugblik } from "@/components/duur-terugblik";
import { vakAfkorting } from "@/lib/vak-afkorting";
import type { PlanningItem, PlanningType, Subject } from "@/lib/types";

function formatMinuten(minuten: number) {
  const uren = Math.floor(minuten / 60);
  const rest = minuten % 60;
  if (uren === 0) return `${rest} min`;
  if (rest === 0) return `${uren} u`;
  return `${uren}u ${rest}m`;
}

/** Kleurblok per categorie - zelfde kleursysteem als de rest van de tool
 * (theme.css), hier alleen prominenter ingezet: een volle kleurtint i.p.v.
 * een dun randje, zodat "wat voor soort taak dit is" in 1 oogopslag
 * duidelijk is (zie het blokken-ontwerp dat hieraan voorafging). */
const BLOK_STIJL: Record<PlanningType, { bg: string; badge: string; label: string }> = {
  huiswerk: { bg: "bg-huiswerk-100", badge: "bg-huiswerk-500", label: "text-huiswerk-700" },
  toets: { bg: "bg-toets-100", badge: "bg-toets-500", label: "text-toets-700" },
  leermoment: { bg: "bg-leermoment-100", badge: "bg-leermoment-500", label: "text-leermoment-700" },
  prive: { bg: "bg-prive-100", badge: "bg-prive-500", label: "text-prive-700" },
};

/**
 * Directe check-lijst voor het kind-startscherm: afvinken kan hier meteen,
 * zonder eerst naar de volle weekagenda te hoeven navigeren - dat ene extra
 * klikje is precies de frictie die ervoor zorgt dat een planner niet
 * bijgehouden wordt.
 */
export function KindVandaagLijst({
  items,
  subjects,
  variant = "vandaag",
}: {
  items: PlanningItem[];
  subjects: Subject[];
  variant?: "vandaag" | "verlopen";
}) {
  function subjectNaam(id: string | null) {
    if (!id) return null;
    return subjects.find((s) => s.id === id)?.name ?? null;
  }

  function subjectCode(id: string | null) {
    if (!id) return null;
    const vak = subjects.find((s) => s.id === id);
    return vak ? vakAfkorting(vak) : null;
  }

  return (
    <ul className="flex flex-col gap-3">
      {items.map((item) => (
        <KindVandaagItem
          key={item.id}
          item={item}
          variant={variant}
          subjectNaam={subjectNaam(item.subject_id)}
          subjectCode={subjectCode(item.subject_id)}
        />
      ))}
    </ul>
  );
}

function KindVandaagItem({
  item,
  variant,
  subjectNaam,
  subjectCode,
}: {
  item: PlanningItem;
  variant: "vandaag" | "verlopen";
  subjectNaam: string | null;
  subjectCode: string | null;
}) {
  const router = useRouter();
  const meta = PLANNING_TYPE_META[item.type];
  const stijl = BLOK_STIJL[item.type];
  const isKlaar = item.status === "klaar";
  const { fase, bezig, vraagBevestiging, annuleer, bevestig, meldDuur } = useKlaarBevestiging();

  async function heropen() {
    await updatePlanningStatus(item.id, "open");
    router.refresh();
  }

  async function markeerKlaar() {
    await bevestig(
      async () => {
        await updatePlanningStatus(item.id, "klaar");
        router.refresh();
      },
      // Alleen vragen als er iets is om tegen af te zetten - zonder schatting
      // valt er ook niets bij te stellen.
      { vraagDuur: Boolean(item.estimated_minutes) }
    );
  }

  async function rondDuurAf(minuten: number | null) {
    await meldDuur(minuten === null ? undefined : async () => updatePlanningWerkelijkeDuur(item.id, minuten));
    router.refresh();
  }

  return (
    <li
      onClick={() => fase === "rust" && router.push(`/kind/focus/${item.id}`)}
      className={clsx(
        "relative flex cursor-pointer flex-col gap-2.5 rounded-[22px] p-4 transition-colors",
        fase === "duur" || item.type === "prive" ? "pb-4" : "pb-12",
        isKlaar
          ? "bg-slate-100"
          : variant === "verlopen"
            ? "bg-rose-100 ring-2 ring-inset ring-rose-300"
            : stijl.bg
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={clsx(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-white",
            isKlaar ? "bg-slate-400" : variant === "verlopen" ? "bg-rose-500" : stijl.badge
          )}
        >
          <Icon name={isKlaar ? "check" : meta.icon} size={18} />
        </span>
        <div className="min-w-0 flex-1 pt-0.5">
          <div className="flex items-center gap-1.5">
            <p
              className={clsx(
                "truncate text-[15px] font-semibold text-slate-900",
                isKlaar && "text-slate-500 line-through"
              )}
            >
              {item.title}
            </p>
            {subjectCode && (
              <span className="shrink-0 rounded-full bg-white/70 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
                {subjectCode}
              </span>
            )}
          </div>
          {((!subjectCode && subjectNaam) || item.estimated_minutes) && (
            <p
              className={clsx(
                "truncate text-xs font-medium",
                isKlaar ? "text-slate-400" : variant === "verlopen" ? "text-rose-700" : stijl.label
              )}
            >
              {[!subjectCode ? subjectNaam : null, item.estimated_minutes ? `~${formatMinuten(item.estimated_minutes)}` : null]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
        </div>
      </div>

      {/* Prive bezet wel tijd (zie capaciteit.ts) maar is geen afvinkbare taak - geen afvink-knop hiervoor. */}
      {item.type === "prive" ? null : fase === "bevestigen" ? (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute inset-x-3 bottom-3 flex items-center justify-end gap-1.5"
        >
          <span className="mr-auto text-xs font-medium text-slate-600">Zeker weten?</span>
          <button
            onClick={annuleer}
            className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-500 shadow-sm hover:bg-slate-50"
          >
            Toch niet
          </button>
          <button
            onClick={markeerKlaar}
            className="flex items-center gap-1 rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-600"
          >
            <Icon name="check" size={14} />
            Ja, {kiesKlaarLabel(item.id).toLowerCase()}
          </button>
        </div>
      ) : fase === "duur" ? (
        <div onClick={(e) => e.stopPropagation()} className="mt-1">
          <DuurTerugblik
            geschatteMinuten={item.estimated_minutes}
            bezig={bezig}
            onKies={(minuten) => rondDuurAf(minuten)}
            onOverslaan={() => rondDuurAf(null)}
          />
        </div>
      ) : fase === "vieren" ? (
        <div className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white">
          <Icon name="party" size={14} />
          {kiesVierTekst(item.id)}
        </div>
      ) : (
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (isKlaar) heropen();
            else vraagBevestiging();
          }}
          disabled={bezig}
          aria-label={isKlaar ? "Weer openzetten" : "Afvinken"}
          className={clsx(
            "absolute bottom-3 right-3 flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold shadow-sm transition-colors disabled:opacity-50",
            isKlaar
              ? "bg-emerald-500 text-white"
              : "bg-white/85 text-slate-600 hover:bg-white active:scale-95"
          )}
        >
          <Icon name={bezig ? "loader" : "check"} size={14} className={bezig ? "animate-spin" : undefined} />
          {isKlaar ? "Klaar" : kiesKlaarLabel(item.id)}
        </button>
      )}
    </li>
  );
}
