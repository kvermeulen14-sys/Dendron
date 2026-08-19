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

  const gegroepeerd = useMemo(() => {
    const groepen = new Map<string, PlanningItem[]>();
    for (const item of items) {
      const lijst = groepen.get(item.due_date) ?? [];
      lijst.push(item);
      groepen.set(item.due_date, lijst);
    }
    return Array.from(groepen.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [items]);

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

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Agenda</h1>
        <Button icon={<Icon name="plus" size={18} />} onClick={() => setFormOpen((v) => !v)}>
          {formOpen ? "Sluiten" : "Nieuw item"}
        </Button>
      </div>

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

      {gegroepeerd.length === 0 && (
        <Card>
          <p className="text-sm text-slate-500">Nog niets ingepland. Voeg je eerste item toe.</p>
        </Card>
      )}

      <div className="flex flex-col gap-4">
        {gegroepeerd.map(([datum, dagItems]) => (
          <div key={datum}>
            <p className="mb-2 text-sm font-medium capitalize text-slate-500">
              {formatDatumLabel(datum)}
            </p>
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
          </div>
        ))}
      </div>
    </div>
  );
}
