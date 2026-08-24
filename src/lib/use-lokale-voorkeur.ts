"use client";

import { useSyncExternalStore } from "react";

/**
 * Een voorkeur die per apparaat onthouden wordt (localStorage), zonder de
 * "setState in een effect"-valkuil: de server en de eerste client-render
 * geven allebei de standaardwaarde terug, en pas na hydratie synct dit naar
 * de echte, opgeslagen waarde - zelfde patroon als de weekend-voorkeur in de
 * agenda.
 */
export function useLokaleVoorkeur<T>(sleutel: string, standaard: T, parse: (ruw: string) => T | null) {
  function abonneer(callback: () => void) {
    window.addEventListener("storage", callback);
    return () => window.removeEventListener("storage", callback);
  }

  function lees(): T {
    try {
      const ruw = window.localStorage.getItem(sleutel);
      if (ruw === null) return standaard;
      return parse(ruw) ?? standaard;
    } catch {
      return standaard;
    }
  }

  const waarde = useSyncExternalStore(abonneer, lees, () => standaard);

  function schrijf(nieuw: T) {
    try {
      window.localStorage.setItem(sleutel, String(nieuw));
    } catch {
      // localStorage kan geblokkeerd zijn (privémodus e.d.) - dan blijft de voorkeur gewoon voor deze sessie gelden.
    }
    // "storage" vuurt alleen in andere tabs, dus hier ook zelf een render forceren.
    window.dispatchEvent(new Event("storage"));
  }

  return [waarde, schrijf] as const;
}
