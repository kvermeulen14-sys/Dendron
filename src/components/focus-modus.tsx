"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Card } from "@/components/ui/card";
import { Button, LinkButton } from "@/components/ui/button";
import { Icon } from "@/components/icon";
import { PLANNING_TYPE_META } from "@/lib/planning";
import { updatePlanningStatus } from "@/lib/actions/planning";
import { kiesKlaarLabel, kiesVierTekst } from "@/lib/motiverend";
import { useKlaarBevestiging } from "@/lib/use-klaar-bevestiging";
import type { PlanningItem, Subject } from "@/lib/types";

const WERK_MINUTEN = 25;
const PAUZE_MINUTEN = 5;

function formatTijd(seconden: number) {
  const m = Math.floor(seconden / 60)
    .toString()
    .padStart(2, "0");
  const s = (seconden % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export function FocusModus({ item, subject }: { item: PlanningItem; subject: Subject | null }) {
  const router = useRouter();
  const meta = PLANNING_TYPE_META[item.type];
  const [fase, setFase] = useState<"werk" | "pauze">("werk");
  const [secondenOver, setSecondenOver] = useState(WERK_MINUTEN * 60);
  const [lopend, setLopend] = useState(false);
  const klaarBevestiging = useKlaarBevestiging();

  useEffect(() => {
    if (!lopend) return;
    const interval = setInterval(() => {
      setSecondenOver((s) => {
        if (s > 1) return s - 1;
        // fase wisselt automatisch, timer blijft doorlopen
        setFase((f) => (f === "werk" ? "pauze" : "werk"));
        return (fase === "werk" ? PAUZE_MINUTEN : WERK_MINUTEN) * 60;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [lopend, fase]);

  function resetTimer() {
    setLopend(false);
    setSecondenOver((fase === "werk" ? WERK_MINUTEN : PAUZE_MINUTEN) * 60);
  }

  function wisselFase(nieuweFase: "werk" | "pauze") {
    setFase(nieuweFase);
    setLopend(false);
    setSecondenOver((nieuweFase === "werk" ? WERK_MINUTEN : PAUZE_MINUTEN) * 60);
  }

  async function afronden() {
    await klaarBevestiging.bevestig(async () => {
      await updatePlanningStatus(item.id, "klaar");
    });
    setTimeout(() => {
      router.push("/kind");
      router.refresh();
    }, 1600);
  }

  const totaalSeconden = (fase === "werk" ? WERK_MINUTEN : PAUZE_MINUTEN) * 60;
  const voortgang = 1 - secondenOver / totaalSeconden;

  return (
    <div className="mx-auto flex max-w-md flex-col gap-5">
      <Link href="/kind" className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700">
        <Icon name="chevron-left" size={16} />
        Terug naar dashboard
      </Link>

      <Card className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
          <Icon name={meta.icon} size={14} />
          {meta.label}
          {subject && <span>&middot; {subject.name}</span>}
        </div>
        <h1 className="text-lg font-semibold text-slate-900">{item.title}</h1>
        {item.description && <p className="text-sm text-slate-500">{item.description}</p>}
      </Card>

      <Card className="flex flex-col items-center gap-4 py-8">
        <div className="flex gap-2">
          <button
            onClick={() => wisselFase("werk")}
            className={clsx(
              "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
              fase === "werk" ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100"
            )}
          >
            Focustijd ({WERK_MINUTEN} min)
          </button>
          <button
            onClick={() => wisselFase("pauze")}
            className={clsx(
              "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
              fase === "pauze" ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100"
            )}
          >
            Pauze ({PAUZE_MINUTEN} min)
          </button>
        </div>

        <div className="relative flex h-48 w-48 items-center justify-center">
          <svg viewBox="0 0 100 100" className="absolute h-full w-full -rotate-90">
            <circle cx="50" cy="50" r="45" className="fill-none stroke-slate-100" strokeWidth="8" />
            <circle
              cx="50"
              cy="50"
              r="45"
              className={clsx("fill-none transition-all duration-1000", fase === "werk" ? "stroke-accent-500" : "stroke-emerald-500")}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 45}
              strokeDashoffset={2 * Math.PI * 45 * (1 - voortgang)}
            />
          </svg>
          <div className="flex flex-col items-center">
            <span className="text-4xl font-semibold tabular-nums text-slate-900">{formatTijd(secondenOver)}</span>
            <span className="mt-1 text-xs font-medium text-slate-400">{fase === "werk" ? "aan het werk" : "pauze"}</span>
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
        >
          {item.status === "klaar" ? "Al afgevinkt" : kiesKlaarLabel(item.id)}
        </Button>
      )}
    </div>
  );
}
