"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { TijdSelect } from "@/components/ui/tijd-select";
import { Icon } from "@/components/icon";
import { TekstOfBestandInvoer } from "@/components/tekst-of-bestand-invoer";
import { maakRoosterItemsBulk } from "@/lib/actions/rooster";
import { vindSubjectVoorTitel } from "@/lib/vak-matching";
import type { RoosterPeriode, Subject } from "@/lib/types";

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
  subjectId: string | null;
}

export function SomTodayUploader({ periodes, subjects }: { periodes: RoosterPeriode[]; subjects: Subject[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [bezig, setBezig] = useState(false);
  const [regels, setRegels] = useState<Regel[] | null>(null);
  const [periodeId, setPeriodeId] = useState(periodes[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setRegels(null);
    setError(null);
    setBezig(false);
  }

  async function verwerk(body: FormData) {
    setError(null);
    setBezig(true);
    try {
      const res = await fetch("/api/rooster-upload", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Verwerken mislukt.");
      const regelsData: { dagVanWeek: number; startTijd: string; eindTijd: string; titel: string }[] = data.regels;
      setRegels(regelsData.map((r) => ({ ...r, subjectId: vindSubjectVoorTitel(r.titel, subjects) })));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verwerken mislukt.");
    } finally {
      setBezig(false);
    }
  }

  function bijwerken(index: number, veld: keyof Regel, waarde: string) {
    setRegels((prev) =>
      prev
        ? prev.map((r, i) =>
            i === index
              ? { ...r, [veld]: veld === "dagVanWeek" ? Number(waarde) : veld === "subjectId" ? waarde || null : waarde }
              : r
          )
        : prev
    );
  }

  function verwijderRegel(index: number) {
    setRegels((prev) => (prev ? prev.filter((_, i) => i !== index) : prev));
  }

  function voegRegelToe() {
    setRegels((prev) => [...(prev ?? []), { dagVanWeek: 1, startTijd: "", eindTijd: "", titel: "", subjectId: null }]);
  }

  async function opslaan() {
    if (!regels || !periodeId) return;
    setError(null);
    setBezig(true);
    try {
      const res = await maakRoosterItemsBulk(periodeId, regels);
      if (res.error) {
        setError(res.error);
        return;
      }
      setOpen(false);
      reset();
      router.refresh();
    } catch {
      setError("Opslaan is mislukt. Probeer het nog eens.");
    } finally {
      setBezig(false);
    }
  }

  return (
    <>
      <Button
        variant="secondary"
        icon={<Icon name="sparkles" size={18} />}
        onClick={() => {
          reset();
          setOpen(true);
        }}
      >
        Rooster uit screenshot
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title="Rooster herkennen uit screenshot" maxWidthClass="max-w-2xl">
        {!regels ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-slate-500">
              Upload een screenshot van je rooster (bijv. uit SomToday). Je kunt het resultaat hierna
              controleren en aanpassen voordat het wordt opgeslagen.
            </p>
            <TekstOfBestandInvoer
              bezig={bezig}
              placeholder="Plak hier de tekst van je rooster, bijv. gekopieerd uit SomToday"
              onVerstuurTekst={(tekst) => {
                const fd = new FormData();
                fd.append("text", tekst);
                verwerk(fd);
              }}
              onVerstuurBestand={(file) => {
                const fd = new FormData();
                fd.append("file", file);
                verwerk(fd);
              }}
            />
            {error && <p className="text-sm text-rose-600">{error}</p>}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm font-medium text-slate-700">Controleer of dit klopt voordat je het opslaat:</p>
            {regels.length === 0 && <p className="text-sm text-slate-500">Niets herkend. Probeer het opnieuw.</p>}
            <div className="flex flex-col gap-2">
              {regels.map((regel, i) => (
                <div key={i} className="grid grid-cols-[1fr_auto_auto_1fr_1fr_auto] items-center gap-1.5">
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
                  <TijdSelect
                    value={regel.startTijd}
                    onChange={(e) => bijwerken(i, "startTijd", e.target.value)}
                    placeholder=""
                    className="w-14 rounded-lg border border-slate-200 px-1.5 py-1.5 text-xs"
                  />
                  <TijdSelect
                    value={regel.eindTijd}
                    onChange={(e) => bijwerken(i, "eindTijd", e.target.value)}
                    placeholder=""
                    className="w-14 rounded-lg border border-slate-200 px-1.5 py-1.5 text-xs"
                  />
                  <input
                    value={regel.titel}
                    onChange={(e) => bijwerken(i, "titel", e.target.value)}
                    placeholder="Titel"
                    className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
                  />
                  <select
                    value={regel.subjectId ?? ""}
                    onChange={(e) => bijwerken(i, "subjectId", e.target.value)}
                    className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
                  >
                    <option value="">Geen specifiek vak</option>
                    {subjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.code ? `${s.code} - ${s.name}` : s.name}
                      </option>
                    ))}
                  </select>
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
              className="flex items-center gap-1 text-xs font-medium text-accent-600 hover:underline"
            >
              <Icon name="plus" size={12} /> Regel toevoegen
            </button>

            {error && <p className="text-sm text-rose-600">{error}</p>}

            <div className="flex flex-wrap items-end gap-3 border-t border-slate-100 pt-3">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Opslaan in periode</label>
                <select
                  value={periodeId}
                  onChange={(e) => setPeriodeId(e.target.value)}
                  className="rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100"
                >
                  {periodes.length === 0 && <option value="">Maak eerst een periode aan</option>}
                  {periodes.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.naam}
                    </option>
                  ))}
                </select>
              </div>
              <Button loading={bezig} disabled={!periodeId || regels.length === 0} onClick={opslaan}>
                {bezig ? "Bezig..." : "Opslaan in rooster"}
              </Button>
              <Button variant="secondary" type="button" onClick={reset}>
                Opnieuw
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
