"use client";

import { useEffect, useMemo, useState, useTransition, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Icon } from "@/components/icon";
import { Button, LinkButton } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { HuiswerkAIImport } from "@/components/huiswerk-ai-import";
import { TijdSelect } from "@/components/ui/tijd-select";
import { PLANNING_TYPE_META, minutenNaarTijd, vindEersteVrijeSlot } from "@/lib/planning";
import { JAAR_EVENT_META, eventsOpDatum, naarIsoDatum } from "@/lib/jaarkalender";
import {
  accepteerPlanningItem,
  bewerkPlanningItem,
  maakPlanningItem,
  updatePlanningStatus,
  verplaatsPlanningItem,
  verwijderPlanningItem,
} from "@/lib/actions/planning";
import type {
  JaarEvent,
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

function isoPlusDagen(iso: string, dagen: number) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + dagen);
  return naarIsoDatum(d);
}

function formatMinuten(minuten: number) {
  const uren = Math.floor(minuten / 60);
  const rest = minuten % 60;
  if (uren === 0) return `${rest} min`;
  if (rest === 0) return `${uren} u`;
  return `${uren}u ${rest}m`;
}

const TIJD_OPTIES = [15, 30, 45, 60, 90, 120];

// Status altijd op dezelfde, herkenbare manier tonen (kleur + label, niet
// alleen kleur) - zodat in 1 oogopslag duidelijk is wat af is, wat gepland
// staat en wat nog een voorstel is, voor kind en ouder allebei.
const STATUS_META = {
  voorstel: { label: "Voorstel", dot: "bg-slate-400" },
  open: { label: "Gepland", dot: "bg-accent-500" },
  klaar: { label: "Klaar", dot: "bg-emerald-500" },
} as const;

// Tijdlijn-schaal voor de dag-per-dag agenda: elk uur krijgt een vaste
// hoogte, zodat je in 1 oogopslag ziet hoeveel tijd iets kost en hoeveel
// ruimte er nog over is - net als in een gewone agenda-app. Het venster
// (6-22u) breidt automatisch uit als er iets buiten die uren gepland staat.
const UUR_HOOGTE = 40;
const STANDAARD_VAN_UUR = 6;
const STANDAARD_TOT_UUR = 22;
const MIN_BLOK_PX = 22;
const ONBEKENDE_DUUR_MINUTEN = 30;

function hoogteVoorDuur(duurMinuten: number) {
  return Math.max(MIN_BLOK_PX, (duurMinuten / 60) * UUR_HOOGTE);
}

function tijdVerschilMinuten(start: string, eind: string) {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = eind.split(":").map(Number);
  return Math.max(0, eh * 60 + em - (sh * 60 + sm));
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
  duurMinuten: number;
  startMinuten: number;
  bron: "rooster" | "gewijzigd" | "extra";
}

function tijdNaarMinuten(tijd: string) {
  const [h, m] = tijd.slice(0, 5).split(":").map(Number);
  return h * 60 + m;
}

function vindPeriode(periodes: RoosterPeriode[], iso: string) {
  return periodes.find((p) => p.start_datum <= iso && iso <= p.eind_datum) ?? null;
}

