import type { JaarEvent, JaarEventType } from "@/lib/types";

export const JAAR_EVENT_META: Record<JaarEventType, { label: string; badgeClass: string; dotClass: string }> = {
  vakantie: {
    label: "Vakantie",
    badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
    dotClass: "bg-emerald-500",
  },
  toetsweek: {
    label: "Toetsweek",
    badgeClass: "bg-rose-50 text-rose-700 border-rose-200",
    dotClass: "bg-rose-500",
  },
  anders: {
    label: "Anders",
    badgeClass: "bg-violet-50 text-violet-700 border-violet-200",
    dotClass: "bg-violet-500",
  },
};

const MAANDNAMEN = [
  "Januari",
  "Februari",
  "Maart",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Augustus",
  "September",
  "Oktober",
  "November",
  "December",
];

export function maandNaam(maandIndex: number) {
  return MAANDNAMEN[maandIndex];
}

function naarIsoWeekdag(datum: Date) {
  const jsDag = datum.getDay();
  return jsDag === 0 ? 7 : jsDag;
}

function naarIsoDatum(datum: Date) {
  const jaar = datum.getFullYear();
  const maand = String(datum.getMonth() + 1).padStart(2, "0");
  const dag = String(datum.getDate()).padStart(2, "0");
  return `${jaar}-${maand}-${dag}`;
}

/** Geeft de dagen van een maand terug als kalenderrooster (maandag als eerste dag), met `null` voor lege cellen. */
export function maandRooster(jaar: number, maandIndex: number): (Date | null)[] {
  const eerste = new Date(jaar, maandIndex, 1);
  const laatsteDag = new Date(jaar, maandIndex + 1, 0).getDate();
  const cellen: (Date | null)[] = [];
  const legeCellenVooraf = naarIsoWeekdag(eerste) - 1;
  for (let i = 0; i < legeCellenVooraf; i++) cellen.push(null);
  for (let d = 1; d <= laatsteDag; d++) cellen.push(new Date(jaar, maandIndex, d));
  return cellen;
}

export function eventsOpDatum(events: JaarEvent[], datum: Date): JaarEvent[] {
  const iso = naarIsoDatum(datum);
  return events.filter((e) => e.start_datum <= iso && iso <= e.eind_datum);
}
