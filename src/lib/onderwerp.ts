/**
 * Bepaalt per vak welk hoofdstuk het meest voor de hand ligt om nu over te
 * oefenen - nodig voor "2 minuten oefenen", dat anders zomaar uit de hele
 * lesstof put (ook stof die nog lang niet behandeld is).
 *
 * Voorkeur: het hoofdstuk dat bij "Oefenen" het laatst gekozen is voor dit
 * vak (dat is een bewuste keuze van de leerling, dus de beste indicatie).
 * Zonder zo'n sessie: het meest recent toegevoegde lesstof-hoofdstuk (een
 * redelijke proxy voor "waar we nu mee bezig zijn" - lesstof wordt in de
 * praktijk toegevoegd naarmate de stof behandeld wordt).
 */

interface SessieBron {
  subject_id: string;
  hoofdstuk: string | null;
  created_at: string;
}

interface MateriaalBron {
  subject_id: string;
  hoofdstuk: string | null;
  created_at: string;
}

export function bepaalLaatsteOnderwerpPerVak(
  materials: MateriaalBron[],
  overhoorSessies: SessieBron[]
): Map<string, string> {
  const resultaat = new Map<string, string>();

  const sessiesPerVak = new Map<string, SessieBron[]>();
  for (const s of overhoorSessies) {
    if (!s.hoofdstuk) continue;
    const lijst = sessiesPerVak.get(s.subject_id) ?? [];
    lijst.push(s);
    sessiesPerVak.set(s.subject_id, lijst);
  }
  for (const [subjectId, lijst] of sessiesPerVak) {
    const laatste = lijst.reduce((a, b) => (a.created_at > b.created_at ? a : b));
    resultaat.set(subjectId, laatste.hoofdstuk!);
  }

  const materialsPerVak = new Map<string, MateriaalBron[]>();
  for (const m of materials) {
    if (!m.hoofdstuk) continue;
    const lijst = materialsPerVak.get(m.subject_id) ?? [];
    lijst.push(m);
    materialsPerVak.set(m.subject_id, lijst);
  }
  for (const [subjectId, lijst] of materialsPerVak) {
    if (resultaat.has(subjectId)) continue;
    const laatste = lijst.reduce((a, b) => (a.created_at > b.created_at ? a : b));
    resultaat.set(subjectId, laatste.hoofdstuk!);
  }

  return resultaat;
}
