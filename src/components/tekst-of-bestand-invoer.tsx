"use client";

import { useRef, useState } from "react";
import clsx from "clsx";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icon";

export function TekstOfBestandInvoer({
  bezig,
  onVerstuurTekst,
  onVerstuurBestand,
  placeholder,
}: {
  bezig: boolean;
  onVerstuurTekst: (tekst: string) => void;
  onVerstuurBestand: (file: File) => void;
  placeholder?: string;
}) {
  const [modus, setModus] = useState<"tekst" | "foto">("tekst");
  const [tekst, setTekst] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setModus("tekst")}
          className={clsx(
            "rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors",
            modus === "tekst" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-600 hover:bg-slate-50"
          )}
        >
          Tekst plakken
        </button>
        <button
          type="button"
          onClick={() => setModus("foto")}
          className={clsx(
            "rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors",
            modus === "foto" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-600 hover:bg-slate-50"
          )}
        >
          Screenshot/foto
        </button>
      </div>

      {modus === "tekst" ? (
        <>
          <textarea
            value={tekst}
            onChange={(e) => setTekst(e.target.value)}
            rows={6}
            placeholder={placeholder}
            className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100"
          />
          <Button loading={bezig} disabled={!tekst.trim()} onClick={() => onVerstuurTekst(tekst)}>
            {bezig ? "Bezig..." : "Herkennen met AI"}
          </Button>
        </>
      ) : (
        <>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onVerstuurBestand(file);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            disabled={bezig}
            onClick={() => inputRef.current?.click()}
            className="flex min-h-[120px] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 text-center hover:bg-slate-100 disabled:opacity-60"
          >
            <Icon name={bezig ? "sparkles" : "image"} size={22} className={clsx("text-accent-600", bezig && "animate-pulse")} />
            <span className="text-sm font-medium text-slate-700">
              {bezig ? "Herkennen met AI..." : "Klik om een screenshot of foto te kiezen"}
            </span>
          </button>
        </>
      )}
    </div>
  );
}
