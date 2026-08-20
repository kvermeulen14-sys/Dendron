"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/icon";
import { maakRoosterItemsBulk } from "@/lib/actions/rooster";
import type { RoosterPeriode } from "@/lib/types";

const DAGEN = [
  { value: 1, label: "Maandag" },
  { value: 2, label: "Dinsdag" },
  { value: 3, label: "Woensdag" },
  { value: 4, label: "Donderdag" },
  { value: 5, label: "Vrijdag" },
  { value: 6, label: "Zaterdag" },
  { value: 7, label: "Zondag" },
];

interface Regel {
  dagVanWeek: number;
  startTijd: string;
  eindTijd: string;
  titel: string;
}

export function SomTodayUploader({ periodes }: { periodes: RoosterPeriode[] }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [slepen, setSlepen] = useState(false);
  const [bezig, setBezig] = useState(false);
  const [regels, setRegels] = useState<Regel[] | null>(null);
  const [periodeId, setPeriodeId] = useState(periodes[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [opgeslagen, setOpgeslagen] = useState<number | null>(null);

  async function verwerkBestand(file: File) {
    setError(null);
    setOpgeslagen(null);
    setBezig(true);
    setRegels(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/rooster-upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Verwerken mislukt.");
      setRegels(data.regels);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verwerken mislukt.");
    } finally {
      setBezig(false);
    }
  }

  function bijwerken(index: number, veld: keyof Regel, waarde: string) {
    setRegels((prev) =>
      prev ? prev.map((r, i) => (i === index ? { ...r, [veld]: veld === "dagVanWeek" ? Number(waarde) : waarde } : r)) : prev
    );
  }

  function verwijderRegel(index: number) {
    setRegels((prev) => (prev ? prev.filter((_, i) => i !== index) : prev));
  }

  function voegRegelToe() {
    setRegels((prev) => [...(prev ?? []), { dagVanWeek: 1, startTijd: "", eindTijd: "", titel: "" }]);
  }

  async function opslaan() {
    if (!regels || !periodeId) return;
    setError(null);
    setBezig(true);
    const res = await maakRoosterItemsBulk(periodeId, regels);
    setBezig(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setOpgeslagen(res.aantal ?? 0);
    setRegels(null);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      {!regels && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setSlepen(true);
          }}
          onDragLeave={() => setSlepen(false)}
          onDrop={(e) => {
            e.preventDefault();
            setSlepen(false);
            const file = e.dataTransfer.files?.[0];
            if (file) verwerkBestand(file);
          }}
          onClick={() => !bezig && inputRef.current?.click()}
          className={clsx(
            "flex min-h-[160px] cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-6 text-center transition-colors",
            slepen ? "border-blue-400 bg-blue-50" : "border-slate-200 bg-slate-50 hover:bg-slate-100"
          )}
        >
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) verwerkBestand(file);
              e.target.value = "";
            }}
          />
          {bezig ? (
            <>
              <Icon name="sparkles" size={22} className="animate-pulse text-blue-600" />
              <p className="text-sm font-medium text-slate-700">Rooster herkennen...</p>
            </>
          ) : (
            <>
              <Icon name="image" size={22} className="text-blue-600" />
              <p className="text-sm font-medium text-slate-700">
                Sleep een screenshot van je rooster (bijv. uit SomToday) hierheen, of klik om te kiezen
              </p>
              <p className="text-xs text-slate-400">Je kunt het resultaat hierna controleren en aanpassen.</p>
            </>
          )}
        </div>
      )}

      {error && <p className="text-sm text-rose-600">{error}</p>}
      {opgeslagen !== null && (
        <p className="text-sm text-emerald-600">{opgeslagen} lesu(u)r(en) toegevoegd aan het rooster.</p>
      )}

      {regels && (
        <Card>
          <p className="mb-3 text-sm font-medium text-slate-700">
            Controleer of dit klopt voordat je het opslaat:
          </p>
          <div className="flex flex-col gap-2">
            {regels.map((regel, i) => (
              <div key={i} className="grid grid-cols-[1fr_auto_auto_1fr_auto] items-center gap-1.5">
                <select
                  value={regel.dagVanWeek}
                  onChange={(e) => bijwerken(i, "dagVanWeek", e.target.value)}
                  className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
                >
                  {DAGEN.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
                <input
                  type="time"
                  value={regel.startTijd}
                  onChange={(e) => bijwerken(i, "startTijd", e.target.value)}
                  className="w-24 rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
                />
                <input
                  type="time"
                  value={regel.eindTijd}
                  onChange={(e) => bijwerken(i, "eindTijd", e.target.value)}
                  className="w-24 rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
                />
                <input
                  value={regel.titel}
                  onChange={(e) => bijwerken(i, "titel", e.target.value)}
                  placeholder="Vak"
                  className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
                />
                <button
                  onClick={() => verwijderRegel(i)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                  aria-label="Regel verwijderen"
                >
                  <Icon name="trash" size={14} />
                </button>
              </div>
            ))}
          </div>

          <button
            onClick={voegRegelToe}
            className="mt-2 flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline"
          >
            <Icon name="plus" size={12} /> Regel toevoegen
          </button>

          <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-slate-100 pt-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Opslaan in periode</label>
              <select
                value={periodeId}
                onChange={(e) => setPeriodeId(e.target.value)}
                className="rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              >
                {periodes.length === 0 && <option value="">Maak eerst een periode aan</option>}
                {periodes.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.naam}
                  </option>
                ))}
              </select>
            </div>
            <Button disabled={bezig || !periodeId} onClick={opslaan}>
              {bezig ? "Bezig..." : "Opslaan in rooster"}
            </Button>
            <Button variant="secondary" type="button" onClick={() => setRegels(null)}>
              Annuleren
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
