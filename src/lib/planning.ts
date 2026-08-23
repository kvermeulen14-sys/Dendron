import type { PlanningType } from "@/lib/types";

export const PLANNING_TYPE_META: Record<
  PlanningType,
  { label: string; icon: string; color: string; badgeClass: string }
> = {
  huiswerk: {
    label: "Huiswerk",
    icon: "pencil-line",
    color: "huiswerk",
    badgeClass: "bg-huiswerk-50 text-huiswerk-700 border-huiswerk-200",
  },
  toets: {
    label: "Toets",
    icon: "target",
    color: "toets",
    badgeClass: "bg-toets-50 text-toets-700 border-toets-200",
  },
  prive: {
    label: "Prive",
    icon: "heart",
    color: "prive",
    badgeClass: "bg-prive-50 text-prive-700 border-prive-200",
  },
  leermoment: {
    label: "Leermoment",
    icon: "brain",
    color: "leermoment",
    badgeClass: "bg-leermoment-50 text-leermoment-700 border-leermoment-200",
  },
};

// Werkdruk-classificatie: helpt kind en ouder in 1 oogopslag zien welke
// dagen vol raken, zodat overbelasting op tijd verplaatst kan worden in
// plaats van er pas achteraf achter te komen (voorkomt "verrassingsstress").
export type WerkdrukNiveau = "vrij" | "rustig" | "prima" | "druk" | "overvol";

export const WERKDRUK_META: Record<WerkdrukNiveau, { label: string; badgeClass: string; barClass: string }> = {
  vrij: { label: "Vrij", badgeClass: "bg-slate-50 text-slate-400 border-slate-200", barClass: "bg-slate-200" },
  rustig: { label: "Rustig", badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200", barClass: "bg-emerald-400" },
  prima: { label: "Prima te doen", badgeClass: "bg-accent-50 text-accent-700 border-accent-200", barClass: "bg-accent-400" },
  druk: { label: "Druk", badgeClass: "bg-amber-50 text-amber-700 border-amber-200", barClass: "bg-amber-400" },
  overvol: { label: "Overvol", badgeClass: "bg-rose-50 text-rose-700 border-rose-200", barClass: "bg-rose-500" },
};

export function classificeerWerkdruk(minuten: number): WerkdrukNiveau {
  if (minuten <= 0) return "vrij";
  if (minuten <= 60) return "rustig";
  if (minuten <= 120) return "prima";
  if (minuten <= 180) return "druk";
  return "overvol";
}

// Zoekt het eerste vrije tijdslot van `duurMinuten` na school, zodat een
// geaccepteerd leermoment/voorstel meteen een concrete plek in de dagplanning
// krijgt in plaats van als los, ongepland kaartje te blijven "zweven" - dat
// laatste is precies waar het voor een kind met planningsmoeite onduidelijk
// wordt ("waar staat dit nu eigenlijk?").
export function vindEersteVrijeSlot(
  bezetteBlokken: { startMinuten: number; duurMinuten: number }[],
  duurMinuten: number,
  opties?: { vanafMinuten?: number; totMinuten?: number }
): number {
  const vanaf = opties?.vanafMinuten ?? 15 * 60 + 30;
  const tot = opties?.totMinuten ?? 20 * 60;
  const sorted = [...bezetteBlokken].sort((a, b) => a.startMinuten - b.startMinuten);
  let kandidaat = vanaf;
  for (const blok of sorted) {
    const blokEind = blok.startMinuten + blok.duurMinuten;
    if (blok.startMinuten >= kandidaat + duurMinuten) break;
    if (blokEind > kandidaat) kandidaat = blokEind;
  }
  return Math.min(kandidaat, tot);
}

export function minutenNaarTijd(minuten: number) {
  const h = Math.floor(minuten / 60)
    .toString()
    .padStart(2, "0");
  const m = (minuten % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function toDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

// Verdeelt N momenten binnen een venster, met kortere tussenpozen naarmate
// het venster (de toetsdatum) nadert - spaced repetition-achtig.
function genereerProporties(n: number): number[] {
  if (n <= 1) return [0.7];
  const start = 0.2;
  const eind = 0.85;
  return Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1);
    const curved = Math.pow(t, 1.4);
    return start + curved * (eind - start);
  });
}

/**
 * Stelt gespreide leermomenten voor tussen vandaag en een toetsdatum, zodat
 * er in delen geleerd wordt in plaats van alles op het laatste moment.
 * Hoe dichter bij de toets, hoe korter de tussenpozen (spaced repetition-achtig).
 * Dit zijn altijd voorstellen ("voorstel"-status) - de leerling past ze samen
 * met een ouder aan naar wat past naast ander huiswerk.
 *
 * Met een toetsvorm (dagenVanTevoren/aantalMomenten) wordt dat leeradvies
 * gevolgd; zonder toetsvorm valt dit terug op een standaard vuistregel op
 * basis van hoeveel dagen er beschikbaar zijn.
 */
export function stelLeermomentenVoor(
  vandaag: Date,
  toetsDatum: Date,
  opties?: { dagenVanTevoren?: number; aantalMomenten?: number }
) {
  const dagenTotToets = Math.floor(
    (toetsDatum.getTime() - vandaag.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (dagenTotToets < 2) return [];

  // Venster waarbinnen geleerd wordt: het advies van de toetsvorm, maar niet
  // langer dan er daadwerkelijk dagen beschikbaar zijn tot de toets.
  const dagenBeschikbaar = Math.min(opties?.dagenVanTevoren ?? dagenTotToets, dagenTotToets);

  let aantalMomenten = opties?.aantalMomenten;
  if (!aantalMomenten) {
    if (dagenBeschikbaar >= 14) aantalMomenten = 4;
    else if (dagenBeschikbaar >= 7) aantalMomenten = 3;
    else if (dagenBeschikbaar >= 4) aantalMomenten = 2;
    else aantalMomenten = 1;
  }
  aantalMomenten = Math.max(1, Math.min(aantalMomenten, dagenBeschikbaar, 8));

  const dagenVoorVensterStart = dagenTotToets - dagenBeschikbaar;
  const dagenVoorToets = genereerProporties(aantalMomenten).map((p) =>
    Math.max(1, Math.round(dagenBeschikbaar * p))
  );

  // Zorg dat er geen dubbele data zijn en dat de laatste minstens 1 dag voor de toets is.
  const uniekeDagen = Array.from(new Set(dagenVoorToets)).sort((a, b) => a - b);

  return uniekeDagen.map((dagenOffset, i) => ({
    due_date: toDateOnly(addDays(vandaag, dagenVoorVensterStart + dagenOffset)),
    volgnummer: i + 1,
    totaal: uniekeDagen.length,
  }));
}
