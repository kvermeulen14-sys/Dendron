"use client";

import { useState } from "react";
import clsx from "clsx";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/icon";
import { MarkdownTekst } from "@/components/markdown-tekst";
import { VisualWeergave } from "@/components/visuals/visual-weergave";
import { slaOverhoorResultaatOp, type OverhoorTranscriptRegel } from "@/lib/actions/overhoor";
import { eenRegel, normaliseerWiskundeNotatie } from "@/lib/tekst";
import { extraheerVisuals, type VisualSpec } from "@/lib/visuals";
import { bepaalLeerfaseAdvies } from "@/lib/oefen-advies";
import type { Leerfase } from "@/lib/types";

type Beoordeling = "goed" | "deels" | "fout" | "geen";
type Stijl = "open" | "meerkeuze";
type WizardStap = "hoofdstuk" | "stijl" | null;
type SessieFase = "vraag" | "feedback" | "klaar";
type LesstofFragment = { titel: string; tekst: string } | null;
type Onderwerp = { paragraafId: string; titel: string };
type HoofdstukStructuur = { hoofdstuk: string; onderwerpen: Onderwerp[] };

const LEERFASE_OPTIES: { value: Leerfase; label: string; uitleg: string }[] = [
  { value: "eerste", label: "Eerste keer", uitleg: "Meer hulp, rustig opbouwen" },
  { value: "tussentijds", label: "Tussentijds oefenen", uitleg: "Gemiddeld niveau" },
  { value: "laatste", label: "Vlak voor de toets", uitleg: "Pittig, zoals de toets" },
];

// Geen vaste "beste" lengte volgens onderzoek (dat hangt af van spreiding/
// moeilijkheid/leerling) - wel is elke oefenmoment beter dan geen, en een
// korte, afgebakende sessie is makkelijker vol te houden en te herhalen dan
// 1 lange, open sessie. Daarom een paar concrete keuzes i.p.v. 1 "juist" getal.
const LENGTE_OPTIES: { waarde: number | null; label: string }[] = [
  { waarde: 5, label: "5 vragen" },
  { waarde: 10, label: "10 vragen" },
  { waarde: null, label: "Tot ik stop" },
];

