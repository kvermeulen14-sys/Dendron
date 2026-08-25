import type { DagInstelling, PlanningItem } from "@/lib/types";

/**
 * Capaciteitsmodel voor de agenda.
 *
 * Het idee: een dag waarop te veel gepland staat moet er ook zo uitzien. Niet
 * door kaartjes weg te vouwen achter een "+3 meer"-knop (dan zie je juist niet
 * dat het te veel is), maar door de geplande tijd af te zetten tegen de tijd
 * die er die dag echt is.
 *
 * Dat is ook waar de planning fallacy zichtbaar wordt: we schatten structureel
 * te laag in hoe lang iets duurt. Door de som van de inschattingen naast de
 * beschikbare tijd te zetten, komt dat aan het licht op het moment dat het nog
 * op te lossen is (bij het plannen), in plaats van 's avonds om half tien.
 */

/** Even landen na school voordat er huiswerk begint. */
export const PAUZE_NA_SCHOOL_MINUTEN = 30;

/**
 * Meer dan dit op 1 dag plannen is niet meer realistisch, ook niet op een
 * verder helemaal vrije dag - vanaf hier slaat de meter uit, ongeacht hoeveel
 * tijd er op papier nog "beschikbaar" zou zijn. Meer inplannen kan gewoon,
 * maar de meter waarschuwt dan eerder in plaats van dat een vrije zaterdag
 * nooit "vol" kan worden.
 */
export const MAX_PLAN_MINUTEN = 8 * 60;

export const STANDAARD_OCHTEND_START_SCHOOLDAG = "07:00";
export const STANDAARD_OCHTEND_START_WEEKEND = "09:30";
export const STANDAARD_AVOND_GRENS = "20:30";
export const STANDAARD_ETEN_MINUTEN = 60;

export function tijdNaarMinuten(tijd: string) {
  const [h, m] = tijd.slice(0, 5).split(":").map(Number);
  return h * 60 + m;
}

export interface DagRitme {
  ochtendStartMinuten: number;
  avondGrensMinuten: number;
  etenMinuten: number;
}

/** Redelijke standaard als de ouder deze dag nog niet zelf heeft ingesteld. */
export function standaardDagRitme(dagVanWeek: number): DagRitme {
  const weekend = dagVanWeek === 6 || dagVanWeek === 7;
  return {
    ochtendStartMinuten: tijdNaarMinuten(weekend ? STANDAARD_OCHTEND_START_WEEKEND : STANDAARD_OCHTEND_START_SCHOOLDAG),
    avondGrensMinuten: tijdNaarMinuten(STANDAARD_AVOND_GRENS),
    etenMinuten: STANDAARD_ETEN_MINUTEN,
  };
}

/** Zet de opgeslagen rijen om naar 1 ritme per weekdag (1-7), met standaardwaarden voor ontbrekende dagen. */
export function dagRitmesPerWeek(instellingen: DagInstelling[]): Map<number, DagRitme> {
  const map = new Map<number, DagRitme>();
  for (let dag = 1; dag <= 7; dag++) map.set(dag, standaardDagRitme(dag));
  for (const i of instellingen) {
    map.set(i.dag_van_week, {
      ochtendStartMinuten: tijdNaarMinuten(i.ochtend_start),
      avondGrensMinuten: tijdNaarMinuten(i.avond_grens),
      etenMinuten: i.eten_minuten,
    });
  }
  return map;
}

export type CapaciteitNiveau = "leeg" | "rustig" | "vol" | "over";

export interface CapaciteitVenster {
  start: number;
  eind: number;
}

export interface DagCapaciteit {
  /** De planbare gaten die dag (bv. een vrije ochtend voor school + de avond). Leeg op een volledig dichte dag. */
  vensters: CapaciteitVenster[];
  /** Bruikbare tijd binnen de vensters, na aftrek van eten en prive-afspraken, en geplafonneerd op MAX_PLAN_MINUTEN. */
  beschikbaarMinuten: number;
  /** Som van de tijdsinschattingen van wat nog open staat (prive niet meegeteld). */
  geplandMinuten: number;
  /** Aantal open taken zonder tijdsinschatting - het blinde vlek van dit model. */
  zonderInschatting: number;
  /** Hoeveel er te veel staat; 0 zolang het past. */
  overMinuten: number;
  /** geplandMinuten / beschikbaarMinuten, kan boven 1 uitkomen. */
  percentage: number;
  niveau: CapaciteitNiveau;
}

export const CAPACITEIT_META: Record<
  CapaciteitNiveau,
  { label: string; barClass: string; textClass: string; kopClass: string }
> = {
  leeg: { label: "Vrij", barClass: "bg-slate-200", textClass: "text-slate-400", kopClass: "" },
  rustig: { label: "Rustig", barClass: "bg-emerald-500", textClass: "text-emerald-700", kopClass: "" },
  vol: { label: "Vol", barClass: "bg-amber-500", textClass: "text-amber-700", kopClass: "" },
  over: {
    label: "Te veel",
    barClass: "bg-rose-500",
    textClass: "text-rose-700",
    kopClass: "ring-2 ring-inset ring-rose-300",
  },
};

/**
 * De planbare gaten op een dag: een vrije ochtend vóór het eerste (fiets- of
 * les-)blok als die er is, en de tijd na school tot de avondgrens. Op een dag
 * zonder rooster (weekend, vakantie) is de hele periode tussen ochtend- en
 * avondgrens 1 groot venster.
 */
