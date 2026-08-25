import type { Leerfase } from "@/lib/types";

/**
 * Vanaf hoeveel dagen voor een toets we automatisch overschakelen naar
 * "vlak voor de toets" (pittiger, zonder hints vooraf) - dat is precies de
 * fase waarin retrieval-onder-toetsomstandigheden (zonder scaffolding) het
 * meest oplevert. Een leerling kan dit altijd zelf overrulen.
 */
const DAGEN_VOOR_STRENG_OEFENEN = 3;

export interface LeerfaseAdvies {
  leerfase: Leerfase;
  reden: string;
}

/** `dagenTotToets` is null als er geen (aankomende) toets voor dit vak is. */
export function bepaalLeerfaseAdvies(dagenTotToets: number | null): LeerfaseAdvies | null {
  if (dagenTotToets === null || dagenTotToets < 0 || dagenTotToets > DAGEN_VOOR_STRENG_OEFENEN) return null;
  return {
    leerfase: "laatste",
    reden:
      dagenTotToets === 0
        ? "Vandaag is de toets - oefen daarom zonder hints, zoals op de toets zelf."
        : `Toets over ${dagenTotToets} ${dagenTotToets === 1 ? "dag" : "dagen"} - oefen daarom zonder hints, zoals op de toets zelf.`,
  };
}

export interface OefenSessieSamenvatting {
  subject_id: string;
  created_at: string;
  aantal_goed: number;
  aantal_deels: number;
  aantal_fout: number;
}

export interface OefenAdvies {
  subjectId: string;
  tekst: string;
}

/** Onder dit aantal dagen sinds de laatste sessie is er simpelweg nog geen reden om te wijzen op iets anders. */
const MIN_DAGEN_VOOR_ADVIES = 3;
/** Hoe zwaar een recent hoog foutpercentage meeweegt t.o.v. het aantal dagen sinds geoefend. */
const FOUTRATIO_GEWICHT = 14;
/** Score voor een vak dat nog helemaal niet geoefend is - genoeg om normaal boven te drijven, maar een vak met aantoonbare, verse fouten kan er nog overheen gaan. */
const NOG_NOOIT_GEOEFEND_SCORE = 8;

/**
 * Bepaalt welk vak nu het meest gebaat is bij een oefenmomentje: een
 * combinatie van "hoe lang geleden voor het laatst geoefend" (forgetting
 * curve) en "hoe goed ging dat toen" (waar nog echte moeite zit, weegt
 * zwaarder mee dan pure sleet). Geeft null als geen enkel vak op dit moment
 * echt om aandacht vraagt (bv. alles pas recent en goed geoefend).
 */
export function bepaalOefenAdvies(
  subjectIds: string[],
  sessies: OefenSessieSamenvatting[],
  laatsteOnderwerpPerVak: Map<string, string>,
  vandaag: Date = new Date()
): OefenAdvies | null {
  const sessiesPerVak = new Map<string, OefenSessieSamenvatting[]>();
  for (const s of sessies) {
    const lijst = sessiesPerVak.get(s.subject_id) ?? [];
    lijst.push(s);
    sessiesPerVak.set(s.subject_id, lijst);
  }

  let beste: { subjectId: string; score: number; tekst: string } | null = null;

  for (const subjectId of subjectIds) {
    const vakSessies = (sessiesPerVak.get(subjectId) ?? []).sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    const laatste = vakSessies[0];
    const onderwerp = laatsteOnderwerpPerVak.get(subjectId);

    let kandidaat: { subjectId: string; score: number; tekst: string };
    if (!laatste) {
      kandidaat = {
        subjectId,
        score: NOG_NOOIT_GEOEFEND_SCORE,
        tekst: `Dit heb je nog niet geoefend${onderwerp ? ` - begin bij ${onderwerp}` : ""}.`,
      };
    } else {
      const dagenSinds = Math.floor((vandaag.getTime() - new Date(laatste.created_at).getTime()) / 86400000);
      if (dagenSinds < MIN_DAGEN_VOOR_ADVIES) continue;

      const totaal = laatste.aantal_goed + laatste.aantal_deels + laatste.aantal_fout;
      const foutRatio = totaal > 0 ? (laatste.aantal_fout + 0.5 * laatste.aantal_deels) / totaal : 0;
      kandidaat = {
        subjectId,
        score: dagenSinds + foutRatio * FOUTRATIO_GEWICHT,
        tekst:
          foutRatio >= 0.4
            ? `Dat heb je ${dagenSinds} dagen niet geoefend, en toen ging ${onderwerp ?? "het"} nog niet zo lekker.`
            : `Alweer ${dagenSinds} dagen geleden geoefend - goed om even op te frissen.`,
      };
    }

    if (!beste || kandidaat.score > beste.score) beste = kandidaat;
  }

  return beste ? { subjectId: beste.subjectId, tekst: beste.tekst } : null;
}
