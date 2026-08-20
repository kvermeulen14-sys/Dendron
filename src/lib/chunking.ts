const MAX_CHUNK_LENGTE = 900;
const MAX_CHUNKS_PER_MATERIAAL = 40;

/**
 * Knipt een lange tekst op in kleinere, samenhangende stukken (op
 * alinea-grenzen) zodat de AI-vakdocent later alleen de relevante stukjes
 * hoeft op te halen in plaats van alle lesstof van een vak te lezen.
 */
export function maakChunks(tekst: string): string[] {
  const alineas = tekst
    .split(/\n{2,}/)
    .map((a) => a.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let huidig = "";

  for (const alinea of alineas) {
    const kandidaat = huidig ? `${huidig}\n\n${alinea}` : alinea;
    if (kandidaat.length > MAX_CHUNK_LENGTE && huidig) {
      chunks.push(huidig);
      huidig = alinea;
    } else {
      huidig = kandidaat;
    }

    // Een enkele (te) lange alinea alsnog hard opknippen.
    while (huidig.length > MAX_CHUNK_LENGTE * 1.5) {
      chunks.push(huidig.slice(0, MAX_CHUNK_LENGTE).trim());
      huidig = huidig.slice(MAX_CHUNK_LENGTE).trim();
    }
  }
  if (huidig) chunks.push(huidig);

  return chunks.slice(0, MAX_CHUNKS_PER_MATERIAAL);
}
