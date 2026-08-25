"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import clsx from "clsx";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/icon";
import { plantToetsweek } from "@/lib/actions/toetsweek";
import type { JaarEvent, PlanningItem, Subject } from "@/lib/types";

const GEWICHT_OPTIES: { value: 1 | 2 | 3; label: string }[] = [
  { value: 1, label: "Licht" },
  { value: 2, label: "Gemiddeld" },
  { value: 3, label: "Zwaar" },
];

export function ToetsweekPlanner({
  toetsweken,
  toetsen,
  subjects,
}: {
  toetsweken: JaarEvent[];
  toetsen: PlanningItem[];
  subjects: Subject[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [toetsweekId, setToetsweekId] = useState(toetsweken[0]?.id ?? "");
  const [gewichten, setGewichten] = useState<Record<string, 1 | 2 | 3>>({});
  const [bezig, setBezig] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultaat, setResultaat] = useState<number | null>(null);
  const [clusterVakId, setClusterVakId] = useState<string | null>(null);

  const gekozenToetsweek = toetsweken.find((t) => t.id === toetsweekId) ?? null;

  const toetsenInWeek = useMemo(() => {
    if (!gekozenToetsweek) return [];
    return toetsen
      .filter((t) => t.due_date >= gekozenToetsweek.start_datum && t.due_date <= gekozenToetsweek.eind_datum)
      .sort((a, b) => a.due_date.localeCompare(b.due_date));
  }, [toetsen, gekozenToetsweek]);

  const aantalVakken = useMemo(
    () => new Set(toetsenInWeek.map((t) => t.subject_id).filter(Boolean)).size,
    [toetsenInWeek]
  );

  function subjectNaam(id: string | null) {
    return subjects.find((s) => s.id === id)?.name ?? "Geen vak";
  }

  function gewichtVan(toetsId: string) {
    return gewichten[toetsId] ?? 2;
  }

  async function plan() {
    setBezig(true);
    setError(null);
    setResultaat(null);
    setClusterVakId(null);
    try {
      const res = await plantToetsweek(toetsenInWeek.map((t) => ({ toetsId: t.id, gewicht: gewichtVan(t.id) })));
      if (res.error) {
        setError(res.error);
        return;
      }
      setResultaat(res.aantal ?? 0);
      setClusterVakId(res.clusterSubjectId ?? null);
      router.refresh();
    } catch {
      setError("Plannen is mislukt. Probeer het nog eens.");
    } finally {
      setBezig(false);
    }
  }

  const agendaHref = pathname.startsWith("/ouder") ? "/ouder/agenda" : "/kind/agenda";

  if (toetsweken.length === 0) {
    return (
      <Card>
        <p className="text-sm text-slate-500">
          Er staat nog geen toetsweek op de jaarkalender. Voeg er eerst een toe (als
          &quot;Toetsweek&quot;) op de jaarkalender-pagina, dan kun je &apos;m hier in 1 keer plannen.
        </p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-700">Welke toetsweek?</label>
        <select
          value={toetsweekId}
          onChange={(e) => {
            setToetsweekId(e.target.value);
            setResultaat(null);
          }}
          className="w-full max-w-sm rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100"
        >
          {toetsweken.map((t) => (
            <option key={t.id} value={t.id}>
              {t.titel} ({new Date(t.start_datum + "T00:00:00").toLocaleDateString("nl-NL", { day: "numeric", month: "short" })} -{" "}
              {new Date(t.eind_datum + "T00:00:00").toLocaleDateString("nl-NL", { day: "numeric", month: "short" })})
            </option>
          ))}
        </select>
      </div>

      {toetsenInWeek.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-500">
            Nog geen toetsen in deze periode gevonden.{" "}
            <Link href={agendaHref} className="font-medium text-accent-600 hover:underline">
              Voeg ze eerst toe in de agenda
            </Link>
            , kom dan hier terug om ze in 1 keer te plannen.
          </p>
        </Card>
      ) : (
        <>
          {aantalVakken >= 2 && (
            <Card className="flex items-start gap-3 border-accent-100 bg-accent-50/60 py-3">
              <Icon name="sparkles" size={18} className="mt-0.5 shrink-0 text-accent-600" />
              <p className="text-sm text-slate-700">
                <span className="font-medium">Tip: wissel vakken af.</span> Leren voor meerdere vakken door
                elkaar werkt beter voor je geheugen dan alles voor 1 vak achter elkaar doen. Probeer in de
                agenda leermomenten van verschillende vakken naast elkaar te zetten, in plaats van dagen
                achter elkaar met steeds hetzelfde vak.
              </p>
            </Card>
          )}

          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-slate-700">
              Hoeveel werk is het voor jou, per vak? (bepaalt hoeveel leermomenten je krijgt)
            </p>
            {toetsenInWeek.map((toets) => (
              <Card key={toets.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-[140px] flex-1">
                  <p className="text-sm font-medium text-slate-800">{toets.title}</p>
                  <p className="text-xs text-slate-500">
                    {subjectNaam(toets.subject_id)} -{" "}
                    {new Date(toets.due_date + "T00:00:00").toLocaleDateString("nl-NL", { day: "numeric", month: "short" })}
                  </p>
                </div>
                <div className="flex gap-1.5">
                  {GEWICHT_OPTIES.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setGewichten((g) => ({ ...g, [toets.id]: opt.value }))}
                      className={clsx(
                        "rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors",
                        gewichtVan(toets.id) === opt.value
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-200 text-slate-600 hover:bg-slate-50"
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </Card>
            ))}
          </div>

          {error && <p className="text-sm text-rose-600">{error}</p>}
          {resultaat !== null && (
            <p className="flex items-center gap-1.5 text-sm text-emerald-600">
              <Icon name="party" size={16} />
              {resultaat} leermomenten voorgesteld - bekijk en bevestig ze in{" "}
              <Link href={agendaHref} className="font-medium underline">
                je agenda
              </Link>
              .
            </p>
          )}
          {clusterVakId && (
            <p className="flex items-start gap-1.5 text-sm text-amber-700">
              <Icon name="alert-circle" size={16} className="mt-0.5 shrink-0" />
              Je hebt nu 3 of meer dagen achter elkaar alleen leermomenten voor{" "}
              <span className="font-medium">{subjectNaam(clusterVakId)}</span> staan. Schuif in de agenda een
              paar leermomenten van een ander vak ertussen - afwisselen onthoud je beter.
            </p>
          )}

          <Button loading={bezig} onClick={plan} icon={<Icon name="rocket" size={18} />}>
            {bezig ? "Bezig..." : "Plan mijn toetsweek"}
          </Button>
        </>
      )}
    </div>
  );
}
