"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Icon } from "@/components/icon";
import { PLANNING_TYPE_META } from "@/lib/planning";
import { updatePlanningStatus } from "@/lib/actions/planning";
import type { PlanningItem, Subject } from "@/lib/types";

function formatMinuten(minuten: number) {
  const uren = Math.floor(minuten / 60);
  const rest = minuten % 60;
  if (uren === 0) return `${rest} min`;
  if (rest === 0) return `${uren} u`;
  return `${uren}u ${rest}m`;
}

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
  const router = useRouter();
  const [bezigId, setBezigId] = useState<string | null>(null);

  function subjectNaam(id: string | null) {
    if (!id) return null;
    return subjects.find((s) => s.id === id)?.name ?? null;
  }

  async function afvinken(item: PlanningItem) {
    setBezigId(item.id);
    await updatePlanningStatus(item.id, item.status === "klaar" ? "open" : "klaar");
    setBezigId(null);
    router.refresh();
  }

  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => {
        const meta = PLANNING_TYPE_META[item.type];
        const bezig = bezigId === item.id;
        const isKlaar = item.status === "klaar";
        return (
          <li
            key={item.id}
            className={clsx(
              "flex items-center gap-3 rounded-xl border px-3.5 py-2.5",
              isKlaar
                ? "border-slate-100 bg-slate-50 opacity-60"
                : variant === "verlopen"
                  ? "border-rose-100 bg-rose-50/40"
                  : "border-slate-100"
            )}
          >
            <button
              onClick={() => afvinken(item)}
              disabled={bezig}
              aria-label={isKlaar ? "Weer openzetten" : "Afvinken"}
              className={clsx(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-colors disabled:opacity-50",
                isKlaar
                  ? "border-emerald-500 bg-emerald-500 text-white"
                  : "border-slate-300 text-transparent hover:border-emerald-400 hover:text-emerald-400"
              )}
            >
              <Icon name={bezig ? "loader" : "check"} size={14} className={bezig ? "animate-spin" : undefined} />
            </button>
            <Icon
              name={meta.icon}
              size={16}
              className={clsx("shrink-0", variant === "verlopen" && !isKlaar ? "text-rose-500" : "text-slate-400")}
            />
            <div className="min-w-0 flex-1">
              <p className={clsx("truncate text-sm font-medium text-slate-800", isKlaar && "line-through")}>
                {item.title}
              </p>
              {(subjectNaam(item.subject_id) || item.estimated_minutes) && (
                <p className="truncate text-xs text-slate-500">
                  {[subjectNaam(item.subject_id), item.estimated_minutes ? `~${formatMinuten(item.estimated_minutes)}` : null]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
