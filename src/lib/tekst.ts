/**
 * Voegt losse regels/witruimte samen tot 1 vloeiende regel - voorkomt dat
 * een AI-antwoord dat bedoeld is als 1 korte zin (zoals een overhoorvraag)
 * halverwege een woord/macht raar afbreekt doordat remark-breaks elke
 * toevallige regelovergang omzet in een harde <br>.
 */
export function eenRegel(tekst: string) {
  return tekst.replace(/\s+/g, " ").trim();
}

const SUPERSCRIPT_CIJFERS: Record<string, string> = {
  "0": "⁰",
  "1": "¹",
  "2": "²",
  "3": "³",
  "4": "⁴",
  "5": "⁵",
  "6": "⁶",
  "7": "⁷",
  "8": "⁸",
  "9": "⁹",
  "-": "⁻",
};

/**
 * Zet '^'-machtnotatie (bv. "x^23") om naar echte Unicode-superscripttekens
 * (x²³) voor weergave. Vangt kennisbank-tekst op die (bv. via een externe
 * import) nog met ^ is opgeslagen i.p.v. de notatie die de rest van de app
 * gebruikt - puur cosmetisch, wijzigt de opgeslagen data zelf niet.
 */
export function normaliseerWiskundeNotatie(tekst: string): string {
  return tekst.replace(/\^(-?\d+)/g, (_, exponent: string) =>
    [...(exponent as string)].map((c) => SUPERSCRIPT_CIJFERS[c] ?? c).join("")
  );
}
