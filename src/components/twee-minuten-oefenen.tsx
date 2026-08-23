"use client";

import { useState } from "react";
import clsx from "clsx";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icon";
import { slaOverhoorResultaatOp } from "@/lib/actions/overhoor";
import type { Subject } from "@/lib/types";

type Beoordeling = "goed" | "deels" | "fout" | "geen";
type Fase = "kies" | "vraag" | "klaar";

const AANTAL_VRAGEN = 2;

const BEOORDELING_STIJL: Record<Beoordeling, string> = {
  goed: "border-emerald-200 bg-emerald-50 text-emerald-700",
  deels: "border-amber-200 bg-amber-50 text-amber-700",
  fout: "border-rose-200 bg-rose-50 text-rose-700",
  geen: "border-slate-200 bg-slate-50 text-slate-600",
};

export function TweeMinutenOefenen({ subjects }: { subjects: Subject[] }) {
  const [fase, setFase] = useState<Fase>("kies");
  const [subject, setSubject] = useState<Subject | null>(null);
  const [vraagNr, setVraagNr] = useState(0);
  const [vraag, setVraag] = useState<string | null>(null);
  const [antwoord, setAntwoord] = useState("");
  const [feedback, setFeedback] = useState<{ tekst: string; beoordeling: Beoordeling } | null>(null);
  const [gesteldeVragen, setGesteldeVragen] = useState<string[]>([]);
  const [score, setScore] = useState({ goed: 0, deels: 0, fout: 0 });
  const [bezig, setBezig] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (subjects.length === 0) return null;

  function reset() {
    setFase("kies");
    setSubject(null);
    setVraagNr(0);
    setVraag(null);
    setAntwoord("");
    setFeedback(null);
    setGesteldeVragen([]);
    setScore({ goed: 0, deels: 0, fout: 0 });
    setError(null);
  }

  async function start(s: Subject) {
    setError(null);
    setBezig(true);
    try {
      const res = await fetch("/api/overhoor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subjectId: s.id, leerfase: "tussentijds", spellingStrict: false, gesteldeVragen: [] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Kon geen vraag ophalen.");
      setSubject(s);
      setVraag(data.vraag);
      setVraagNr(1);
      setFeedback(null);
      setGesteldeVragen([]);
      setFase("vraag");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Er ging iets mis.");
    } finally {
      setBezig(false);
    }
  }

  async function controleer() {
    if (!subject || !vraag || !antwoord.trim()) return;
    setError(null);
    setBezig(true);
    try {
      const res = await fetch("/api/overhoor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subjectId: subject.id,
          leerfase: "tussentijds",
          spellingStrict: false,
          gesteldeVragen,
          vorigeVraag: vraag,
          vorigAntwoord: antwoord,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Kon niet controleren.");

      const beoordeling = (data.beoordeling as Beoordeling) ?? "geen";
      setFeedback({ tekst: data.feedback || "", beoordeling });
      setGesteldeVragen((prev) => [...prev, vraag]);
      setAntwoord("");

      const nieuweScore =
        beoordeling === "goed" || beoordeling === "deels" || beoordeling === "fout"
          ? { ...score, [beoordeling]: score[beoordeling] + 1 }
          : score;
      setScore(nieuweScore);

      if (vraagNr >= AANTAL_VRAGEN) {
        setFase("klaar");
        void slaOverhoorResultaatOp(subject.id, "tussentijds", nieuweScore);
      } else {
        setVraag(data.vraag);
        setVraagNr((n) => n + 1);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Er ging iets mis.");
    } finally {
      setBezig(false);
    }
  }

  return (
    <Card className="flex flex-col gap-3 border-accent-100 bg-accent-50/40">
      <div className="flex items-center gap-2">
        <Icon name="sparkles" size={18} className="text-accent-600" />
        <p className="text-sm font-semibold text-slate-900">2 minuten oefenen</p>
      </div>

      {fase === "kies" && (
        <>
          <p className="text-sm text-slate-600">Kies een vak voor {AANTAL_VRAGEN} snelle oefenvragen.</p>
          <div className="flex flex-wrap gap-2">
            {subjects.map((s) => (
              <button
                key={s.id}
                disabled={bezig}
                onClick={() => start(s)}
                className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:border-accent-300 hover:bg-accent-50 disabled:opacity-50"
              >
                <Icon name={s.icon} size={16} />
                {s.name}
              </button>
            ))}
          </div>
          {error && <p className="text-sm text-rose-600">{error}</p>}
        </>
      )}

      {fase === "vraag" && subject && (
        <div className="flex flex-col gap-3">
          {feedback && (
            <div className={clsx("rounded-xl border p-2.5 text-xs", BEOORDELING_STIJL[feedback.beoordeling])}>{feedback.tekst}</div>
          )}
          <p className="text-xs font-medium text-slate-500">
            {subject.name} - vraag {vraagNr} van {AANTAL_VRAGEN}
          </p>
          <p className="rounded-xl bg-white p-3 text-sm font-medium text-slate-800">{vraag}</p>
          <textarea
            value={antwoord}
            onChange={(e) => setAntwoord(e.target.value)}
            rows={2}
            placeholder="Typ hier je antwoord..."
            className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100"
          />
          {error && <p className="text-sm text-rose-600">{error}</p>}
          <div className="flex gap-2">
            <Button loading={bezig} disabled={!antwoord.trim()} onClick={controleer}>
              Controleren
            </Button>
            <Button variant="secondary" type="button" onClick={reset}>
              Stoppen
            </Button>
          </div>
        </div>
      )}

      {fase === "klaar" && (
        <div className="flex flex-col gap-3">
          {feedback && (
            <div className={clsx("rounded-xl border p-2.5 text-xs", BEOORDELING_STIJL[feedback.beoordeling])}>{feedback.tekst}</div>
          )}
          <p className="flex items-center gap-1.5 text-sm text-emerald-700">
            <Icon name="party" size={16} />
            Goed gedaan! Tot de volgende keer.
          </p>
          <Button variant="secondary" onClick={reset} icon={<Icon name="sparkles" size={16} />}>
            Nog een keer
          </Button>
        </div>
      )}
    </Card>
  );
}
