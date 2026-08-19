"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PLANNING_TYPE_META } from "@/lib/planning";
import { maakPlanningItem, updatePlanningStatus, verwijderPlanningItem } from "@/lib/actions/planning";
import type { PlanningItem, PlanningType, Subject } from "@/lib/types";

function naarMaandagVanWeek(datum: Date) {
  const d = new Date(datum);
  d.setHours(0, 0, 0, 0);
  const dag = d.getDay(); // 0 = zondag ... 6 = zaterdag
  const verschil = dag === 0 ? -6 : 1 - dag;
  d.setDate(d.getDate() + verschil);
  return d;
}

function voegDagenToe(datum: Date, dagen: number) {
  const d = new Date(datum);
  d.setDate(d.getDate() + dagen);
  return d;
}

function naarIsoDatum(datum: Date) {
  return datum.toISOString().slice(0, 10);
}

function formatDatumLabel(iso: string) {
  const datum = new Date(iso + "T00:00:00");
  const vandaag = new Date();
  vandaag.setHours(0, 0, 0, 0);
  const verschil = Math.round((datum.getTime() - vandaag.getTime()) / 86400000);

  const label = datum.toLocaleDateString("nl-NL", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  if (verschil === 0) return `Vandaag - ${label}`;
  if (verschil === 1) return `Morgen - ${label}`;
  if (verschil < 0) return `${label} (verlopen)`;
  return label;
}

export function AgendaBoard({
  items,
  subjects,
}: {
  items: PlanningItem[];
  subjects: Subject[];
}) {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);
  const [type, setType] = useState<PlanningType>("huiswerk");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [weekOffset, setWeekOffset] = useState(0);

  const vandaagIso = useMemo(() => naarIsoDatum(new Date()), []);
  const dezeWeekMaandag = useMemo(() => naarMaandagVanWeek(new Date()), []);
  const weekMaandag = useMemo(
    () => voegDagenToe(dezeWeekMaandag, weekOffset * 7),
    [dezeWeekMaandag, weekOffset]
  );
  const weekDagen = useMemo(
    () => Array.from({ length: 7 }, (_, i) => voegDagenToe(weekMaandag, i)),
    [weekMaandag]
  );

  const itemsPerDag = useMemo(() => {
    const map = new Map<string, PlanningItem[]>();
    for (const dag of weekDagen) map.set(naarIsoDatum(dag), []);
    for (const item of items) {
      const lijst = map.get(item.due_date);
      if (lijst) lijst.push(item);
    }
    return map;
  }, [items, weekDagen]);

  function subjectNaam(id: string | null) {
    if (!id) return null;
    return subjects.find((s) => s.id === id)?.name ?? null;
  }

  async function handleSubmit(formData: FormData) {
    setError(null);
    const res = await maakPlanningItem(formData);
    if (res?.error) {
      setError(res.error);
      return;
    }

    const dueDateRaw = String(formData.get("dueDate") || "");
    if (dueDateRaw) {
      const dueMaandag = naarMaandagVanWeek(new Date(dueDateRaw + "T00:00:00"));
      const verschilWeken = Math.round(
        (dueMaandag.getTime() - dezeWeekMaandag.getTime()) / (7 * 86400000)
      );
      setWeekOffset(verschilWeken);
    }

    setFormOpen(false);
    router.refresh();
  }

  function toggleStatus(item: PlanningItem) {
    startTransition(async () => {
      await updatePlanningStatus(item.id, item.status === "klaar" ? "open" : "klaar");
      router.refresh();
    });
  }

  function accepteer(item: PlanningItem) {
    startTransition(async () => {
      await updatePlanningStatus(item.id, "open");
      router.refresh();
    });
  }

  function verwijder(item: PlanningItem) {
    startTransition(async () => {
      await verwijderPlanningItem(item.id);
      router.refresh();
    });
  }

  const weekZondag = weekDagen[6];
  const weekLabel = `${weekMaandag.toLocaleDateString("nl-NL", { day: "numeric", month: "short" })} - ${weekZondag.toLocaleDateString("nl-NL", { day: "numeric", month: "short" })}`;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Agenda</h1>
        <Button icon={<Icon name="plus" size={18} />} onClick={() => setFormOpen((v) => !v)}>
          {formOpen ? "Sluiten" : "Nieuw item"}
        </Button>
      </div>

      <Card className="flex items-center justify-between gap-2 py-3">
        <button
          onClick={() => setWeekOffset((w) => w - 1)}
          className="flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
          aria-label="Vorige week"
        >
          <Icon name="chevron-left" size={18} />
          <span className="hidden sm:inline">Vorige week</span>
        </button>

        <div className="flex flex-col items-center">
          <p className="text-sm font-semibold text-slate-900">Week van {weekLabel}</p>
          {weekOffset !== 0 && (
            <button
              onClick={() => setWeekOffset(0)}
              className="text-xs font-medium text-blue-600 hover:underline"
            >
              Naar deze week
            </button>
          )}
        </div>

        <button
          onClick={() => setWeekOffset((w) => w + 1)}
          className="flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
          aria-label="Volgende week"
        >
          <span className="hidden sm:inline">Volgende week</span>
          <Icon name="chevron-right" size={18} />
        </button>
      </Card>

      {formOpen && (
        <Card>
          <form action={handleSubmit} className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(["huiswerk", "toets", "leermoment", "prive"] as PlanningType[]).map((t) => (
                <button
                  type="button"
                  key={t}
                  onClick={() => setType(t)}
                  className={clsx(
                    "flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-xs font-medium transition-colors",
                    type === t
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  )}
                >
                  <Icon name={PLANNING_TYPE_META[t].icon} size={18} />
                  {PLANNING_TYPE_META[t].label}
                </button>
              ))}
            </div>
            <input type="hidden" name="type" value={type} />

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Titel</label>
              <input
                name="title"
                required
                placeholder="bijv. Hoofdstuk 3 samenvatten"
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            </div>

            {type !== "prive" && subjects.length > 0 && (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Vak</label>
                <select
                  name="subjectId"
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                >
                  <option value="">Geen specifiek vak</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                {type === "toets" ? "Datum van de toets" : "Datum"}
              </label>
              <input
                type="date"
                name="dueDate"
                required
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
              {type === "toets" && (
                <p className="mt-1.5 text-xs text-slate-500">
                  Er worden automatisch een paar leermomenten voorgesteld die je samen kunt
                  aanpassen.
                </p>
              )}
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Toelichting (optioneel)
              </label>
              <textarea
                name="description"
                rows={2}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            </div>

            {error && <p className="text-sm text-rose-600">{error}</p>}

            <Button type="submit" className="mt-1">
              Toevoegen
            </Button>
          </form>
        </Card>
      )}

      {/* Kalenderweergave: 7 dagen naast elkaar, zoals afsprakenplanning-software */}
      <div className="hidden gap-2 md:grid md:grid-cols-7">
        {weekDagen.map((dag) => {
          const iso = naarIsoDatum(dag);
          const isVandaag = iso === vandaagIso;
          const dagItems = itemsPerDag.get(iso) ?? [];
          return (
            <div
              key={iso}
              className={clsx(
                "flex min-h-[220px] flex-col gap-2 rounded-2xl border p-2.5",
                isVandaag ? "border-blue-300 bg-blue-50/50" : "border-slate-200 bg-white"
              )}
            >
              <div className="text-center">
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                  {dag.toLocaleDateString("nl-NL", { weekday: "short" })}
                </p>
                <p
                  className={clsx(
                    "text-lg font-semibold",
                    isVandaag ? "text-blue-600" : "text-slate-800"
                  )}
                >
                  {dag.getDate()}
                </p>
              </div>

              <div className="flex flex-col gap-1.5">
                {dagItems.length === 0 && (
                  <p className="pt-2 text-center text-xs text-slate-300">-</p>
                )}
                {dagItems.map((item) => {
                  const meta = PLANNING_TYPE_META[item.type];
                  const isVoorstel = item.status === "voorstel";
                  const isKlaar = item.status === "klaar";
                  return (
                    <div
                      key={item.id}
                      className={clsx(
                        "rounded-lg border px-2 py-1.5 text-xs",
                        meta.badgeClass,
                        isKlaar && "opacity-50"
                      )}
                    >
                      <div className="flex items-start gap-1">
                        <Icon name={meta.icon} size={12} className="mt-0.5 shrink-0" />
                        <span
                          className={clsx(
                            "line-clamp-2 font-medium leading-snug",
                            isKlaar && "line-through"
                          )}
                        >
                          {item.title}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        {isVoorstel ? (
                          <>
                            <button
                              disabled={pending}
                              onClick={() => accepteer(item)}
                              className="text-[10px] font-medium underline underline-offset-2"
                            >
                              Prima zo
                            </button>
                            <button
                              disabled={pending}
                              onClick={() => verwijder(item)}
                              aria-label="Verwijderen"
                              className="opacity-70 hover:opacity-100"
                            >
                              <Icon name="trash" size={11} />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              disabled={pending}
                              onClick={() => toggleStatus(item)}
                              aria-label="Klaar markeren"
                              className="opacity-70 hover:opacity-100"
                            >
                              <Icon name="check" size={11} />
                            </button>
                            <button
                              disabled={pending}
                              onClick={() => verwijder(item)}
                              aria-label="Verwijderen"
                              className="opacity-70 hover:opacity-100"
                            >
                              <Icon name="trash" size={11} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Mobiele weergave: dagen onder elkaar */}
      <div className="flex flex-col gap-4 md:hidden">
        {weekDagen.map((dag) => {
          const iso = naarIsoDatum(dag);
          const dagItems = itemsPerDag.get(iso) ?? [];
          return (
            <div key={iso}>
              <p className="mb-2 text-sm font-medium capitalize text-slate-500">
                {formatDatumLabel(iso)}
              </p>
              {dagItems.length === 0 ? (
                <Card className="py-3">
                  <p className="text-sm text-slate-400">Niets gepland.</p>
                </Card>
              ) : (
                <div className="flex flex-col gap-2">
                  {dagItems.map((item) => {
                    const meta = PLANNING_TYPE_META[item.type];
                    const isVoorstel = item.status === "voorstel";
                    const isKlaar = item.status === "klaar";
                    return (
                      <Card
                        key={item.id}
                        className={clsx("flex items-center gap-3 py-3", isKlaar && "opacity-60")}
                      >
                        <span
                          className={clsx(
                            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border",
                            meta.badgeClass
                          )}
                        >
                          <Icon name={meta.icon} size={16} />
                        </span>

                        <div className="min-w-0 flex-1">
                          <p
                            className={clsx(
                              "truncate text-sm font-medium text-slate-800",
                              isKlaar && "line-through"
                            )}
                          >
                            {item.title}
                          </p>
                          <p className="truncate text-xs text-slate-500">
                            {[meta.label, subjectNaam(item.subject_id)].filter(Boolean).join(" - ")}
                            {isVoorstel && " - voorstel, nog niet bevestigd"}
                          </p>
                        </div>

                        {isVoorstel ? (
                          <div className="flex shrink-0 gap-1.5">
                            <Button size="md" variant="secondary" disabled={pending} onClick={() => accepteer(item)}>
                              Prima zo
                            </Button>
                            <button
                              disabled={pending}
                              onClick={() => verwijder(item)}
                              className="rounded-xl p-2.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                              aria-label="Verwijderen"
                            >
                              <Icon name="trash" size={16} />
                            </button>
                          </div>
                        ) : (
                          <div className="flex shrink-0 items-center gap-1.5">
                            <button
                              disabled={pending}
                              onClick={() => toggleStatus(item)}
                              className={clsx(
                                "rounded-xl p-2.5",
                                isKlaar
                                  ? "bg-emerald-100 text-emerald-700"
                                  : "text-slate-400 hover:bg-emerald-50 hover:text-emerald-600"
                              )}
                              aria-label="Klaar markeren"
                            >
                              <Icon name="check" size={16} />
                            </button>
                            <button
                              disabled={pending}
                              onClick={() => verwijder(item)}
                              className="rounded-xl p-2.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                              aria-label="Verwijderen"
                            >
                              <Icon name="trash" size={16} />
                            </button>
                          </div>
                        )}
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
