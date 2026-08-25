export interface OefenSessieVoorChat {
  hoofdstuk: string | null;
  transcript: { vraag: string; beoordeling: "goed" | "deels" | "fout" | "geen" }[] | null;
}

export const MAX_RECENTE_STRUIKELVRAGEN = 8;

/**
 * Vragen die de leerling recent bij Oefenen nog niet (helemaal) goed had.
 * Gedeeld tussen de vakdocent-chat (mag dit openlijk noemen, bv. "dit kwam
 * net ook bij het oefenen langs") en de Oefenen-quiz zelf (mag er af en toe
 * een vraag over stellen) - dat is precies het soort herhaling waar
 * retrieval-practice-onderzoek de meeste winst uit haalt, en zonder dit
 * blok waren dat 2 losse, van elkaar onwetende kanalen.
 */
export function bouwOefenGeschiedenisBlok(sessies: OefenSessieVoorChat[]): string {
  const regels: { hoofdstuk: string | null; vraag: string }[] = [];
  for (const sessie of sessies) {
    for (const regel of sessie.transcript ?? []) {
      if (regels.length >= MAX_RECENTE_STRUIKELVRAGEN) break;
      if (regel.beoordeling === "fout" || regel.beoordeling === "deels") {
        regels.push({ hoofdstuk: sessie.hoofdstuk, vraag: regel.vraag });
      }
    }
  }
  if (regels.length === 0) return "";

  const lijst = regels.map((r) => `- ${r.hoofdstuk ? `[${r.hoofdstuk}] ` : ""}${r.vraag}`).join("\n");
  return `\n\n[RECENTE OEFENGESCHIEDENIS - vragen die de leerling recent bij Oefenen nog niet (helemaal) goed had, nieuwste eerst. Gebruik dit om proactief te herkennen of de huidige vraag hiermee te maken heeft, en waar dat past kort en vriendelijk te verwijzen (bv. "dit kwam net ook bij het oefenen langs, hè?") - dwing dit niet geforceerd in elk antwoord, alleen als het echt relevant is.]\n${lijst}`;
}
