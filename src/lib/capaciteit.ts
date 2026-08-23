import type { PlanningItem } from "@/lib/types";

/**
 * Capaciteitsmodel voor de agenda.
 *
 * Het idee: een dag waarop te veel gepland staat moet er ook zo uitzien. Niet
 * door kaartjes weg te vouwen achter een "+3 meer"-knop (dan zie je juist niet
 * dat het te veel is), maar door de geplande tijd af te zetten tegen de tijd
 * die er die dag echt is - vanaf het moment dat je thuis bent tot de avondgrens
 * die het gezin instelt.
 *
 * Dat is ook waar de planning fallacy zichtbaar wordt: we schatten structureel
 * te laag in hoe lang iets duurt. Door de som van de inschattingen naast de
 * beschikbare tijd te zetten, komt dat aan het licht op het moment dat het nog
 * op te lossen is (bij het plannen), in plaats van 's avonds om half tien.
 */

/** Even landen na school voordat er huiswerk begint. */
export const PAUZE_NA_SCHOOL_MINUTEN = 30;

/**
 * Eten staat niet als afspraak in de agenda, maar kost wel elke dag een gat in
 * de avond. Zonder deze aftrek lijkt er structureel meer tijd te zijn dan er is
 * en slaat de meter nooit uit - precies het probleem dat hij moet laten zien.
 */
export const ETEN_MINUTEN = 60;

/** Op een dag zonder school (weekend, vakantie) begint de planbare tijd later. */
export const VRIJE_DAG_START_MINUTEN = 10 * 60;

export const STANDAARD_AVOND_GRENS = "20:30";

export function tijdNaarMinuten(tijd: string) {
  const [h, m] = tijd.slice(0, 5).split(":").map(Number);
  return h * 60 + m;
}

export type CapaciteitNiveau = "leeg" | "rustig" | "vol" | "over";

export interface DagCapaciteit {
  /** Vanaf wanneer er die dag gepland kan worden (minuten sinds middernacht). */
  startMinuten: number;
  eindMinuten: number;
  /** Bruikbare tijd, dus na aftrek van prive-afspraken die in de avond vallen. */
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

export function berekenDagCapaciteit({
  roosterBlokken,
  items,
  avondGrensMinuten,
}: {
  roosterBlokken: { startMinuten: number; duurMinuten: number }[];
  items: PlanningItem[];
  avondGrensMinuten: number;
}): DagCapaciteit {
  // Het laatste roosterblok is de fietstijd naar huis, dus dit is het moment
  // waarop het kind daadwerkelijk thuis is.
  const thuisMinuten = roosterBlokken.reduce((laatste, b) => Math.max(laatste, b.startMinuten + b.duurMinuten), 0);
  const startMinuten =
    roosterBlokken.length > 0 ? thuisMinuten + PAUZE_NA_SCHOOL_MINUTEN : VRIJE_DAG_START_MINUTEN;
  const eindMinuten = avondGrensMinuten;

  const ruwBeschikbaar = Math.max(0, eindMinuten - startMinuten - ETEN_MINUTEN);

  // Alleen wat nog moet gebeuren telt mee: voorstellen zijn nog geen afspraak,
  // en afgevinkt werk hoort de balk juist te laten leeglopen gedurende de dag.
  const teDoen = items.filter((i) => i.status === "open");

  // Prive-afspraken (training, verjaardag) zijn geen huiswerk, maar ze nemen wel
  // avond in beslag - die gaan er dus af van de beschikbare tijd.
  const priveMinuten = teDoen
    .filter((i) => i.type === "prive")
    .reduce((som, i) => som + (i.estimated_minutes ?? 0), 0);
  const beschikbaarMinuten = Math.max(0, ruwBeschikbaar - priveMinuten);

  const werk = teDoen.filter((i) => i.type !== "prive");
  const geplandMinuten = werk.reduce((som, i) => som + (i.estimated_minutes ?? 0), 0);
  const zonderInschatting = werk.filter((i) => !i.estimated_minutes).length;

  const overMinuten = Math.max(0, geplandMinuten - beschikbaarMinuten);
  const percentage =
    beschikbaarMinuten > 0 ? geplandMinuten / beschikbaarMinuten : geplandMinuten > 0 ? 1.5 : 0;

  let niveau: CapaciteitNiveau;
  if (geplandMinuten === 0 && zonderInschatting === 0) niveau = "leeg";
  else if (overMinuten > 0) niveau = "over";
  else if (percentage > 0.8) niveau = "vol";
  else niveau = "rustig";

  return {
    startMinuten,
    eindMinuten,
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
