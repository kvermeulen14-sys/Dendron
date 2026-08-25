"use client";

import { useState } from "react";

export type KlaarFase = "rust" | "bevestigen" | "duur" | "vieren";

const VIER_DUUR_MS = 1600;

/**
 * Kleine state-machine voor het "klaar melden"-gevoel: eerst een korte
 * bevestiging (voorkomt per-ongeluk-afvinken), dan de echte actie, en
 * daarna kort een viering voordat het weer normaal oogt. Geen native
 * confirm() - dat past niet bij de rest van de app - maar een inline stap.
 *
 * Optioneel zit er tussen de actie en de viering een stap "duur": een korte
 * terugblik op hoe lang het echt duurde. Dat is de enige manier om de
 * tijdsinschattingen na verloop van tijd realistisch te krijgen, en het is
 * bewust overslaanbaar - een verplichte vraag bij elk vinkje maakt afvinken
 * juist minder aantrekkelijk.
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

  function vier() {
    setFase("vieren");
    setTimeout(() => setFase((f) => (f === "vieren" ? "rust" : f)), VIER_DUUR_MS);
  }

  async function bevestig(onKlaar: () => Promise<void> | void, opties?: { vraagDuur?: boolean }) {
    setBezig(true);
    await onKlaar();
    setBezig(false);
    if (opties?.vraagDuur) {
      setFase("duur");
      return;
    }
    vier();
  }

  /** Duur-stap afronden, met of zonder antwoord. */
  async function meldDuur(opslaan?: () => Promise<void> | void) {
    if (opslaan) {
      setBezig(true);
      await opslaan();
      setBezig(false);
    }
    vier();
  }

  return { fase, bezig, vraagBevestiging, annuleer, bevestig, meldDuur, reset };
}
