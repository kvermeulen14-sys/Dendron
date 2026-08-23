import type { PlanningItem, PlanningType } from "@/lib/types";

/**
 * Tijdsinschattingen bijstellen op basis van hoe lang het in het echt duurde.
 *
 * De planning fallacy zegt dat we structureel te laag inschatten, en dat we dat
 * niet vanzelf afleren - ook niet als het de vorige keer uitliep. Wat wel helpt
 * is de terugkoppeling concreet maken: niet "je onderschat vaak", maar
 * "wiskunde-huiswerk duurt bij jou meestal 45 minuten, niet 30".
 *
 * Daarom rekenen we per soort werk (vak + type) de verhouding tussen werkelijke
 * en geschatte tijd uit. Bewust met de mediaan en niet het gemiddelde: een keer
 * drie uur aan een werkstuk zitten mag het beeld van je gewone huiswerk niet
 * verpesten.
 */

/** Onder dit aantal metingen is het toeval, geen patroon - dan zwijgen we. */
export const MIN_METINGEN = 3;

/** Binnen deze marge klopt de schatting gewoon; daar hoeft niets over gezegd. */
const NEGEER_MARGE = 0.15;

function mediaan(getallen: number[]) {
  const gesorteerd = [...getallen].sort((a, b) => a - b);
  const midden = Math.floor(gesorteerd.length / 2);
  return gesorteerd.length % 2 === 0
    ? (gesorteerd[midden - 1] + gesorteerd[midden]) / 2
    : gesorteerd[midden];
}

function sleutel(type: PlanningType, subjectId: string | null) {
  return `${type}:${subjectId ?? "-"}`;
}

export interface Kalibratie {
  /** Werkelijke tijd gedeeld door geschatte tijd; 1.5 = het duurt anderhalf keer zo lang. */
  factor: number;
  aantalMetingen: number;
}

export function berekenKalibratie(items: PlanningItem[]): Map<string, Kalibratie> {
  const perSoort = new Map<string, number[]>();
  for (const item of items) {
    if (!item.actual_minutes || !item.estimated_minutes) continue;
    const k = sleutel(item.type, item.subject_id);
    const lijst = perSoort.get(k) ?? [];
    lijst.push(item.actual_minutes / item.estimated_minutes);
    perSoort.set(k, lijst);
  }

  const resultaat = new Map<string, Kalibratie>();
  for (const [k, verhoudingen] of perSoort) {
    if (verhoudingen.length < MIN_METINGEN) continue;
    resultaat.set(k, { factor: mediaan(verhoudingen), aantalMetingen: verhoudingen.length });
  }
  return resultaat;
}

/**
 * Wat Dendron over deze schatting te melden heeft - of niets, als er nog te
 * weinig metingen zijn of de schatting gewoon klopt.
 */
export function schattingAdvies(
  kalibratie: Map<string, Kalibratie>,
  type: PlanningType,
  subjectId: string | null,
  geschatteMinuten: number | null
): { voorstelMinuten: number; tekst: string } | null {
  if (!geschatteMinuten) return null;
  const gevonden = kalibratie.get(sleutel(type, subjectId));
  if (!gevonden) return null;
  if (Math.abs(gevonden.factor - 1) < NEGEER_MARGE) return null;

  // Afronden op kwartieren, zoals overal in de agenda.
  const voorstelMinuten = Math.max(15, Math.round((geschatteMinuten * gevonden.factor) / 15) * 15);
  if (voorstelMinuten === geschatteMinuten) return null;

  const langer = voorstelMinuten > geschatteMinuten;
  return {
    voorstelMinuten,
    tekst: langer
      ? `Dit soort werk duurt bij jou meestal ${voorstelMinuten} minuten, niet ${geschatteMinuten}.`
      : `Dit soort werk gaat bij jou meestal sneller: ongeveer ${voorstelMinuten} minuten.`,
  };
}
