"use client";

import { useState } from "react";
import clsx from "clsx";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Icon } from "@/components/icon";
import { MarkdownTekst } from "@/components/markdown-tekst";
import { VisualWeergave } from "@/components/visuals/visual-weergave";
import { slaOverhoorResultaatOp, type OverhoorTranscriptRegel } from "@/lib/actions/overhoor";
import { eenRegel, normaliseerWiskundeNotatie } from "@/lib/tekst";
import { extraheerVisuals, type VisualSpec } from "@/lib/visuals";
import { bepaalLeerfaseAdvies, type OefenAdvies } from "@/lib/oefen-advies";
import type { Leerfase, Subject } from "@/lib/types";

type Beoordeling = "goed" | "deels" | "fout" | "geen";
type Fase = "kies" | "vraag" | "feedback" | "klaar";
type LesstofFragment = { titel: string; tekst: string } | null;

function normFragment(f: unknown): LesstofFragment {
  if (!f || typeof f !== "object") return null;
  const rec = f as Record<string, unknown>;
  if (typeof rec.titel === "string" && typeof rec.tekst === "string") return { titel: rec.titel, tekst: rec.tekst };
  return null;
}

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
export function TweeMinutenOefenen({
  subjects,
  laatsteOnderwerpPerVak,
  oefenAdvies,
  dagenTotToetsPerVak,
}: {
  subjects: Subject[];
  /** Hoofdstuk per vak-id om de vragen op te richten, zodat er niet zomaar uit de hele lesstof geput wordt. */
  laatsteOnderwerpPerVak?: Map<string, string>;
  /** Welk vak nu de meeste aandacht verdient (lang niet geoefend en/of recent moeilijk) - zie lib/oefen-advies.ts. */
  oefenAdvies?: OefenAdvies | null;
  /** Dagen tot de eerstvolgende toets per vak - stuurt het automatische leerfase-advies bij het starten. */
  dagenTotToetsPerVak?: Map<string, number>;
}) {
  const [open, setOpen] = useState(false);
  const [fase, setFase] = useState<Fase>("kies");
  const [subject, setSubject] = useState<Subject | null>(null);
  const [leerfase, setLeerfase] = useState<Leerfase>("tussentijds");
  const [leerfaseReden, setLeerfaseReden] = useState<string | null>(null);
  const [vraagNr, setVraagNr] = useState(0);
  const [vraag, setVraag] = useState<string | null>(null);
  const [vraagVisuals, setVraagVisuals] = useState<VisualSpec[]>([]);
  const [opties, setOpties] = useState<string[] | null>(null);
  const [juisteOptie, setJuisteOptie] = useState<string | null>(null);
  const [volgende, setVolgende] = useState<{
    vraag: string;
    visuals: VisualSpec[];
    opties: string[] | null;
    zelfCheck: boolean;
    zelfCheckAntwoord: string | null;
  } | null>(null);
  const [antwoord, setAntwoord] = useState("");
  const [laatsteAntwoord, setLaatsteAntwoord] = useState("");
  const [feedback, setFeedback] = useState<{ tekst: string; beoordeling: Beoordeling } | null>(null);
  const [feedbackVisuals, setFeedbackVisuals] = useState<VisualSpec[]>([]);
  const [lesstofFragment, setLesstofFragment] = useState<LesstofFragment>(null);
  const [juisteAntwoord, setJuisteAntwoord] = useState<string | null>(null);
  const [zelfCheck, setZelfCheck] = useState(false);
  const [zelfCheckAntwoord, setZelfCheckAntwoord] = useState<string | null>(null);
  const [zelfCheckOnthuld, setZelfCheckOnthuld] = useState(false);
  const [laatsteWasZelfCheck, setLaatsteWasZelfCheck] = useState(false);
  const [uitleg, setUitleg] = useState<string | null>(null);
  const [uitlegBezig, setUitlegBezig] = useState(false);
  const [gesteldeVragen, setGesteldeVragen] = useState<string[]>([]);
  const [scopeInstructie, setScopeInstructie] = useState<string | undefined>(undefined);
  const [transcript, setTranscript] = useState<OverhoorTranscriptRegel[]>([]);
  const [score, setScore] = useState({ goed: 0, deels: 0, fout: 0 });
  const [bezig, setBezig] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (subjects.length === 0) return null;

  const aanbevolenVak = oefenAdvies ? subjects.find((s) => s.id === oefenAdvies.subjectId) : undefined;
  const overigeVakken = aanbevolenVak ? subjects.filter((s) => s.id !== aanbevolenVak.id) : subjects;

  function reset() {
    setFase("kies");
    setSubject(null);
    setLeerfase("tussentijds");
    setLeerfaseReden(null);
    setVraagNr(0);
    setVraag(null);
    setVraagVisuals([]);
    setOpties(null);
    setJuisteOptie(null);
    setVolgende(null);
    setAntwoord("");
    setFeedback(null);
    setFeedbackVisuals([]);
    setLesstofFragment(null);
    setJuisteAntwoord(null);
    setZelfCheck(false);
    setZelfCheckAntwoord(null);
    setZelfCheckOnthuld(false);
    setLaatsteWasZelfCheck(false);
    setUitleg(null);
    setGesteldeVragen([]);
    setScopeInstructie(undefined);
    setTranscript([]);
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
    // Zonder dit scopet de AI zelf maar wat uit de hele lesstof - met alle
    // kans op een vraag over stof die nog lang niet behandeld is. Met het
    // laatst geoefende (of laatst toegevoegde) hoofdstuk sluit dit aan bij
    // waar de leerling nu mee bezig is.
    const onderwerp = laatsteOnderwerpPerVak?.get(s.id);
    const scope = onderwerp ? `Onderwerp: "${onderwerp}". Vraagstijl: mix van open en meerkeuze vragen.` : undefined;
    setScopeInstructie(scope);
    // Vlak voor een toets voor dit vak: strenger oefenen, zonder hints -
    // zie bepaalLeerfaseAdvies in lib/oefen-advies.ts.
    const advies = bepaalLeerfaseAdvies(dagenTotToetsPerVak?.get(s.id) ?? null);
    const gekozenLeerfase = advies?.leerfase ?? "tussentijds";
    setLeerfase(gekozenLeerfase);
    setLeerfaseReden(advies?.reden ?? null);
    try {
      const res = await fetch("/api/overhoor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subjectId: s.id,
          leerfase: gekozenLeerfase,
          spellingStrict: false,
          gesteldeVragen: [],
          scopeInstructie: scope,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Kon geen vraag ophalen.");
      const { tekst: vraagTekst, visuals } = extraheerVisuals(data.vraag ?? "");
      setSubject(s);
      setVraag(vraagTekst);
      setVraagVisuals(visuals);
      setOpties(Array.isArray(data.opties) && data.opties.length > 0 ? data.opties : null);
      setZelfCheck(Boolean(data.zelfCheck));
      setZelfCheckAntwoord(typeof data.zelfCheckAntwoord === "string" ? data.zelfCheckAntwoord : null);
      setZelfCheckOnthuld(false);
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
    const dieZelfCheckWas = zelfCheck;
    try {
      const res = await fetch("/api/overhoor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subjectId: subject.id,
          leerfase,
          spellingStrict: false,
          gesteldeVragen,
          vorigeVraag: vraag,
          vorigAntwoord: antwoordTeControleren,
          scopeInstructie,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Kon niet controleren.");

      const beoordeling = (data.beoordeling as Beoordeling) ?? "geen";
      const { tekst: feedbackTekst, visuals: fVisuals } = extraheerVisuals(data.feedback || "");
      setFeedback({ tekst: feedbackTekst, beoordeling });
      setFeedbackVisuals(fVisuals);
      setJuisteOptie(typeof data.juisteOptie === "string" ? data.juisteOptie : null);
      setJuisteAntwoord(typeof data.juisteAntwoord === "string" ? data.juisteAntwoord : null);
      setLaatsteWasZelfCheck(dieZelfCheckWas);
      setLesstofFragment(normFragment(data.lesstofFragment));
      if (beoordeling === "goed" || beoordeling === "deels" || beoordeling === "fout") {
        setScore((s) => ({ ...s, [beoordeling]: s[beoordeling] + 1 }));
      }
      setGesteldeVragen((prev) => [...prev, vraag]);
      setTranscript((prev) => [
        ...prev,
        { vraag, antwoord: antwoordTeControleren, feedback: data.feedback || "", beoordeling },
      ]);
      setLaatsteAntwoord(antwoordTeControleren);
      const { tekst: volgendeVraagTekst, visuals: volgendeVisuals } = extraheerVisuals(data.vraag ?? "");
      setVolgende({
        vraag: volgendeVraagTekst,
        visuals: volgendeVisuals,
        opties: Array.isArray(data.opties) && data.opties.length > 0 ? data.opties : null,
        zelfCheck: Boolean(data.zelfCheck),
        zelfCheckAntwoord: typeof data.zelfCheckAntwoord === "string" ? data.zelfCheckAntwoord : null,
      });
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
      void slaOverhoorResultaatOp(subject!.id, leerfase, score, transcript, laatsteOnderwerpPerVak?.get(subject!.id) ?? null);
      return;
    }
    setVraag(volgende?.vraag ?? null);
    setVraagVisuals(volgende?.visuals ?? []);
    setOpties(volgende?.opties ?? null);
    setJuisteOptie(null);
    setZelfCheck(volgende?.zelfCheck ?? false);
    setZelfCheckAntwoord(volgende?.zelfCheckAntwoord ?? null);
    setZelfCheckOnthuld(false);
    setVraagNr((n) => n + 1);
    setFeedback(null);
    setFeedbackVisuals([]);
    setLesstofFragment(null);
    setJuisteAntwoord(null);
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
          <p className="text-xs text-slate-500">
            {aanbevolenVak ? (
              <>
                <span className="font-medium text-accent-700">{aanbevolenVak.name}</span> - {oefenAdvies!.tekst}
              </>
            ) : (
              `${AANTAL_VRAGEN} snelle oefenvragen, kies zelf een vak`
            )}
          </p>
        </div>
      </Card>

      <Modal open={open} onClose={sluit} title="2 minuten oefenen">
        <div className="flex flex-col gap-4">
          {fase === "kies" && (
            <>
              {aanbevolenVak && oefenAdvies ? (
                <div className="flex flex-col gap-2">
                  <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-accent-700">
                    <Icon name="sparkles" size={13} />
                    Dit heeft nu de meeste aandacht nodig
                  </p>
                  <button
                    disabled={bezig}
                    onClick={() => start(aanbevolenVak)}
                    className="flex items-start gap-3 rounded-xl border-2 border-accent-400 bg-accent-50/60 px-3.5 py-3 text-left transition-colors hover:bg-accent-50 disabled:opacity-50"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-100 text-accent-600">
                      <Icon name={aanbevolenVak.icon} size={17} />
                    </span>
                    <span>
                      <span className="block text-sm font-semibold text-slate-900">{aanbevolenVak.name}</span>
                      <span className="block text-xs text-slate-600">{oefenAdvies.tekst}</span>
                    </span>
                  </button>
                </div>
              ) : (
                <p className="text-sm text-slate-600">Kies een vak voor {AANTAL_VRAGEN} snelle oefenvragen.</p>
              )}
              {overigeVakken.length > 0 && (
                <div className="flex flex-col gap-2">
                  {aanbevolenVak && <p className="text-xs font-medium text-slate-400">Of kies zelf een vak</p>}
                  <div className="flex flex-wrap gap-2">
                    {overigeVakken.map((s) => (
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
                </div>
              )}
              {error && <p className="text-sm text-rose-600">{error}</p>}
            </>
          )}

          {(fase === "vraag" || fase === "feedback") && subject && (
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-accent-500 transition-all"
                style={{ width: `${(Math.min(vraagNr, AANTAL_VRAGEN) / AANTAL_VRAGEN) * 100}%` }}
              />
            </div>
          )}

          {fase === "vraag" && subject && leerfaseReden && (
            <p className="flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-medium text-rose-700">
              <Icon name="alert-circle" size={13} className="shrink-0" />
              {leerfaseReden}
            </p>
          )}

          {fase === "vraag" && subject && (
            <div className="flex flex-col gap-3">
              <p className="text-xs font-medium text-slate-500">
                {subject.name} - vraag {vraagNr} van {AANTAL_VRAGEN}
                {laatsteOnderwerpPerVak?.get(subject.id) && (
                  <span className="font-normal text-slate-400"> · over {laatsteOnderwerpPerVak.get(subject.id)}</span>
                )}
              </p>
              <div className="rounded-xl bg-slate-50 p-3 font-medium text-slate-800">
                <MarkdownTekst>{eenRegel(vraag ?? "")}</MarkdownTekst>
                {vraagVisuals.map((v, i) => (
                  <VisualWeergave key={i} visual={v} />
                ))}
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
              ) : zelfCheck ? (
                <div className="flex flex-col gap-3">
                  {!zelfCheckOnthuld ? (
                    <>
                      <p className="text-xs text-slate-500">
                        Het antwoord hierop is lastig exact te typen - werk het op papier uit en controleer daarna zelf.
                      </p>
                      <Button variant="secondary" onClick={() => setZelfCheckOnthuld(true)} icon={<Icon name="eye" size={16} />}>
                        Toon het juiste antwoord
                      </Button>
                    </>
                  ) : (
                    <>
                      <div className="rounded-xl border border-accent-200 bg-accent-50/60 p-3 text-sm text-slate-700">
                        <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-accent-700">
                          <Icon name="check" size={13} />
                          Het juiste antwoord
                        </p>
                        {zelfCheckAntwoord && <MarkdownTekst>{zelfCheckAntwoord}</MarkdownTekst>}
                      </div>
                      <p className="text-sm font-medium text-slate-700">Had jij dit goed?</p>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          loading={bezig}
                          onClick={() => controleer("(zelf gecontroleerd: had ik goed)")}
                          icon={<Icon name="thumbs-up" size={16} />}
                        >
                          Ja, had ik goed
                        </Button>
                        <Button
                          variant="secondary"
                          loading={bezig}
                          onClick={() => controleer("(zelf gecontroleerd: nog niet helemaal goed)")}
                          icon={<Icon name="thumbs-down" size={16} />}
                        >
                          Nog niet helemaal
                        </Button>
                      </div>
                    </>
                  )}
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
              {opties && (
                <div className="flex flex-col gap-2">
                  {opties.map((optie, i) => {
                    const isJuist = juisteOptie !== null && optie === juisteOptie;
                    const isGekozenFout = !isJuist && optie === laatsteAntwoord;
                    return (
                      <div
                        key={i}
                        className={clsx(
                          "flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-left text-sm",
                          isJuist
                            ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                            : isGekozenFout
                              ? "border-rose-300 bg-rose-50 text-rose-700"
                              : "border-slate-200 bg-slate-50 text-slate-400"
                        )}
                      >
                        <span
                          className={clsx(
                            "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                            isJuist
                              ? "bg-emerald-200 text-emerald-800"
                              : isGekozenFout
                                ? "bg-rose-200 text-rose-700"
                                : "bg-slate-200 text-slate-500"
                          )}
                        >
                          {isJuist ? <Icon name="check" size={12} /> : isGekozenFout ? <Icon name="close" size={12} /> : LETTERS[i] ?? i + 1}
                        </span>
                        {optie}
                      </div>
                    );
                  })}
                </div>
              )}
              {!opties && laatsteWasZelfCheck && (
                <p className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-500">
                  <Icon name="check" size={14} className="text-slate-400" />
                  Je hebt dit zelf op papier gecontroleerd.
                </p>
              )}
              {!opties && !laatsteWasZelfCheck && juisteAntwoord && feedback.beoordeling !== "goed" && (
                <p className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-3.5 py-2.5 text-sm text-emerald-800">
                  <span className="font-medium">Het juiste antwoord: </span>
                  {juisteAntwoord}
                </p>
              )}
              <div className={clsx("rounded-xl border p-3 text-sm", BEOORDELING_STIJL[feedback.beoordeling])}>
                <MarkdownTekst>{feedback.tekst}</MarkdownTekst>
                {feedbackVisuals.map((v, i) => (
                  <VisualWeergave key={i} visual={v} />
                ))}
              </div>

              {lesstofFragment && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                  <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <Icon name="book-open" size={13} />
                    Uit je lesstof - {lesstofFragment.titel}
                  </p>
                  <p className="whitespace-pre-wrap">{normaliseerWiskundeNotatie(lesstofFragment.tekst)}</p>
                </div>
              )}

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
