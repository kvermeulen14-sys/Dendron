/**
 * Elk vak krijgt een eigen, stabiele kleur voor het icoontje in rooster en
 * agenda - net als in de meeste schoolplanners (elk vak heeft altijd
 * dezelfde kleur, zodat je 'm in 1 oogopslag herkent). Er is geen kleur-veld
 * in de vakken-CMS, dus deze wordt afgeleid uit het vak-id: hetzelfde vak
 * geeft altijd dezelfde kleur, zonder dat er iets opgeslagen hoeft te worden.
 */
const PALET: { bg: string; text: string }[] = [
  { bg: "bg-violet-100", text: "text-violet-600" },
  { bg: "bg-emerald-100", text: "text-emerald-600" },
  { bg: "bg-rose-100", text: "text-rose-600" },
  { bg: "bg-sky-100", text: "text-sky-600" },
  { bg: "bg-amber-100", text: "text-amber-600" },
  { bg: "bg-teal-100", text: "text-teal-600" },
  { bg: "bg-orange-100", text: "text-orange-600" },
  { bg: "bg-fuchsia-100", text: "text-fuchsia-600" },
];

export function vakKleur(subjectId: string | null | undefined) {
  if (!subjectId) return { bg: "bg-slate-100", text: "text-slate-500" };
  let hash = 0;
  for (let i = 0; i < subjectId.length; i++) {
    hash = (hash * 31 + subjectId.charCodeAt(i)) >>> 0;
  }
  return PALET[hash % PALET.length];
}
