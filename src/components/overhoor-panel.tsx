"use client";

import { useState } from "react";
import clsx from "clsx";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/icon";

type Leerfase = "eerste" | "tussentijds" | "laatste";
type Beoordeling = "goed" | "deels" | "fout" | "geen";

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

export function OverhoorPanel({ subjectId, subjectName }: { subjectId: string; subjectName: string }) {
  const [gestart, setGestart] = useState(false);
  const [spellingStrict, setSpellingStrict] = useState(false);
  const [leerfase, setLeerfase] = useState<Leerfase>("tussentijds");

  const [vraag, setVraag] = useState<string | null>(null);
  const [antwoord, setAntwoord] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [beoordeling, setBeoordeling] = useState<Beoordeling | null>(null);
  const [gesteldeVragen, setGesteldeVragen] = useState<string[]>([]);
  const [score, setScore] = useState({ goed: 0, deels: 0, fout: 0 });
  const [bezig, setBezig] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function haalVolgendeVraagOp(vorigAntwoord?: string) {
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
          vorigeVraag: vraag,
          vorigAntwoord,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Er ging iets mis.");

      if (data.beoordeling && data.beoordeling !== "geen") {
        setScore((s) => ({ ...s, [data.beoordeling]: s[data.beoordeling as "goed" | "deels" | "fout"] + 1 }));
      }
      setFeedback(data.feedback || null);
      setBeoordeling(data.beoordeling ?? null);
      if (vraag) setGesteldeVragen((prev) => [...prev, vraag]);
      setVraag(data.vraag);
      setAntwoord("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Er ging iets mis.");
    } finally {
      setBezig(false);
    }
  }

  function start() {
    setGestart(true);
    setScore({ goed: 0, deels: 0, fout: 0 });
    setFeedback(null);
    setBeoordeling(null);
    setGesteldeVragen([]);
    setVraag(null);
    haalVolgendeVraagOp();
  }

  function stop() {
    setGestart(false);
    setVraag(null);
  }

  if (!gestart) {
    return (
      <Card className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Icon name="target" size={18} className="text-blue-600" />
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
          <Icon name="target" size={18} className="text-blue-600" />
          <p className="text-sm font-semibold text-slate-900">Overhoren - {subjectName}</p>
        </div>
        <button onClick={stop} className="text-xs font-medium text-slate-500 hover:underline">
          Stoppen
        </button>
      </div>

      <div className="flex gap-3 text-xs text-slate-500">
        <span>{score.goed} goed</span>
        <span>{score.deels} deels</span>
        <span>{score.fout} nog niet</span>
      </div>

      {beoordeling && beoordeling !== "geen" && (
        <div className={clsx("flex items-start gap-2 rounded-xl border p-3 text-sm", BEOORDELING_STIJL[beoordeling].className)}>
          <Icon name={BEOORDELING_STIJL[beoordeling].icon} size={16} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">{BEOORDELING_STIJL[beoordeling].label}</p>
            {feedback && <p className="mt-0.5">{feedback}</p>}
          </div>
        </div>
      )}

      {bezig && !vraag ? (
        <p className="text-sm text-slate-400">Volgende vraag wordt bedacht...</p>
      ) : (
        vraag && (
          <div className="flex flex-col gap-3">
            <p className="rounded-xl bg-slate-50 p-3 text-sm font-medium text-slate-800">{vraag}</p>
            <textarea
              value={antwoord}
              onChange={(e) => setAntwoord(e.target.value)}
              rows={3}
              placeholder="Typ hier je antwoord..."
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
            {error && <p className="text-sm text-rose-600">{error}</p>}
            <Button disabled={bezig || !antwoord.trim()} onClick={() => haalVolgendeVraagOp(antwoord)}>
              {bezig ? "Bezig..." : "Controleren & volgende vraag"}
            </Button>
          </div>
        )
      )}
    </Card>
  );
}
