// Kleine, deterministische woordkeuze (geseed op een stabiel id, bv. het
// item-id) zodat dezelfde taak altijd hetzelfde label toont binnen 1 sessie,
// maar verschillende taken niet allemaal hetzelfde "Klaar melden" tonen -
// dat maakt afvinken net iets leuker zonder willekeurig te flikkeren bij
// elke re-render.
const KLAAR_LABELS = ["Klaar!", "Voor elkaar!", "Gefixt!", "Geregeld!", "Gelukt!", "Toppie, klaar!"];
const VIER_TEKSTEN = ["Goed gedaan!", "Mooi zo!", "Lekker bezig!", "Yes, geregeld!", "Knap gedaan!"];

function kiesUitPool(seed: string, pool: string[], startWaarde: number) {
  let hash = startWaarde;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return pool[hash % pool.length];
}

export function kiesKlaarLabel(seed: string) {
  return kiesUitPool(seed, KLAAR_LABELS, 7);
}

export function kiesVierTekst(seed: string) {
  return kiesUitPool(seed, VIER_TEKSTEN, 13);
}
