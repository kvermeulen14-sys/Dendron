"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { HuiswerkAIImport } from "@/components/huiswerk-ai-import";
import { PLANNING_TYPE_META } from "@/lib/planning";
import { maakPlanningItem, updatePlanningStatus, verwijderPlanningItem } from "@/lib/actions/planning";
import type {
  PlanningItem,
  PlanningType,
  RoosterItem,
  RoosterPeriode,
  RoosterUitzondering,
  Subject,
  TestType,
} from "@/lib/types";

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

function naarIsoWeekdag(datum: Date) {
  const jsDag = datum.getDay(); // 0 = zondag
  return jsDag === 0 ? 7 : jsDag; // 1 = maandag ... 7 = zondag
}

function tijdKort(tijd: string) {
  return tijd.slice(0, 5);
}

function tijdPlusMinuten(tijd: string, minuten: number) {
  const [h, m] = tijd.split(":").map(Number);
  const totaal = Math.max(0, Math.min(23 * 60 + 59, h * 60 + m + minuten));
  const hh = Math.floor(totaal / 60)
    .toString()
    .padStart(2, "0");
  const mm = (totaal % 60).toString().padStart(2, "0");
  return `${hh}:${mm}`;
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

interface RoosterBlok {
  tijd: string;
  titel: string;
  isFietsen: boolean;
}

function vindPeriode(periodes: RoosterPeriode[], iso: string) {
  return periodes.find((p) => p.start_datum <= iso && iso <= p.eind_datum) ?? null;
}

function roosterBlokkenVoorDag(
  datum: Date,
  periodes: RoosterPeriode[],
  roosterItems: RoosterItem[],
  uitzonderingen: RoosterUitzondering[],
  reistijdMinuten: number
): RoosterBlok[] {
  const iso = naarIsoDatum(datum);
  const weekdag = naarIsoWeekdag(datum);
  const periode = vindPeriode(periodes, iso);
  const dagUitzonderingen = uitzonderingen.filter((u) => u.datum === iso);
  const vervallenIds = new Set(dagUitzonderingen.filter((u) => u.type === "vervallen").map((u) => u.origineel_item_id));
  const gewijzigdMap = new Map(
    dagUitzonderingen.filter((u) => u.type === "gewijzigd").map((u) => [u.origineel_item_id, u])
  );

  let lessen: { titel: string; start_tijd: string; eind_tijd: string }[] = periode
    ? roosterItems
        .filter((i) => i.periode_id === periode.id && i.dag_van_week === weekdag && !vervallenIds.has(i.id))
        .map((i) => {
          const wijziging = gewijzigdMap.get(i.id);
          return wijziging
            ? {
                titel: wijziging.titel ?? i.titel,
                start_tijd: wijziging.start_tijd ?? i.start_tijd,
                eind_tijd: wijziging.eind_tijd ?? i.eind_tijd,
              }
            : { titel: i.titel, start_tijd: i.start_tijd, eind_tijd: i.eind_tijd };
        })
    : [];

  for (const extra of dagUitzonderingen.filter((u) => u.type === "extra")) {
    if (extra.titel && extra.start_tijd && extra.eind_tijd) {
      lessen.push({ titel: extra.titel, start_tijd: extra.start_tijd, eind_tijd: extra.eind_tijd });
    }
  }

  lessen = lessen.sort((a, b) => a.start_tijd.localeCompare(b.start_tijd));
  if (lessen.length === 0) return [];

  const blokken: RoosterBlok[] = [];
  const eerste = lessen[0];
  const laatste = lessen[lessen.length - 1];

  if (reistijdMinuten > 0) {
    blokken.push({
      tijd: `${tijdPlusMinuten(eerste.start_tijd, -reistijdMinuten)}-${tijdKort(eerste.start_tijd)}`,
      titel: "Fietsen naar school",
      isFietsen: true,
    });
  }
  for (const les of lessen) {
    blokken.push({
      tijd: `${tijdKort(les.start_tijd)}-${tijdKort(les.eind_tijd)}`,
      titel: les.titel,
      isFietsen: false,
    });
  }
  if (reistijdMinuten > 0) {
    blokken.push({
      tijd: `${tijdKort(laatste.eind_tijd)}-${tijdPlusMinuten(laatste.eind_tijd, reistijdMinuten)}`,
      titel: "Fietsen naar huis",
      isFietsen: true,
    });
  }
  return blokken;
}

export function AgendaBoard({
  items,
  subjects,
  testTypes,
  periodes,
  roosterItems,
  uitzonderingen,
  reistijdMinuten,
}: {
  items: PlanningItem[];
  subjects: Subject[];
  testTypes: TestType[];
  periodes: RoosterPeriode[];
  roosterItems: RoosterItem[];
  uitzonderingen: RoosterUitzondering[];
  reistijdMinuten: number;
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold text-slate-900">Agenda</h1>
        <div className="flex gap-2">
          <HuiswerkAIImport subjects={subjects} />
          <Button icon={<Icon name="plus" size={18} />} onClick={() => setFormOpen(true)}>
            Nieuw item
          </Button>
        </div>
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

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title="Nieuw item">
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

            {type === "toets" && testTypes.length > 0 && (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Toetsvorm (bepaalt het leeradvies)
                </label>
                <select
                  name="testTypeId"
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                >
                  <option value="">Standaard vuistregel</option>
                  {testTypes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.dagen_van_tevoren} dagen vooraf, {t.aantal_leermomenten}x leren)
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
                  Er worden automatisch gespreide leermomenten voorgesteld die je samen kunt
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

            <SubmitButton className="mt-1">Toevoegen</SubmitButton>
        </form>
      </Modal>

      {/* Kalenderweergave: 7 dagen naast elkaar, zoals afsprakenplanning-software */}
      <div className="hidden gap-2 md:grid md:grid-cols-7">
        {weekDagen.map((dag) => {
          const iso = naarIsoDatum(dag);
          const isVandaag = iso === vandaagIso;
          const dagItems = itemsPerDag.get(iso) ?? [];
          const roosterBlokken = roosterBlokkenVoorDag(dag, periodes, roosterItems, uitzonderingen, reistijdMinuten);
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

              {roosterBlokken.length > 0 && (
                <div className="flex flex-col gap-1 border-b border-slate-100 pb-2">
                  {roosterBlokken.map((b, i) => (
                    <div
                      key={i}
                      className={clsx(
                        "flex items-start gap-1 rounded-lg px-1.5 py-1 text-[10px] leading-snug",
                        b.isFietsen ? "text-slate-400" : "bg-slate-50 text-slate-600"
                      )}
                    >
                      <Icon name={b.isFietsen ? "bike" : "school"} size={11} className="mt-0.5 shrink-0" />
                      <span className="line-clamp-1">
                        {b.tijd} {b.titel}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                {dagItems.length === 0 && roosterBlokken.length === 0 && (
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
                              className="text-[10px] font-medium underline underline-offset-2 disabled:opacity-50"
                            >
                              Prima zo
                            </button>
                            <button
                              disabled={pending}
                              onClick={() => verwijder(item)}
                              aria-label="Verwijderen"
                              className="opacity-70 hover:opacity-100 disabled:opacity-30"
                            >
                              <Icon name={pending ? "loader" : "trash"} size={11} className={pending ? "animate-spin" : undefined} />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              disabled={pending}
                              onClick={() => toggleStatus(item)}
                              aria-label="Klaar markeren"
                              className="opacity-70 hover:opacity-100 disabled:opacity-30"
                            >
                              <Icon name="check" size={11} />
                            </button>
                            <button
                              disabled={pending}
                              onClick={() => verwijder(item)}
                              aria-label="Verwijderen"
                              className="opacity-70 hover:opacity-100 disabled:opacity-30"
                            >
                              <Icon name={pending ? "loader" : "trash"} size={11} className={pending ? "animate-spin" : undefined} />
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
          const roosterBlokken = roosterBlokkenVoorDag(dag, periodes, roosterItems, uitzonderingen, reistijdMinuten);
          return (
            <div key={iso}>
              <p className="mb-2 text-sm font-medium capitalize text-slate-500">
                {formatDatumLabel(iso)}
              </p>

              {roosterBlokken.length > 0 && (
                <div className="mb-2 flex flex-col gap-1 rounded-xl border border-slate-100 bg-slate-50/60 p-2.5">
                  {roosterBlokken.map((b, i) => (
                    <div
                      key={i}
                      className={clsx(
                        "flex items-center gap-2 text-xs",
                        b.isFietsen ? "text-slate-400" : "text-slate-600"
                      )}
                    >
                      <Icon name={b.isFietsen ? "bike" : "school"} size={13} className="shrink-0" />
                      <span className="font-medium">{b.tijd}</span>
                      <span>{b.titel}</span>
                    </div>
                  ))}
                </div>
              )}

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
                            <Button size="md" variant="secondary" loading={pending} onClick={() => accepteer(item)}>
                              Prima zo
                            </Button>
                            <button
                              disabled={pending}
                              onClick={() => verwijder(item)}
                              className="rounded-xl p-2.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                              aria-label="Verwijderen"
                            >
                              <Icon name={pending ? "loader" : "trash"} size={16} className={pending ? "animate-spin" : undefined} />
                            </button>
                          </div>
                        ) : (
                          <div className="flex shrink-0 items-center gap-1.5">
                            <button
                              disabled={pending}
                              onClick={() => toggleStatus(item)}
                              className={clsx(
                                "rounded-xl p-2.5 disabled:opacity-50",
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
                              className="rounded-xl p-2.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                              aria-label="Verwijderen"
                            >
                              <Icon name={pending ? "loader" : "trash"} size={16} className={pending ? "animate-spin" : undefined} />
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
