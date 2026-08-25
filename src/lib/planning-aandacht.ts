import { stelLeermomentenVoor } from "@/lib/planning";
import { naarIsoDatum } from "@/lib/jaarkalender";
import type { PlanningItem, TestType } from "@/lib/types";

export type AandachtSoort = "huiswerk-ongepland" | "toets-onderprepareerd" | "leermoment-na-toets" | "gemist";

export interface AandachtSignaal {
  soort: AandachtSoort;
  /** Het item waar dit signaal om draait - bij "toets-onderprepareerd" de toets zelf, anders het huiswerk/leermoment. */
  item: PlanningItem;
  boodschap: string;
}

/**
 * Vindt huiswerk/toetsen/leermomenten die aandacht nodig hebben: geen
 * werkmoment vóór de deadline, een toets met minder gespreide leermomenten
 * dan er nu zouden moeten staan, een leermoment dat per ongeluk op of na de
 * toetsdatum zelf staat, of iets dat niet is afgevinkt terwijl de dag al
 * voorbij is. Bewust geen aparte "te weinig tijd ingeschat"-check (staat al
 * in de capaciteitsbalk) of "toetsen te dicht op elkaar"-check (bestaat al
 * losstaand voor toetsweekplanning, zie vindGeclusterdVak) - dat zou hier
 * vooral ruis toevoegen.
 */
export function bepaalAandachtSignalen(items: PlanningItem[], testTypes: TestType[], vandaag: Date): AandachtSignaal[] {
  const vandaagIso = naarIsoDatum(vandaag);
  const signalen: AandachtSignaal[] = [];

  for (const item of items) {
    if (item.status === "klaar") continue;

    // Gemist: de dag is al voorbij en het is nog niet afgevinkt. Verdere
    // checks (die over vooruitplannen gaan) slaan dan niet meer ergens op.
    if (item.due_date < vandaagIso && (item.type === "huiswerk" || item.type === "toets" || item.type === "leermoment")) {
      signalen.push({
        soort: "gemist",
        item,
        boodschap: `"${item.title}" stond gepland op ${item.due_date} en is niet afgevinkt.`,
      });
      continue;
    }

    if (item.type === "huiswerk" && !item.start_time) {
      signalen.push({
        soort: "huiswerk-ongepland",
        item,
        boodschap: `"${item.title}" heeft nog geen werkmoment.`,
      });
    }
  }

  for (const toets of items) {
    if (toets.type !== "toets" || toets.status === "klaar" || toets.due_date < vandaagIso) continue;

    const toetsDatum = new Date(toets.due_date + "T00:00:00");
    const testType = testTypes.find((t) => t.id === toets.test_type_id);
    const nuVerwacht = stelLeermomentenVoor(
      vandaag,
      toetsDatum,
      testType ? { aantalMomenten: testType.aantal_leermomenten } : undefined
    );
    if (nuVerwacht.length === 0) continue; // < 2 dagen te gaan, niks meer aan te plannen

    // Meestal auto-aangemaakt en via parent_item_id gekoppeld, maar de coach
    // kan via het gesprek ook losse leermomenten voor dit vak toevoegen
    // zonder die koppeling te zetten - die tellen net zo goed mee als
    // voorbereiding, dus meenemen op vak + datum vóór de toets.
    const leermomenten = items.filter(
      (i) =>
        i.type === "leermoment" &&
        (i.parent_item_id === toets.id ||
          (!i.parent_item_id && i.subject_id === toets.subject_id && i.due_date >= vandaagIso && i.due_date < toets.due_date))
    );

    for (const l of leermomenten.filter((l) => l.due_date >= toets.due_date)) {
      signalen.push({
        soort: "leermoment-na-toets",
        item: l,
        boodschap: `Een leermoment voor "${toets.title}" staat gepland op of na de toetsdatum zelf.`,
      });
    }

    if (leermomenten.length < nuVerwacht.length) {
      signalen.push({
        soort: "toets-onderprepareerd",
        item: toets,
        boodschap: `"${toets.title}" heeft nog maar ${leermomenten.length} van de ${nuVerwacht.length} leermomenten die er nu zouden moeten staan.`,
      });
    }
  }

  return signalen;
}

/** Bouwt 1 openingsbericht voor de planningscoach uit meerdere signalen tegelijk. */
export function bouwAandachtBericht(signalen: AandachtSignaal[]): string {
  const punten = signalen.map((s) => `- ${s.boodschap}`).join("\n");
  return `Er zijn een paar dingen die aandacht nodig hebben:\n${punten}\n\nKun je me helpen dit op te lossen, rekening houdend met de rest van mijn week?`;
}
