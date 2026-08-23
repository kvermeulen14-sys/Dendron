/**
 * Voegt losse regels/witruimte samen tot 1 vloeiende regel - voorkomt dat
 * een AI-antwoord dat bedoeld is als 1 korte zin (zoals een overhoorvraag)
 * halverwege een woord/macht raar afbreekt doordat remark-breaks elke
 * toevallige regelovergang omzet in een harde <br>.
 */
export function eenRegel(tekst: string) {
  return tekst.replace(/\s+/g, " ").trim();
}
