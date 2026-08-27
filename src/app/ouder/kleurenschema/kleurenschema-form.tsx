"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icon";
import { updateThemeKleuren } from "@/lib/actions/gezin-instellingen";
import {
  KLEUR_CATEGORIE_LABELS,
  KLEUR_PRESETS,
  volledigeKleuren,
  hslNaarHex,
} from "@/lib/theme-kleuren";
import type { KleurCategorie, ThemeKleuren } from "@/lib/types";

const CATEGORIEEN = Object.keys(KLEUR_CATEGORIE_LABELS) as KleurCategorie[];

/** Zelfde iconen als elders per categorie gebruikt worden, zodat het
 * instelscherm meteen herkenbaar aansluit op de rest van de app. */
const CATEGORIE_ICOON: Record<KleurCategorie, string> = {
  accent: "sparkles",
  toets: "target",
  huiswerk: "pencil-line",
  leermoment: "brain",
  prive: "heart",
};

function presetKomtOvereen(kleuren: Record<KleurCategorie, { hue: number; sat: number }>, preset: ThemeKleuren) {
  return CATEGORIEEN.every((cat) => {
    const p = preset[cat];
    return p && p.hue === kleuren[cat].hue && p.sat === kleuren[cat].sat;
  });
}

export function KleurenschemaForm({ opgeslagenKleuren }: { opgeslagenKleuren: ThemeKleuren | null }) {
  const router = useRouter();
  const [kleuren, setKleuren] = useState(() => volledigeKleuren(opgeslagenKleuren));
  const [isPending, startTransition] = useTransition();
  const [foutmelding, setFoutmelding] = useState<string | null>(null);

  function pasCategorieAan(categorie: KleurCategorie, veld: "hue" | "sat", waarde: number) {
    setKleuren((huidig) => ({ ...huidig, [categorie]: { ...huidig[categorie], [veld]: waarde } }));
  }

  function kiesPreset(preset: ThemeKleuren) {
    setKleuren(volledigeKleuren(preset));
  }

  function slaOp() {
    setFoutmelding(null);
    startTransition(async () => {
      const res = await updateThemeKleuren(kleuren);
      if ("error" in res && res.error) {
        setFoutmelding(res.error);
        return;
      }
      router.refresh();
    });
  }

  function zetTerugNaarStandaard() {
    setFoutmelding(null);
    startTransition(async () => {
      const res = await updateThemeKleuren(null);
      if ("error" in res && res.error) {
        setFoutmelding(res.error);
        return;
      }
      setKleuren(volledigeKleuren(null));
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <h2 className="text-sm font-semibold text-slate-900">Snel kiezen</h2>
        <p className="mt-1 text-xs text-slate-500">Een kant-en-klaar schema, daarna nog verder aan te passen.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {Object.entries(KLEUR_PRESETS).map(([naam, preset]) => {
            const actief = presetKomtOvereen(kleuren, preset);
            return (
              <button
                key={naam}
                type="button"
                onClick={() => kiesPreset(preset)}
                className={clsx(
                  "flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-medium transition-colors",
                  actief
                    ? "border-accent-300 bg-accent-50 text-accent-700"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                )}
              >
                <span className="flex -space-x-1">
                  {CATEGORIEEN.map((cat) => (
                    <span
                      key={cat}
                      className="h-4 w-4 rounded-full ring-2 ring-white"
                      style={{ backgroundColor: hslNaarHex(preset[cat]!.hue, preset[cat]!.sat, 60) }}
                    />
                  ))}
                </span>
                {naam}
              </button>
            );
          })}
        </div>
      </Card>

      <Card className="flex flex-col gap-5">
        <h2 className="text-sm font-semibold text-slate-900">Per categorie aanpassen</h2>
        {CATEGORIEEN.map((categorie) => {
          const waarde = kleuren[categorie];
          const label = KLEUR_CATEGORIE_LABELS[categorie];
          const hex = hslNaarHex(waarde.hue, waarde.sat, 60);
          return (
            <div key={categorie} className="flex flex-col gap-2 border-t border-slate-100 pt-4 first:border-0 first:pt-0">
              <div className="flex items-center gap-3">
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl text-white"
                  style={{ backgroundColor: hex }}
                >
                  <Icon name={CATEGORIE_ICOON[categorie]} size={16} />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">{label.naam}</p>
                  <p className="truncate text-xs text-slate-500">{label.uitleg}</p>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
                  Tint
                  <input
                    type="range"
                    min={0}
                    max={359}
                    value={waarde.hue}
                    onChange={(e) => pasCategorieAan(categorie, "hue", Number(e.target.value))}
                    className="accent-slate-500"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
                  Verzadiging
                  <input
                    type="range"
                    min={10}
                    max={100}
                    value={waarde.sat}
                    onChange={(e) => pasCategorieAan(categorie, "sat", Number(e.target.value))}
                    className="accent-slate-500"
                  />
                </label>
              </div>
            </div>
          );
        })}
      </Card>

      <Card>
        <h2 className="text-sm font-semibold text-slate-900">Voorbeeld</h2>
        <p className="mt-1 text-xs text-slate-500">Zo ziet de vandaag-lijst van je kind eruit met dit schema.</p>
        <div className="mt-3 flex flex-col gap-2.5">
          {CATEGORIEEN.filter((c) => c !== "accent").map((categorie) => {
            const waarde = kleuren[categorie];
            const label = KLEUR_CATEGORIE_LABELS[categorie];
            return (
              <div
                key={categorie}
                className="flex items-center gap-3 rounded-[22px] p-4"
                style={{ backgroundColor: hslNaarHex(waarde.hue, waarde.sat, 94) }}
              >
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-white"
                  style={{ backgroundColor: hslNaarHex(waarde.hue, waarde.sat, 60) }}
                >
                  <Icon name={CATEGORIE_ICOON[categorie]} size={18} />
                </span>
                <p className="text-[15px] font-semibold text-slate-900">{label.naam} voorbeeld</p>
              </div>
            );
          })}
        </div>
      </Card>

      {foutmelding && <p className="text-sm font-medium text-rose-600">{foutmelding}</p>}

      <div className="flex items-center gap-3">
        <Button onClick={slaOp} loading={isPending} icon={<Icon name="check" size={16} />}>
          Opslaan
        </Button>
        <Button variant="ghost" onClick={zetTerugNaarStandaard} disabled={isPending}>
          Terug naar standaard
        </Button>
      </div>
    </div>
  );
}
