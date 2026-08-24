"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Icon } from "@/components/icon";
import { TekstOfBestandInvoer } from "@/components/tekst-of-bestand-invoer";
import { JAAR_EVENT_META } from "@/lib/jaarkalender";
import { maakJaarEventsBulk } from "@/lib/actions/jaar-events";
import type { JaarEventType } from "@/lib/types";

interface Regel {
  titel: string;
  type: JaarEventType;
  start: string;
  eind: string;
}

export function JaarkalenderAIImport() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [bezig, setBezig] = useState(false);
  const [regels, setRegels] = useState<Regel[] | null>(null);
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
      const res = await fetch("/api/jaarkalender-upload", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Verwerken mislukt.");
      setRegels(data.periodes);
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
    setBezig(true);
    setError(null);
    try {
      const res = await maakJaarEventsBulk(regels);
      if (res.error) {
        setError(res.error);
        return;
      }
      setOpen(false);
      reset();
      router.refresh();
    } catch (e) {
      // Gebeurt vooral als de pagina al open stond vóór een nieuwe deploy -
      // de server kent de actie dan niet meer. De echte foutmelding erbij
      // tonen (i.p.v. alleen de generieke tekst) maakt dat duidelijker.
      const detail = e instanceof Error && e.message ? ` (${e.message})` : "";
      setError(`Opslaan is mislukt.${detail} Ververs de pagina en probeer het opnieuw.`);
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
        Invoeren met AI
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title="Vakanties/toetsweken invoeren" maxWidthClass="max-w-2xl">
        {!regels ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-slate-500">
              Plak een schoolkalender/jaarplanning als tekst, of upload een screenshot ervan. De AI
              herkent de periodes; je controleert en past ze hierna aan voordat ze worden opgeslagen.
            </p>
            <TekstOfBestandInvoer
              bezig={bezig}
              placeholder="bijv. Herfstvakantie 19-10-2026 t/m 27-10-2026, Toetsweek 1 vanaf 8 december..."
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
            <p className="text-sm font-medium text-slate-700">Controleer of dit klopt voordat je opslaat:</p>
            {regels.length === 0 && <p className="text-sm text-slate-500">Niets herkend. Probeer het opnieuw.</p>}
            <div className="flex flex-col gap-2">
              {regels.map((regel, i) => (
                <div key={i} className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-1.5">
                  <input
                    value={regel.titel}
                    onChange={(e) => bijwerken(i, "titel", e.target.value)}
                    className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
                  />
                  <select
                    value={regel.type}
                    onChange={(e) => bijwerken(i, "type", e.target.value)}
                    className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
                  >
                    {(Object.keys(JAAR_EVENT_META) as JaarEventType[]).map((t) => (
                      <option key={t} value={t}>
                        {JAAR_EVENT_META[t].label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="date"
                    value={regel.start}
                    onChange={(e) => bijwerken(i, "start", e.target.value)}
                    className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
                  />
                  <input
                    type="date"
                    value={regel.eind}
                    onChange={(e) => bijwerken(i, "eind", e.target.value)}
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
    </>
  );
}
