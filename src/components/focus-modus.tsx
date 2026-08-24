"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Card } from "@/components/ui/card";
import { Button, LinkButton } from "@/components/ui/button";
import { Icon } from "@/components/icon";
import { PLANNING_TYPE_META } from "@/lib/planning";
import { updatePlanningStatus, updatePlanningWerkelijkeDuur } from "@/lib/actions/planning";
import { formatCapaciteitMinuten } from "@/lib/capaciteit";
import { DuurTerugblik } from "@/components/duur-terugblik";
import { kiesKlaarLabel, kiesVierTekst } from "@/lib/motiverend";
import { useKlaarBevestiging } from "@/lib/use-klaar-bevestiging";
import { useLokaleVoorkeur } from "@/lib/use-lokale-voorkeur";
import type { PlanningItem, Subject } from "@/lib/types";

const STANDAARD_WERK_MINUTEN = 25;
const STANDAARD_PAUZE_MINUTEN = 5;

// Geen "1 juiste" lengte volgens onderzoek - 25/5 is de bekende vuistregel,
// maar bij lastigere stof of een jonger kind werkt korter vaak beter (~15-22
// min), en bij lekker in de flow zitten juist langer (~45 min). Daarom een
// paar concrete presets in plaats van 1 vast getal, en instelbaar.
const PRESETS = [
  { werk: 15, pauze: 5, label: "15 + 5" },
  { werk: 25, pauze: 5, label: "25 + 5" },
  { werk: 45, pauze: 10, label: "45 + 10" },
] as const;

const WERK_MIN = 5;
const WERK_MAX = 90;
const PAUZE_MIN = 1;
const PAUZE_MAX = 30;

