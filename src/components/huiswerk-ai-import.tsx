"use client";

import { forwardRef, useImperativeHandle, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Icon } from "@/components/icon";
import { TekstOfBestandInvoer } from "@/components/tekst-of-bestand-invoer";
import { maakHuiswerkItemsBulk } from "@/lib/actions/planning";
import type { Subject } from "@/lib/types";

export interface HuiswerkAIImportHandle {
  open: () => void;
}

interface RuweRegel {
  titel: string;
  vak?: string;
  datum: string;
  beschrijving?: string;
}

export interface Regel {
  titel: string;
  subjectId: string;
  datum: string;
  beschrijving: string;
}

function vindVakMatch(subjects: Subject[], vak?: string) {
  if (!vak) return "";
  const gevonden = subjects.find((s) => s.name.toLowerCase() === vak.toLowerCase() || vak.toLowerCase().includes(s.name.toLowerCase()));
  return gevonden?.id ?? "";
}

/**
 * Geen eigen zichtbare knop - wordt geopend via de ref, zodat de agenda dit
 * kan aanbieden als 1 van de opties achter de gedeelde "Nieuw item"-knop
 * i.p.v. een losse knop ernaast.
 */
export const HuiswerkAIImport = forwardRef<
  HuiswerkAIImportHandle,
  { subjects: Subject[]; /** Na succesvol opslaan, met de opgeslagen regels - bv. om meteen de planningscoach te openen. */ onOpgeslagen?: (regels: Regel[]) => void }
>(function HuiswerkAIImport({ subjects, onOpgeslagen }, ref) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [bezig, setBezig] = useState(false);
  const [regels, setRegels] = useState<Regel[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useImperativeHandle(ref, () => ({
    open: () => {
      reset();
      setOpen(true);
    },
  }));

  function reset() {
    setRegels(null);
    setError(null);
    setBezig(false);
  }

  async function verwerk(body: FormData) {
    setError(null);
    setBezig(true);
    try {
      const res = await fetch("/api/huiswerk-upload", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Verwerken mislukt.");
      const ruw: RuweRegel[] = data.items ?? [];
      setRegels(
        ruw.map((r) => ({
          titel: r.titel,
          subjectId: vindVakMatch(subjects, r.vak),
          datum: r.datum,
          beschrijving: r.beschrijving ?? "",
        }))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verwerken mislukt.");
    } finally {
      setBezig(false);
    }
  }

  function bijwerken(index: number, veld: keyof Regel, waarde: string) {
    setRegels((prev) => (prev ? prev.map((r, i) => (i === index ? { ...r, [veld]: waarde } : r)) : prev));
  }

  function verwijderRegel(index: number) {
    setRegels((prev) => (prev ? prev.filter((_, i) => i !== index) : prev));
  }

  async function opslaan() {
    if (!regels) return;
    setError(null);
    setBezig(true);
    try {
      const res = await maakHuiswerkItemsBulk(regels);
      if (res.error) {
        setError(res.error);
        return;
      }
      setOpen(false);
      onOpgeslagen?.(regels);
      reset();
      router.refresh();
    } catch {
      setError("Opslaan is mislukt. Probeer het nog eens.");
    } finally {
      setBezig(false);
    }
  }

  return (
      <Modal open={open} onClose={() => setOpen(false)} title="Huiswerk invoeren met AI" maxWidthClass="max-w-2xl">
        {!regels ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-slate-500">
              Plak het huiswerk als tekst (bijv. gekopieerd uit SomToday), of upload een foto/screenshot
              van je agenda of planner. Je controleert en past het hierna aan voordat het wordt opgeslagen.
            </p>
            <TekstOfBestandInvoer
              bezig={bezig}
              placeholder="bijv. Wiskunde: par 4.2 maken tegen morgen. Engels: woordjes hoofdstuk 3 leren voor vrijdag."
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
                <div key={i} className="rounded-xl border border-slate-200 p-2.5">
                  <div className="grid grid-cols-[1fr_auto] items-center gap-1.5">
                    <input
                      value={regel.titel}
                      onChange={(e) => bijwerken(i, "titel", e.target.value)}
                      placeholder="Titel"
                      className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
                    />
                    <button
                      onClick={() => verwijderRegel(i)}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                      aria-label="Verwijderen"
                    >
                      <Icon name="trash" size={14} />
                    </button>
                  </div>
                  <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                    <select
                      value={regel.subjectId}
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
                    <input
                      type="date"
                      value={regel.datum}
                      onChange={(e) => bijwerken(i, "datum", e.target.value)}
                      className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
                    />
                  </div>
                  <input
                    value={regel.beschrijving}
                    onChange={(e) => bijwerken(i, "beschrijving", e.target.value)}
                    placeholder="Toelichting (optioneel)"
                    className="mt-1.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
                  />
                </div>
              ))}
            </div>

            {error && <p className="text-sm text-rose-600">{error}</p>}

            <div className="flex gap-2 border-t border-slate-100 pt-3">
              <Button loading={bezig} disabled={regels.length === 0} onClick={opslaan}>
                {bezig ? "Bezig..." : "Opslaan"}
              </Button>
              <Button variant="secondary" type="button" onClick={reset}>
                Opnieuw
              </Button>
            </div>
          </div>
        )}
      </Modal>
  );
});
