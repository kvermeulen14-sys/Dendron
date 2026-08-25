/**
 * Korte weergave van een vak - de handmatig ingestelde code (Vakken-CMS) als
 * die er is, anders automatisch afgeleid uit de naam. Gebruikt waar een vak
 * gekoppeld getoond wordt maar de volledige naam te veel ruimte inneemt (en
 * bij een lange titel voor lay-out-problemen zorgt, zie rooster-beheer).
 */
export function vakAfkorting(subject: { code: string | null; name: string }): string {
  if (subject.code) return subject.code;

  const woorden = subject.name.trim().split(/\s+/).filter(Boolean);
  if (woorden.length === 0) return "";
  if (woorden.length >= 2) {
    return woorden
      .slice(0, 3)
      .map((w) => w[0]!.toUpperCase())
      .join("");
  }
  return woorden[0]!.slice(0, 3).toUpperCase();
}
