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

  function subjectCode(id: string | null) {
    if (!id) return null;
    return subjects.find((s) => s.id === id)?.code ?? null;
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
            onClick={() => router.push(`/kind/focus/${item.id}`)}
            className={clsx(
              "relative flex cursor-pointer flex-col gap-2 rounded-xl border p-3 pb-11 transition-colors hover:border-accent-200 hover:bg-accent-50/30",
              isKlaar
                ? "border-slate-100 bg-slate-50 opacity-60"
                : variant === "verlopen"
                  ? "border-rose-100 bg-rose-50/40"
                  : "border-slate-100"
            )}
          >
            <div className="flex items-start gap-2.5">
              <Icon
                name={meta.icon}
                size={16}
                className={clsx("mt-0.5 shrink-0", variant === "verlopen" && !isKlaar ? "text-rose-500" : "text-slate-400")}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className={clsx("truncate text-sm font-medium text-slate-800", isKlaar && "line-through")}>
                    {item.title}
                  </p>
                  {subjectCode(item.subject_id) && (
                    <span className="shrink-0 rounded bg-slate-100 px-1 py-0.5 text-[9px] font-bold text-slate-500">
                      {subjectCode(item.subject_id)}
                    </span>
                  )}
                </div>
                {((!subjectCode(item.subject_id) && subjectNaam(item.subject_id)) || item.estimated_minutes) && (
                  <p className="truncate text-xs text-slate-500">
                    {[
                      !subjectCode(item.subject_id) ? subjectNaam(item.subject_id) : null,
                      item.estimated_minutes ? `~${formatMinuten(item.estimated_minutes)}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
              </div>
            </div>

            <button
              onClick={(e) => {
                e.stopPropagation();
                afvinken(item);
              }}
              disabled={bezig}
              aria-label={isKlaar ? "Weer openzetten" : "Afvinken"}
              className={clsx(
                "absolute bottom-2 right-2 flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold shadow-sm transition-colors disabled:opacity-50",
                isKlaar
                  ? "bg-emerald-500 text-white"
                  : "bg-white text-slate-500 ring-1 ring-inset ring-slate-200 hover:bg-emerald-50 hover:text-emerald-700 hover:ring-emerald-300 active:scale-95"
              )}
            >
              <Icon name={bezig ? "loader" : "check"} size={14} className={bezig ? "animate-spin" : undefined} />
              {isKlaar ? "Klaar" : "Afvinken"}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
