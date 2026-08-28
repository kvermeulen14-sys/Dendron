"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icon";
import {
  maakHoofdstuk,
  hernoemHoofdstuk,
  herordenHoofdstukken,
  verwijderHoofdstuk,
  hernoemParagraaf,
  verplaatsParagraaf,
  herordenParagrafen,
  verwijderMethodeParagraaf,
} from "@/lib/actions/methode-structuur";
import type { MethodeCategorie, MethodeHoofdstuk, MethodeParagraaf } from "@/lib/types";

const CATEGORIE_LABEL: Record<MethodeCategorie, string> = {
  grammatica: "Theorie: Grammatica",
  zinnen: "Theorie: Zinnen & uitdrukkingen",
  woordenschat: "Theorie: Woordenschat",
  praktijk: "Praktijk: Vaardigheden",
};
const CATEGORIE_VOLGORDE: MethodeCategorie[] = ["grammatica", "zinnen", "woordenschat", "praktijk"];

function move<T>(lijst: T[], van: number, naar: number): T[] {
  const kopie = lijst.slice();
  const [item] = kopie.splice(van, 1);
  kopie.splice(naar, 0, item);
  return kopie;
}

export function InhoudsopgaveEditor({
  subjectId,
  hoofdstukken,
  paragrafen,
}: {
  subjectId: string;
  hoofdstukken: MethodeHoofdstuk[];
  paragrafen: MethodeParagraaf[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [fout, setFout] = useState<string | null>(null);
  const [nieuweHoofdstukNaam, setNieuweHoofdstukNaam] = useState("");
  const [bewerkHoofdstuk, setBewerkHoofdstuk] = useState<string | null>(null);
  const [bewerkParagraaf, setBewerkParagraaf] = useState<string | null>(null);
  const [verplaatsOpen, setVerplaatsOpen] = useState<string | null>(null);

  function run(actie: () => Promise<{ error?: string } | undefined>, onSuccess?: () => void) {
    setFout(null);
    startTransition(async () => {
      const res = await actie();
      if (res && "error" in res && res.error) {
        setFout(res.error);
        return;
      }
      onSuccess?.();
      router.refresh();
    });
  }

  if (hoofdstukken.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 p-4">
        <p className="mb-3 text-sm text-slate-400">
          Nog geen inhoudsopgave - die vult zich vanzelf zodra je hierboven iets uploadt en importeert. Je kunt ook
          zelf alvast een hoofdstuk aanmaken.
        </p>
        <NieuwHoofdstukForm
          waarde={nieuweHoofdstukNaam}
          onChange={setNieuweHoofdstukNaam}
          bezig={pending}
          onToevoegen={() => run(() => maakHoofdstuk(subjectId, nieuweHoofdstukNaam), () => setNieuweHoofdstukNaam(""))}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {fout && <p className="text-sm text-rose-600">{fout}</p>}
      {hoofdstukken.map((h, hIdx) => {
        const parsVanHoofdstuk = paragrafen.filter((p) => p.hoofdstuk_id === h.id);
        return (
          <div key={h.id} className="rounded-2xl border border-slate-200 p-3">
            <div className="flex items-center gap-2">
              <div className="flex shrink-0 flex-col">
                <button
                  disabled={hIdx === 0 || pending}
                  onClick={() => run(() => herordenHoofdstukken(subjectId, move(hoofdstukken, hIdx, hIdx - 1).map((x) => x.id)))}
                  className="rounded p-0.5 text-slate-300 hover:text-slate-600 disabled:opacity-30"
                  aria-label="Omhoog"
                >
                  <Icon name="chevron-right" size={12} className="-rotate-90" />
                </button>
                <button
                  disabled={hIdx === hoofdstukken.length - 1 || pending}
                  onClick={() => run(() => herordenHoofdstukken(subjectId, move(hoofdstukken, hIdx, hIdx + 1).map((x) => x.id)))}
                  className="rounded p-0.5 text-slate-300 hover:text-slate-600 disabled:opacity-30"
                  aria-label="Omlaag"
                >
                  <Icon name="chevron-right" size={12} className="rotate-90" />
                </button>
              </div>

              {bewerkHoofdstuk === h.id ? (
                <InlineRenameForm
                  waarde={h.naam}
                  bezig={pending}
                  onOpslaan={(naam) => run(() => hernoemHoofdstuk(subjectId, h.id, naam), () => setBewerkHoofdstuk(null))}
                  onAnnuleren={() => setBewerkHoofdstuk(null)}
                />
              ) : (
                <>
                  <h3 className="min-w-0 flex-1 truncate font-heading text-base font-bold text-slate-900">{h.naam}</h3>
                  <button
                    onClick={() => setBewerkHoofdstuk(h.id)}
                    className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    aria-label="Hoofdstuk hernoemen"
                  >
                    <Icon name="pencil-line" size={14} />
                  </button>
                  <button
                    disabled={pending}
                    onClick={() => {
                      if (confirm(`"${h.naam}" verwijderen? Alle content eronder gaat mee.`)) run(() => verwijderHoofdstuk(subjectId, h.id));
                    }}
                    className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                    aria-label="Hoofdstuk verwijderen"
                  >
                    <Icon name="trash" size={14} />
                  </button>
                </>
              )}
            </div>

            <div className="mt-2.5 flex flex-col gap-2.5 pl-6">
              {CATEGORIE_VOLGORDE.map((categorie) => {
                const lijst = parsVanHoofdstuk.filter((p) => p.categorie === categorie).sort((a, b) => a.volgorde - b.volgorde);
                if (lijst.length === 0) return null;
                return (
                  <div key={categorie}>
                    <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">{CATEGORIE_LABEL[categorie]}</p>
                    <div className="flex flex-col gap-1">
                      {lijst.map((p, pIdx) => (
                        <div key={p.id} className="flex items-center gap-1.5 rounded-xl bg-slate-50 px-2.5 py-1.5">
                          <div className="flex shrink-0 flex-col">
                            <button
                              disabled={pIdx === 0 || pending}
                              onClick={() => run(() => herordenParagrafen(subjectId, move(lijst, pIdx, pIdx - 1).map((x) => x.id)))}
                              className="rounded p-0.5 text-slate-300 hover:text-slate-600 disabled:opacity-30"
                              aria-label="Omhoog"
                            >
                              <Icon name="chevron-right" size={10} className="-rotate-90" />
                            </button>
                            <button
                              disabled={pIdx === lijst.length - 1 || pending}
                              onClick={() => run(() => herordenParagrafen(subjectId, move(lijst, pIdx, pIdx + 1).map((x) => x.id)))}
                              className="rounded p-0.5 text-slate-300 hover:text-slate-600 disabled:opacity-30"
                              aria-label="Omlaag"
                            >
                              <Icon name="chevron-right" size={10} className="rotate-90" />
                            </button>
                          </div>

                          {bewerkParagraaf === p.id ? (
                            <ParagraafRenameForm
                              code={p.code}
                              titel={p.titel}
                              bezig={pending}
                              onOpslaan={(code, titel) => run(() => hernoemParagraaf(subjectId, p.id, titel, code), () => setBewerkParagraaf(null))}
                              onAnnuleren={() => setBewerkParagraaf(null)}
                            />
                          ) : verplaatsOpen === p.id ? (
                            <VerplaatsForm
                              hoofdstukken={hoofdstukken}
                              huidigeCategorie={p.categorie}
                              bezig={pending}
                              onVerplaats={(hoofdstukId, cat) =>
                                run(() => verplaatsParagraaf(subjectId, p.id, hoofdstukId, cat), () => setVerplaatsOpen(null))
                              }
                              onAnnuleren={() => setVerplaatsOpen(null)}
                            />
                          ) : (
                            <>
                              <span className="min-w-0 flex-1 truncate text-sm text-slate-700">
                                <span className="font-medium text-slate-500">{p.code}</span> - {p.titel}
                              </span>
                              <button
                                onClick={() => setBewerkParagraaf(p.id)}
                                className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-slate-700"
                                aria-label="Paragraaf hernoemen"
                              >
                                <Icon name="pencil-line" size={13} />
                              </button>
                              <button
                                onClick={() => setVerplaatsOpen(p.id)}
                                className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-slate-700"
                                aria-label="Paragraaf verplaatsen"
                              >
                                <Icon name="arrow-right-circle" size={13} />
                              </button>
                              <button
                                disabled={pending}
                                onClick={() => {
                                  if (confirm(`Paragraaf "${p.titel}" verwijderen? Alle content erin gaat mee.`))
                                    run(() => verwijderMethodeParagraaf(subjectId, p.id));
                                }}
                                className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                                aria-label="Paragraaf verwijderen"
                              >
                                <Icon name="trash" size={13} />
                              </button>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
              {parsVanHoofdstuk.length === 0 && <p className="text-sm text-slate-400">Nog geen paragrafen in dit hoofdstuk.</p>}
            </div>
          </div>
        );
      })}

      <NieuwHoofdstukForm
        waarde={nieuweHoofdstukNaam}
        onChange={setNieuweHoofdstukNaam}
        bezig={pending}
        onToevoegen={() => run(() => maakHoofdstuk(subjectId, nieuweHoofdstukNaam), () => setNieuweHoofdstukNaam(""))}
      />
    </div>
  );
}

function NieuwHoofdstukForm({
  waarde,
  onChange,
  bezig,
  onToevoegen,
}: {
  waarde: string;
  onChange: (v: string) => void;
  bezig: boolean;
  onToevoegen: () => void;
}) {
  return (
    <div className="flex gap-2">
      <input
        value={waarde}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Nieuw hoofdstuk, bv. Unit 3"
        onKeyDown={(e) => {
          if (e.key === "Enter" && waarde.trim()) onToevoegen();
        }}
        className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100"
      />
      <Button size="md" variant="secondary" icon={<Icon name="plus" size={16} />} disabled={!waarde.trim() || bezig} onClick={onToevoegen}>
        Hoofdstuk
      </Button>
    </div>
  );
}

function InlineRenameForm({
  waarde,
  bezig,
  onOpslaan,
  onAnnuleren,
}: {
  waarde: string;
  bezig: boolean;
  onOpslaan: (v: string) => void;
  onAnnuleren: () => void;
}) {
  const [tekst, setTekst] = useState(waarde);
  return (
    <div className="flex min-w-0 flex-1 gap-1.5">
      <input
        autoFocus
        value={tekst}
        onChange={(e) => setTekst(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && tekst.trim()) onOpslaan(tekst);
          if (e.key === "Escape") onAnnuleren();
        }}
        className="min-w-0 flex-1 rounded-lg border border-accent-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-accent-100"
      />
      <button
        disabled={!tekst.trim() || bezig}
        onClick={() => onOpslaan(tekst)}
        className="shrink-0 rounded-lg bg-emerald-500 px-2 py-1 text-xs font-semibold text-white disabled:opacity-50"
      >
        Opslaan
      </button>
      <button onClick={onAnnuleren} className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100">
        Annuleren
      </button>
    </div>
  );
}

function ParagraafRenameForm({
  code,
  titel,
  bezig,
  onOpslaan,
  onAnnuleren,
}: {
  code: string;
  titel: string;
  bezig: boolean;
  onOpslaan: (code: string, titel: string) => void;
  onAnnuleren: () => void;
}) {
  const [nieuweCode, setNieuweCode] = useState(code);
  const [nieuweTitel, setNieuweTitel] = useState(titel);
  return (
    <div className="flex min-w-0 flex-1 gap-1.5">
      <input
        autoFocus
        value={nieuweCode}
        onChange={(e) => setNieuweCode(e.target.value)}
        className="w-16 shrink-0 rounded-lg border border-accent-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-accent-100"
      />
      <input
        value={nieuweTitel}
        onChange={(e) => setNieuweTitel(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && nieuweCode.trim() && nieuweTitel.trim()) onOpslaan(nieuweCode, nieuweTitel);
          if (e.key === "Escape") onAnnuleren();
        }}
        className="min-w-0 flex-1 rounded-lg border border-accent-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-accent-100"
      />
      <button
        disabled={!nieuweCode.trim() || !nieuweTitel.trim() || bezig}
        onClick={() => onOpslaan(nieuweCode, nieuweTitel)}
        className="shrink-0 rounded-lg bg-emerald-500 px-2 py-1 text-xs font-semibold text-white disabled:opacity-50"
      >
        Opslaan
      </button>
      <button onClick={onAnnuleren} className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100">
        Annuleren
      </button>
    </div>
  );
}

function VerplaatsForm({
  hoofdstukken,
  huidigeCategorie,
  bezig,
  onVerplaats,
  onAnnuleren,
}: {
  hoofdstukken: MethodeHoofdstuk[];
  huidigeCategorie: MethodeCategorie;
  bezig: boolean;
  onVerplaats: (hoofdstukId: string, categorie: MethodeCategorie) => void;
  onAnnuleren: () => void;
}) {
  const [hoofdstukId, setHoofdstukId] = useState(hoofdstukken[0]?.id ?? "");
  const [categorie, setCategorie] = useState<MethodeCategorie>(huidigeCategorie);
  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
      <select
        value={hoofdstukId}
        onChange={(e) => setHoofdstukId(e.target.value)}
        className="rounded-lg border border-accent-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-accent-100"
      >
        {hoofdstukken.map((h) => (
          <option key={h.id} value={h.id}>
            {h.naam}
          </option>
        ))}
      </select>
      <select
        value={categorie}
        onChange={(e) => setCategorie(e.target.value as MethodeCategorie)}
        className="rounded-lg border border-accent-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-accent-100"
      >
        {CATEGORIE_VOLGORDE.map((c) => (
          <option key={c} value={c}>
            {CATEGORIE_LABEL[c]}
          </option>
        ))}
      </select>
      <button
        disabled={!hoofdstukId || bezig}
        onClick={() => onVerplaats(hoofdstukId, categorie)}
        className={clsx("shrink-0 rounded-lg bg-emerald-500 px-2 py-1 text-xs font-semibold text-white disabled:opacity-50")}
      >
        Verplaats
      </button>
      <button onClick={onAnnuleren} className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100">
        Annuleren
      </button>
    </div>
  );
}
