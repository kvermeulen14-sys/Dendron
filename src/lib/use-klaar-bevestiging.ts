"use client";

import { useState } from "react";

export type KlaarFase = "rust" | "bevestigen" | "vieren";

const VIER_DUUR_MS = 1600;

/**
 * Kleine state-machine voor het "klaar melden"-gevoel: eerst een korte
 * bevestiging (voorkomt per-ongeluk-afvinken), dan de echte actie, en
 * daarna kort een viering voordat het weer normaal oogt. Geen native
 * confirm() - dat past niet bij de rest van de app - maar een inline stap.
 */
export function useKlaarBevestiging() {
  const [fase, setFase] = useState<KlaarFase>("rust");
  const [bezig, setBezig] = useState(false);

  function vraagBevestiging() {
    setFase("bevestigen");
  }

  function annuleer() {
    setFase("rust");
  }

  function reset() {
    setFase("rust");
    setBezig(false);
  }

  async function bevestig(onKlaar: () => Promise<void> | void) {
    setBezig(true);
    await onKlaar();
    setBezig(false);
    setFase("vieren");
    setTimeout(() => setFase((f) => (f === "vieren" ? "rust" : f)), VIER_DUUR_MS);
  }

  return { fase, bezig, vraagBevestiging, annuleer, bevestig, reset };
}
