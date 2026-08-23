"use client";

import { useState } from "react";
import clsx from "clsx";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Icon } from "@/components/icon";
import { MarkdownTekst } from "@/components/markdown-tekst";
import { slaOverhoorResultaatOp } from "@/lib/actions/overhoor";
import type { Subject } from "@/lib/types";

type Beoordeling = "goed" | "deels" | "fout" | "geen";
type Fase = "kies" | "vraag" | "feedback" | "klaar";

const AANTAL_VRAGEN = 2;
const LETTERS = ["a", "b", "c", "d", "e", "f"];

const BEOORDELING_STIJL: Record<Beoordeling, string> = {
  goed: "border-emerald-200 bg-emerald-50 text-emerald-700",
  deels: "border-amber-200 bg-amber-50 text-amber-700",
  fout: "border-rose-200 bg-rose-50 text-rose-700",
  geen: "border-slate-200 bg-slate-50 text-slate-600",
};

/**
 * Laagdrempelige, korte retrieval-practice: 2 vragen per keer, in een popup
 * zodat de rest van het scherm wegvalt en er focus is op de vraag - net
 * genoeg voor een moment tussendoor, niet een volledige overhoorsessie.
 */
export function TweeMinutenOefenen({ subjects }: { subjects: Subject[] }) {
  const [open, setOpen] = useState(false);
  const [fase, setFase] = useState<Fase>("kies");
  const [subject, setSubject] = useState<Subject | null>(null);
  const [vraagNr, setVraagNr] = useState(0);
  const [vraag, setVraag] = useState<string | null>(null);
  const [opties, setOpties] = useState<string[] | null>(null);
  const [volgende, setVolgende] = useState<{ vraag: string; opties: string[] | null } | null>(null);
  const [antwoord, setAntwoord] = useState("");
  const [laatsteAntwoord, setLaatsteAntwoord] = useState("");
  const [feedback, setFeedback] = useState<{ tekst: string; beoordeling: Beoordeling } | null>(null);
  const [uitleg, setUitleg] = useState<string | null>(null);
  const [uitlegBezig, setUitlegBezig] = useState(false);
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
    setOpties(null);
    setVolgende(null);
    setAntwoord("");
    setFeedback(null);
    setUitleg(null);
    setGesteldeVragen([]);
    setScore({ goed: 0, deels: 0, fout: 0 });
    setError(null);
  }

  function sluit() {
    setOpen(false);
    reset();
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
      setOpties(Array.isArray(data.opties) && data.opties.length > 0 ? data.opties : null);
      setVraagNr(1);
      setFeedback(null);
      setUitleg(null);
      setGesteldeVragen([]);
      setFase("vraag");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Er ging iets mis.");
    } finally {
      setBezig(false);
    }
  }

  async function controleer(overrideAntwoord?: string) {
    const antwoordTeControleren = overrideAntwoord ?? antwoord;
    if (!subject || !vraag || !antwoordTeControleren.trim()) return;
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
          vorigAntwoord: antwoordTeControleren,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Kon niet controleren.");

      const beoordeling = (data.beoordeling as Beoordeling) ?? "geen";
      setFeedback({ tekst: data.feedback || "", beoordeling });
      if (beoordeling === "goed" || beoordeling === "deels" || beoordeling === "fout") {
        setScore((s) => ({ ...s, [beoordeling]: s[beoordeling] + 1 }));
      }
      setGesteldeVragen((prev) => [...prev, vraag]);
      setLaatsteAntwoord(antwoordTeControleren);
      setVolgende({ vraag: data.vraag, opties: Array.isArray(data.opties) && data.opties.length > 0 ? data.opties : null });
      setAntwoord("");
      setUitleg(null);
      setFase("feedback");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Er ging iets mis.");
    } finally {
      setBezig(false);
    }
  }

  function volgendeVraag() {
    if (vraagNr >= AANTAL_VRAGEN) {
      setFase("klaar");
      void slaOverhoorResultaatOp(subject!.id, "tussentijds", score);
      return;
    }
    setVraag(volgende?.vraag ?? null);
    setOpties(volgende?.opties ?? null);
    setVraagNr((n) => n + 1);
    setFeedback(null);
    setUitleg(null);
    setFase("vraag");
  }

  async function vraagUitleg() {
    if (!subject || !vraag) return;
    setUitlegBezig(true);
    setError(null);
    try {
      const res = await fetch("/api/overhoor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subjectId: subject.id,
          modus: "uitleg",
          vorigeVraag: vraag,
          vorigAntwoord: laatsteAntwoord,
          eerdereUitleg: uitleg,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Kon geen uitleg ophalen.");
      setUitleg(data.uitleg);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Er ging iets mis.");
    } finally {
      setUitlegBezig(false);
    }
  }

  return (
    <>
      <Card
        onClick={() => setOpen(true)}
        className="flex cursor-pointer items-center gap-3 border-accent-100 bg-accent-50/40 py-4 transition-shadow hover:shadow-md"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-100 text-accent-600">
          <Icon name="sparkles" size={18} />
        </span>
        <div>
          <p className="text-sm font-semibold text-slate-900">2 minuten oefenen</p>
          <p className="text-xs text-slate-500">{AANTAL_VRAGEN} snelle oefenvragen, kies zelf een vak</p>
        </div>
      </Card>

      <Modal open={open} onClose={sluit} title="2 minuten oefenen">
        <div className="flex flex-col gap-4">
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
              <p className="text-xs font-medium text-slate-500">
                {subject.name} - vraag {vraagNr} van {AANTAL_VRAGEN}
              </p>
              <div className="rounded-xl bg-slate-50 p-3 font-medium text-slate-800">
                <MarkdownTekst>{vraag ?? ""}</MarkdownTekst>
              </div>

              {opties ? (
                <div className="flex flex-col gap-2">
                  {opties.map((optie, i) => (
                    <button
                      key={i}
                      disabled={bezig}
                      onClick={() => controleer(optie)}
                      className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-left text-sm text-slate-700 transition-colors hover:border-accent-300 hover:bg-accent-50 disabled:opacity-50"
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
                    rows={2}
                    placeholder="Typ hier je antwoord..."
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100"
                  />
                  <Button loading={bezig} disabled={!antwoord.trim()} onClick={() => controleer()}>
                    Controleren
                  </Button>
                </>
              )}
              {error && <p className="text-sm text-rose-600">{error}</p>}
              <Button variant="secondary" type="button" onClick={sluit}>
                Stoppen
              </Button>
            </div>
          )}

          {fase === "feedback" && feedback && (
            <div className="flex flex-col gap-3">
              <div className={clsx("rounded-xl border p-3 text-sm", BEOORDELING_STIJL[feedback.beoordeling])}>
                <MarkdownTekst>{feedback.tekst}</MarkdownTekst>
              </div>

              {uitleg && (
                <div className="rounded-xl border border-accent-200 bg-accent-50/60 p-3 text-sm text-slate-700">
                  <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-accent-700">
                    <Icon name="brain" size={13} />
                    Extra uitleg
                  </p>
                  <MarkdownTekst>{uitleg}</MarkdownTekst>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <Button onClick={volgendeVraag} icon={<Icon name={vraagNr >= AANTAL_VRAGEN ? "check" : "chevron-right"} size={16} />}>
                  {vraagNr >= AANTAL_VRAGEN ? "Klaar" : "Volgende vraag"}
                </Button>
                {(feedback.beoordeling === "deels" || feedback.beoordeling === "fout") && (
                  <Button variant="secondary" loading={uitlegBezig} onClick={vraagUitleg} icon={<Icon name="brain" size={16} />}>
                    Ik snap het nog niet
                  </Button>
                )}
              </div>
              {error && <p className="text-sm text-rose-600">{error}</p>}
            </div>
          )}

          {fase === "klaar" && (
            <div className="flex flex-col gap-3">
              <p className="flex items-center gap-1.5 text-sm text-emerald-700">
                <Icon name="party" size={16} />
                Goed gedaan! Tot de volgende keer.
              </p>
              <div className="flex gap-2">
                <Button onClick={reset} icon={<Icon name="sparkles" size={16} />}>
                  Nog een keer
                </Button>
                <Button variant="secondary" onClick={sluit}>
                  Sluiten
                </Button>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
