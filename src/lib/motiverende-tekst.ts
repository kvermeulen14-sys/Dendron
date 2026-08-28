/**
 * Positieve, leeftijdspassende motivatietekst voor het kind-overzicht -
 * vervangt de vroegere droge "Vandaag: X taken - Y uur"-samenvatting (die
 * stond hier trouwens dubbelop met de capaciteitsring in de agenda zelf).
 * Elke dag een andere tekst (deterministisch op dag-van-het-jaar, dus
 * stabiel binnen 1 dag maar geen herhaling van de vorige dag), zonder dat
 * er iets voor uitgerekend hoeft te worden.
 */
const MOTIVATIETEKSTEN = [
  "Elke stap telt, ook de kleine. Ga er lekker voor vandaag!",
  "Je hoeft het niet perfect te doen - je hoeft het gewoon te doen.",
  "Vandaag is een nieuwe kans om iets af te vinken. Succes!",
  "Rustig aan is ook vooruitgang. Eén ding tegelijk.",
  "Je hebt dit al vaker gedaan - je kan dit ook vandaag.",
  "Klein beginnen mag. Als je maar begint.",
  "Trots op jezelf beginnen is nog belangrijker dan trots op jezelf eindigen.",
  "Een goede dag begint met 1 taak afkrijgen. Welke wordt het eerst?",
  "Je bent verder dan je denkt. Ga zo door!",
  "Niet alles hoeft vandaag - wel iets. Dat is genoeg.",
  "Doorzetten is stiekem de helft van het werk. Je doet het al.",
  "Vandaag hoef je alleen maar te beginnen, de rest komt vanzelf.",
  "Je hersenen groeien juist van dingen die nog lastig voelen. Mooi bezig.",
  "Even diep ademhalen, dan gewoon starten. Het went snel.",
  "Iedere afgevinkte taak is een overwinning, hoe klein ook.",
  "Je bent geen robot - pauzes horen erbij. Maar eerst: aan de slag!",
  "Wat je vandaag doet, telt op voor later. Elk beetje helpt.",
  "Je hoeft het niet alleen te doen - vraag gerust hulp als iets lastig is.",
  "Fouten maken hoort bij leren. Ga vooral gewoon proberen.",
  "Een frisse start, een frisse dag. Wat pak je als eerste op?",
];

/** Dag-van-het-jaar (1-366), lokale tijd. */
function dagVanJaar(datum: Date) {
  const start = new Date(datum.getFullYear(), 0, 0);
  const verschilMs = datum.getTime() - start.getTime();
  return Math.floor(verschilMs / 86400000);
}

export function kiesDagelijkseMotivatie(datum: Date = new Date()): string {
  const index = dagVanJaar(datum) % MOTIVATIETEKSTEN.length;
  return MOTIVATIETEKSTEN[index]!;
}