function formatTijd(seconden: number) {
  const m = Math.floor(seconden / 60)
    .toString()
    .padStart(2, "0");
  const s = (seconden % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function parseMinuten(min: number, max: number) {
  return (ruw: string) => {
    const n = Number(ruw);
    if (!Number.isFinite(n)) return null;
    return Math.max(min, Math.min(max, Math.round(n)));
  };
}

/**
 * Hoe de geschatte tijd voor deze taak het beste in blokken past. Zonder dit
 * is de timer een generiek klokje; hiermee wordt meteen duidelijk hoeveel
 * ronden er ongeveer nodig zijn - dat maakt "1 blok" behapbaar in plaats van
 * dat de hele taak als 1 grote, vage klus voelt.
 */
function berekenBlokPlan(totaalMinuten: number | null, werkMinuten: number, pauzeMinuten: number) {
  if (!totaalMinuten || totaalMinuten <= 0) return null;
  const blokken = Math.max(1, Math.round(totaalMinuten / werkMinuten));
  const werkTotaal = blokken * werkMinuten;
  const pauzeTotaal = Math.max(0, blokken - 1) * pauzeMinuten;
  return { blokken, werkTotaal, pauzeTotaal, totaal: werkTotaal + pauzeTotaal };
}

export function FocusModus({ item, subject }: { item: PlanningItem | null; subject: Subject | null }) {
  const router = useRouter();
  const meta = item ? PLANNING_TYPE_META[item.type] : { icon: "target", label: "Vrije sessie" };
  const [werkMinuten, schrijfWerkMinuten] = useLokaleVoorkeur(
    "dendron-focus-werk",
    STANDAARD_WERK_MINUTEN,
    parseMinuten(WERK_MIN, WERK_MAX)
  );
  const [pauzeMinuten, schrijfPauzeMinuten] = useLokaleVoorkeur(
    "dendron-focus-pauze",
    STANDAARD_PAUZE_MINUTEN,
    parseMinuten(PAUZE_MIN, PAUZE_MAX)
  );
  const [fase, setFase] = useState<"werk" | "pauze">("werk");
  const [secondenOver, setSecondenOver] = useState(STANDAARD_WERK_MINUTEN * 60);
  const [lopend, setLopend] = useState(false);
  const [blokNr, setBlokNr] = useState(1);
  // Meegeteld terwijl de focustimer loopt, zodat de vraag "hoe lang deed je
  // erover?" straks al een gemeten voorstel kan tonen in plaats van een gok.
  const [gewerkteSeconden, setGewerkteSeconden] = useState(0);
  const klaarBevestiging = useKlaarBevestiging();

  useEffect(() => {
    if (!lopend) return;
    const interval = setInterval(() => {
      if (fase === "werk") setGewerkteSeconden((g) => g + 1);
      setSecondenOver((s) => {
        if (s > 1) return s - 1;
        // fase wisselt automatisch, timer blijft doorlopen
        setFase((f) => {
          if (f === "pauze") setBlokNr((n) => n + 1);
          return f === "werk" ? "pauze" : "werk";
        });
        return (fase === "werk" ? pauzeMinuten : werkMinuten) * 60;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [lopend, fase, werkMinuten, pauzeMinuten]);

  function resetTimer() {
    setLopend(false);
    setSecondenOver((fase === "werk" ? werkMinuten : pauzeMinuten) * 60);
  }

  function wisselFase(nieuweFase: "werk" | "pauze") {
    setFase(nieuweFase);
    setLopend(false);
    setSecondenOver((nieuweFase === "werk" ? werkMinuten : pauzeMinuten) * 60);
  }

  // Duur aanpassen herstart de huidige fase met de nieuwe tijd - een lopende
  // ronde blijft dan niet stiekem op de oude tijd doortellen terwijl de
  // voortgangscirkel al van de nieuwe uitgaat.
  function stelDuur(nieuwWerk: number, nieuwPauze: number) {
    schrijfWerkMinuten(nieuwWerk);
    schrijfPauzeMinuten(nieuwPauze);
    setLopend(false);
    setSecondenOver((fase === "werk" ? nieuwWerk : nieuwPauze) * 60);
  }

  const gemetenMinuten = gewerkteSeconden >= 60 ? Math.round(gewerkteSeconden / 60) : null;
  const blokPlan = item ? berekenBlokPlan(item.estimated_minutes, werkMinuten, pauzeMinuten) : null;
  const huidigePreset = PRESETS.find((p) => p.werk === werkMinuten && p.pauze === pauzeMinuten);

  function naarDashboard() {
    setTimeout(() => {
      router.push("/kind");
      router.refresh();
    }, 1600);
  }

  async function afronden() {
    if (!item) return;
    const huidigItem = item;
    await klaarBevestiging.bevestig(
      async () => {
        await updatePlanningStatus(huidigItem.id, "klaar");
      },
      { vraagDuur: true }
    );
  }

  async function rondDuurAf(minuten: number | null) {
    const huidigItem = item;
    await klaarBevestiging.meldDuur(
      minuten === null || !huidigItem ? undefined : async () => updatePlanningWerkelijkeDuur(huidigItem.id, minuten)
    );
    naarDashboard();
  }

  const totaalSeconden = (fase === "werk" ? werkMinuten : pauzeMinuten) * 60;
  const voortgang = 1 - secondenOver / totaalSeconden;

  // Zonder gekoppelde taak, of bij een prive-afspraak (die bezet wel tijd
  // maar is geen afvinkbare taak), is er niets om af te vinken - dan gewoon
  // terug naar het dashboard i.p.v. de klaar-bevestiging.
  const klaarBlok = !item || item.type === "prive" ? (
    <LinkButton href="/kind" variant="secondary" className="w-full" icon={<Icon name="check" size={18} />}>
      Klaar voor nu
    </LinkButton>
  ) : (
    <>
      {klaarBevestiging.fase === "bevestigen" ? (
        <div className="flex items-center gap-2 rounded-2xl bg-slate-50 p-2.5">
          <span className="flex-1 pl-1 text-sm font-medium text-slate-600">Zeker weten?</span>
          <Button variant="secondary" onClick={klaarBevestiging.annuleer}>
            Toch niet
          </Button>
          <Button loading={klaarBevestiging.bezig} onClick={afronden} icon={<Icon name="check" size={18} />}>
            Ja, {kiesKlaarLabel(item.id).toLowerCase()}
          </Button>
        </div>
      ) : klaarBevestiging.fase === "duur" ? (
        <DuurTerugblik
          geschatteMinuten={item.estimated_minutes}
          voorstelMinuten={gemetenMinuten}
          bezig={klaarBevestiging.bezig}
          onKies={(minuten) => rondDuurAf(minuten)}
          onOverslaan={() => rondDuurAf(null)}
        />
      ) : klaarBevestiging.fase === "vieren" ? (
        <div className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-50 py-4 text-base font-semibold text-emerald-700">
          <Icon name="party" size={20} />
          {kiesVierTekst(item.id)}
        </div>
      ) : (
        <Button
          disabled={item.status === "klaar"}
          onClick={klaarBevestiging.vraagBevestiging}
          icon={<Icon name="check" size={18} />}
          className="w-full"
        >
          {item.status === "klaar" ? "Al afgevinkt" : kiesKlaarLabel(item.id)}
        </Button>
      )}
    </>
  );

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <Link href="/kind" className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700">
        <Icon name="chevron-left" size={16} />
        Terug naar dashboard
      </Link>

      <div className="grid gap-5 lg:grid-cols-[1.15fr_1fr] lg:items-start">
        <div className="flex flex-col gap-5">
          <Card className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
              <Icon name={meta.icon} size={14} />
              {meta.label}
              {subject && <span>&middot; {subject.name}</span>}
            </div>
            {item ? (
              <>
                <h1 className="text-lg font-semibold text-slate-900">{item.title}</h1>
                {item.description && <p className="text-sm text-slate-500">{item.description}</p>}
              </>
            ) : (
              <>
                <h1 className="text-lg font-semibold text-slate-900">Vrij focussen</h1>
                <p className="text-sm text-slate-500">Kies zelf waar je aan werkt - de timer helpt je gefocust blijven.</p>
              </>
            )}
          </Card>

          <Card className="flex flex-col items-center gap-5 py-10">
            <div className="flex flex-col items-center gap-1.5">
              {blokPlan && (
                <span className="text-xs font-medium text-slate-400">
                  Blok {blokNr} van {blokPlan.blokken}
                </span>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => wisselFase("werk")}
                  className={clsx(
                    "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                    fase === "werk" ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100"
                  )}
                >
                  Werken ({werkMinuten} min)
                </button>
                <button
                  onClick={() => wisselFase("pauze")}
                  className={clsx(
                    "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                    fase === "pauze" ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100"
                  )}
                >
                  Pauze ({pauzeMinuten} min)
                </button>
              </div>
            </div>

            <div className="relative flex h-64 w-64 items-center justify-center sm:h-72 sm:w-72">
              <svg viewBox="0 0 100 100" className="absolute h-full w-full -rotate-90">
                <circle cx="50" cy="50" r="45" className="fill-none stroke-slate-100" strokeWidth="7" />
                <circle
                  cx="50"
                  cy="50"
                  r="45"
                  className={clsx("fill-none transition-all duration-1000", fase === "werk" ? "stroke-accent-500" : "stroke-emerald-500")}
                  strokeWidth="7"
                  strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 45}
                  strokeDashoffset={2 * Math.PI * 45 * (1 - voortgang)}
                />
              </svg>
              <div className="flex max-w-[70%] flex-col items-center text-center">
                <span className="text-5xl font-semibold tabular-nums text-slate-900">{formatTijd(secondenOver)}</span>
                <span className="mt-2 text-sm font-medium text-slate-500">
                  {fase === "werk" ? (
                    item ? (
                      <>
                        bezig met <span className="text-slate-700">{item.title}</span>
                      </>
                    ) : (
                      "vrije focussessie"
                    )
                  ) : (
                    "pauze"
                  )}
                </span>
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={() => setLopend((l) => !l)} icon={<Icon name={lopend ? "check" : "rocket"} size={18} />}>
                {lopend ? "Pauzeer timer" : "Start timer"}
              </Button>
              <Button variant="secondary" onClick={resetTimer} icon={<Icon name="loader" size={18} />}>
                Reset
              </Button>
            </div>
          </Card>

          {subject && (
            <div className="grid grid-cols-2 gap-3">
              <LinkButton href={`/kind/vakken/${subject.id}?modus=opdracht`} variant="secondary" icon={<Icon name="pencil-line" size={18} />}>
                Opdracht maken
              </LinkButton>
              <LinkButton href={`/kind/vakken/${subject.id}?modus=overhoren`} variant="secondary" icon={<Icon name="target" size={18} />}>
                Oefenen
              </LinkButton>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-5">
          {blokPlan && item && (
            <Card className="flex flex-col gap-2.5">
              <h2 className="text-sm font-semibold text-slate-900">Jouw plan voor deze taak</h2>
              <p className="text-sm text-slate-600">
                Je schatte hiervoor <b>{formatCapaciteitMinuten(item.estimated_minutes!)}</b>. Dat past ongeveer in{" "}
                <b>
                  {blokPlan.blokken} {blokPlan.blokken === 1 ? "blok" : "blokken"} van {werkMinuten} min
                </b>
                {blokPlan.blokken > 1 && (
                  <>
                    {" "}
                    met {blokPlan.blokken - 1} {blokPlan.blokken - 1 === 1 ? "pauze" : "pauzes"} van {pauzeMinuten} min
                  </>
                )}
                , in totaal zo&apos;n {formatCapaciteitMinuten(blokPlan.totaal)}.
              </p>
              <div className="flex gap-1">
                {Array.from({ length: blokPlan.blokken }, (_, i) => (
                  <span
                    key={i}
                    className={clsx(
                      "h-1.5 flex-1 rounded-full",
                      i + 1 < blokNr ? "bg-emerald-400" : i + 1 === blokNr ? "bg-accent-500" : "bg-slate-100"
                    )}
                  />
                ))}
              </div>
            </Card>
          )}

          <Card className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-slate-900">Werk- en pauzetijd</h2>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  onClick={() => stelDuur(p.werk, p.pauze)}
                  className={clsx(
                    "rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors",
                    huidigePreset?.label === p.label
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  )}
                >
                  {p.label} min
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <span>Eigen tijden:</span>
              <input
                type="number"
                min={WERK_MIN}
                max={WERK_MAX}
                value={werkMinuten}
                onChange={(e) => e.target.value && stelDuur(Number(e.target.value), pauzeMinuten)}
                aria-label="Werktijd in minuten"
                className="w-16 rounded-lg border border-slate-200 px-2 py-1.5 text-center text-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100"
              />
              <span className="text-slate-400">+</span>
              <input
                type="number"
                min={PAUZE_MIN}
                max={PAUZE_MAX}
                value={pauzeMinuten}
                onChange={(e) => e.target.value && stelDuur(werkMinuten, Number(e.target.value))}
                aria-label="Pauzetijd in minuten"
                className="w-16 rounded-lg border border-slate-200 px-2 py-1.5 text-center text-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100"
              />
              <span>min pauze</span>
            </div>
            <p className="text-xs text-slate-500">
              25 + 5 werkt voor de meeste leerlingen goed. Lastige stof (of net begonnen)? Probeer 15 + 5 - dat is
              makkelijker vol te houden. Lekker in de flow bij iets wat je al snapt? Dan kan 45 + 10 ook.
            </p>
          </Card>

          <div className="hidden lg:block">{klaarBlok}</div>
        </div>
      </div>

      <div className="lg:hidden">{klaarBlok}</div>
    </div>
  );
}