const BEOORDELING_STIJL: Record<Beoordeling, { label: string; icon: string; className: string }> = {
  goed: { label: "Goed!", icon: "party", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  deels: { label: "Deels goed", icon: "sparkles", className: "border-amber-200 bg-amber-50 text-amber-700" },
  fout: { label: "Nog niet helemaal", icon: "brain", className: "border-rose-200 bg-rose-50 text-rose-700" },
  geen: { label: "", icon: "sparkles", className: "" },
};

const LETTERS = ["a", "b", "c", "d", "e", "f"];

function normOpties(o: unknown): string[] | null {
  return Array.isArray(o) && o.length > 0 ? (o as string[]) : null;
}

function normFragment(f: unknown): LesstofFragment {
  if (!f || typeof f !== "object") return null;
  const rec = f as Record<string, unknown>;
  if (typeof rec.titel === "string" && typeof rec.tekst === "string") return { titel: rec.titel, tekst: rec.tekst };
  return null;
}

export function OverhoorPanel({
  subjectId,
  subjectName,
  hoofdstukStructuur = [],
  sessieActiefChange,
  dagenTotToets = null,
}: {
  subjectId: string;
  subjectName: string;
  hoofdstukStructuur?: HoofdstukStructuur[];
  /** Meldt aan de omgeving of er een sessie loopt, zodat elders (bv. lesstof toevoegen) verborgen kan worden. */
  sessieActiefChange?: (actief: boolean) => void;
  /** Dagen tot de eerstvolgende toets voor dit vak - stuurt het automatische leerfase-advies hieronder. */
  dagenTotToets?: number | null;
}) {
  const leerfaseAdvies = bepaalLeerfaseAdvies(dagenTotToets);

  const [gestart, setGestart] = useState(false);
  const [spellingStrict, setSpellingStrict] = useState(false);
  // Vlak voor een toets start dit automatisch op "vlak voor de toets" (zonder
  // hints) - de leerling kan dit hieronder altijd zelf nog aanpassen.
  const [leerfase, setLeerfase] = useState<Leerfase>(() => leerfaseAdvies?.leerfase ?? "tussentijds");

  const [wizardStap, setWizardStap] = useState<WizardStap>(null);
  const [gekozenHoofdstuk, setGekozenHoofdstuk] = useState<string | null>(null);
  const [gekozenOnderwerp, setGekozenOnderwerp] = useState<Onderwerp | null>(null);
  const [opengeklapt, setOpengeklapt] = useState<string | null>(null);
  const [andersInvoer, setAndersInvoer] = useState("");
  const [andersModus, setAndersModus] = useState(false);
  const [gekozenStijl, setGekozenStijl] = useState<Stijl | null>(null);
  const [gekozenLengte, setGekozenLengte] = useState<number | null>(null);
  const [scopeInstructie, setScopeInstructie] = useState<string | null>(null);
  const [maxVragen, setMaxVragen] = useState<number | null>(null);
  const [vraagIndex, setVraagIndex] = useState(0);

  const [fase, setFase] = useState<SessieFase>("vraag");
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
  const [feedback, setFeedback] = useState<string | null>(null);
  const [feedbackVisuals, setFeedbackVisuals] = useState<VisualSpec[]>([]);
  const [beoordeling, setBeoordeling] = useState<Beoordeling | null>(null);
  const [lesstofFragment, setLesstofFragment] = useState<LesstofFragment>(null);
  const [juisteAntwoord, setJuisteAntwoord] = useState<string | null>(null);
  const [zelfCheck, setZelfCheck] = useState(false);
  const [zelfCheckAntwoord, setZelfCheckAntwoord] = useState<string | null>(null);
  const [zelfCheckOnthuld, setZelfCheckOnthuld] = useState(false);
  const [laatsteWasZelfCheck, setLaatsteWasZelfCheck] = useState(false);
  const [gesteldeVragen, setGesteldeVragen] = useState<string[]>([]);
  const [transcript, setTranscript] = useState<OverhoorTranscriptRegel[]>([]);
  const [score, setScore] = useState({ goed: 0, deels: 0, fout: 0 });
  const [bezig, setBezig] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function meldSessieStatus(actief: boolean) {
    sessieActiefChange?.(actief);
  }

  function start() {
    setGestart(true);
    meldSessieStatus(true);
    setScore({ goed: 0, deels: 0, fout: 0 });
    setFeedback(null);
    setFeedbackVisuals([]);
    setBeoordeling(null);
    setLesstofFragment(null);
    setJuisteAntwoord(null);
    setZelfCheck(false);
    setZelfCheckAntwoord(null);
    setZelfCheckOnthuld(false);
    setLaatsteWasZelfCheck(false);
    setGesteldeVragen([]);
    setTranscript([]);
    setScopeInstructie(null);
    setGekozenHoofdstuk(null);
    setGekozenOnderwerp(null);
    setOpengeklapt(null);
    setGekozenStijl(null);
    setGekozenLengte(null);
    setAndersInvoer("");
    setAndersModus(false);
    setMaxVragen(null);
    setVraagIndex(0);
    setVraag(null);
    setVraagVisuals([]);
    setOpties(null);
    setJuisteOptie(null);
    setVolgende(null);
    setFase("vraag");
    setWizardStap(hoofdstukStructuur.length > 0 ? "hoofdstuk" : "stijl");
  }

  /** Heel hoofdstuk oefenen (geen specifiek onderwerp erbinnen), of vrije tekst via "Anders". */
  function kiesHoofdstuk(h: string | null) {
    setGekozenHoofdstuk(h);
    setGekozenOnderwerp(null);
    setWizardStap("stijl");
  }

  /** 1 specifiek onderwerp (paragraaf) binnen een hoofdstuk oefenen - duidelijker en gerichter dan het hele hoofdstuk. */
  function kiesOnderwerp(hoofdstuk: string, onderwerp: Onderwerp) {
    setGekozenHoofdstuk(hoofdstuk);
    setGekozenOnderwerp(onderwerp);
    setWizardStap("stijl");
  }

  function bevestigAnders() {
    if (!andersInvoer.trim()) return;
    kiesHoofdstuk(andersInvoer.trim());
  }

  async function beginnen() {
    if (!gekozenStijl) return;
    const onderwerp = gekozenOnderwerp
      ? `paragraaf ${gekozenOnderwerp.paragraafId} - "${gekozenOnderwerp.titel}" (binnen hoofdstuk "${gekozenHoofdstuk}")`
      : gekozenHoofdstuk
        ? `"${gekozenHoofdstuk}"`
        : "alle beschikbare lesstof";
    const instructie = `Onderwerp: ${onderwerp}. Vraagstijl: ${gekozenStijl === "meerkeuze" ? "meerkeuzevragen (3-4 opties)" : "open vragen"}.`;
    setScopeInstructie(instructie);
    setMaxVragen(gekozenLengte);
    setWizardStap(null);

    setBezig(true);
    setError(null);
    try {
      const res = await fetch("/api/overhoor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subjectId, spellingStrict, leerfase, gesteldeVragen: [], scopeInstructie: instructie }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Er ging iets mis.");
      const { tekst: vraagTekst, visuals } = extraheerVisuals(data.vraag ?? "");
      setVraag(vraagTekst);
      setVraagVisuals(visuals);
      setOpties(normOpties(data.opties));
      setZelfCheck(Boolean(data.zelfCheck));
      setZelfCheckAntwoord(typeof data.zelfCheckAntwoord === "string" ? data.zelfCheckAntwoord : null);
      setZelfCheckOnthuld(false);
      setVraagIndex(1);
      setFase("vraag");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Er ging iets mis.");
      setWizardStap("stijl");
    } finally {
      setBezig(false);
    }
  }

  async function controleer(gegevenAntwoord: string) {
    if (!vraag || !gegevenAntwoord.trim()) return;
    setBezig(true);
    setError(null);
    const dieZelfCheckWas = zelfCheck;
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
          vorigAntwoord: gegevenAntwoord,
          scopeInstructie,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Er ging iets mis.");

      const nieuweBeoordeling = (data.beoordeling as Beoordeling) ?? "geen";
      if (nieuweBeoordeling !== "geen") {
        setScore((s) => ({ ...s, [nieuweBeoordeling]: s[nieuweBeoordeling] + 1 }));
      }
      const { tekst: feedbackTekst, visuals: fVisuals } = extraheerVisuals(data.feedback || "");
      setFeedback(feedbackTekst || null);
      setFeedbackVisuals(fVisuals);
      setBeoordeling(nieuweBeoordeling);
      setJuisteOptie(typeof data.juisteOptie === "string" ? data.juisteOptie : null);
      setJuisteAntwoord(typeof data.juisteAntwoord === "string" ? data.juisteAntwoord : null);
      setLaatsteWasZelfCheck(dieZelfCheckWas);
      setLesstofFragment(normFragment(data.lesstofFragment));
      setLaatsteAntwoord(gegevenAntwoord);
      setGesteldeVragen((prev) => [...prev, vraag]);
      setTranscript((prev) => [
        ...prev,
        { vraag, antwoord: gegevenAntwoord, feedback: data.feedback || "", beoordeling: nieuweBeoordeling },
      ]);
      const { tekst: volgendeVraagTekst, visuals: volgendeVisuals } = extraheerVisuals(data.vraag ?? "");
      setVolgende({
        vraag: volgendeVraagTekst,
        visuals: volgendeVisuals,
        opties: normOpties(data.opties),
        zelfCheck: Boolean(data.zelfCheck),
        zelfCheckAntwoord: typeof data.zelfCheckAntwoord === "string" ? data.zelfCheckAntwoord : null,
      });
      setAntwoord("");
      setFase("feedback");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Er ging iets mis.");
    } finally {
      setBezig(false);
    }
  }

  function volgendeVraag() {
    if (maxVragen !== null && vraagIndex >= maxVragen) {
      if (score.goed + score.deels + score.fout > 0) {
        void slaOverhoorResultaatOp(subjectId, leerfase, score, transcript, gekozenOnderwerp?.titel ?? gekozenHoofdstuk);
      }
      setFase("klaar");
      return;
    }
    if (!volgende) return;
    setVraag(volgende.vraag);
    setVraagVisuals(volgende.visuals);
    setOpties(volgende.opties);
    setJuisteOptie(null);
    setZelfCheck(volgende.zelfCheck);
    setZelfCheckAntwoord(volgende.zelfCheckAntwoord);
    setZelfCheckOnthuld(false);
    setVolgende(null);
    setFeedback(null);
    setFeedbackVisuals([]);
    setBeoordeling(null);
    setLesstofFragment(null);
    setJuisteAntwoord(null);
    setVraagIndex((n) => n + 1);
    setFase("vraag");
  }

  function stop() {
    if (score.goed + score.deels + score.fout > 0) {
      void slaOverhoorResultaatOp(subjectId, leerfase, score, transcript, gekozenHoofdstuk);
    }
    setGestart(false);
    meldSessieStatus(false);
    setWizardStap(null);
    setVraag(null);
  }

  if (!gestart) {
    return (
      <Card className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Icon name="target" size={18} className="text-accent-600" />
          <p className="text-sm font-semibold text-slate-900">Oefenen met {subjectName}</p>
        </div>

        <div>
          <p className="mb-1.5 text-sm font-medium text-slate-700">In welke fase zit je?</p>
          {leerfaseAdvies && (
            <p className="mb-2 flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
              <Icon name="alert-circle" size={14} className="shrink-0" />
              {leerfaseAdvies.reden}
            </p>
          )}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {LEERFASE_OPTIES.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setLeerfase(opt.value)}
                className={clsx(
                  "relative rounded-xl border px-3 py-2.5 text-left text-xs transition-colors",
                  leerfase === opt.value
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 text-slate-600 hover:bg-slate-50"
                )}
              >
                {leerfaseAdvies?.leerfase === opt.value && (
                  <span className="absolute -top-2 right-2 rounded-full bg-rose-500 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
                    Aanbevolen
                  </span>
                )}
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
          Beginnen
        </Button>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon name="target" size={18} className="text-accent-600" />
          <div>
            <p className="text-sm font-semibold text-slate-900">Oefenen - {subjectName}</p>
            {wizardStap === null && (gekozenOnderwerp || gekozenHoofdstuk) && (
              <p className="text-xs text-slate-500">{gekozenOnderwerp ? gekozenOnderwerp.titel : gekozenHoofdstuk}</p>
            )}
          </div>
        </div>
        <button onClick={stop} className="text-xs font-medium text-slate-500 hover:underline">
          Stoppen
        </button>
      </div>

      {wizardStap !== null ? (
        <div className="flex flex-col gap-4">
          {wizardStap === "hoofdstuk" ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm font-medium text-slate-700">Wat wil je oefenen?</p>
              <div className="flex flex-col gap-2">
                {hoofdstukStructuur.map((h) => {
                  const open = opengeklapt === h.hoofdstuk;
                  const heeftOnderwerpen = h.onderwerpen.length > 0;
                  return (
                    <div key={h.hoofdstuk} className="overflow-hidden rounded-xl border border-slate-200">
                      <button
                        onClick={() => (heeftOnderwerpen ? setOpengeklapt(open ? null : h.hoofdstuk) : kiesHoofdstuk(h.hoofdstuk))}
                        className="flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
                      >
                        <span>H. {h.hoofdstuk}</span>
                        {heeftOnderwerpen && (
                          <Icon
                            name="chevron-right"
                            size={15}
                            className={clsx("shrink-0 text-slate-400 transition-transform", open && "rotate-90")}
                          />
                        )}
                      </button>
                      {open && heeftOnderwerpen && (
                        <div className="flex flex-col gap-1 border-t border-slate-100 bg-slate-50/60 p-2">
                          <button
                            onClick={() => kiesHoofdstuk(h.hoofdstuk)}
                            className="rounded-lg px-3 py-2 text-left text-sm font-medium text-accent-700 transition-colors hover:bg-accent-50"
                          >
                            Heel hoofdstuk {h.hoofdstuk} oefenen
                          </button>
                          {h.onderwerpen.map((o) => (
                            <button
                              key={o.paragraafId}
                              onClick={() => kiesOnderwerp(h.hoofdstuk, o)}
                              className="rounded-lg px-3 py-2 text-left text-sm text-slate-600 transition-colors hover:bg-white hover:text-slate-900"
                            >
                              {o.paragraafId} - {o.titel}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => kiesHoofdstuk(null)}
                  className="rounded-xl border border-dashed border-slate-300 px-3.5 py-2.5 text-sm font-medium text-slate-500 transition-colors hover:border-accent-300 hover:bg-accent-50"
                >
                  Alle lesstof
                </button>
                <button
                  onClick={() => setAndersModus(true)}
                  className={clsx(
                    "rounded-xl border border-dashed px-3.5 py-2.5 text-sm font-medium transition-colors hover:border-accent-300 hover:bg-accent-50",
                    andersModus ? "border-accent-300 bg-accent-50 text-accent-700" : "border-slate-300 text-slate-500"
                  )}
                >
                  Anders, namelijk...
                </button>
              </div>
              {andersModus && (
                <div className="flex gap-2">
                  <input
                    autoFocus
                    value={andersInvoer}
                    onChange={(e) => setAndersInvoer(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && bevestigAnders()}
                    placeholder="Bijv. 'de opgaven over breuken' of 'paragraaf 4.2 en 4.3'"
                    className="flex-1 rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100"
                  />
                  <Button size="md" disabled={!andersInvoer.trim()} onClick={bevestigAnders}>
                    Verder
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-slate-700">Hoe wil je de vragen?</p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs text-accent-700">
                    <Icon name="target" size={12} />
                    Je gaat oefenen: {gekozenOnderwerp ? gekozenOnderwerp.titel : (gekozenHoofdstuk ?? "alle lesstof")}
                  </p>
                </div>
                {hoofdstukStructuur.length > 0 && (
                  <button
                    onClick={() => setWizardStap("hoofdstuk")}
                    className="flex shrink-0 items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700"
                  >
                    <Icon name="chevron-left" size={13} />
                    Terug
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  onClick={() => setGekozenStijl("open")}
                  className={clsx(
                    "flex flex-col items-start gap-1 rounded-xl border px-3.5 py-3 text-left transition-colors",
                    gekozenStijl === "open" ? "border-accent-400 bg-accent-50" : "border-slate-200 hover:border-accent-300 hover:bg-accent-50"
                  )}
                >
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
                    <Icon name="pencil-line" size={16} className="text-accent-600" />
                    Open vragen
                  </span>
                  <span className="text-xs text-slate-500">Zelf het antwoord intypen</span>
                </button>
                <button
                  onClick={() => setGekozenStijl("meerkeuze")}
                  className={clsx(
                    "flex flex-col items-start gap-1 rounded-xl border px-3.5 py-3 text-left transition-colors",
                    gekozenStijl === "meerkeuze"
                      ? "border-accent-400 bg-accent-50"
                      : "border-slate-200 hover:border-accent-300 hover:bg-accent-50"
                  )}
                >
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
                    <Icon name="check" size={16} className="text-accent-600" />
                    Meerkeuze
                  </span>
                  <span className="text-xs text-slate-500">Zoals op sommige toetsen</span>
                </button>
              </div>

              <div>
                <p className="mb-2 text-sm font-medium text-slate-700">Hoeveel wil je oefenen?</p>
                <div className="flex flex-wrap gap-2">
                  {LENGTE_OPTIES.map((opt) => (
                    <button
                      key={opt.label}
                      onClick={() => setGekozenLengte(opt.waarde)}
                      className={clsx(
                        "rounded-xl border px-3.5 py-2 text-sm font-medium transition-colors",
                        gekozenLengte === opt.waarde
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-200 text-slate-600 hover:bg-slate-50"
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <Button loading={bezig} disabled={!gekozenStijl} onClick={beginnen} icon={<Icon name="rocket" size={18} />}>
                Beginnen
              </Button>
            </div>
          )}
          {error && <p className="text-sm text-rose-600">{error}</p>}
        </div>
      ) : fase === "klaar" ? (
        <div className="flex flex-col gap-3">
          <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-700">
            <Icon name="party" size={16} />
            Klaar! {score.goed} goed, {score.deels} deels, {score.fout} nog niet.
          </p>
          <div className="flex gap-2">
            <Button onClick={start} icon={<Icon name="rocket" size={16} />}>
              Nog een keer
            </Button>
            <Button variant="secondary" onClick={stop}>
              Klaar voor nu
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
            <div className="flex gap-3">
              <span>{score.goed} goed</span>
              <span>{score.deels} deels</span>
              <span>{score.fout} nog niet</span>
            </div>
            {maxVragen !== null && (
              <span className="font-medium text-slate-600">
                vraag {Math.min(vraagIndex, maxVragen)} van {maxVragen}
              </span>
            )}
          </div>

          {maxVragen !== null && (
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-accent-500 transition-all"
                style={{ width: `${Math.min(100, (Math.min(vraagIndex, maxVragen) / maxVragen) * 100)}%` }}
              />
            </div>
          )}

          {bezig && !vraag ? (
            <p className="text-sm text-slate-400">Volgende vraag wordt bedacht...</p>
          ) : (
            vraag && (
              <div className="flex flex-col gap-3">
                <div className="rounded-xl bg-slate-50 p-3 font-medium text-slate-800">
                  <MarkdownTekst>{eenRegel(vraag)}</MarkdownTekst>
                  {vraagVisuals.map((v, i) => (
                    <VisualWeergave key={i} visual={v} />
                  ))}
                </div>

                {fase === "feedback" ? (
                  <>
                    {opties ? (
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
                    ) : laatsteWasZelfCheck ? (
                      <p className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-500">
                        <Icon name="check" size={14} className="text-slate-400" />
                        Je hebt dit zelf op papier gecontroleerd.
                      </p>
                    ) : (
                      <>
                        <p className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-600">
                          <span className="font-medium text-slate-400">Jouw antwoord: </span>
                          {laatsteAntwoord}
                        </p>
                        {juisteAntwoord && beoordeling !== "goed" && (
                          <p className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-3.5 py-2.5 text-sm text-emerald-800">
                            <span className="font-medium">Het juiste antwoord: </span>
                            {juisteAntwoord}
                          </p>
                        )}
                      </>
                    )}
                    {beoordeling && beoordeling !== "geen" && (
                      <div
                        className={clsx(
                          "flex items-start gap-2 rounded-xl border p-3 text-sm",
                          BEOORDELING_STIJL[beoordeling].className
                        )}
                      >
                        <Icon name={BEOORDELING_STIJL[beoordeling].icon} size={16} className="mt-0.5 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium">{BEOORDELING_STIJL[beoordeling].label}</p>
                          {feedback && <MarkdownTekst className="mt-0.5">{feedback}</MarkdownTekst>}
                          {feedbackVisuals.map((v, i) => (
                            <VisualWeergave key={i} visual={v} />
                          ))}
                        </div>
                      </div>
                    )}
                    {lesstofFragment && (
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                        <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                          <Icon name="book-open" size={13} />
                          Uit je lesstof - {lesstofFragment.titel}
                        </p>
                        <p className="whitespace-pre-wrap">{normaliseerWiskundeNotatie(lesstofFragment.tekst)}</p>
                      </div>
                    )}
                    <Button loading={bezig} onClick={volgendeVraag} icon={<Icon name="chevron-right" size={16} />}>
                      {maxVragen !== null && vraagIndex >= maxVragen ? "Afronden" : "Volgende vraag"}
                    </Button>
                  </>
                ) : opties ? (
                  <div className="flex flex-col gap-2">
                    {opties.map((optie, i) => (
                      <button
                        key={i}
                        disabled={bezig}
                        onClick={() => controleer(optie)}
                        className="flex items-start gap-2.5 rounded-xl border border-slate-200 px-3.5 py-2.5 text-left text-sm text-slate-700 transition-colors hover:border-accent-300 hover:bg-accent-50 disabled:opacity-50"
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
                      rows={3}
                      placeholder="Typ hier je antwoord..."
                      className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100"
                    />
                    <Button loading={bezig} disabled={!antwoord.trim()} onClick={() => controleer(antwoord)}>
                      Controleren
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
