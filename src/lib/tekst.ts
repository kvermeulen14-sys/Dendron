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

const LATEX_COMMANDO_VERVANGINGEN: [RegExp, string][] = [
  [/\\times/g, "×"],
  [/\\cdot/g, "·"],
  [/\\div/g, "÷"],
  [/\\pm/g, "±"],
  [/\\leq/g, "≤"],
  [/\\geq/g, "≥"],
  [/\\neq/g, "≠"],
  [/\\approx/g, "≈"],
  [/\\infty/g, "∞"],
  [/\\pi/g, "π"],
];

/**
 * Vangnet tegen LaTeX-restjes in een AI-antwoord (bv. "$6 \times 7$" of
 * "\frac{2}{3}") - de systeemprompt verbiedt dit al expliciet, maar een taalmodel
 * volgt zo'n schrijfregel niet altijd 100% betrouwbaar op. Zet de meest
 * voorkomende LaTeX-notatie alsnog om naar leesbare tekst, zodat een leerling
 * nooit rare backslashes/dollartekens te zien krijgt. Geen volledige
 * LaTeX-parser - puur een pragmatische laatste correctie, geen vervanging
 * van de instructie zelf.
 */
export function saneerLatexNotatie(tekst: string): string {
  let resultaat = tekst;

  // De app heeft een eigen visueel breuk-blok voor "echte" breuken - dit is
  // puur de vangnet-omzetting voor als het model daar toch per ongeluk
  // \frac voor gebruikt i.p.v. dat blok.
  resultaat = resultaat.replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, "$1/$2");
  resultaat = resultaat.replace(/\\sqrt\{([^{}]+)\}/g, "√($1)");
  resultaat = resultaat.replace(/\\sqrt(\d)/g, "√$1");

  for (const [patroon, vervanging] of LATEX_COMMANDO_VERVANGINGEN) {
    resultaat = resultaat.replace(patroon, vervanging);
  }

  // Machten met accolades (^{23}) - de variant zonder accolades (^23) gaat
  // hieronder mee met normaliseerWiskundeNotatie.
  resultaat = resultaat.replace(/\^\{(-?\d+)\}/g, (_, exponent: string) =>
    [...(exponent as string)].map((c) => SUPERSCRIPT_CIJFERS[c] ?? c).join("")
  );
  resultaat = normaliseerWiskundeNotatie(resultaat);

  // De inhoud tussen dollartekens is hierboven al zoveel mogelijk omgezet -
  // de dollartekens zelf mogen dan gewoon weg (eerst $$...$$, dan losse $...$).
  resultaat = resultaat.replace(/\$\$([^$]+)\$\$/g, "$1");
  resultaat = resultaat.replace(/\$([^$\n]+)\$/g, "$1");

  return resultaat;
}
