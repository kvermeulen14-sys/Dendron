"use client";

import { useState } from "react";
import clsx from "clsx";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/icon";
import { MarkdownTekst } from "@/components/markdown-tekst";
import { slaOverhoorResultaatOp } from "@/lib/actions/overhoor";

type Leerfase = "eerste" | "tussentijds" | "laatste";
type Beoordeling = "goed" | "deels" | "fout" | "geen";
type Stijl = "open" | "meerkeuze";
type WizardStap = "hoofdstuk" | "stijl" | null;

const LEERFASE_OPTIES: { value: Leerfase; label: string; uitleg: string }[] = [
  { value: "eerste", label: "Eerste keer", uitleg: "Meer hulp, rustig opbouwen" },
  { value: "tussentijds", label: "Tussentijds oefenen", uitleg: "Gemiddeld niveau" },
  { value: "laatste", label: "Vlak voor de toets", uitleg: "Pittig, zoals de toets" },
];

const BEOORDELING_STIJL: Record<Beoordeling, { label: string; icon: string; className: string }> = {
  goed: { label: "Goed!", icon: "party", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  deels: { label: "Deels goed", icon: "sparkles", className: "border-amber-200 bg-amber-50 text-amber-700" },
  fout: { label: "Nog niet helemaal", icon: "brain", className: "border-rose-200 bg-rose-50 text-rose-700" },
  geen: { label: "", icon: "sparkles", className: "" },
};

const LETTERS = ["a", "b", "c", "d", "e", "f"];

export function OverhoorPanel({
  subjectId,
  subjectName,
  hoofdstukken = [],
}: {
  subjectId: string;
  subjectName: string;
  hoofdstukken?: string[];
}) {
  const [gestart, setGestart] = useState(false);
  const [spellingStrict, setSpellingStrict] = useState(false);
  const [leerfase, setLeerfase] = useState<Leerfase>("tussentijds");

  const [wizardStap, setWizardStap] = useState<WizardStap>(null);
  const [gekozenHoofdstuk, setGekozenHoofdstuk] = useState<string | null>(null);
  const [scopeInstructie, setScopeInstructie] = useState<string | null>(null);

  const [vraag, setVraag] = useState<string | null>(null);
  const [opties, setOpties] = useState<string[] | null>(null);
  const [antwoord, setAntwoord] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [beoordeling, setBeoordeling] = useState<Beoordeling | null>(null);
  const [gesteldeVragen, setGesteldeVragen] = useState<string[]>([]);
  const [score, setScore] = useState({ goed: 0, deels: 0, fout: 0 });
  const [bezig, setBezig] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function start() {
    setGestart(true);
    setScore({ goed: 0, deels: 0, fout: 0 });
    setFeedback(null);
    setBeoordeling(null);
    setGesteldeVragen([]);
    setScopeInstructie(null);
    setGekozenHoofdstuk(null);
    setVraag(null);
    setOpties(null);
    setWizardStap(hoofdstukken.length > 0 ? "hoofdstuk" : "stijl");
  }

  function kiesHoofdstuk(h: string | null) {
    setGekozenHoofdstuk(h);
    setWizardStap("stijl");
  }

  function kiesStijl(stijl: Stijl) {
    const onderwerp = gekozenHoofdstuk ? `hoofdstuk "${gekozenHoofdstuk}"` : "alle beschikbare lesstof";
    const instructie = `Onderwerp: ${onderwerp}. Vraagstijl: ${stijl === "meerkeuze" ? "meerkeuzevragen (3-4 opties)" : "open vragen"}.`;
    setScopeInstructie(instructie);
    setWizardStap(null);
    haalVolgendeVraagOp(undefined, instructie, true);
  }

  async function haalVolgendeVraagOp(vorigAntwoord?: string, nieuweScopeInstructie?: string, naWizard = false) {
    setBezig(true);
    setError(null);
    try {
      const res = await fetch("/api/overhoor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subjectId,
          spellingStrict,
          leerfase,
          gesteldeVragen,
          vorigeVraag: naWizard ? null : vraag,
          vorigAntwoord,
          scopeInstructie: nieuweScopeInstructie ?? scopeInstructie,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Er ging iets mis.");

      if (data.beoordeling && data.beoordeling !== "geen") {
        setScore((s) => ({ ...s, [data.beoordeling]: s[data.beoordeling as "goed" | "deels" | "fout"] + 1 }));
      }
      setFeedback(data.feedback || null);
      setBeoordeling(data.beoordeling ?? null);
      if (vraag && !naWizard) setGesteldeVragen((prev) => [...prev, vraag]);
      setVraag(data.vraag);
      setOpties(Array.isArray(data.opties) && data.opties.length > 0 ? data.opties : null);
      setAntwoord("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Er ging iets mis.");
    } finally {
      setBezig(false);
    }
  }

  function stop() {
    if (score.goed + score.deels + score.fout > 0) {
      void slaOverhoorResultaatOp(subjectId, leerfase, score);
    }
    setGestart(false);
    setWizardStap(null);
    setVraag(null);
  }

  if (!gestart) {
    return (
      <Card className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Icon name="target" size={18} className="text-accent-600" />
          <p className="text-sm font-semibold text-slate-900">Overhoor mij over {subjectName}</p>
        </div>

        <div>
          <p className="mb-1.5 text-sm font-medium text-slate-700">In welke fase zit je?</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {LEERFASE_OPTIES.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setLeerfase(opt.value)}
                className={clsx(
                  "rounded-xl border px-3 py-2.5 text-left text-xs transition-colors",
                  leerfase === opt.value
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 text-slate-600 hover:bg-slate-50"
                )}
              >
                <p className="font-medium">{opt.label}</p>
                <p className={clsx("mt-0.5", leerfase === opt.value ? "text-slate-300" : "text-slate-400")}>
                  {opt.uitleg}
                </p>
              </button>
            ))}
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={spellingStrict}
            onChange={(e) => setSpellingStrict(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          Let op spelling bij het beoordelen
        </label>

        {(score.goed > 0 || score.deels > 0 || score.fout > 0) && (
          <p className="text-xs text-slate-500">
            Laatste sessie: {score.goed} goed, {score.deels} deels, {score.fout} nog niet
          </p>
        )}

        {error && <p className="text-sm text-rose-600">{error}</p>}

        <Button onClick={start} icon={<Icon name="rocket" size={18} />}>
          Begin met overhoren
        </Button>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon name="target" size={18} className="text-accent-600" />
          <p className="text-sm font-semibold text-slate-900">Overhoren - {subjectName}</p>
        </div>
        <button onClick={stop} className="text-xs font-medium text-slate-500 hover:underline">
          Stoppen
        </button>
      </div>

      {wizardStap !== null ? (
        <div className="flex flex-col gap-4">
          {wizardStap === "hoofdstuk" ? (
            <div>
              <p className="mb-2 text-sm font-medium text-slate-700">Welk onderdeel wil je oefenen?</p>
              <div className="flex flex-wrap gap-2">
                {hoofdstukken.map((h) => (
                  <button
                    key={h}
                    onClick={() => kiesHoofdstuk(h)}
                    className="rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:border-accent-300 hover:bg-accent-50"
                  >
                    H. {h}
                  </button>
                ))}
                <button
                  onClick={() => kiesHoofdstuk(null)}
                  className="rounded-xl border border-dashed border-slate-300 px-3.5 py-2.5 text-sm font-medium text-slate-500 transition-colors hover:border-accent-300 hover:bg-accent-50"
                >
                  Alle lesstof
                </button>
              </div>
            </div>
          ) : (
            <div>
              <p className="mb-2 text-sm font-medium text-slate-700">Hoe wil je de vragen?</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  onClick={() => kiesStijl("open")}
                  className="flex flex-col items-start gap-1 rounded-xl border border-slate-200 px-3.5 py-3 text-left transition-colors hover:border-accent-300 hover:bg-accent-50"
                >
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
                    <Icon name="pencil-line" size={16} className="text-accent-600" />
                    Open vragen
                  </span>
                  <span className="text-xs text-slate-500">Zelf het antwoord intypen</span>
                </button>
                <button
                  onClick={() => kiesStijl("meerkeuze")}
                  className="flex flex-col items-start gap-1 rounded-xl border border-slate-200 px-3.5 py-3 text-left transition-colors hover:border-accent-300 hover:bg-accent-50"
                >
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
                    <Icon name="check" size={16} className="text-accent-600" />
                    Meerkeuze
                  </span>
                  <span className="text-xs text-slate-500">Zoals op sommige toetsen</span>
                </button>
              </div>
            </div>
          )}
          {error && <p className="text-sm text-rose-600">{error}</p>}
        </div>
      ) : (
        <>
          <div className="flex gap-3 text-xs text-slate-500">
            <span>{score.goed} goed</span>
            <span>{score.deels} deels</span>
            <span>{score.fout} nog niet</span>
          </div>

          {beoordeling && beoordeling !== "geen" && (
            <div className={clsx("flex items-start gap-2 rounded-xl border p-3 text-sm", BEOORDELING_STIJL[beoordeling].className)}>
              <Icon name={BEOORDELING_STIJL[beoordeling].icon} size={16} className="mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="font-medium">{BEOORDELING_STIJL[beoordeling].label}</p>
                {feedback && <MarkdownTekst className="mt-0.5">{feedback}</MarkdownTekst>}
              </div>
            </div>
          )}

          {bezig && !vraag ? (
            <p className="text-sm text-slate-400">Volgende vraag wordt bedacht...</p>
          ) : (
            vraag && (
              <div className="flex flex-col gap-3">
                <div className="rounded-xl bg-slate-50 p-3 font-medium text-slate-800">
                  <MarkdownTekst>{vraag}</MarkdownTekst>
                </div>

                {opties ? (
                  <div className="flex flex-col gap-2">
                    {opties.map((optie, i) => (
                      <button
                        key={i}
                        disabled={bezig}
                        onClick={() => haalVolgendeVraagOp(optie)}
                        className="flex items-start gap-2.5 rounded-xl border border-slate-200 px-3.5 py-2.5 text-left text-sm text-slate-700 transition-colors hover:border-accent-300 hover:bg-accent-50 disabled:opacity-50"
                      >
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-500">
                          {LETTERS[i] ?? i + 1}
                        </span>
                        {optie}
                      </button>
                    ))}
                  </div>
                ) : (
                  <>
                    <textarea
                      value={antwoord}
                      onChange={(e) => setAntwoord(e.target.value)}
                      rows={3}
                      placeholder="Typ hier je antwoord..."
                      className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100"
                    />
                    <Button loading={bezig} disabled={!antwoord.trim()} onClick={() => haalVolgendeVraagOp(antwoord)}>
                      Controleren & volgende vraag
                    </Button>
                  </>
                )}
                {error && <p className="text-sm text-rose-600">{error}</p>}
              </div>
            )
          )}
        </>
      )}
    </Card>
  );
}
