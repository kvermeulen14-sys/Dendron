/**
 * Herkent welk vak bij een vrije-tekst titel hoort (bv. een roosterregel
 * "Engelse taal" of "wetenschap en technologie") door de titel te
 * vergelijken met de namen van de bestaande vakken van het gezin. Puur
 * tekstueel, geen AI - snel genoeg om bij elke invoer/import live te
 * gebruiken, en voorzichtig genoeg (alleen bij een duidelijke match) om niet
 * per ongeluk het verkeerde vak te koppelen.
 */

const COMBINING_DIACRITICS = new RegExp("[\\u0300-\\u036f]", "g");

function normaliseer(tekst: string): string {
  return tekst
    .toLowerCase()
    .normalize("NFD")
    .replace(COMBINING_DIACRITICS, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Nederlandse taalvakken staan op een rooster vaak als bijvoeglijk naamwoord
// ("Engelse taal") terwijl het vak zelf als zelfstandig naamwoord heet
// ("Engels") - dat scheelt precies de laatste "e" plus dit achtervoegsel.
const STRIP_SUFFIXEN = [" taal"];

const MIN_PREFIX_LENGTE = 4;

export function vindSubjectVoorTitel<T extends { id: string; name: string }>(
  titel: string,
  subjects: T[]
): string | null {
  const genormTitel = normaliseer(titel);
  if (!genormTitel || subjects.length === 0) return null;

  let titelKaal = genormTitel;
  for (const suffix of STRIP_SUFFIXEN) {
    if (titelKaal.endsWith(suffix)) titelKaal = titelKaal.slice(0, -suffix.length).trim();
  }
  const eersteWoordTitel = titelKaal.split(" ")[0] ?? "";

  // 1. Exacte match (met of zonder "taal"-achtervoegsel).
  for (const s of subjects) {
    const genormNaam = normaliseer(s.name);
    if (!genormNaam) continue;
    if (genormTitel === genormNaam || titelKaal === genormNaam) return s.id;
  }

  // 2. De een is het begin van de ander (bv. "engelse" / "engels").
  for (const s of subjects) {
    const genormNaam = normaliseer(s.name);
    if (genormNaam.length < MIN_PREFIX_LENGTE || titelKaal.length < MIN_PREFIX_LENGTE) continue;
    if (titelKaal.startsWith(genormNaam) || genormNaam.startsWith(titelKaal)) return s.id;
  }

  // 3. Zelfde eerste woord (bv. "beeldende vakken" / "beeldende vorming").
  for (const s of subjects) {
    const eersteWoordNaam = normaliseer(s.name).split(" ")[0] ?? "";
    if (eersteWoordNaam.length < MIN_PREFIX_LENGTE || eersteWoordTitel.length < MIN_PREFIX_LENGTE) continue;
    if (eersteWoordTitel === eersteWoordNaam) return s.id;
  }

  return null;
}
