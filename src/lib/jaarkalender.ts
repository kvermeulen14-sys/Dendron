import type { JaarEvent, JaarEventType } from "@/lib/types";

export const JAAR_EVENT_META: Record<JaarEventType, { label: string; badgeClass: string; dotClass: string; barClass: string }> = {
  vakantie: {
    label: "Vakantie",
    badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
    dotClass: "bg-emerald-500",
    barClass: "bg-emerald-200 text-emerald-900",
  },
  toetsweek: {
    label: "Toetsweek",
    badgeClass: "bg-rose-50 text-rose-700 border-rose-200",
    dotClass: "bg-rose-500",
    barClass: "bg-rose-200 text-rose-900",
  },
  anders: {
    label: "Anders",
    badgeClass: "bg-violet-50 text-violet-700 border-violet-200",
    dotClass: "bg-violet-500",
    barClass: "bg-violet-200 text-violet-900",
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

export interface MaandSegment {
  event: JaarEvent;
  startDag: number;
  eindDag: number;
}

/** Geeft per maand de events terug die deze maand raken, afgekapt tot de dagen binnen die maand. */
export function segmentenVoorMaand(events: JaarEvent[], jaar: number, maandIndex: number): MaandSegment[] {
  const laatsteDag = dagenInMaand(jaar, maandIndex);
  const maandStart = naarIsoDatum(new Date(jaar, maandIndex, 1));
  const maandEind = naarIsoDatum(new Date(jaar, maandIndex, laatsteDag));

  return events
    .filter((e) => e.eind_datum >= maandStart && e.start_datum <= maandEind)
    .map((e) => {
      const startDag = e.start_datum <= maandStart ? 1 : Number(e.start_datum.slice(8, 10));
      const eindDag = e.eind_datum >= maandEind ? laatsteDag : Number(e.eind_datum.slice(8, 10));
      return { event: e, startDag, eindDag };
    })
    .sort((a, b) => a.startDag - b.startDag || a.eindDag - b.eindDag);
}

export interface MaandSegmentMetBaan extends MaandSegment {
  baan: number;
}

/**
 * Wijst elk segment een "baan" (rijnummer) toe zodat overlappende periodes
 * niet over elkaar heen getekend worden - net als losstaande balken in een
 * maandweergave. Segmenten die elkaar niet overlappen delen dezelfde baan.
 */
export function segmentenMetBanen(segmenten: MaandSegment[]): MaandSegmentMetBaan[] {
  const laatsteEindPerBaan: number[] = [];
  return segmenten.map((seg) => {
    let baan = laatsteEindPerBaan.findIndex((eind) => eind < seg.startDag);
    if (baan === -1) {
      baan = laatsteEindPerBaan.length;
      laatsteEindPerBaan.push(seg.eindDag);
    } else {
      laatsteEindPerBaan[baan] = seg.eindDag;
    }
    return { ...seg, baan };
  });
}