function roosterBlokkenVoorDag(
  datum: Date,
  periodes: RoosterPeriode[],
  roosterItems: RoosterItem[],
  uitzonderingen: RoosterUitzondering[],
  reistijdMinuten: number,
  jaarEvents: JaarEvent[]
): RoosterBlok[] {
  const iso = naarIsoDatum(datum);
  // In een vakantie (uit de jaarkalender) vervalt het schoolrooster
  // automatisch - andere agenda-items (huiswerk, toetsen, ...) blijven staan.
  if (eventsOpDatum(jaarEvents, datum).some((e) => e.type === "vakantie")) return [];
  const weekdag = naarIsoWeekdag(datum);
  const periode = vindPeriode(periodes, iso);
  const dagUitzonderingen = uitzonderingen.filter((u) => u.datum === iso);
  const vervallenIds = new Set(dagUitzonderingen.filter((u) => u.type === "vervallen").map((u) => u.origineel_item_id));
  const gewijzigdMap = new Map(
    dagUitzonderingen.filter((u) => u.type === "gewijzigd").map((u) => [u.origineel_item_id, u])
  );

  let lessen: { titel: string; start_tijd: string; eind_tijd: string; bron: "rooster" | "gewijzigd" | "extra" }[] = periode
    ? roosterItems
        .filter((i) => i.periode_id === periode.id && i.dag_van_week === weekdag && !vervallenIds.has(i.id))
        .map((i) => {
          const wijziging = gewijzigdMap.get(i.id);
          return wijziging
            ? {
                titel: wijziging.titel ?? i.titel,
                start_tijd: wijziging.start_tijd ?? i.start_tijd,
                eind_tijd: wijziging.eind_tijd ?? i.eind_tijd,
                bron: "gewijzigd" as const,
              }
            : { titel: i.titel, start_tijd: i.start_tijd, eind_tijd: i.eind_tijd, bron: "rooster" as const };
        })
    : [];

  for (const extra of dagUitzonderingen.filter((u) => u.type === "extra")) {
    if (extra.titel && extra.start_tijd && extra.eind_tijd) {
      lessen.push({ titel: extra.titel, start_tijd: extra.start_tijd, eind_tijd: extra.eind_tijd, bron: "extra" });
    }
  }

  lessen = lessen.sort((a, b) => a.start_tijd.localeCompare(b.start_tijd));
  if (lessen.length === 0) return [];

  const blokken: RoosterBlok[] = [];
  const eerste = lessen[0];
  const laatste = lessen[lessen.length - 1];

  if (reistijdMinuten > 0) {
    const start = tijdPlusMinuten(eerste.start_tijd, -reistijdMinuten);
    blokken.push({
      tijd: `${start}-${tijdKort(eerste.start_tijd)}`,
      titel: "Fietsen naar school",
      isFietsen: true,
      duurMinuten: reistijdMinuten,
      startMinuten: tijdNaarMinuten(start),
      bron: "rooster",
    });
  }
  for (const les of lessen) {
    blokken.push({
      tijd: `${tijdKort(les.start_tijd)}-${tijdKort(les.eind_tijd)}`,
      titel: les.titel,
      isFietsen: false,
      duurMinuten: tijdVerschilMinuten(les.start_tijd, les.eind_tijd),
      startMinuten: tijdNaarMinuten(les.start_tijd),
      bron: les.bron,
    });
  }
  if (reistijdMinuten > 0) {
    blokken.push({
      tijd: `${tijdKort(laatste.eind_tijd)}-${tijdPlusMinuten(laatste.eind_tijd, reistijdMinuten)}`,
      titel: "Fietsen naar huis",
      isFietsen: true,
      duurMinuten: reistijdMinuten,
      startMinuten: tijdNaarMinuten(laatste.eind_tijd),
      bron: "rooster",
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
  jaarEvents,
  voorKind = false,
}: {
  items: PlanningItem[];
  subjects: Subject[];
  testTypes: TestType[];
  periodes: RoosterPeriode[];
  roosterItems: RoosterItem[];
  uitzonderingen: RoosterUitzondering[];
  reistijdMinuten: number;
  jaarEvents: JaarEvent[];
  /** Kind-omgeving: begint in de rustigere lijstweergave i.p.v. het dichte roosterraster, en toont een link naar Focusmodus. */
  voorKind?: boolean;
}) {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);
  const [type, setType] = useState<PlanningType>("huiswerk");
  const [estimatedMinutes, setEstimatedMinutes] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [weekOffset, setWeekOffset] = useState(0);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverIso, setDragOverIso] = useState<string | null>(null);
  const [bewerkItem, setBewerkItem] = useState<PlanningItem | null>(null);
  const [bewerkEstimatedMinutes, setBewerkEstimatedMinutes] = useState<number | null>(null);
  const [bewerkError, setBewerkError] = useState<string | null>(null);
  const [detailItem, setDetailItem] = useState<PlanningItem | null>(null);
  const [weergave, setWeergave] = useState<"rooster" | "lijst">(voorKind ? "lijst" : "rooster");

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

  const vandaagItems = useMemo(
    () => items.filter((i) => i.due_date === vandaagIso && i.status !== "voorstel"),
    [items, vandaagIso]
  );
  const vandaagOpenItems = vandaagItems.filter((i) => i.status !== "klaar");
  const vandaagMinuten = vandaagOpenItems.reduce((som, i) => som + (i.estimated_minutes ?? 0), 0);
  const vandaagZonderInschatting = vandaagOpenItems.filter((i) => !i.estimated_minutes).length;

  const roosterPerDag = useMemo(() => {
    const map = new Map<string, RoosterBlok[]>();
    for (const dag of weekDagen) {
      map.set(
        naarIsoDatum(dag),
        roosterBlokkenVoorDag(dag, periodes, roosterItems, uitzonderingen, reistijdMinuten, jaarEvents)
      );
    }
    return map;
  }, [weekDagen, periodes, roosterItems, uitzonderingen, reistijdMinuten, jaarEvents]);

  const { vanUur, totUur } = useMemo(() => {
    let minMin = STANDAARD_VAN_UUR * 60;
    let maxMin = STANDAARD_TOT_UUR * 60;
    for (const blokken of roosterPerDag.values()) {
      for (const b of blokken) {
        minMin = Math.min(minMin, b.startMinuten);
        maxMin = Math.max(maxMin, b.startMinuten + b.duurMinuten);
      }
    }
    for (const dag of weekDagen) {
      for (const item of itemsPerDag.get(naarIsoDatum(dag)) ?? []) {
        if (item.start_time) {
          const start = tijdNaarMinuten(item.start_time);
          minMin = Math.min(minMin, start);
          maxMin = Math.max(maxMin, start + (item.estimated_minutes ?? ONBEKENDE_DUUR_MINUTEN));
        }
      }
    }
    return { vanUur: Math.floor(minMin / 60), totUur: Math.ceil(maxMin / 60) };
  }, [roosterPerDag, weekDagen, itemsPerDag]);

  const totaalHoogte = (totUur - vanUur) * UUR_HOOGTE;

  function topVoorMinuut(minuut: number) {
    return ((minuut - vanUur * 60) / 60) * UUR_HOOGTE;
  }

  const [nuMinuten, setNuMinuten] = useState<number | null>(null);
  useEffect(() => {
    function tick() {
      const nu = new Date();
      setNuMinuten(nu.getHours() * 60 + nu.getMinutes());
    }
    tick();
    const interval = setInterval(tick, 60000);
    return () => clearInterval(interval);
  }, []);

  function subjectNaam(id: string | null) {
    if (!id) return null;
    return subjects.find((s) => s.id === id)?.name ?? null;
  }

  function subjectCode(id: string | null) {
    if (!id) return null;
    return subjects.find((s) => s.id === id)?.code ?? null;
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
      // Geef het voorstel meteen een concrete tijd na school, rekening
      // houdend met het rooster en al ingeplande taken die dag - zo landt
      // het direct zichtbaar in de tijdlijn i.p.v. als los kaartje boven de
      // agenda te blijven staan.
      const bezet = [
        ...(roosterPerDag.get(item.due_date) ?? []).map((b) => ({
          startMinuten: b.startMinuten,
          duurMinuten: b.duurMinuten,
        })),
        ...(itemsPerDag.get(item.due_date) ?? [])
          .filter((i) => i.id !== item.id && i.status !== "voorstel" && i.start_time)
          .map((i) => ({
            startMinuten: tijdNaarMinuten(i.start_time!),
            duurMinuten: i.estimated_minutes ?? ONBEKENDE_DUUR_MINUTEN,
          })),
      ];
      const duur = item.estimated_minutes ?? ONBEKENDE_DUUR_MINUTEN;
      const slot = vindEersteVrijeSlot(bezet, duur);
      await accepteerPlanningItem(item.id, minutenNaarTijd(slot));
      router.refresh();
    });
  }

  function verwijder(item: PlanningItem) {
    startTransition(async () => {
      await verwijderPlanningItem(item.id);
      router.refresh();
    });
  }

  function openBewerken(item: PlanningItem) {
    setDetailItem(null);
    setBewerkError(null);
    setBewerkEstimatedMinutes(item.estimated_minutes);
    setBewerkItem(item);
  }

  function openDetail(item: PlanningItem) {
    setDetailItem(item);
  }

  async function handleBewerkSubmit(formData: FormData) {
    if (!bewerkItem) return;
    setBewerkError(null);
    const res = await bewerkPlanningItem(bewerkItem.id, formData);
    if (res?.error) {
      setBewerkError(res.error);
      return;
    }
    setBewerkItem(null);
    router.refresh();
  }

  function verplaats(item: PlanningItem, nieuweDatum: string) {
    if (nieuweDatum === item.due_date) return;
    startTransition(async () => {
      await verplaatsPlanningItem(item.id, nieuweDatum);
      router.refresh();
    });
  }

  function dropOpDag(e: DragEvent, iso: string) {
    e.preventDefault();
    setDragOverIso(null);
    const id = e.dataTransfer.getData("text/plain");
    const item = items.find((i) => i.id === id);
    if (item) verplaats(item, iso);
    setDraggedId(null);
  }

  const weekZondag = weekDagen[6];
  const weekLabel = `${weekMaandag.toLocaleDateString("nl-NL", { day: "numeric", month: "short" })} - ${weekZondag.toLocaleDateString("nl-NL", { day: "numeric", month: "short" })}`;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold text-slate-900">Agenda</h1>
        <div className="flex flex-wrap gap-2">
          <div className="flex rounded-xl border border-slate-200 p-0.5">
            <button
              onClick={() => setWeergave("lijst")}
              className={clsx(
                "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                weergave === "lijst" ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-50"
              )}
            >
              <Icon name="book-open" size={14} />
              Lijst
            </button>
            <button
              onClick={() => setWeergave("rooster")}
              className={clsx(
                "hidden items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors md:flex",
                weergave === "rooster" ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-50"
              )}
            >
              <Icon name="calendar" size={14} />
              Rooster
            </button>
          </div>
          <HuiswerkAIImport subjects={subjects} />
          <Button
            icon={<Icon name="plus" size={18} />}
            onClick={() => {
              setEstimatedMinutes(null);
              setFormOpen(true);
            }}
          >
            Nieuw item
          </Button>
        </div>
      </div>

      {vandaagOpenItems.length > 0 && (
        <Card className="flex items-center gap-3 border-accent-100 bg-accent-50/60 py-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-100 text-accent-600">
            <Icon name="target" size={18} />
          </span>
          <div className="flex-1">
            <p className="text-sm font-semibold text-slate-900">
              Vandaag: {vandaagOpenItems.length} {vandaagOpenItems.length === 1 ? "taak" : "taken"}
              {vandaagMinuten > 0 && ` - ongeveer ${formatMinuten(vandaagMinuten)} in totaal`}
            </p>
            <p className="text-xs text-slate-500">
              {vandaagZonderInschatting > 0
                ? `${vandaagZonderInschatting} zonder tijdsinschatting - vul die in voor een realistischer beeld.`
                : "Elke taak heeft een tijdsinschatting, zo weet je precies wat er vandaag in past."}
            </p>
          </div>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
        {(Object.entries(STATUS_META) as [PlanningItem["status"], (typeof STATUS_META)[keyof typeof STATUS_META]][]).map(
          ([status, meta]) => (
            <span key={status} className="flex items-center gap-1.5">
              <span className={clsx("h-2 w-2 rounded-full", meta.dot)} />
              {meta.label}
            </span>
          )
        )}
        <span className="text-slate-300">|</span>
        <span>Tik op een taak voor details</span>
      </div>

      <Card className="flex items-center justify-between gap-2 py-3">
        <button
          onClick={() => setWeekOffset((w) => w - 1)}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
          }}
          onDrop={(e) => {
            e.preventDefault();
            const id = e.dataTransfer.getData("text/plain");
            const item = items.find((i) => i.id === id);
            if (item) verplaats(item, isoPlusDagen(item.due_date, -7));
            setDraggedId(null);
          }}
          className="flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
          aria-label="Vorige week (sleep hier een item op om het een week eerder te plannen)"
        >
          <Icon name="chevron-left" size={18} />
          <span className="hidden sm:inline">Vorige week</span>
        </button>

        <div className="flex flex-col items-center">
          <p className="text-sm font-semibold text-slate-900">Week van {weekLabel}</p>
          {weekOffset !== 0 && (
            <button
              onClick={() => setWeekOffset(0)}
              className="text-xs font-medium text-accent-600 hover:underline"
            >
              Naar deze week
            </button>
          )}
        </div>

        <button
          onClick={() => setWeekOffset((w) => w + 1)}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
          }}
          onDrop={(e) => {
            e.preventDefault();
            const id = e.dataTransfer.getData("text/plain");
            const item = items.find((i) => i.id === id);
            if (item) verplaats(item, isoPlusDagen(item.due_date, 7));
            setDraggedId(null);
          }}
          className="flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
          aria-label="Volgende week (sleep hier een item op om het een week later te plannen)"
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
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100"
              />
            </div>

            {type !== "prive" && subjects.length > 0 && (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Vak</label>
                <select
                  name="subjectId"
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100"
                >
                  <option value="">Geen specifiek vak</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code ? `${s.code} - ${s.name}` : s.name}
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
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100"
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
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100"
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
                Vaste tijd (optioneel)
              </label>
              <TijdSelect name="startTime" startUur={6} eindUur={23} placeholder="Geen vaste tijd" />
              <p className="mt-1.5 text-xs text-slate-500">
                Zet dit op een tijdstip als je precies weet wanneer je dit gaat doen - dan komt het
                op die tijd in de agenda te staan.
              </p>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Geschatte tijd (optioneel)
              </label>
              <div className="flex flex-wrap gap-1.5">
                {TIJD_OPTIES.map((minuten) => (
                  <button
                    type="button"
                    key={minuten}
                    onClick={() => setEstimatedMinutes((huidig) => (huidig === minuten ? null : minuten))}
                    className={clsx(
                      "rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors",
                      estimatedMinutes === minuten
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    )}
                  >
                    {formatMinuten(minuten)}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-xs text-slate-500">
                Helpt om in te schatten wat er op een dag realistisch in past.
              </p>
              <input type="hidden" name="estimatedMinutes" value={estimatedMinutes ?? ""} />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Toelichting (optioneel)
              </label>
              <textarea
                name="description"
                rows={2}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100"
              />
            </div>

            {error && <p className="text-sm text-rose-600">{error}</p>}

            <SubmitButton className="mt-1">Toevoegen</SubmitButton>
        </form>
      </Modal>

      <Modal open={bewerkItem !== null} onClose={() => setBewerkItem(null)} title="Item bewerken">
        {bewerkItem && (
          <form action={handleBewerkSubmit} className="flex flex-col gap-4">
            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
              <Icon name={PLANNING_TYPE_META[bewerkItem.type].icon} size={14} />
              {PLANNING_TYPE_META[bewerkItem.type].label}
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Titel</label>
              <input
                name="title"
                required
                defaultValue={bewerkItem.title}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100"
              />
            </div>

            {bewerkItem.type !== "prive" && subjects.length > 0 && (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Vak</label>
                <select
                  name="subjectId"
                  defaultValue={bewerkItem.subject_id ?? ""}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100"
                >
                  <option value="">Geen specifiek vak</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code ? `${s.code} - ${s.name}` : s.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                {bewerkItem.type === "toets" ? "Datum van de toets" : "Datum"}
              </label>
              <input
                type="date"
                name="dueDate"
                required
                defaultValue={bewerkItem.due_date}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Vaste tijd (optioneel)
              </label>
              <TijdSelect
                name="startTime"
                startUur={6}
                eindUur={23}
                placeholder="Geen vaste tijd"
                defaultValue={bewerkItem.start_time?.slice(0, 5) ?? ""}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Geschatte tijd (optioneel)
              </label>
              <div className="flex flex-wrap gap-1.5">
                {TIJD_OPTIES.map((minuten) => (
                  <button
                    type="button"
                    key={minuten}
                    onClick={() => setBewerkEstimatedMinutes((huidig) => (huidig === minuten ? null : minuten))}
                    className={clsx(
                      "rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors",
                      bewerkEstimatedMinutes === minuten
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    )}
                  >
                    {formatMinuten(minuten)}
                  </button>
                ))}
              </div>
              <input type="hidden" name="estimatedMinutes" value={bewerkEstimatedMinutes ?? ""} />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Toelichting (optioneel)
              </label>
              <textarea
                name="description"
                rows={2}
                defaultValue={bewerkItem.description}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100"
              />
            </div>

            {bewerkError && <p className="text-sm text-rose-600">{bewerkError}</p>}

            <div className="flex gap-2">
              <SubmitButton>Wijzigingen opslaan</SubmitButton>
              <Button type="button" variant="secondary" onClick={() => setBewerkItem(null)}>
                Annuleren
              </Button>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={detailItem !== null} onClose={() => setDetailItem(null)} title="Details">
        {detailItem &&
          (() => {
            const meta = PLANNING_TYPE_META[detailItem.type];
            const statusMeta = STATUS_META[detailItem.status];
            const isVoorstel = detailItem.status === "voorstel";
            const isKlaar = detailItem.status === "klaar";
            return (
              <div className="flex flex-col gap-4">
                <div className="flex items-start gap-3">
                  <span
                    className={clsx(
                      "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border",
                      meta.badgeClass
                    )}
                  >
                    <Icon name={meta.icon} size={20} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={clsx("text-base font-semibold text-slate-900", isKlaar && "line-through")}>
                      {detailItem.title}
                    </p>
                    <p className="text-xs text-slate-500">
                      {meta.label}
                      {subjectNaam(detailItem.subject_id) && ` - ${subjectNaam(detailItem.subject_id)}`}
                    </p>
                  </div>
                  <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600">
                    <span className={clsx("h-1.5 w-1.5 rounded-full", statusMeta.dot)} />
                    {statusMeta.label}
                  </span>
                </div>

                {detailItem.description && (
                  <p className="whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
                    {detailItem.description}
                  </p>
                )}

                <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-slate-600">
                  <span className="flex items-center gap-1.5">
                    <Icon name="calendar" size={14} className="text-slate-400" />
                    {formatDatumLabel(detailItem.due_date)}
                  </span>
                  {detailItem.start_time && (
                    <span className="flex items-center gap-1.5">
                      <Icon name="history" size={14} className="text-slate-400" />
                      {tijdKort(detailItem.start_time)} uur
                    </span>
                  )}
                  {detailItem.estimated_minutes && (
                    <span className="flex items-center gap-1.5">
                      <Icon name="target" size={14} className="text-slate-400" />
                      ~{formatMinuten(detailItem.estimated_minutes)}
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                  {isVoorstel ? (
                    <>
                      <Button
                        loading={pending}
                        onClick={() => {
                          accepteer(detailItem);
                          setDetailItem(null);
                        }}
                        icon={<Icon name="check" size={16} />}
                      >
                        Prima zo, plan in
                      </Button>
                      <Button
                        variant="secondary"
                        disabled={pending}
                        onClick={() => {
                          verwijder(detailItem);
                          setDetailItem(null);
                        }}
                        icon={<Icon name="trash" size={16} />}
                      >
                        Verwijderen
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        variant={isKlaar ? "secondary" : "primary"}
                        loading={pending}
                        onClick={() => {
                          toggleStatus(detailItem);
                          setDetailItem(null);
                        }}
                        icon={<Icon name="check" size={16} />}
                      >
                        {isKlaar ? "Weer openzetten" : "Klaar melden"}
                      </Button>
                      {voorKind && (
                        <LinkButton
                          href={`/kind/focus/${detailItem.id}`}
                          variant="secondary"
                          icon={<Icon name="target" size={16} />}
                        >
                          Focus starten
                        </LinkButton>
                      )}
                      <Button variant="secondary" onClick={() => openBewerken(detailItem)} icon={<Icon name="pencil-line" size={16} />}>
                        Bewerken
                      </Button>
                      <Button
                        variant="danger"
                        disabled={pending}
                        onClick={() => {
                          verwijder(detailItem);
                          setDetailItem(null);
                        }}
                        icon={<Icon name="trash" size={16} />}
                      >
                        Verwijderen
                      </Button>
                    </>
                  )}
                </div>
              </div>
            );
          })()}
      </Modal>

      {/* Kalenderweergave: tijdlijn 7 dagen naast elkaar, zoals afsprakenplanning-software */}
      <div className={clsx("overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm", weergave === "rooster" ? "hidden md:block" : "hidden")}>
        <div className="overflow-x-auto">
        <div className="max-h-[calc(100vh-280px)] min-h-[280px] overflow-y-auto">
        <div
          className="grid min-w-[760px]"
          style={{ gridTemplateColumns: `48px repeat(7, minmax(0, 1fr))` }}
        >
          {/* rij 1: lege hoek + dagkoppen (sticky, blijft zichtbaar tijdens scrollen) */}
          <div className="sticky top-0 z-20 border-b border-slate-100 bg-white" />
          {weekDagen.map((dag, i) => {
            const iso = naarIsoDatum(dag);
            const isVandaag = iso === vandaagIso;
            const dagItems = itemsPerDag.get(iso) ?? [];
            const ongeplandeItems = dagItems.filter((it) => it.status === "voorstel" || !it.start_time);
            const jaarEvent = eventsOpDatum(jaarEvents, dag)[0] ?? null;
            const eventMeta = jaarEvent ? JAAR_EVENT_META[jaarEvent.type] : null;
            return (
              <div
                key={iso}
                className={clsx(
                  "sticky top-0 z-20 flex flex-col gap-1.5 border-b border-slate-100 px-2 py-2",
                  i > 0 && "border-l border-slate-100",
                  eventMeta ? eventMeta.dayTintClass : isVandaag ? "bg-accent-50/60" : "bg-white",
                  isVandaag && "ring-2 ring-inset ring-accent-300"
                )}
              >
                <div className="text-center">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                    {dag.toLocaleDateString("nl-NL", { weekday: "short" })}
                  </p>
                  <p className={clsx("text-xl font-semibold", isVandaag ? "text-accent-600" : "text-slate-800")}>
                    {dag.getDate()}
                  </p>
                </div>

                {eventMeta && jaarEvent && (
                  <span className={clsx("truncate rounded px-1.5 py-0.5 text-center text-[10px] font-medium", eventMeta.dayLabelClass)}>
                    {jaarEvent.titel}
                  </span>
                )}

                {ongeplandeItems.map((item) => {
                  const meta = PLANNING_TYPE_META[item.type];
                  const isVoorstel = item.status === "voorstel";
                  const isKlaar = item.status === "klaar";
                  return (
                    <div
                      key={item.id}
                      draggable={!isVoorstel}
                      onDragStart={(e) => {
                        setDraggedId(item.id);
                        e.dataTransfer.setData("text/plain", item.id);
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onDragEnd={() => {
                        setDraggedId(null);
                        setDragOverIso(null);
                      }}
                      onClick={() => openDetail(item)}
                      className={clsx(
                        "cursor-pointer rounded-lg border px-2 py-1.5 text-xs transition-opacity",
                        isKlaar
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : isVoorstel
                            ? clsx(meta.badgeClass, "border-dashed")
                            : meta.badgeClass,
                        !isVoorstel && "cursor-grab active:cursor-grabbing",
                        draggedId === item.id && "opacity-30"
                      )}
                    >
                      <div className="flex items-start gap-1">
                        {isKlaar ? (
                          <Icon name="check" size={12} className="mt-0.5 shrink-0 text-emerald-600" />
                        ) : (
                          <Icon name={meta.icon} size={12} className="mt-0.5 shrink-0" />
                        )}
                        <span className={clsx("line-clamp-2 flex-1 font-medium leading-snug", isKlaar && "line-through")}>
                          {item.title}
                        </span>
                        {subjectCode(item.subject_id) && (
                          <span className="shrink-0 rounded bg-white/70 px-1 py-0.5 text-[10px] font-bold leading-none text-slate-600">
                            {subjectCode(item.subject_id)}
                          </span>
                        )}
                      </div>
                      {isVoorstel && <p className="mt-0.5 text-[10px] italic opacity-70">voorstel, nog niet bevestigd</p>}
                      <div className="mt-1 flex items-center gap-2">
                        {isVoorstel ? (
                          <>
                            <button
                              disabled={pending}
                              onClick={(e) => {
                                e.stopPropagation();
                                accepteer(item);
                              }}
                              className="text-[10px] font-medium underline underline-offset-2 disabled:opacity-50"
                            >
                              Prima zo
                            </button>
                            <button
                              disabled={pending}
                              onClick={(e) => {
                                e.stopPropagation();
                                verwijder(item);
                              }}
                              aria-label="Verwijderen"
                              className="opacity-70 hover:opacity-100 disabled:opacity-30"
                            >
                              <Icon name={pending ? "loader" : "trash"} size={11} className={pending ? "animate-spin" : undefined} />
                            </button>
                          </>
                        ) : (
                          <button
                            disabled={pending}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleStatus(item);
                            }}
                            aria-label={isKlaar ? "Weer openzetten" : "Klaar markeren"}
                            className="opacity-70 hover:opacity-100 disabled:opacity-30"
                          >
                            <Icon name="check" size={11} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}

          {/* rij 2: uurlijst + tijdlijnen per dag, allemaal even hoog */}
          <div className="relative" style={{ height: totaalHoogte }}>
            {Array.from({ length: totUur - vanUur + 1 }, (_, i) => vanUur + i).map((uur) => (
              <div
                key={uur}
                className="absolute right-1 -translate-y-1/2 text-[11px] font-medium text-slate-400"
                style={{ top: (uur - vanUur) * UUR_HOOGTE }}
              >
                {String(uur).padStart(2, "0")}:00
              </div>
            ))}
          </div>
          {weekDagen.map((dag, i) => {
            const iso = naarIsoDatum(dag);
            const isVandaag = iso === vandaagIso;
            const weekdagNr = dag.getDay();
            const isWeekendDag = weekdagNr === 0 || weekdagNr === 6;
            const dagItems = itemsPerDag.get(iso) ?? [];
            const tijdItems = dagItems.filter((it) => it.status !== "voorstel" && it.start_time);
            const roosterBlokken = roosterPerDag.get(iso) ?? [];
            const jaarEvent = eventsOpDatum(jaarEvents, dag)[0] ?? null;
            const eventMeta = jaarEvent ? JAAR_EVENT_META[jaarEvent.type] : null;
            return (
              <div
                key={iso}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  if (dragOverIso !== iso) setDragOverIso(iso);
                }}
                onDragLeave={() => setDragOverIso((huidig) => (huidig === iso ? null : huidig))}
                onDrop={(e) => dropOpDag(e, iso)}
                className={clsx(
                  "relative overflow-hidden transition-colors",
                  i > 0 && "border-l border-slate-100",
                  eventMeta
                    ? eventMeta.dayTintClass
                    : isVandaag
                      ? "bg-accent-50/30"
                      : isWeekendDag
                        ? "bg-slate-50/70"
                        : "bg-white",
                  isVandaag && "ring-2 ring-inset ring-accent-300",
                  dragOverIso === iso && "bg-accent-50 ring-2 ring-inset ring-accent-400"
                )}
                style={{
                  height: totaalHoogte,
                  backgroundImage: `repeating-linear-gradient(to bottom, rgba(100,116,139,0.14) 0px, rgba(100,116,139,0.14) 1px, transparent 1px, transparent ${UUR_HOOGTE}px)`,
                }}
              >
                {roosterBlokken.map((b, bi) => (
                  <div
                    key={`r-${bi}`}
                    title={`${b.tijd} ${b.titel}`}
                    style={{ top: topVoorMinuut(b.startMinuten), height: hoogteVoorDuur(b.duurMinuten) }}
                    className={clsx(
                      "absolute inset-x-1 overflow-hidden rounded-md border-l-2 px-1.5 py-0.5 text-[11px] leading-tight",
                      b.isFietsen
                        ? "border-l-slate-300 bg-slate-50 text-slate-400"
                        : "border-l-slate-300 bg-slate-100 text-slate-600",
                      b.bron === "gewijzigd" &&
                        "border-l-amber-400 bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200",
                      b.bron === "extra" &&
                        "border-l-accent-400 bg-accent-50 text-accent-800 ring-1 ring-inset ring-accent-200"
                    )}
                  >
                    {b.bron === "gewijzigd" && <Icon name="pencil-line" size={9} className="mr-0.5 mb-px inline" />}
                    <span className="line-clamp-2">
                      {!b.isFietsen && `${b.tijd.split("-")[0]} `}
                      {b.titel}
                    </span>
                  </div>
                ))}

                {tijdItems.map((item) => {
                  const meta = PLANNING_TYPE_META[item.type];
                  const isKlaar = item.status === "klaar";
                  const startMin = tijdNaarMinuten(item.start_time!);
                  const duur = item.estimated_minutes ?? ONBEKENDE_DUUR_MINUTEN;
                  return (
                    <div
                      key={item.id}
                      draggable
                      onDragStart={(e) => {
                        setDraggedId(item.id);
                        e.dataTransfer.setData("text/plain", item.id);
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onDragEnd={() => {
                        setDraggedId(null);
                        setDragOverIso(null);
                      }}
                      onClick={() => openDetail(item)}
                      style={{ top: topVoorMinuut(startMin), height: hoogteVoorDuur(duur) }}
                      className={clsx(
                        "group absolute inset-x-1 cursor-pointer overflow-hidden rounded-md border px-1.5 py-0.5 text-xs leading-tight shadow-sm transition-opacity",
                        isKlaar ? "border-emerald-200 bg-emerald-50 text-emerald-700" : meta.badgeClass,
                        "cursor-grab active:cursor-grabbing",
                        draggedId === item.id && "opacity-30"
                      )}
                    >
                      <p className={clsx("flex items-center gap-1 truncate font-medium", isKlaar && "line-through")}>
                        {isKlaar && <Icon name="check" size={10} className="shrink-0 text-emerald-600" />}
                        {tijdKort(item.start_time!)} {item.title}
                      </p>
                      <div className="absolute right-0.5 top-0.5 hidden gap-0.5 group-hover:flex">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleStatus(item);
                          }}
                          className="rounded bg-white/90 p-0.5 hover:bg-white"
                          aria-label={isKlaar ? "Weer openzetten" : "Klaar markeren"}
                        >
                          <Icon name="check" size={10} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            verwijder(item);
                          }}
                          className="rounded bg-white/90 p-0.5 hover:bg-white"
                          aria-label="Verwijderen"
                        >
                          <Icon name="trash" size={10} />
                        </button>
                      </div>
                    </div>
                  );
                })}

                {isVandaag && nuMinuten !== null && nuMinuten >= vanUur * 60 && nuMinuten <= totUur * 60 && (
                  <div className="absolute inset-x-0 z-10 border-t-2 border-accent-500" style={{ top: topVoorMinuut(nuMinuten) }}>
                    <span className="absolute -left-1 -top-1.5 h-3 w-3 rounded-full border-2 border-white bg-accent-500 shadow-sm" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
        </div>
        </div>
      </div>

      {/* Lijstweergave: dagen onder elkaar - altijd op mobiel, en op elk formaat als 'Lijst' gekozen is */}
      <div className={clsx("flex flex-col gap-4", weergave === "rooster" && "md:hidden")}>
        {weekDagen.map((dag) => {
          const iso = naarIsoDatum(dag);
          const dagItems = [...(itemsPerDag.get(iso) ?? [])].sort((a, b) => {
            if (a.start_time && b.start_time) return a.start_time.localeCompare(b.start_time);
            if (a.start_time) return -1;
            if (b.start_time) return 1;
            return 0;
          });
          const roosterBlokken = roosterBlokkenVoorDag(
            dag,
            periodes,
            roosterItems,
            uitzonderingen,
            reistijdMinuten,
            jaarEvents
          );
          const jaarEvent = eventsOpDatum(jaarEvents, dag)[0] ?? null;
          const eventMeta = jaarEvent ? JAAR_EVENT_META[jaarEvent.type] : null;
          return (
            <div key={iso} className={clsx("rounded-2xl p-2", eventMeta?.dayTintClass)}>
              <div className="mb-2 flex items-center gap-2">
                <p className="text-sm font-medium capitalize text-slate-500">{formatDatumLabel(iso)}</p>
                {eventMeta && jaarEvent && (
                  <span className={clsx("rounded px-1.5 py-0.5 text-[10px] font-medium", eventMeta.dayLabelClass)}>
                    {jaarEvent.titel}
                  </span>
                )}
              </div>

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
                      {b.bron === "gewijzigd" && <Icon name="pencil-line" size={11} className="shrink-0 text-amber-500" />}
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
                        onClick={() => openDetail(item)}
                        className={clsx(
                          "flex cursor-pointer items-center gap-3 py-3 transition-colors hover:border-accent-200",
                          isKlaar
                            ? "border-emerald-200 bg-emerald-50/60"
                            : isVoorstel && "border-dashed"
                        )}
                      >
                        <span
                          className={clsx(
                            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border",
                            isKlaar ? "border-emerald-200 bg-emerald-100 text-emerald-600" : meta.badgeClass
                          )}
                        >
                          <Icon name={isKlaar ? "check" : meta.icon} size={16} />
                        </span>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <p
                              className={clsx(
                                "truncate text-sm font-medium text-slate-800",
                                isKlaar && "line-through"
                              )}
                            >
                              {item.start_time && <span className="text-slate-400">{tijdKort(item.start_time)} </span>}
                              {item.title}
                            </p>
                            {subjectCode(item.subject_id) && (
                              <span className="shrink-0 rounded bg-slate-100 px-1 py-0.5 text-[10px] font-bold text-slate-500">
                                {subjectCode(item.subject_id)}
                              </span>
                            )}
                          </div>
                          <p className="truncate text-xs text-slate-500">
                            {[meta.label, !subjectCode(item.subject_id) ? subjectNaam(item.subject_id) : null]
                              .filter(Boolean)
                              .join(" - ")}
                            {item.estimated_minutes && ` - ~${formatMinuten(item.estimated_minutes)}`}
                            {isVoorstel && " - voorstel, nog niet bevestigd"}
                          </p>
                          {!isVoorstel && (
                            <div className="mt-1 flex items-center gap-2 text-[11px] font-medium text-slate-400">
                              <span>Verplaats:</span>
                              <button
                                disabled={pending}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  verplaats(item, isoPlusDagen(item.due_date, -1));
                                }}
                                className="rounded px-1.5 py-0.5 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
                              >
                                -1 dag
                              </button>
                              <button
                                disabled={pending}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  verplaats(item, isoPlusDagen(item.due_date, 1));
                                }}
                                className="rounded px-1.5 py-0.5 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
                              >
                                +1 dag
                              </button>
                              <button
                                disabled={pending}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  verplaats(item, isoPlusDagen(item.due_date, 7));
                                }}
                                className="rounded px-1.5 py-0.5 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
                              >
                                +1 week
                              </button>
                            </div>
                          )}
                        </div>

                        {isVoorstel ? (
                          <div className="flex shrink-0 gap-1.5">
                            <Button
                              size="md"
                              variant="secondary"
                              loading={pending}
                              onClick={(e) => {
                                e.stopPropagation();
                                accepteer(item);
                              }}
                            >
                              Prima zo
                            </Button>
                            <button
                              disabled={pending}
                              onClick={(e) => {
                                e.stopPropagation();
                                verwijder(item);
                              }}
                              className="rounded-xl p-2.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                              aria-label="Verwijderen"
                            >
                              <Icon name={pending ? "loader" : "trash"} size={16} className={pending ? "animate-spin" : undefined} />
                            </button>
                          </div>
                        ) : (
                          <button
                            disabled={pending}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleStatus(item);
                            }}
                            className={clsx(
                              "shrink-0 rounded-xl p-2.5 disabled:opacity-50",
                              isKlaar
                                ? "bg-emerald-100 text-emerald-700"
                                : "text-slate-400 hover:bg-emerald-50 hover:text-emerald-600"
                            )}
                            aria-label={isKlaar ? "Weer openzetten" : "Klaar markeren"}
                          >
                            <Icon name="check" size={18} />
                          </button>
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
