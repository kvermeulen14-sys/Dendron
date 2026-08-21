import type { JaarEvent, JaarEventType } from "@/lib/types";

export const JAAR_EVENT_META: Record<
  JaarEventType,
  {
    label: string;
    badgeClass: string;
    dotClass: string;
    cellClass: string;
    cellWeekendClass: string;
    cellTextClass: string;
    dayTintClass: string;
    dayLabelClass: string;
  }
> = {
  vakantie: {
    label: "Vakantie",
    badgeClass: "bg-vakantie-50 text-vakantie-700 border-vakantie-200",
    dotClass: "bg-vakantie-500",
    cellClass: "bg-vakantie-200",
    cellWeekendClass: "bg-vakantie-300",
    cellTextClass: "text-vakantie-900",
    dayTintClass: "bg-vakantie-50",
    dayLabelClass: "bg-vakantie-100 text-vakantie-800",
  },
  toetsweek: {
    label: "Toetsweek",
    badgeClass: "bg-toets-50 text-toets-700 border-toets-200",
    dotClass: "bg-toets-500",
    cellClass: "bg-toets-200",
    cellWeekendClass: "bg-toets-300",
    cellTextClass: "text-toets-900",
    dayTintClass: "bg-toets-50",
    dayLabelClass: "bg-toets-100 text-toets-800",
  },
  anders: {
    label: "Anders",
    badgeClass: "bg-anders-50 text-anders-700 border-anders-200",
    dotClass: "bg-anders-500",
    cellClass: "bg-anders-200",
    cellWeekendClass: "bg-anders-300",
    cellTextClass: "text-anders-900",
    dayTintClass: "bg-anders-50",
    dayLabelClass: "bg-anders-100 text-anders-800",
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

export function naarIsoDatum(datum: Date) {
  const jaar = datum.getFullYear();
  const maand = String(datum.getMonth() + 1).padStart(2, "0");
  const dag = String(datum.getDate()).padStart(2, "0");
  return `${jaar}-${maand}-${dag}`;
}

export function isWeekend(datum: Date) {
  const dag = datum.getDay();
  return dag === 0 || dag === 6;
}

export function dagenInMaand(jaar: number, maandIndex: number) {
  return new Date(jaar, maandIndex + 1, 0).getDate();
}

/**
 * Een schooljaar loopt van augustus t/m juli. Geeft de 12 maanden van het
 * schooljaar dat in `startJaar` begint, in die volgorde (aug..dec van
 * startJaar, jan..jul van startJaar + 1).
 */
export function schooljaarMaanden(startJaar: number): { jaar: number; maandIndex: number }[] {
  const maanden: { jaar: number; maandIndex: number }[] = [];
  for (let m = 7; m <= 11; m++) maanden.push({ jaar: startJaar, maandIndex: m });
  for (let m = 0; m <= 6; m++) maanden.push({ jaar: startJaar + 1, maandIndex: m });
  return maanden;
}

export function eventsOpDatum(events: JaarEvent[], datum: Date): JaarEvent[] {
  const iso = naarIsoDatum(datum);
  return events.filter((e) => e.start_datum <= iso && iso <= e.eind_datum);
}

/** Geeft de dagvakje-kleurklassen terug: event-kleur als de dag in een periode valt, anders wit/grijs. Weekenden krijgen altijd de donkerdere variant. */
export function dagCelKlassen(events: JaarEvent[], datum: Date) {
  const [event] = eventsOpDatum(events, datum);
  const weekend = isWeekend(datum);
  if (event) {
    const meta = JAAR_EVENT_META[event.type];
    return { bg: weekend ? meta.cellWeekendClass : meta.cellClass, text: meta.cellTextClass, titel: event.titel };
  }
  return { bg: weekend ? "bg-slate-200" : "bg-white", text: "text-slate-400", titel: null as string | null };
}
