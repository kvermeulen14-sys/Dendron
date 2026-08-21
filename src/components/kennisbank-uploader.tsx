"use client";

import { useRef, useState, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Icon } from "@/components/icon";

interface Resultaat {
  title: string;
  hoofdstuk: string | null;
  opdrachten: string | null;
}

export function KennisbankUploader({ subjectId }: { subjectId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [slepen, setSlepen] = useState(false);
  const [bezig, setBezig] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultaat, setResultaat] = useState<Resultaat | null>(null);

  async function verwerkBestand(file: File) {
    setError(null);
    setResultaat(null);
    setBezig(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("subjectId", subjectId);

      const res = await fetch("/api/materiaal-upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Verwerken mislukt.");

      setResultaat(data.material);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verwerken mislukt.");
    } finally {
      setBezig(false);
    }
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setSlepen(false);
    const file = e.dataTransfer.files?.[0];
    if (file) verwerkBestand(file);
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setSlepen(true);
        }}
        onDragLeave={() => setSlepen(false)}
        onDrop={handleDrop}
        onClick={() => !bezig && inputRef.current?.click()}
        className={clsx(
          "flex min-h-[220px] cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-8 text-center transition-colors",
          slepen ? "border-accent-400 bg-accent-50" : "border-slate-200 bg-slate-50 hover:bg-slate-100"
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp,application/json,.json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) verwerkBestand(file);
            e.target.value = "";
          }}
        />

        {bezig ? (
          <>
            <span className="flex h-12 w-12 animate-pulse items-center justify-center rounded-2xl bg-accent-100 text-accent-600">
              <Icon name="sparkles" size={24} />
            </span>
            <p className="text-sm font-medium text-slate-700">
              De AI leest het bestand en zet het om naar de kennisbank...
            </p>
            <p className="text-xs text-slate-400">Dit kan een paar tientallen seconden duren.</p>
          </>
        ) : (
          <>
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-100 text-accent-600">
              <Icon name="upload" size={24} />
            </span>
            <p className="text-sm font-medium text-slate-700">
              Sleep een PDF, foto of JSON-bestand van lesstof hierheen, of klik om te kiezen
            </p>
            <p className="text-xs text-slate-400">
              De AI herkent automatisch hoofdstuk- en opdrachtnummers. Max 15MB.
            </p>
          </>
        )}
      </div>

      {error && <p className="text-sm text-rose-600">{error}</p>}

      {resultaat && (
        <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <Icon name="sparkles" size={18} className="mt-0.5 shrink-0 text-emerald-600" />
          <div>
            <p className="text-sm font-semibold text-emerald-800">Toegevoegd: {resultaat.title}</p>
            {(resultaat.hoofdstuk || resultaat.opdrachten) && (
              <p className="mt-0.5 text-xs text-emerald-700">
                {[resultaat.hoofdstuk && `Hoofdstuk ${resultaat.hoofdstuk}`, resultaat.opdrachten && `Opdrachten ${resultaat.opdrachten}`]
                  .filter(Boolean)
                  .join(" - ")}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
