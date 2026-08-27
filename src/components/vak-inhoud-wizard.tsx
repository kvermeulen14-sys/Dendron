"use client";

import { useRef, useState, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import {
  analyseerKennisbankBestand,
  bevestigKennisbankBestand,
  type KennisbankVoorstel,
} from "@/lib/actions/kennis-bron-import";

type VerwerkResultaat =
  | { error: string }
  | { overgeslagen: true; reden: string }
  | {
      paragraafId: string;
      titel?: string;
      aantalOnderdelen?: number;
      aantalOefenvragen?: number;
      oefenvragenFout?: string | null;
      contextOpgeslagen?: boolean;
      aantalWoordenlijsten?: number;
      aantalWoorden?: number;
    };

interface WizardItem {
  id: string;
  bestandsnaam: string;
  status: "analyseren" | "voorstel" | "verwerken" | "klaar" | "fout";
  ruweTekst?: string;
  hoofdstuk: string;
  paragraafId: string;
  titel?: string;
  isWoordenlijst?: boolean;
  fout?: string;
  resultaat?: VerwerkResultaat;
}

let volgendeId = 0;

/**
 * Multi-bestand kennisbank-wizard: in tegenstelling tot de oude, enkelvoudige
 * flow (1 bestand + vooraf zelf een paragraafnummer intypen) leest dit
 * meerdere bestanden tegelijk in en laat de AI per bestand EERST een
 * indeling voorstellen (hoofdstuk/paragraafnummer/titel) - de ouder houdt zo
 * de regie: bevestig het voorstel of pas het aan voor het echt wordt
 * opgeslagen. Elk bestand doorloopt zelfstandig analyseren -> voorstel ->
 * bevestigen, zodat een fout bij 1 bestand de rest niet blokkeert.
 */
export function VakInhoudWizard({ subjectId }: { subjectId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<WizardItem[]>([]);
  const [tekst, setTekst] = useState("");
  const [slepen, setSlepen] = useState(false);

  function patchItem(id: string, patch: Partial<WizardItem>) {
    setItems((huidig) => huidig.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  async function analyseer(id: string, file: File | null, tekstInvoer: string) {
    const formData = new FormData();
    formData.append("subjectId", subjectId);
    if (file) formData.append("file", file);
    if (tekstInvoer) formData.append("tekst", tekstInvoer);

    const res = await analyseerKennisbankBestand(formData);
    if ("error" in res) {
      patchItem(id, { status: "fout", fout: res.error });
      return;
    }
    const v: KennisbankVoorstel = res.voorstel;
    patchItem(id, {
      status: "voorstel",
      ruweTekst: res.ruweTekst,
      bestandsnaam: res.bestandsnaam,
      hoofdstuk: v.hoofdstuk,
      paragraafId: v.paragraafId,
      titel: v.titel,
      isWoordenlijst: v.isWoordenlijst,
    });
  }

  function voegToe(file: File | null, tekstInvoer: string) {
    const id = `item-${volgendeId++}`;
    const bestandsnaam = file?.name || "geplakte-tekst.txt";
    setItems((huidig) => [
      ...huidig,
      { id, bestandsnaam, status: "analyseren", hoofdstuk: "", paragraafId: "" },
    ]);
    void analyseer(id, file, tekstInvoer);
  }

  function voegBestandenToe(bestanden: FileList | File[]) {
    for (const f of Array.from(bestanden)) voegToe(f, "");
  }

  async function bevestig(item: WizardItem) {
    if (!item.ruweTekst) return;
    patchItem(item.id, { status: "verwerken" });
    const res = (await bevestigKennisbankBestand(
      subjectId,
      item.ruweTekst,
      item.bestandsnaam,
      item.hoofdstuk,
      item.paragraafId
    )) as VerwerkResultaat;
    patchItem(item.id, { status: "klaar", resultaat: res });
    router.refresh();
  }

  function verwijderItem(id: string) {
    setItems((huidig) => huidig.filter((it) => it.id !== id));
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-start gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-50 text-accent-600">
          <Icon name="sparkles" size={18} />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">Lesstof toevoegen</p>
          <p className="text-xs text-slate-500">
            Sleep 1 of meerdere bestanden hierheen (foto, PDF, tekst/markdown) - de AI stelt per bestand een indeling
            voor (hoofdstuk/paragraaf), die je hieronder kunt controleren en aanpassen voor het wordt opgeslagen.
            Alles komt als concept binnen, publiceren doe je verderop.
          </p>
        </div>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setSlepen(true);
        }}
        onDragLeave={() => setSlepen(false)}
        onDrop={(e: DragEvent<HTMLDivElement>) => {
          e.preventDefault();
          setSlepen(false);
          if (e.dataTransfer.files?.length) voegBestandenToe(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className={clsx(
          "flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed p-5 text-center transition-colors",
          slepen ? "border-accent-400 bg-accent-50" : "border-slate-200 bg-slate-50 hover:bg-slate-100"
        )}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="application/pdf,image/jpeg,image/png,image/webp,.md,.markdown,text/markdown,text/plain"
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) voegBestandenToe(e.target.files);
            e.target.value = "";
          }}
        />
        <Icon name="upload" size={20} className="text-accent-500" />
        <p className="text-sm font-medium text-slate-700">Sleep bestanden hierheen, of klik om te kiezen</p>
      </div>

      <div className="flex items-center gap-2 text-xs text-slate-400">
        <span className="h-px flex-1 bg-slate-100" />
        of plak tekst
        <span className="h-px flex-1 bg-slate-100" />
      </div>

      <div className="flex gap-2">
        <textarea
          value={tekst}
          onChange={(e) => setTekst(e.target.value)}
          rows={2}
          placeholder="Plak hier woordenlijst, grammatica-uitleg of oefenvragen als je geen bestand hebt"
          className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100"
        />
        <Button
          size="md"
          variant="secondary"
          disabled={!tekst.trim()}
          onClick={() => {
            voegToe(null, tekst.trim());
            setTekst("");
          }}
        >
          Toevoegen
        </Button>
      </div>

      {items.length > 0 && (
        <div className="flex flex-col gap-2.5 border-t border-slate-100 pt-3">
          {items.map((item) => (
            <div key={item.id} className="rounded-xl border border-slate-200 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="min-w-0 truncate text-sm font-medium text-slate-800">{item.bestandsnaam}</p>
                {item.status !== "verwerken" && (
                  <button
                    onClick={() => verwijderItem(item.id)}
                    aria-label="Verwijderen"
                    className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-rose-600"
                  >
                    <Icon name="trash" size={13} />
                  </button>
                )}
              </div>

              {item.status === "analyseren" && (
                <p className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-400">
                  <Icon name="loader" size={12} className="animate-spin" />
                  Bestand wordt gelezen en een indeling voorgesteld...
                </p>
              )}

              {item.status === "fout" && <p className="mt-1.5 text-xs text-rose-600">{item.fout}</p>}

              {(item.status === "voorstel" || item.status === "verwerken") && (
                <div className="mt-2 flex flex-col gap-2">
                  {item.isWoordenlijst !== undefined && (
                    <p className="text-xs text-slate-400">
                      Voorstel: {item.titel}
                      {item.isWoordenlijst && " - hoofdzakelijk een woordenlijst"}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <div className="min-w-[160px] flex-1">
                      <label className="mb-1 block text-[11px] font-medium text-slate-500">Hoofdstuk/unit</label>
                      <input
                        value={item.hoofdstuk}
                        onChange={(e) => patchItem(item.id, { hoofdstuk: e.target.value })}
                        disabled={item.status === "verwerken"}
                        className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100 disabled:opacity-50"
                      />
                    </div>
                    <div className="w-28">
                      <label className="mb-1 block text-[11px] font-medium text-slate-500">Paragraaf/les</label>
                      <input
                        value={item.paragraafId}
                        onChange={(e) => patchItem(item.id, { paragraafId: e.target.value })}
                        disabled={item.status === "verwerken"}
                        className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100 disabled:opacity-50"
                      />
                    </div>
                  </div>
                  <Button size="md" loading={item.status === "verwerken"} disabled={!item.paragraafId.trim()} onClick={() => bevestig(item)}>
                    Bevestigen en verwerken
                  </Button>
                </div>
              )}

              {item.status === "klaar" && item.resultaat && "overgeslagen" in item.resultaat && (
                <p className="mt-1.5 rounded-lg bg-amber-50 p-2 text-xs text-amber-800">{item.resultaat.reden}</p>
              )}
              {item.status === "klaar" && item.resultaat && "error" in item.resultaat && (
                <p className="mt-1.5 text-xs text-rose-600">{item.resultaat.error}</p>
              )}
              {item.status === "klaar" &&
                item.resultaat &&
                !("overgeslagen" in item.resultaat) &&
                !("error" in item.resultaat) && (
                  <div className="mt-1.5 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-2">
                    <Icon name="sparkles" size={14} className="mt-0.5 shrink-0 text-emerald-600" />
                    <div className="text-xs text-emerald-800">
                      <p className="font-semibold">
                        Verwerkt voor paragraaf {item.resultaat.paragraafId}
                        {item.resultaat.titel ? ` - ${item.resultaat.titel}` : ""}
                      </p>
                      <p className="mt-0.5">
                        {[
                          item.resultaat.aantalOnderdelen ? `${item.resultaat.aantalOnderdelen} kennisonderdeel/-onderdelen` : null,
                          item.resultaat.aantalWoordenlijsten
                            ? `${item.resultaat.aantalWoordenlijsten} woordenlijst(en) (${item.resultaat.aantalWoorden ?? 0} woorden)`
                            : null,
                          item.resultaat.aantalOefenvragen ? `${item.resultaat.aantalOefenvragen} oefenvragen` : null,
                          item.resultaat.contextOpgeslagen ? "paragraafinfo" : null,
                        ]
                          .filter(Boolean)
                          .join(", ") || "niets specifieks herkend - controleer hieronder of dit klopt"}
                      </p>
                      {item.resultaat.oefenvragenFout && (
                        <p className="mt-1 text-amber-700">Oefenbank ophalen mislukt: {item.resultaat.oefenvragenFout}</p>
                      )}
                    </div>
                  </div>
                )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
