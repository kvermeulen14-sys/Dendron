"use client";

import { useRef, useState, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { verwerkKennisbankBestand } from "@/lib/actions/kennis-bron-import";

type Resultaat =
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

/**
 * Laagdrempelig invoerpunt voor de kennisbank: in tegenstelling tot de losse
 * .md-upload hierboven (die al een kant-en-klaar geëxporteerd bestand
 * verwacht) accepteert dit een foto, PDF, of zomaar geplakte tekst - de AI
 * doet zelf het structureringswerk (zie verwerkKennisbankBestand). Bewust
 * geen open eind-loze chat: 1 gerichte vraag (welke paragraaf/unit) vooraf
 * is genoeg om de bekende faalmodus ("geen paragraafnummer herkend") te
 * voorkomen, en houdt dit voorspelbaar en snel te bouwen/onderhouden.
 * Resultaat komt als 'concept' binnen - controle/publiceren blijft bij de
 * bestaande kennisonderdelen-lijst hieronder, hier wordt niets automatisch
 * zichtbaar voor de leerling.
 */
export function KennisbankWizard({ subjectId }: { subjectId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [paragraafHint, setParagraafHint] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [tekst, setTekst] = useState("");
  const [slepen, setSlepen] = useState(false);
  const [bezig, setBezig] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultaat, setResultaat] = useState<Resultaat | null>(null);

  function kiesBestand(f: File) {
    setFile(f);
    setTekst("");
    setResultaat(null);
    setError(null);
  }

  async function versturen() {
    setError(null);
    setResultaat(null);
    if (!paragraafHint.trim()) {
      setError("Vul eerst in voor welke paragraaf/unit dit is (bv '1.2' of gewoon '3').");
      return;
    }
    if (!file && !tekst.trim()) {
      setError("Upload een bestand of plak tekst hieronder.");
      return;
    }

    setBezig(true);
    const formData = new FormData();
    formData.append("subjectId", subjectId);
    formData.append("paragraafHint", paragraafHint.trim());
    if (file) formData.append("file", file);
    if (tekst.trim()) formData.append("tekst", tekst.trim());

    const res = (await verwerkKennisbankBestand(formData)) as Resultaat;
    setBezig(false);
    if ("error" in res) {
      setError(res.error);
      return;
    }
    setResultaat(res);
    setFile(null);
    setTekst("");
    router.refresh();
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
            Upload een foto, PDF of tekstbestand van de lesstof, of plak de tekst hieronder - de AI structureert het
            zelf. Alles komt als concept binnen, jij controleert en publiceert het verderop.
          </p>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">Voor welke paragraaf/unit is dit?</label>
        <input
          value={paragraafHint}
          onChange={(e) => setParagraafHint(e.target.value)}
          placeholder="bv. 1.2, of gewoon 3 bij units"
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100"
        />
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
          const f = e.dataTransfer.files?.[0];
          if (f) kiesBestand(f);
        }}
        onClick={() => !bezig && inputRef.current?.click()}
        className={clsx(
          "flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed p-5 text-center transition-colors",
          slepen ? "border-accent-400 bg-accent-50" : "border-slate-200 bg-slate-50 hover:bg-slate-100"
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp,.md,.markdown,text/markdown,text/plain"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) kiesBestand(f);
            e.target.value = "";
          }}
        />
        <Icon name="upload" size={20} className="text-accent-500" />
        <p className="text-sm font-medium text-slate-700">
          {file ? file.name : "Sleep een foto, PDF of tekstbestand hierheen, of klik om te kiezen"}
        </p>
      </div>

      <div className="flex items-center gap-2 text-xs text-slate-400">
        <span className="h-px flex-1 bg-slate-100" />
        of plak tekst
        <span className="h-px flex-1 bg-slate-100" />
      </div>

      <textarea
        value={tekst}
        onChange={(e) => {
          setTekst(e.target.value);
          if (e.target.value.trim()) setFile(null);
        }}
        rows={3}
        placeholder="Plak hier woordenlijst, grammatica-uitleg of oefenvragen als je geen bestand hebt"
        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100"
      />

      {error && <p className="text-sm text-rose-600">{error}</p>}

      {resultaat && "overgeslagen" in resultaat && (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{resultaat.reden}</p>
      )}

      {resultaat && !("overgeslagen" in resultaat) && !("error" in resultaat) && (
        <div className="flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
          <Icon name="sparkles" size={16} className="mt-0.5 shrink-0 text-emerald-600" />
          <div className="text-sm text-emerald-800">
            <p className="font-semibold">Verwerkt voor paragraaf {resultaat.paragraafId}{resultaat.titel ? ` - ${resultaat.titel}` : ""}</p>
            <p className="mt-0.5">
              {[
                resultaat.aantalOnderdelen ? `${resultaat.aantalOnderdelen} kennisonderdeel/-onderdelen` : null,
                resultaat.aantalWoordenlijsten
                  ? `${resultaat.aantalWoordenlijsten} woordenlijst(en) (${resultaat.aantalWoorden ?? 0} woorden)`
                  : null,
                resultaat.aantalOefenvragen ? `${resultaat.aantalOefenvragen} oefenvragen` : null,
                resultaat.contextOpgeslagen ? "paragraafinfo" : null,
              ]
                .filter(Boolean)
                .join(", ") || "niets specifieks herkend - controleer hieronder of dit klopt"}
            </p>
            {resultaat.oefenvragenFout && <p className="mt-1 text-amber-700">Oefenbank ophalen mislukt: {resultaat.oefenvragenFout}</p>}
            <p className="mt-1 text-emerald-700">Staat als concept - bekijk en publiceer hieronder.</p>
          </div>
        </div>
      )}

      <Button loading={bezig} disabled={!paragraafHint.trim() || (!file && !tekst.trim())} onClick={versturen}>
        {bezig ? "Bezig met verwerken..." : "Verwerken"}
      </Button>
    </div>
  );
}
