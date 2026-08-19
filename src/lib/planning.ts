import type { PlanningType } from "@/lib/types";

export const PLANNING_TYPE_META: Record<
  PlanningType,
  { label: string; icon: string; color: string; badgeClass: string }
> = {
  huiswerk: {
    label: "Huiswerk",
    icon: "pencil-line",
    color: "amber",
    badgeClass: "bg-amber-50 text-amber-700 border-amber-200",
  },
  toets: {
    label: "Toets",
    icon: "alert-circle",
    color: "rose",
    badgeClass: "bg-rose-50 text-rose-700 border-rose-200",
  },
  prive: {
    label: "Prive",
    icon: "heart",
    color: "violet",
    badgeClass: "bg-violet-50 text-violet-700 border-violet-200",
  },
  leermoment: {
    label: "Leermoment",
    icon: "brain",
    color: "emerald",
    badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
};

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function toDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

/**
 * Stelt gespreide leermomenten voor tussen vandaag en een toetsdatum, zodat
 * er in delen geleerd wordt in plaats van alles op het laatste moment.
 * Hoe dichter bij de toets, hoe korter de tussenpozen (spaced repetition-achtig).
 * Dit zijn altijd voorstellen ("voorstel"-status) - de leerling past ze samen
 * met een ouder aan naar wat past naast ander huiswerk.
 */
export function stelLeermomentenVoor(vandaag: Date, toetsDatum: Date) {
  const dagenBeschikbaar = Math.floor(
    (toetsDatum.getTime() - vandaag.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (dagenBeschikbaar < 2) return [];

  let aantalMomenten: number;
  if (dagenBeschikbaar >= 14) aantalMomenten = 4;
  else if (dagenBeschikbaar >= 7) aantalMomenten = 3;
  else if (dagenBeschikbaar >= 4) aantalMomenten = 2;
  else aantalMomenten = 1;

  // Verhoudingen binnen het beschikbare interval, ingeplande momenten liggen
  // dichter bij elkaar naarmate de toets nadert.
  const proporties: Record<number, number[]> = {
    1: [0.7],
    2: [0.35, 0.75],
    3: [0.25, 0.55, 0.8],
    4: [0.15, 0.4, 0.65, 0.85],
  };

  const dagenVoorToets = proporties[aantalMomenten].map((p) =>
    Math.max(1, Math.round(dagenBeschikbaar * p))
  );

  // Zorg dat er geen dubbele data zijn en dat de laatste minstens 1 dag voor de toets is.
  const uniekeDagen = Array.from(new Set(dagenVoorToets)).sort((a, b) => a - b);

  return uniekeDagen.map((dagenOffset, i) => ({
    due_date: toDateOnly(addDays(vandaag, dagenOffset)),
    volgnummer: i + 1,
    totaal: uniekeDagen.length,
  }));
}