function berekenVensters(
  roosterBlokken: { startMinuten: number; duurMinuten: number }[],
  ritme: DagRitme
): CapaciteitVenster[] {
  if (roosterBlokken.length === 0) {
    if (ritme.avondGrensMinuten <= ritme.ochtendStartMinuten) return [];
    return [{ start: ritme.ochtendStartMinuten, eind: ritme.avondGrensMinuten }];
  }

  const vertrekMinuten = Math.min(...roosterBlokken.map((b) => b.startMinuten));
  const thuiskomstMinuten = Math.max(...roosterBlokken.map((b) => b.startMinuten + b.duurMinuten));

  const vensters: CapaciteitVenster[] = [];
  if (vertrekMinuten > ritme.ochtendStartMinuten) {
    vensters.push({ start: ritme.ochtendStartMinuten, eind: vertrekMinuten });
  }
  const avondStart = thuiskomstMinuten + PAUZE_NA_SCHOOL_MINUTEN;
  if (ritme.avondGrensMinuten > avondStart) {
    vensters.push({ start: avondStart, eind: ritme.avondGrensMinuten });
  }
  return vensters;
}

export function berekenDagCapaciteit({
  roosterBlokken,
  items,
  ritme,
}: {
  roosterBlokken: { startMinuten: number; duurMinuten: number }[];
  items: PlanningItem[];
  ritme: DagRitme;
}): DagCapaciteit {
  const vensters = berekenVensters(roosterBlokken, ritme);
  const ruwVensterMinuten = vensters.reduce((som, v) => som + (v.eind - v.start), 0);
  const ruwBeschikbaar = Math.max(0, ruwVensterMinuten - ritme.etenMinuten);

  // Deze balk is een plánningstool ("past dit binnen de dag"), geen
  // voortgangsbalk - dus telt het hele geplande werk mee, ook wat al is
  // afgevinkt. Alleen een voorstel is nog geen afspraak en telt niet mee.
  const gepland = items.filter((i) => i.status !== "voorstel");

  // Prive-afspraken (training, verjaardag) zijn geen huiswerk, maar ze nemen wel
  // tijd in beslag - die gaan er dus af van de beschikbare tijd.
  const priveMinuten = gepland
    .filter((i) => i.type === "prive")
    .reduce((som, i) => som + (i.estimated_minutes ?? 0), 0);

  // Meer dan MAX_PLAN_MINUTEN plannen is nooit meer "gewoon vol" - dat is het
  // plafond waarop de meter zich baseert, ook als er op papier meer tijd is.
  const beschikbaarMinuten = Math.min(MAX_PLAN_MINUTEN, Math.max(0, ruwBeschikbaar - priveMinuten));

  const werk = gepland.filter((i) => i.type !== "prive");
  const geplandMinuten = werk.reduce((som, i) => som + (i.estimated_minutes ?? 0), 0);
  // Een afgevinkte taak heeft niks meer om in te vullen - dat blijft dus
  // scoped op wat nog open staat, anders zou hij een niet-meer-relevante
  // vul-in-nudge blijven tonen voor iets dat al klaar is.
  const zonderInschatting = werk.filter((i) => i.status === "open" && !i.estimated_minutes).length;

  const overMinuten = Math.max(0, geplandMinuten - beschikbaarMinuten);
  const percentage =
    beschikbaarMinuten > 0 ? geplandMinuten / beschikbaarMinuten : geplandMinuten > 0 ? 1.5 : 0;

  let niveau: CapaciteitNiveau;
  if (geplandMinuten === 0 && zonderInschatting === 0) niveau = "leeg";
  else if (overMinuten > 0) niveau = "over";
  else if (percentage > 0.8) niveau = "vol";
  else niveau = "rustig";

  return {
    vensters,
    beschikbaarMinuten,
    geplandMinuten,
    zonderInschatting,
    overMinuten,
    percentage,
    niveau,
  };
}

export function formatCapaciteitMinuten(minuten: number) {
  const uren = Math.floor(minuten / 60);
  const rest = minuten % 60;
  if (uren === 0) return `${rest}m`;
  if (rest === 0) return `${uren}u`;
  return `${uren}u ${rest}m`;
}

/**
 * De regel onder de balk. Bewust zonder verwijt geformuleerd: hij vertelt wat
 * er aan de hand is en nodigt uit om te schuiven, in plaats van te melden dat
 * je achterloopt.
 */
export function capaciteitTekst(cap: DagCapaciteit) {
  if (cap.niveau === "over") {
    return `${formatCapaciteitMinuten(cap.overMinuten)} te veel`;
  }
  if (cap.niveau === "leeg") return "Niets gepland";
  return `${formatCapaciteitMinuten(cap.geplandMinuten)} van ${formatCapaciteitMinuten(cap.beschikbaarMinuten)}`;
}

function minutenNaarKlok(minuten: number) {
  const h = Math.floor(minuten / 60)
    .toString()
    .padStart(2, "0");
  const m = (minuten % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

/** Voor een tooltip: "07:00-08:15 en 16:00-20:30". */
export function vensterTekst(cap: DagCapaciteit) {
  if (cap.vensters.length === 0) return "geen planbare tijd";
  return cap.vensters.map((v) => `${minutenNaarKlok(v.start)}-${minutenNaarKlok(v.eind)}`).join(" en ");
}
