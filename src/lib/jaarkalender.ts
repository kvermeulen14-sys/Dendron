import type { JaarEvent, JaarEventType } from "@/lib/types";

export const JAAR_EVENT_META: Record<
  JaarEventType,
  { label: string; badgeClass: string; dotClass: string; cellClass: string; cellWeekendClass: string; cellTextClass: string }
> = {
  vakantie: {
    label: "Vakantie",
    badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
    dotClass: "bg-emerald-500",
    cellClass: "bg-emerald-200",
    cellWeekendClass: "bg-emerald-300",
    cellTextClass: "text-emerald-900",
  },
  toetsweek: {
    label: "Toetsweek",
    badgeClass: "bg-rose-50 text-rose-700 border-rose-200",
    dotClass: "bg-rose-500",
    cellClass: "bg-rose-200",
    cellWeekendClass: "bg-rose-300",
    cellTextClass: "text-rose-900",
  },
  anders: {
    label: "Anders",
    badgeClass: "bg-violet-50 text-violet-700 border-violet-200",
    dotClass: "bg-violet-500",
    cellClass: "bg-violet-200",
    cellWeekendClass: "bg-violet-300",
    cellTextClass: "text-violet-900",
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
