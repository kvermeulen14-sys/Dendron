"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
  type DragEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Icon } from "@/components/icon";
import { Button, LinkButton } from "@/components/ui/button";
import { PlanningshulpKnop } from "@/components/planningshulp-knop";
import { RoosterVakDeadlineModal } from "@/components/rooster-vak-deadline-modal";
import { NuEnStraks } from "@/components/nu-en-straks";
import { CapaciteitRing } from "@/components/capaciteit-ring";
import { vakKleur } from "@/lib/vak-kleur";
import { vakAfkorting } from "@/lib/vak-afkorting";
import { kiesKlaarLabel, kiesVierTekst } from "@/lib/motiverend";
import { useKlaarBevestiging } from "@/lib/use-klaar-bevestiging";
import { DuurTerugblik } from "@/components/duur-terugblik";
import { berekenKalibratie, schattingAdvies } from "@/lib/kalibratie";
import { SubmitButton } from "@/components/ui/submit-button";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { HuiswerkAIImport, type HuiswerkAIImportHandle } from "@/components/huiswerk-ai-import";
import { TijdSelect } from "@/components/ui/tijd-select";
import { PlanningHulpChat } from "@/components/planning-hulp-chat";
import { bepaalAandachtSignalen, bouwAandachtBericht } from "@/lib/planning-aandacht";
import { PLANNING_TYPE_META, minutenNaarTijd, vindEersteVrijeSlot } from "@/lib/planning";
import { JAAR_EVENT_META, eventsOpDatum, naarIsoDatum } from "@/lib/jaarkalender";
import {
  accepteerPlanningItem,
  bewerkPlanningItem,
  bewerkPlanningReeks,
  maakPlanningItem,
  updatePlanningDuur,
  updatePlanningStatus,
  updatePlanningWerkelijkeDuur,
  verplaatsPlanningItem,
  verplaatsPlanningItemNaarTijd,
  verwijderPlanningItem,
} from "@/lib/actions/planning";
import {
  CAPACITEIT_META,
  berekenDagCapaciteit,
  capaciteitTekst,
  dagRitmesPerWeek,
  tijdNaarMinuten,
  vensterTekst,
  type DagCapaciteit,
} from "@/lib/capaciteit";
import type {
  DagInstelling,
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

type HerhalingType = "geen" | "dagelijks" | "wekelijks" | "maandelijks";
const HERHALING_OPTIES: { value: HerhalingType; label: string }[] = [
  { value: "geen", label: "Niet herhalen" },
  { value: "dagelijks", label: "Elke dag" },
  { value: "wekelijks", label: "Elke week" },
  { value: "maandelijks", label: "Elke maand" },
];

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
const UUR_HOOGTE = 48;
const STANDAARD_VAN_UUR = 6;
const STANDAARD_TOT_UUR = 22;
const MIN_BLOK_PX = 34;
const ONBEKENDE_DUUR_MINUTEN = 30;

/** Slepen landt altijd op een kwartier, zodat er geen 16:07-afspraken ontstaan. */
const SNAP_MINUTEN = 15;
const MIN_DUUR_MINUTEN = 15;
const MAX_DUUR_MINUTEN = 8 * 60;
/** Vanaf deze hoogte past er naast de titel ook nog een regel met tijd en duur. */
const METAREGEL_VANAF_PX = 46;

// Of het weekend ingeklapt is, is een voorkeur van de gebruiker en hoort dus
// bewaard te blijven. Via een kleine externe store i.p.v. een effect, zodat er
// op de server "auto" uitkomt en pas na hydratie de echte keuze - zonder
// cascade-render.
type WeekendVoorkeur = "auto" | "open" | "dicht";
const WEEKEND_SLEUTEL = "dendron-weekend";
const weekendLuisteraars = new Set<() => void>();

function abonneerWeekendVoorkeur(callback: () => void) {
  weekendLuisteraars.add(callback);
  return () => {
    weekendLuisteraars.delete(callback);
  };
}

function leesWeekendVoorkeur(): WeekendVoorkeur {
  const bewaard = window.localStorage.getItem(WEEKEND_SLEUTEL);
  return bewaard === "open" || bewaard === "dicht" ? bewaard : "auto";
}

function schrijfWeekendVoorkeur(voorkeur: WeekendVoorkeur) {
  window.localStorage.setItem(WEEKEND_SLEUTEL, voorkeur);
  for (const luisteraar of weekendLuisteraars) luisteraar();
}

// Kleur staat voor het soort item, en alleen daarvoor. De status (voorstel,
// klaar) wordt met vorm en verzadiging aangegeven - zo hoeft er maar een
// kleurtaal onthouden te worden.
const KAART_STIJL: Record<PlanningType, { rail: string; ico: string; stip: string }> = {
  huiswerk: { rail: "bg-huiswerk-500", ico: "bg-huiswerk-100 text-huiswerk-700", stip: "bg-huiswerk-500" },
  toets: { rail: "bg-toets-500", ico: "bg-toets-100 text-toets-700", stip: "bg-toets-500" },
  leermoment: {
    rail: "bg-leermoment-500",
    ico: "bg-leermoment-100 text-leermoment-700",
    stip: "bg-leermoment-500",
  },
  prive: { rail: "bg-prive-500", ico: "bg-prive-100 text-prive-700", stip: "bg-prive-500" },
};

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
  subjectId: string | null;
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
  // Een "vervallen"-uitzondering zonder gekoppeld lesuur betekent "hele dag
  // vervalt" (gekozen via "Hele dag" i.p.v. 1 specifiek lesuur) - dan vervallen
  // alle gewone lessen, maar een los toegevoegde "extra"-activiteit die dag
  // (bv. een schoolreisje) blijft wel gewoon staan.
  const heleDagVervallen = dagUitzonderingen.some((u) => u.type === "vervallen" && !u.origineel_item_id);
  const vervallenIds = new Set(dagUitzonderingen.filter((u) => u.type === "vervallen").map((u) => u.origineel_item_id));
  const gewijzigdMap = new Map(
    dagUitzonderingen.filter((u) => u.type === "gewijzigd").map((u) => [u.origineel_item_id, u])
  );

  let lessen: {
    titel: string;
    start_tijd: string;
    eind_tijd: string;
    bron: "rooster" | "gewijzigd" | "extra";
    subjectId: string | null;
  }[] =
    periode && !heleDagVervallen
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
                  subjectId: i.subject_id,
                }
              : {
                  titel: i.titel,
                  start_tijd: i.start_tijd,
                  eind_tijd: i.eind_tijd,
                  bron: "rooster" as const,
                  subjectId: i.subject_id,
                };
          })
      : [];

  for (const extra of dagUitzonderingen.filter((u) => u.type === "extra")) {
    if (extra.titel && extra.start_tijd && extra.eind_tijd) {
      lessen.push({ titel: extra.titel, start_tijd: extra.start_tijd, eind_tijd: extra.eind_tijd, bron: "extra", subjectId: null });
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
      subjectId: null,
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
      subjectId: les.subjectId,
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
      subjectId: null,
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
  dagInstellingen,
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
  /** Ochtend/avond/eten-ritme per weekdag, zie /ouder/rooster. */
  dagInstellingen: DagInstelling[];
  jaarEvents: JaarEvent[];
  /** Kind-omgeving: begint in de rustigere lijstweergave i.p.v. het dichte roosterraster, en toont een link naar Focusmodus. */
  voorKind?: boolean;
}) {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);
  // Opent meteen als je via de ronde +-knop in de onderste navigatiebalk komt
  // (?nieuw=1) - puur client-side gelezen, zodat er geen Suspense-boundary
  // nodig is zoals bij next/navigation's useSearchParams.
  const [kiesModusOpen, setKiesModusOpen] = useState(
    () => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("nieuw") === "1"
  );
  const huiswerkAIImportRef = useRef<HuiswerkAIImportHandle>(null);

  function openHandmatigFormulier() {
    setEstimatedMinutes(null);
    setSubjectId("");
    setHerhaling("geen");
    setHerhaalTot("");
    setPriveVan("");
    setPriveTot("");
    setFormOpen(true);
  }
  const [type, setType] = useState<PlanningType>("huiswerk");
  const [estimatedMinutes, setEstimatedMinutes] = useState<number | null>(null);
  // Prive-afspraken (bv. oppassen) duren vaak langer dan het 2u-plafond van de
  // duur-chips en hebben typisch een concreet begin- en eindtijdstip - dus
  // daar los van/tot invullen i.p.v. een duur uit een lijst kiezen.
  const [priveVan, setPriveVan] = useState("");
  const [priveTot, setPriveTot] = useState("");
  const priveDuur =
    priveVan && priveTot ? Math.max(0, tijdNaarMinuten(priveTot) - tijdNaarMinuten(priveVan)) : null;
  const [subjectId, setSubjectId] = useState("");
  const [herhaling, setHerhaling] = useState<HerhalingType>("geen");
  const [herhaalTot, setHerhaalTot] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [weekOffset, setWeekOffset] = useState(0);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverIso, setDragOverIso] = useState<string | null>(null);
  const [bewerkItem, setBewerkItem] = useState<PlanningItem | null>(null);
  const [bewerkEstimatedMinutes, setBewerkEstimatedMinutes] = useState<number | null>(null);
  const [bewerkPriveVan, setBewerkPriveVan] = useState("");
  const [bewerkPriveTot, setBewerkPriveTot] = useState("");
  const bewerkPriveDuur =
    bewerkPriveVan && bewerkPriveTot
      ? Math.max(0, tijdNaarMinuten(bewerkPriveTot) - tijdNaarMinuten(bewerkPriveVan))
      : null;
  const [bewerkHeleReeks, setBewerkHeleReeks] = useState(false);
  const [bewerkError, setBewerkError] = useState<string | null>(null);
  const [detailItem, setDetailItem] = useState<PlanningItem | null>(null);
  const [weergave, setWeergave] = useState<"rooster" | "lijst">("rooster");
  // Klik-op-vak-in-het-rooster -> deadline (huiswerk/toets) bekijken/toevoegen
  // voor dat vak op die dag (ouder en kind, zie RoosterVakDeadlineModal). Dit
  // lesuur zelf is de deadline - geen losse datum/tijd-keuze.
  const [deadlineVak, setDeadlineVak] = useState<{ subjectId: string; titel: string; datum: string; lesuurTijd: string } | null>(
    null
  );
  // Gedeelde coach-popup voor alle plekken waar net huiswerk/toets is
  // toegevoegd (Nieuw item, AI-import) of waar iets aandacht nodig heeft -
  // los van de eigen coach-popup die RoosterVakDeadlineModal al opent.
  const [planningshulp, setPlanningshulp] = useState<{ openingsbericht: string } | null>(null);
  // Waar het kaartje zou landen als je nu loslaat - als kwartier-lijn zichtbaar.
  const [dropMinuut, setDropMinuut] = useState<number | null>(null);
  const [resizeDuur, setResizeDuur] = useState<{ id: string; duur: number } | null>(null);
  const [lijstSleep, setLijstSleep] = useState<{ id: string; x: number; y: number } | null>(null);
  const [lijstDoelIso, setLijstDoelIso] = useState<string | null>(null);
  const resizeRef = useRef<{ id: string; startY: number; startDuur: number; huidig: number } | null>(null);
  const weekendVoorkeur = useSyncExternalStore(
    abonneerWeekendVoorkeur,
    leesWeekendVoorkeur,
    () => "auto" as WeekendVoorkeur
  );
  const klaarBevestiging = useKlaarBevestiging();

  const ritmesPerWeek = useMemo(() => dagRitmesPerWeek(dagInstellingen), [dagInstellingen]);

  // Wat eerdere taken leerden over hoe lang dit soort werk echt duurt.
  const kalibratie = useMemo(() => berekenKalibratie(items), [items]);
  const advies = useMemo(
    () => schattingAdvies(kalibratie, type, subjectId || null, estimatedMinutes),
    [kalibratie, type, subjectId, estimatedMinutes]
  );

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
  // Bredere reeks voor de lijstweergave: deze week plus de komende 3 weken in
  // 1 keer zichtbaar (i.p.v. steeds "volgende week" te moeten klikken), zodat
  // er ook echt vooruitgepland kan worden. Het roosterraster (desktop) blijft
  // op de smallere weekDagen - dat is bewust een 1-weeks grid.
  const LIJST_WEKEN = 2;
  const lijstDagen = useMemo(
    () => Array.from({ length: LIJST_WEKEN * 7 }, (_, i) => voegDagenToe(weekMaandag, i)),
    [weekMaandag]
  );

  const itemsPerDag = useMemo(() => {
    const map = new Map<string, PlanningItem[]>();
    for (const dag of lijstDagen) map.set(naarIsoDatum(dag), []);
    for (const item of items) {
      const lijst = map.get(item.due_date);
      if (lijst) lijst.push(item);
    }
    return map;
  }, [items, lijstDagen]);

  const vandaagItems = useMemo(
    () => items.filter((i) => i.due_date === vandaagIso && i.status !== "voorstel"),
    [items, vandaagIso]
  );
  // Prive bezet wel tijd (zie capaciteit.ts) maar is geen afvinkbare taak -
  // telt daarom niet mee in dit taken-overzicht.
  const vandaagOpenItems = vandaagItems.filter((i) => i.status !== "klaar" && i.type !== "prive");
  const vandaagMinuten = vandaagOpenItems.reduce((som, i) => som + (i.estimated_minutes ?? 0), 0);

  // Vandaag apart, want die valt buiten de getoonde week zodra je vooruitbladert.
  const vandaagRoosterBlokken = useMemo(
    () =>
      roosterBlokkenVoorDag(
        new Date(vandaagIso + "T00:00:00"),
        periodes,
        roosterItems,
        uitzonderingen,
        reistijdMinuten,
        jaarEvents
      ),
    [vandaagIso, periodes, roosterItems, uitzonderingen, reistijdMinuten, jaarEvents]
  );

  const vandaagCapaciteit = useMemo(
    () =>
      berekenDagCapaciteit({
        roosterBlokken: vandaagRoosterBlokken,
        items: items.filter((i) => i.due_date === vandaagIso),
        ritme: ritmesPerWeek.get(naarIsoWeekdag(new Date(vandaagIso + "T00:00:00")))!,
      }),
    [items, vandaagIso, vandaagRoosterBlokken, ritmesPerWeek]
  );

  // Leren in delen werkt alleen als je ook ziet dat je ermee bezig bent: op het
  // toetskaartje staat daarom hoeveel van de gespreide leermomenten al af zijn.
  const leermomentVoortgang = useMemo(() => {
    const map = new Map<string, { totaal: number; klaar: number }>();
    for (const item of items) {
      if (item.type !== "leermoment" || !item.parent_item_id) continue;
      const huidig = map.get(item.parent_item_id) ?? { totaal: 0, klaar: 0 };
      huidig.totaal += 1;
      if (item.status === "klaar") huidig.klaar += 1;
      map.set(item.parent_item_id, huidig);
    }
    return map;
  }, [items]);

  function dagenTot(iso: string) {
    return Math.round(
      (new Date(iso + "T00:00:00").getTime() - new Date(vandaagIso + "T00:00:00").getTime()) / 86400000
    );
  }

  function toetsAftelling(iso: string) {
    const dagen = dagenTot(iso);
    if (dagen < 0) return "geweest";
    if (dagen === 0) return "vandaag";
    if (dagen === 1) return "morgen";
    return `nog ${dagen} dagen`;
  }

  // Onaf werk verdwijnt niet stilletjes in het verleden: het blijft in beeld
  // tot er een keuze over gemaakt is. Zolang het nergens veilig staat, blijft
  // het in je hoofd rondzingen - en dat is precies wat een agenda moet
  // overnemen.
  const openstaandVerleden = useMemo(
    () =>
      items
        .filter((i) => i.status === "open" && i.due_date < vandaagIso)
        .sort((a, b) => a.due_date.localeCompare(b.due_date)),
    [items, vandaagIso]
  );

  // Huiswerk/toetsen zonder werkmoment, een toets met te weinig gespreide
  // leermomenten, of iets dat niet is afgevinkt terwijl de dag al voorbij is
  // - dit hoort niet stil te blijven liggen, dus overal zichtbaar maken en
  // met 1 klik naar de coach kunnen om het samen met de rest van de week op
  // te lossen.
  const aandachtSignalen = useMemo(
    () => bepaalAandachtSignalen(items, testTypes, new Date(vandaagIso + "T00:00:00")),
    [items, testTypes, vandaagIso]
  );
  const aandachtItemIds = useMemo(() => new Set(aandachtSignalen.map((s) => s.item.id)), [aandachtSignalen]);

  const roosterPerDag = useMemo(() => {
    const map = new Map<string, RoosterBlok[]>();
    for (const dag of lijstDagen) {
      map.set(
        naarIsoDatum(dag),
        roosterBlokkenVoorDag(dag, periodes, roosterItems, uitzonderingen, reistijdMinuten, jaarEvents)
      );
    }
    return map;
  }, [lijstDagen, periodes, roosterItems, uitzonderingen, reistijdMinuten, jaarEvents]);

  // Per dag: hoeveel tijd is er echt, en hoeveel staat er gepland. Zo wordt een
  // te volle dag zichtbaar op het moment dat er nog iets aan te doen is.
  const capaciteitPerDag = useMemo(() => {
    const map = new Map<string, DagCapaciteit>();
    for (const dag of lijstDagen) {
      const iso = naarIsoDatum(dag);
      map.set(
        iso,
        berekenDagCapaciteit({
          roosterBlokken: roosterPerDag.get(iso) ?? [],
          items: itemsPerDag.get(iso) ?? [],
          ritme: ritmesPerWeek.get(naarIsoWeekdag(dag))!,
        })
      );
    }
    return map;
  }, [lijstDagen, roosterPerDag, itemsPerDag, ritmesPerWeek]);

  // Het weekend klapt vanzelf in zolang er niets staat, en gaat open zodra er
  // wel iets is (ook bij een vakantie of toetsweek uit de jaarkalender) - tenzij
  // de gebruiker zelf een keuze heeft gemaakt.
  const weekendHeeftInhoud = useMemo(
    () =>
      weekDagen.slice(5).some((dag) => {
        const iso = naarIsoDatum(dag);
        return (
          (itemsPerDag.get(iso) ?? []).length > 0 ||
          (roosterPerDag.get(iso) ?? []).length > 0 ||
          eventsOpDatum(jaarEvents, dag).length > 0
        );
      }),
    [weekDagen, itemsPerDag, roosterPerDag, jaarEvents]
  );
  const weekendIngeklapt =
    weekendVoorkeur === "dicht" ? true : weekendVoorkeur === "open" ? false : !weekendHeeftInhoud;

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
    const vak = subjects.find((s) => s.id === id);
    return vak ? vakAfkorting(vak) : null;
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

    // Huiswerk/toets: meteen de coach erbij halen om te bedenken wanneer
    // eraan gewerkt wordt - i.p.v. dat het los blijft liggen tot iemand het
    // zelf weer oppikt.
    const typeIngevuld = String(formData.get("type") || "");
    if (typeIngevuld === "huiswerk" || typeIngevuld === "toets") {
      const titelIngevuld = String(formData.get("title") || "");
      const vak = subjects.find((s) => s.id === String(formData.get("subjectId") || ""))?.name;
      setPlanningshulp({
        openingsbericht: `Ik heb net ${typeIngevuld === "toets" ? "een toets" : "huiswerk"}${vak ? ` voor ${vak}` : ""} toegevoegd ("${titelIngevuld}"), moet af zijn op ${dueDateRaw ? formatDatumLabel(dueDateRaw) : "later"}. Kun je helpen bedenken wanneer ik hier het beste aan kan werken, rekening houdend met de rest van mijn week?`,
      });
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
    const van = item.start_time?.slice(0, 5) ?? "";
    setBewerkPriveVan(van);
    setBewerkPriveTot(van && item.estimated_minutes ? tijdPlusMinuten(van, item.estimated_minutes) : "");
    setBewerkHeleReeks(false);
    setBewerkItem(item);
  }

  function openDetail(item: PlanningItem) {
    klaarBevestiging.reset();
    setDetailItem(item);
  }

  function sluitDetail() {
    klaarBevestiging.reset();
    setDetailItem(null);
  }

  async function handleBewerkSubmit(formData: FormData) {
    if (!bewerkItem) return;
    setBewerkError(null);
    const res =
      bewerkHeleReeks && bewerkItem.herhaling_groep_id
        ? await bewerkPlanningReeks(bewerkItem.herhaling_groep_id, formData)
        : await bewerkPlanningItem(bewerkItem.id, formData);
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

  /** Rekent de muispositie in een dagkolom terug naar een tijdstip op het kwartier. */
  function minuutUitPositie(e: DragEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const ruw = vanUur * 60 + ((e.clientY - rect.top) / UUR_HOOGTE) * 60;
    const gesnapt = Math.round(ruw / SNAP_MINUTEN) * SNAP_MINUTEN;
    return Math.max(vanUur * 60, Math.min(totUur * 60 - SNAP_MINUTEN, gesnapt));
  }

  function sleepOverTijdlijn(e: DragEvent<HTMLDivElement>, iso: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverIso !== iso) setDragOverIso(iso);
    const minuut = minuutUitPositie(e);
    setDropMinuut((huidig) => (huidig === minuut ? huidig : minuut));
  }

  // Loslaten op de tijdlijn bepaalt zowel de dag als het tijdstip: een item dat
  // nog geen tijd had, krijgt er zo in een beweging een.
  function dropOpTijdlijn(e: DragEvent<HTMLDivElement>, iso: string) {
    e.preventDefault();
    const minuut = minuutUitPositie(e);
    setDragOverIso(null);
    setDropMinuut(null);
    const id = e.dataTransfer.getData("text/plain");
    setDraggedId(null);
    const item = items.find((i) => i.id === id);
    if (!item) return;
    const nieuweTijd = minutenNaarTijd(minuut);
    if (item.due_date === iso && item.start_time?.slice(0, 5) === nieuweTijd) return;
    startTransition(async () => {
      await verplaatsPlanningItemNaarTijd(item.id, iso, nieuweTijd);
      router.refresh();
    });
  }

  // Slepen in de lijstweergave (mobiel). HTML5-drag doet op touch niets, dus
  // dit loopt via pointer events, met een eigen greepje: dat is duidelijker dan
  // ingedrukt houden en het houdt gewoon scrollen intact.
  function startLijstSlepen(e: ReactPointerEvent<HTMLElement>, item: PlanningItem) {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setLijstSleep({ id: item.id, x: e.clientX, y: e.clientY });
    setLijstDoelIso(null);
  }

  function lijstSlepen(e: ReactPointerEvent<HTMLElement>) {
    if (!lijstSleep) return;
    setLijstSleep({ ...lijstSleep, x: e.clientX, y: e.clientY });
    const onder = document.elementFromPoint(e.clientX, e.clientY);
    const dag = onder?.closest<HTMLElement>("[data-dag-iso]");
    setLijstDoelIso(dag?.dataset.dagIso ?? null);
  }

  function eindigLijstSlepen(e: ReactPointerEvent<HTMLElement>) {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    const sleep = lijstSleep;
    const doel = lijstDoelIso;
    setLijstSleep(null);
    setLijstDoelIso(null);
    if (!sleep || !doel) return;
    const item = items.find((i) => i.id === sleep.id);
    if (item) verplaats(item, doel);
  }

  function startDuurSlepen(e: ReactPointerEvent<HTMLElement>, item: PlanningItem) {
    e.preventDefault();
    e.stopPropagation();
    const startDuur = item.estimated_minutes ?? ONBEKENDE_DUUR_MINUTEN;
    e.currentTarget.setPointerCapture(e.pointerId);
    resizeRef.current = { id: item.id, startY: e.clientY, startDuur, huidig: startDuur };
    setResizeDuur({ id: item.id, duur: startDuur });
  }

  function duurSlepen(e: ReactPointerEvent<HTMLElement>) {
    const ref = resizeRef.current;
    if (!ref) return;
    const verschil = ((e.clientY - ref.startY) / UUR_HOOGTE) * 60;
    const nieuw = Math.max(
      MIN_DUUR_MINUTEN,
      Math.min(MAX_DUUR_MINUTEN, Math.round((ref.startDuur + verschil) / SNAP_MINUTEN) * SNAP_MINUTEN)
    );
    ref.huidig = nieuw;
    setResizeDuur({ id: ref.id, duur: nieuw });
  }

  function eindigDuurSlepen(e: ReactPointerEvent<HTMLElement>) {
    const ref = resizeRef.current;
    resizeRef.current = null;
    setResizeDuur(null);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (!ref || ref.huidig === ref.startDuur) return;
    startTransition(async () => {
      await updatePlanningDuur(ref.id, ref.huidig);
      router.refresh();
    });
  }

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
          {voorKind && (
            <LinkButton href="/kind/focus/vrij" variant="secondary" icon={<Icon name="target" size={18} />}>
              Focus
            </LinkButton>
          )}
          <PlanningshulpKnop items={items} subjects={subjects} variant="knop" />
          <Button icon={<Icon name="plus" size={18} />} onClick={() => setKiesModusOpen(true)}>
            Nieuw item
          </Button>
        </div>
      </div>

      {aandachtSignalen.length > 0 && (
        <Card className="flex flex-wrap items-center gap-3 border-rose-200 bg-rose-50/70 py-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-600">
            <Icon name="alert-triangle" size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-900">
              {aandachtSignalen.length} {aandachtSignalen.length === 1 ? "ding heeft" : "dingen hebben"} aandacht nodig
            </p>
            <p className="text-xs text-slate-500">Huiswerk of een toets zonder werkmoment, of iets dat niet is afgevinkt.</p>
          </div>
          <Button size="sm" onClick={() => setPlanningshulp({ openingsbericht: bouwAandachtBericht(aandachtSignalen) })}>
            Bespreek met de coach
          </Button>
        </Card>
      )}

      <HuiswerkAIImport
        subjects={subjects}
        ref={huiswerkAIImportRef}
        onOpgeslagen={(regels) => {
          const lijst = regels
            .map((r) => {
              const vak = subjects.find((s) => s.id === r.subjectId)?.name;
              return `- ${r.titel}${vak ? ` (${vak})` : ""}, moet af op ${formatDatumLabel(r.datum)}`;
            })
            .join("\n");
          setPlanningshulp({
            openingsbericht: `Ik heb net dit huiswerk toegevoegd:\n${lijst}\n\nKun je me helpen dit in te plannen, rekening houdend met de rest van mijn week?`,
          });
        }}
      />

      {/* 1 knop met daarachter de keuze foto/tekst (AI) of handmatig, i.p.v. 2
          losse knoppen naast elkaar - rustiger boven de agenda. */}
      <Modal open={kiesModusOpen} onClose={() => setKiesModusOpen(false)} title="Nieuw item toevoegen">
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            onClick={() => {
              setKiesModusOpen(false);
              huiswerkAIImportRef.current?.open();
            }}
            className="flex flex-col items-start gap-2 rounded-2xl border border-slate-200 p-4 text-left transition-colors hover:border-accent-300 hover:bg-accent-50/40"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-100 text-accent-600">
              <Icon name="sparkles" size={20} />
            </span>
            <span className="text-sm font-semibold text-slate-900">Foto of tekst (AI)</span>
            <span className="text-xs text-slate-500">
              Plak huiswerk als tekst, of upload een foto van je agenda of planner - je controleert het
              hierna zelf.
            </span>
          </button>
          <button
            onClick={() => {
              setKiesModusOpen(false);
              openHandmatigFormulier();
            }}
            className="flex flex-col items-start gap-2 rounded-2xl border border-slate-200 p-4 text-left transition-colors hover:border-accent-300 hover:bg-accent-50/40"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
              <Icon name="pencil-line" size={20} />
            </span>
            <span className="text-sm font-semibold text-slate-900">Handmatig invullen</span>
            <span className="text-xs text-slate-500">
              Zelf 1 item invullen - huiswerk, toets, leermoment of iets privés.
            </span>
          </button>
        </div>
      </Modal>

      {/* Ook zichtbaar voor een ouder (handig om in 1 oogopslag te zien
          waar je kind nu mee bezig is) - alleen de "Focus starten"-link
          erin is kind-only, dat regelt de voorKind-prop van dit component zelf. */}
      <NuEnStraks items={vandaagItems} roosterBlokken={vandaagRoosterBlokken} voorKind={voorKind} />

      {vandaagOpenItems.length > 0 && (
        <Card
          className={clsx(
            "flex items-center gap-3 py-3",
            vandaagCapaciteit.niveau === "over"
              ? "border-rose-200 bg-rose-50/70"
              : "border-accent-100 bg-accent-50/60"
          )}
        >
          <span
            className={clsx(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
              vandaagCapaciteit.niveau === "over"
                ? "bg-rose-100 text-rose-600"
                : "bg-accent-100 text-accent-600"
            )}
          >
            <Icon name={vandaagCapaciteit.niveau === "over" ? "alert-circle" : "target"} size={18} />
          </span>
          <div className="flex-1">
            <p className="text-sm font-semibold text-slate-900">
              Vandaag: {vandaagOpenItems.length} {vandaagOpenItems.length === 1 ? "taak" : "taken"}
              {vandaagMinuten > 0 && ` - ongeveer ${formatMinuten(vandaagMinuten)} in totaal`}
            </p>
            <p className="text-xs text-slate-500">
              {vandaagCapaciteit.niveau === "over"
                ? `Er staat ${formatMinuten(vandaagCapaciteit.overMinuten)} meer gepland dan er past. Wat schuiven we naar een andere dag?`
                : vandaagCapaciteit.zonderInschatting > 0
                  ? `${vandaagCapaciteit.zonderInschatting} zonder tijdsinschatting - vul die in, dan klopt het beeld van wat er past.`
                  : `Dit past binnen de ${formatMinuten(vandaagCapaciteit.beschikbaarMinuten)} die je vandaag hebt.`}
            </p>
          </div>
        </Card>
      )}

      {openstaandVerleden.length > 0 && (
        <Card className="flex flex-col gap-2.5 border-amber-200 bg-amber-50/60 py-3">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600">
              <Icon name="alert-circle" size={17} />
            </span>
            <div>
              <p className="text-sm font-semibold text-slate-900">
                Nog niet af: {openstaandVerleden.length}{" "}
                {openstaandVerleden.length === 1 ? "ding" : "dingen"}
              </p>
              <p className="text-xs text-slate-500">
                Dit blijft hier staan tot je er iets mee doet - zet het op vandaag, of op een dag
                waarop het wel past.
              </p>
            </div>
          </div>
          <ul className="flex flex-col gap-1.5">
            {openstaandVerleden.map((item) => {
              const meta = PLANNING_TYPE_META[item.type];
              const code = subjectCode(item.subject_id);
              return (
                <li
                  key={item.id}
                  className="flex items-center gap-2 rounded-xl border border-amber-100 bg-white py-1.5 pl-0 pr-1.5"
                >
                  <span className={clsx("ml-1.5 h-7 w-1 shrink-0 rounded-full", KAART_STIJL[item.type].rail)} />
                  <span
                    className={clsx(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded",
                      KAART_STIJL[item.type].ico
                    )}
                  >
                    <Icon name={meta.icon} size={11} />
                  </span>
                  <button onClick={() => openDetail(item)} className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-sm font-medium text-slate-800">{item.title}</span>
                    <span className="block truncate text-[11px] text-slate-400">
                      stond op{" "}
                      {new Date(item.due_date + "T00:00:00").toLocaleDateString("nl-NL", {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                      })}
                      {code && <span className="ml-1 font-semibold text-slate-500">{code}</span>}
                    </span>
                  </button>
                  <button
                    disabled={pending}
                    onClick={() => verplaats(item, vandaagIso)}
                    className="shrink-0 rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
                  >
                    Vandaag
                  </button>
                  <button
                    disabled={pending}
                    onClick={() => verplaats(item, isoPlusDagen(vandaagIso, 1))}
                    className="shrink-0 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Morgen
                  </button>
                  <button
                    disabled={pending}
                    onClick={() => toggleStatus(item)}
                    aria-label="Klaar markeren"
                    title="Klaar markeren"
                    className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600 disabled:opacity-50"
                  >
                    <Icon name="check" size={15} />
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {/* Puur navigatie, geen dag-informatie meer hier - dag/datum/capaciteit
          staat al in de kalendergrid (en in elke dag-kop in de lijstweergave),
          dus dit was letterlijk dubbelop. */}
      <div className="flex items-center justify-between gap-2">
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
          <Icon name="chevron-left" size={16} />
          Vorige week
        </button>

        {weekOffset !== 0 && (
          <button
            onClick={() => setWeekOffset(0)}
            className="rounded-xl px-2.5 py-2 text-xs font-medium text-accent-600 hover:bg-accent-50"
          >
            Naar deze week
          </button>
        )}

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
          Volgende week
          <Icon name="chevron-right" size={16} />
        </button>
      </div>

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
                  value={subjectId}
                  onChange={(e) => setSubjectId(e.target.value)}
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
                  Soort toets (voor leertips)
                </label>
                <select
                  name="testTypeId"
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100"
                >
                  <option value="">Standaard</option>
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
                  Je krijgt er automatisch een paar leermomenten bij, verspreid vóór de toets - die kun je zelf
                  aanpassen.
                </p>
              )}
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Herhalen</label>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                {HERHALING_OPTIES.map((opt) => (
                  <button
                    type="button"
                    key={opt.value}
                    onClick={() => setHerhaling(opt.value)}
                    className={clsx(
                      "rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors",
                      herhaling === opt.value
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {herhaling !== "geen" && (
                <div className="mt-2">
                  <label className="mb-1.5 block text-xs font-medium text-slate-500">Herhalen tot en met</label>
                  <input
                    type="date"
                    required
                    value={herhaalTot}
                    onChange={(e) => setHerhaalTot(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100"
                  />
                  <p className="mt-1.5 text-xs text-slate-500">
                    Er worden meteen losse taken aangemaakt tot en met deze datum, zodat je ze
                    stuk voor stuk kunt afvinken of verplaatsen.
                  </p>
                </div>
              )}
              <input type="hidden" name="herhaling" value={herhaling} />
              <input type="hidden" name="herhaalTot" value={herhaalTot} />
            </div>

            {type === "prive" ? (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Van - tot (optioneel)</label>
                <div className="flex items-center gap-2">
                  <TijdSelect
                    startUur={6}
                    eindUur={23}
                    placeholder="Van"
                    value={priveVan}
                    onChange={(e) => setPriveVan(e.target.value)}
                  />
                  <span className="text-slate-400">-</span>
                  <TijdSelect
                    startUur={6}
                    eindUur={23}
                    placeholder="Tot"
                    value={priveTot}
                    onChange={(e) => setPriveTot(e.target.value)}
                  />
                </div>
                <p className="mt-1.5 text-xs text-slate-500">
                  {priveDuur !== null
                    ? `Duurt ${formatMinuten(priveDuur)} - dat komt op ${priveVan} in de agenda te staan.`
                    : "Bv. 19:00 tot 23:00 voor een avond oppassen - geen vast plafond zoals bij huiswerk."}
                </p>
                <input type="hidden" name="startTime" value={priveVan} />
                <input type="hidden" name="estimatedMinutes" value={priveDuur ?? ""} />
              </div>
            ) : (
              <>
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
                  {advies ? (
                    <button
                      type="button"
                      onClick={() => setEstimatedMinutes(advies.voorstelMinuten)}
                      className="mt-1.5 flex w-full items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-2.5 py-2 text-left text-xs text-amber-800 hover:bg-amber-100"
                    >
                      <Icon name="alert-circle" size={14} className="mt-px shrink-0" />
                      <span>
                        {advies.tekst} <span className="font-semibold underline">Neem {advies.voorstelMinuten} min over</span>
                      </span>
                    </button>
                  ) : (
                    <p className="mt-1.5 text-xs text-slate-500">
                      Voor de hele taak samen, niet per keer dat je ermee bezig gaat. Helpt om in te schatten wat er
                      op een dag realistisch in past.
                    </p>
                  )}
                  <input type="hidden" name="estimatedMinutes" value={estimatedMinutes ?? ""} />
                </div>
              </>
            )}

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Omschrijving (optioneel)
              </label>
              <textarea
                name="description"
                rows={2}
                placeholder="bijv. paragraaf 3.2, opgave 5 t/m 10"
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

            {bewerkItem.type === "prive" ? (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Van - tot (optioneel)</label>
                <div className="flex items-center gap-2">
                  <TijdSelect
                    startUur={6}
                    eindUur={23}
                    placeholder="Van"
                    value={bewerkPriveVan}
                    onChange={(e) => setBewerkPriveVan(e.target.value)}
                  />
                  <span className="text-slate-400">-</span>
                  <TijdSelect
                    startUur={6}
                    eindUur={23}
                    placeholder="Tot"
                    value={bewerkPriveTot}
                    onChange={(e) => setBewerkPriveTot(e.target.value)}
                  />
                </div>
                {bewerkPriveDuur !== null && (
                  <p className="mt-1.5 text-xs text-slate-500">Duurt {formatMinuten(bewerkPriveDuur)}.</p>
                )}
                <input type="hidden" name="startTime" value={bewerkPriveVan} />
                <input type="hidden" name="estimatedMinutes" value={bewerkPriveDuur ?? ""} />
              </div>
            ) : (
              <>
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
              </>
            )}

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

            {bewerkItem.herhaling_groep_id && (
              <label className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={bewerkHeleReeks}
                  onChange={(e) => setBewerkHeleReeks(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-accent-600 focus:ring-accent-500"
                />
                <span>
                  <span className="font-medium">Voor de hele reeks toepassen</span>
                  <span className="block text-xs text-slate-500">
                    Dit item herhaalt. Pas titel/vak/tijd/toelichting aan voor alle nog niet afgevinkte
                    herhalingen tegelijk - al afgevinkte blijven ongewijzigd, en de datum blijft per
                    item apart.
                  </span>
                </span>
              </label>
            )}

            {bewerkError && <p className="text-sm text-rose-600">{bewerkError}</p>}

            <div className="flex gap-2">
              <SubmitButton>{bewerkHeleReeks ? "Hele reeks opslaan" : "Wijzigingen opslaan"}</SubmitButton>
              <Button type="button" variant="secondary" onClick={() => setBewerkItem(null)}>
                Annuleren
              </Button>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={detailItem !== null} onClose={sluitDetail} title="Details">
        {detailItem &&
          (() => {
            const meta = PLANNING_TYPE_META[detailItem.type];
            const statusMeta = STATUS_META[detailItem.status];
            const isVoorstel = detailItem.status === "voorstel";
            const isKlaar = detailItem.status === "klaar";
            const isPrive = detailItem.type === "prive";
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
                      {detailItem.actual_minutes && (
                        <span className="text-slate-400">
                          (werd {formatMinuten(detailItem.actual_minutes)})
                        </span>
                      )}
                    </span>
                  )}
                </div>

                {/* Aftellen naar de toets, en hoeveel van het gespreide leren
                    al gedaan is - leren in delen werkt alleen als je die
                    voortgang ook ziet. */}
                {detailItem.type === "toets" &&
                  (() => {
                    const voortgang = leermomentVoortgang.get(detailItem.id);
                    const dagen = dagenTot(detailItem.due_date);
                    return (
                      <div className="flex flex-col gap-2 rounded-xl border border-toets-200 bg-toets-50 p-3">
                        <p className="text-sm font-semibold text-toets-700">
                          Toets {toetsAftelling(detailItem.due_date)}
                          {dagen > 1 && <span className="font-normal text-slate-500"> - nog even tijd om te leren</span>}
                        </p>
                        {voortgang ? (
                          <>
                            <div className="flex h-1.5 overflow-hidden rounded-full bg-white">
                              <span
                                className="h-full bg-leermoment-500"
                                style={{ width: `${(voortgang.klaar / voortgang.totaal) * 100}%` }}
                              />
                            </div>
                            <p className="text-xs text-slate-600">
                              {voortgang.klaar} van {voortgang.totaal} leermomenten af
                              {voortgang.klaar < voortgang.totaal &&
                                " - de rest staat verspreid in je agenda, dat leert beter dan alles op de avond ervoor."}
                            </p>
                          </>
                        ) : (
                          <p className="text-xs text-slate-500">
                            Er staan nog geen leermomenten voor deze toets.
                          </p>
                        )}
                      </div>
                    );
                  })()}

                <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                  {isVoorstel ? (
                    <>
                      <Button
                        loading={pending}
                        onClick={() => {
                          accepteer(detailItem);
                          sluitDetail();
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
                          sluitDetail();
                        }}
                        icon={<Icon name="trash" size={16} />}
                      >
                        Verwijderen
                      </Button>
                    </>
                  ) : klaarBevestiging.fase === "bevestigen" ? (
                    <div className="flex w-full items-center gap-2 rounded-xl bg-slate-50 p-2.5">
                      <span className="flex-1 text-sm font-medium text-slate-600">Zeker weten?</span>
                      <Button variant="secondary" size="md" onClick={klaarBevestiging.annuleer}>
                        Toch niet
                      </Button>
                      <Button
                        size="md"
                        loading={klaarBevestiging.bezig}
                        onClick={async () => {
                          await klaarBevestiging.bevestig(
                            async () => {
                              await updatePlanningStatus(detailItem.id, "klaar");
                              router.refresh();
                            },
                            { vraagDuur: Boolean(detailItem.estimated_minutes) }
                          );
                          if (!detailItem.estimated_minutes) setTimeout(() => sluitDetail(), 1600);
                        }}
                        icon={<Icon name="check" size={16} />}
                      >
                        Ja, {kiesKlaarLabel(detailItem.id).toLowerCase()}
                      </Button>
                    </div>
                  ) : klaarBevestiging.fase === "duur" ? (
                    <div className="w-full">
                      <DuurTerugblik
                        geschatteMinuten={detailItem.estimated_minutes}
                        bezig={klaarBevestiging.bezig}
                        onKies={async (minuten) => {
                          await klaarBevestiging.meldDuur(async () => {
                            await updatePlanningWerkelijkeDuur(detailItem.id, minuten);
                            router.refresh();
                          });
                          setTimeout(() => sluitDetail(), 1600);
                        }}
                        onOverslaan={async () => {
                          await klaarBevestiging.meldDuur();
                          setTimeout(() => sluitDetail(), 1600);
                        }}
                      />
                    </div>
                  ) : klaarBevestiging.fase === "vieren" ? (
                    <div className="flex w-full items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2.5 text-sm font-semibold text-emerald-700">
                      <Icon name="party" size={16} />
                      {kiesVierTekst(detailItem.id)}
                    </div>
                  ) : (
                    <>
                      {!isPrive && (
                        <Button
                          variant={isKlaar ? "secondary" : "primary"}
                          loading={pending}
                          onClick={() => {
                            if (isKlaar) {
                              toggleStatus(detailItem);
                              sluitDetail();
                            } else {
                              klaarBevestiging.vraagBevestiging();
                            }
                          }}
                          icon={<Icon name="check" size={16} />}
                        >
                          {isKlaar ? "Weer openzetten" : kiesKlaarLabel(detailItem.id)}
                        </Button>
                      )}
                      {voorKind && !isPrive && (
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
                          sluitDetail();
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
      <div className={clsx("rounded-2xl border border-slate-200 bg-white shadow-sm", weergave === "rooster" ? "hidden md:block" : "hidden")}>
        <div className="overflow-x-auto overflow-y-visible rounded-2xl">
        <div
          className={clsx("grid", weekendIngeklapt ? "min-w-[640px]" : "min-w-[760px]")}
          style={{
            gridTemplateColumns: weekendIngeklapt
              ? `48px repeat(5, minmax(0, 1fr)) 40px 40px`
              : `48px repeat(7, minmax(0, 1fr))`,
          }}
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
            const cap = capaciteitPerDag.get(iso);
            const capMeta = cap ? CAPACITEIT_META[cap.niveau] : null;
            const isWeekendKolom = i >= 5;

            // Ingeklapt weekend: alleen een smalle knop met de dagnaam. De
            // items zelf blijven zichtbaar als stipjes in de tijdlijn eronder.
            if (isWeekendKolom && weekendIngeklapt) {
              return (
                <button
                  key={iso}
                  onClick={() => schrijfWeekendVoorkeur("open")}
                  title={`${dag.toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long" })} - klik om open te klappen`}
                  className="sticky top-0 z-20 flex flex-col items-center justify-start gap-1 border-b border-l border-slate-100 bg-slate-50 py-2 hover:bg-slate-100"
                >
                  <Icon name="chevron-left" size={12} className="text-slate-400" />
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 [writing-mode:vertical-rl]">
                    {dag.toLocaleDateString("nl-NL", { weekday: "short" })} {dag.getDate()}
                  </span>
                </button>
              );
            }

            return (
              <div
                key={iso}
                className={clsx(
                  "sticky top-0 z-20 flex flex-col gap-1.5 border-b border-slate-100 px-2 py-2",
                  i > 0 && "border-l border-slate-100",
                  eventMeta ? eventMeta.dayTintClass : isVandaag ? "bg-accent-50/60" : "bg-white",
                  isVandaag && "ring-2 ring-inset ring-accent-300",
                  capMeta?.kopClass
                )}
              >
                <div className="relative text-center">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                    {dag.toLocaleDateString("nl-NL", { weekday: "short" })}
                  </p>
                  <p className={clsx("text-xl font-semibold", isVandaag ? "text-accent-600" : "text-slate-800")}>
                    {dag.getDate()}
                  </p>
                  {isWeekendKolom && i === 5 && (
                    <button
                      onClick={() => schrijfWeekendVoorkeur("dicht")}
                      aria-label="Weekend inklappen"
                      title="Weekend inklappen"
                      className="absolute -top-0.5 right-0 rounded p-0.5 text-slate-300 hover:bg-slate-100 hover:text-slate-500"
                    >
                      <Icon name="chevron-right" size={13} />
                    </button>
                  )}
                </div>

                {/* Capaciteitsmeter: geplande tijd tegenover de tijd die er die
                    dag echt is. Een te volle dag hoort er ook te vol uit te zien. */}
                {cap && capMeta && (
                  <div
                    className="flex flex-col gap-1"
                    title={`${formatMinuten(cap.geplandMinuten)} gepland, ${formatMinuten(cap.beschikbaarMinuten)} beschikbaar (${vensterTekst(cap)})`}
                  >
                    <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <span
                        className={clsx("h-full", capMeta.barClass)}
                        style={{ width: `${Math.min(100, Math.round(cap.percentage * 100))}%` }}
                      />
                      {cap.zonderInschatting > 0 && (
                        <span
                          className="h-full bg-slate-300"
                          style={{
                            width: `${Math.max(0, Math.min(100 - Math.min(100, Math.round(cap.percentage * 100)), cap.beschikbaarMinuten > 0 ? Math.round(((cap.zonderInschatting * ONBEKENDE_DUUR_MINUTEN) / cap.beschikbaarMinuten) * 100) : 100))}%`,
                            backgroundImage:
                              "repeating-linear-gradient(135deg, rgba(100,116,139,0.55) 0 3px, transparent 3px 6px)",
                          }}
                        />
                      )}
                    </div>
                    <p className="truncate text-center text-[10px] leading-tight">
                      <span className={clsx("font-semibold", capMeta.textClass)}>{capaciteitTekst(cap)}</span>
                      {cap.zonderInschatting > 0 && (
                        <span className="text-slate-400"> &middot; {cap.zonderInschatting}&times; geen tijd</span>
                      )}
                    </p>
                  </div>
                )}

                {eventMeta && jaarEvent && (
                  <span className={clsx("truncate rounded px-1.5 py-0.5 text-center text-[10px] font-medium", eventMeta.dayLabelClass)}>
                    {jaarEvent.titel}
                  </span>
                )}

                {ongeplandeItems.map((item) => {
                  const meta = PLANNING_TYPE_META[item.type];
                  const isVoorstel = item.status === "voorstel";
                  const isKlaar = item.status === "klaar";
                  const heeftAandacht = !isKlaar && aandachtItemIds.has(item.id);
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
                        "flex cursor-pointer gap-1.5 rounded-lg border bg-white py-1 pr-1.5 text-xs shadow-sm transition-opacity",
                        heeftAandacht ? "border-rose-300" : "border-slate-200",
                        isVoorstel && "border-dashed bg-slate-50/70",
                        isKlaar && "opacity-60",
                        !isVoorstel && "cursor-grab active:cursor-grabbing",
                        draggedId === item.id && "opacity-30"
                      )}
                    >
                      <span
                        className={clsx(
                          "ml-1 w-1 shrink-0 rounded-full",
                          isKlaar ? "bg-emerald-500" : heeftAandacht ? "bg-rose-500" : KAART_STIJL[item.type].rail,
                          isVoorstel && "opacity-50"
                        )}
                      />
                      <div className="min-w-0 flex-1">
                      <div className="flex items-start gap-1">
                        <span
                          className={clsx(
                            "mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded",
                            isKlaar ? "bg-emerald-100 text-emerald-700" : KAART_STIJL[item.type].ico
                          )}
                        >
                          <Icon name={isKlaar ? "check" : meta.icon} size={10} />
                        </span>
                        <span
                          className={clsx(
                            "line-clamp-2 flex-1 font-semibold leading-snug text-slate-800",
                            isKlaar && "line-through"
                          )}
                        >
                          {item.title}
                        </span>
                        {subjectCode(item.subject_id) && (
                          <span className="shrink-0 rounded bg-slate-100 px-1 py-0.5 text-[10px] font-bold leading-none text-slate-500">
                            {subjectCode(item.subject_id)}
                          </span>
                        )}
                      </div>
                      {isVoorstel && <p className="mt-0.5 text-[10px] italic text-slate-400">voorstel, nog niet bevestigd</p>}
                      <div className="mt-1 flex items-center gap-2">
                        {isVoorstel ? (
                          <>
                            <button
                              disabled={pending}
                              onClick={(e) => {
                                e.stopPropagation();
                                accepteer(item);
                              }}
                              className="text-[10px] font-medium text-slate-500 underline underline-offset-2 hover:text-slate-800 disabled:opacity-50"
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
                              className="text-slate-400 hover:text-rose-600 disabled:opacity-30"
                            >
                              <Icon name={pending ? "loader" : "trash"} size={11} className={pending ? "animate-spin" : undefined} />
                            </button>
                          </>
                        ) : (
                          <>
                            {/* Huiswerk/toets zonder werkmoment: niet zelf een
                                tijd erop plakken (die dag kan de deadline zelf
                                zijn), maar de coach erbij halen die met de rest
                                van de week rekening houdt. */}
                            {!item.start_time && !isKlaar && (item.type === "huiswerk" || item.type === "toets") && (
                              <button
                                disabled={pending}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const vak = subjectNaam(item.subject_id);
                                  setPlanningshulp({
                                    openingsbericht: `Ik heb ${item.type === "toets" ? "een toets" : "huiswerk"}${vak ? ` voor ${vak}` : ""} ("${item.title}"), moet af zijn op ${formatDatumLabel(item.due_date)}. Kun je helpen bedenken wanneer ik hier het beste aan kan werken, rekening houdend met de rest van mijn week?`,
                                  });
                                }}
                                className="flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-200 disabled:opacity-50"
                              >
                                <Icon name="chat" size={10} />
                                Plan met de coach
                              </button>
                            )}
                            <button
                              disabled={pending}
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleStatus(item);
                              }}
                              aria-label={isKlaar ? "Weer openzetten" : "Klaar markeren"}
                              className="text-slate-400 hover:text-slate-700 disabled:opacity-30"
                            >
                              <Icon name="check" size={11} />
                            </button>
                          </>
                        )}
                      </div>
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
            const cap = capaciteitPerDag.get(iso);

            // Ingeklapte weekendstrook: geen tijdlijn, wel een stip per item,
            // zodat je nog steeds ziet dat er iets staat. Er iets op laten
            // vallen klapt de dag meteen weer open.
            if (i >= 5 && weekendIngeklapt) {
              return (
                <div
                  key={iso}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    if (dragOverIso !== iso) setDragOverIso(iso);
                  }}
                  onDragLeave={() => setDragOverIso((huidig) => (huidig === iso ? null : huidig))}
                  onDrop={(e) => {
                    dropOpDag(e, iso);
                    schrijfWeekendVoorkeur("open");
                  }}
                  style={{ height: totaalHoogte }}
                  className={clsx(
                    "flex flex-col items-center gap-1.5 border-l border-slate-100 bg-slate-50 pt-3 transition-colors",
                    dragOverIso === iso && "bg-accent-50 ring-2 ring-inset ring-accent-400"
                  )}
                >
                  {dagItems.map((it) => (
                    <span
                      key={it.id}
                      title={it.title}
                      className={clsx(
                        "h-2 w-2 rounded-full",
                        it.status === "klaar" ? "bg-emerald-400" : KAART_STIJL[it.type].stip,
                        it.status === "voorstel" && "opacity-40"
                      )}
                    />
                  ))}
                </div>
              );
            }

            return (
              <div
                key={iso}
                onDragOver={(e) => sleepOverTijdlijn(e, iso)}
                onDragLeave={() => {
                  setDragOverIso((huidig) => (huidig === iso ? null : huidig));
                  setDropMinuut(null);
                }}
                onDrop={(e) => dropOpTijdlijn(e, iso)}
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
                  cap?.niveau === "over" && "ring-2 ring-inset ring-rose-200",
                  dragOverIso === iso && "bg-accent-50 ring-2 ring-inset ring-accent-400"
                )}
                style={{
                  height: totaalHoogte,
                  backgroundImage: `repeating-linear-gradient(to bottom, rgba(100,116,139,0.14) 0px, rgba(100,116,139,0.14) 1px, transparent 1px, transparent ${UUR_HOOGTE}px)`,
                }}
              >
                {(() => {
                  // Een vak dat die dag meerdere keren in het rooster staat,
                  // claimt zijn huiswerk/toets bij het lesuur waarop het
                  // daadwerkelijk is aangemaakt (rooster_start_tijd). Alleen
                  // items zonder die koppeling (bv. via Planningshulp
                  // aangemaakt) vallen terug op "eerste lesuur claimt 'm".
                  const geclaimdeVakIdsGrid = new Set<string>();
                  return roosterBlokken.map((b, bi) => {
                  const klikbaar = !b.isFietsen && Boolean(b.subjectId);
                  const blokTijd = b.tijd.split("-")[0];
                  let deadlines: PlanningItem[] = [];
                  if (klikbaar) {
                    const vakItems = dagItems.filter(
                      (it) => it.subject_id === b.subjectId && (it.type === "huiswerk" || it.type === "toets")
                    );
                    const exact = vakItems.filter((it) => it.rooster_start_tijd?.slice(0, 5) === blokTijd);
                    if (exact.length > 0) {
                      deadlines = exact;
                    } else {
                      const algeclaimd = b.subjectId ? geclaimdeVakIdsGrid.has(b.subjectId) : false;
                      const zonderLesuur = vakItems.filter((it) => !it.rooster_start_tijd);
                      deadlines = !algeclaimd ? zonderLesuur : [];
                      if (deadlines.length > 0 && b.subjectId) geclaimdeVakIdsGrid.add(b.subjectId);
                    }
                  }
                  const heeftToets = deadlines.some((d) => d.type === "toets");
                  const heeftDeadline = deadlines.length > 0;
                  const heeftAandacht = deadlines.some((d) => aandachtItemIds.has(d.id));
                  return (
                    <div
                      key={`r-${bi}`}
                      title={
                        heeftAandacht
                          ? `${b.tijd} ${b.titel} - heeft aandacht nodig, klik om te bekijken`
                          : heeftDeadline
                            ? `${b.tijd} ${b.titel} - ${deadlines.length} deadline(s), klik om te bekijken`
                            : klikbaar
                              ? `${b.tijd} ${b.titel} - klik om huiswerk of een toets toe te voegen`
                              : `${b.tijd} ${b.titel}`
                      }
                      onClick={
                        klikbaar
                          ? () => setDeadlineVak({ subjectId: b.subjectId!, titel: b.titel, datum: iso, lesuurTijd: blokTijd })
                          : undefined
                      }
                      style={{ top: topVoorMinuut(b.startMinuten), height: hoogteVoorDuur(b.duurMinuten) }}
                      className={clsx(
                        "absolute inset-x-1 overflow-hidden rounded-md border-l-2 px-1.5 py-0.5 text-[11px] leading-tight",
                        b.isFietsen
                          ? "border-l-slate-300 bg-slate-50 text-slate-400"
                          : "border-l-slate-300 bg-slate-100 text-slate-600",
                        b.bron === "gewijzigd" &&
                          "border-l-amber-400 bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200",
                        b.bron === "extra" &&
                          "border-l-accent-400 bg-accent-50 text-accent-800 ring-1 ring-inset ring-accent-200",
                        heeftDeadline &&
                          (heeftToets
                            ? "border-l-toets-400 bg-toets-50 text-toets-800 ring-1 ring-inset ring-toets-200"
                            : "border-l-huiswerk-400 bg-huiswerk-50 text-huiswerk-800 ring-1 ring-inset ring-huiswerk-200"),
                        heeftAandacht && "border-l-rose-500 ring-1 ring-inset ring-rose-300",
                        klikbaar && "cursor-pointer hover:ring-1 hover:ring-inset hover:ring-accent-300"
                      )}
                    >
                      {b.bron === "gewijzigd" && <Icon name="pencil-line" size={9} className="mr-0.5 mb-px inline" />}
                      {heeftAandacht && <Icon name="alert-triangle" size={9} className="mr-0.5 mb-px inline text-rose-600" />}
                      {heeftDeadline &&
                        (heeftToets ? (
                          <span className="mr-0.5 text-[8px] font-black tracking-tighter">TOETS</span>
                        ) : (
                          <span className="mr-0.5 text-[8px] font-black tracking-tighter">HUISWERK</span>
                        ))}
                      <span className="line-clamp-2">
                        {!b.isFietsen && `${b.tijd.split("-")[0]} `}
                        {b.titel}
                      </span>
                      {klikbaar && !heeftDeadline && <Icon name="plus" size={9} className="ml-0.5 mb-px inline text-accent-500" />}
                    </div>
                  );
                  });
                })()}

                {tijdItems.map((item) => {
                  const meta = PLANNING_TYPE_META[item.type];
                  const stijl = KAART_STIJL[item.type];
                  const isKlaar = item.status === "klaar";
                  const startMin = tijdNaarMinuten(item.start_time!);
                  const duur =
                    resizeDuur?.id === item.id
                      ? resizeDuur.duur
                      : (item.estimated_minutes ?? ONBEKENDE_DUUR_MINUTEN);
                  const hoogte = hoogteVoorDuur(duur);
                  const code = subjectCode(item.subject_id);
                  return (
                    <div
                      key={item.id}
                      draggable={resizeDuur === null}
                      onDragStart={(e) => {
                        setDraggedId(item.id);
                        e.dataTransfer.setData("text/plain", item.id);
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onDragEnd={() => {
                        setDraggedId(null);
                        setDragOverIso(null);
                        setDropMinuut(null);
                      }}
                      onClick={() => openDetail(item)}
                      title={`${tijdKort(item.start_time!)} - ${tijdPlusMinuten(item.start_time!, duur)} - ${item.title}`}
                      style={{ top: topVoorMinuut(startMin), height: hoogte }}
                      className={clsx(
                        "group absolute inset-x-1 flex cursor-grab gap-1.5 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 pr-1.5 shadow-sm transition-opacity active:cursor-grabbing",
                        isKlaar && "opacity-60",
                        draggedId === item.id && "opacity-30",
                        resizeDuur?.id === item.id && "ring-2 ring-accent-400"
                      )}
                    >
                      {/* Kleurbalk = soort item; de rest van het kaartje blijft rustig wit. */}
                      <span className={clsx("ml-1 w-1 shrink-0 rounded-full", isKlaar ? "bg-emerald-500" : stijl.rail)} />
                      <span
                        className={clsx(
                          "mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded",
                          isKlaar ? "bg-emerald-100 text-emerald-700" : stijl.ico
                        )}
                      >
                        <Icon name={isKlaar ? "check" : meta.icon} size={10} />
                      </span>
                      <span className="min-w-0 flex-1 leading-tight">
                        <span
                          className={clsx(
                            "block text-[11px] font-semibold text-slate-800",
                            hoogte >= METAREGEL_VANAF_PX ? "line-clamp-2" : "truncate",
                            isKlaar && "line-through"
                          )}
                        >
                          {item.title}
                        </span>
                        {hoogte >= METAREGEL_VANAF_PX && (
                          <span className="mt-0.5 block truncate text-[10px] text-slate-400 tabular-nums">
                            {tijdKort(item.start_time!)} &middot;{" "}
                            {item.type === "toets" ? (
                              <span className="font-semibold text-toets-700">{toetsAftelling(item.due_date)}</span>
                            ) : (
                              formatMinuten(duur)
                            )}
                            {code && <span className="ml-1 font-semibold text-slate-500">{code}</span>}
                          </span>
                        )}
                      </span>

                      {/* Onderrand slepen = hoe lang het duurt. Dat voedt meteen
                          de capaciteitsmeter, dus je ziet direct of het nog past. */}
                      <span
                        onPointerDown={(e) => startDuurSlepen(e, item)}
                        onPointerMove={duurSlepen}
                        onPointerUp={eindigDuurSlepen}
                        onPointerCancel={eindigDuurSlepen}
                        onClick={(e) => e.stopPropagation()}
                        title="Sleep om de tijdsinschatting aan te passen"
                        className="absolute inset-x-0 bottom-0 flex h-2 cursor-ns-resize touch-none items-end justify-center"
                      >
                        <span
                          className={clsx(
                            "mb-0.5 h-0.5 w-6 rounded-full bg-slate-300 transition-opacity group-hover:opacity-100",
                            resizeDuur?.id === item.id ? "opacity-100" : "opacity-0"
                          )}
                        />
                      </span>
                    </div>
                  );
                })}

                {/* Waar het kaartje landt als je nu loslaat. */}
                {dragOverIso === iso && dropMinuut !== null && (
                  <div
                    className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-dashed border-accent-500"
                    style={{ top: topVoorMinuut(dropMinuut) }}
                  >
                    <span className="absolute -top-2.5 right-1 rounded bg-accent-600 px-1 py-px text-[10px] font-semibold text-white tabular-nums">
                      {minutenNaarTijd(dropMinuut)}
                    </span>
                  </div>
                )}

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

      {/* Dag-kiezer: springt naar een dag verderop in de lijst hieronder -
          de dag van vandaag springt eruit, net als in een gewone planner-app. */}
      <div className={clsx("-mx-1 flex gap-2 overflow-x-auto px-1 pb-1", weergave === "rooster" && "md:hidden")}>
        {lijstDagen.map((dag) => {
          const iso = naarIsoDatum(dag);
          const isVandaag = iso === vandaagIso;
          return (
            <button
              key={iso}
              onClick={() =>
                document.querySelector(`[data-dag-iso="${iso}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" })
              }
              className={clsx(
                "flex shrink-0 flex-col items-center gap-0.5 rounded-2xl px-3.5 py-2 transition-colors",
                isVandaag
                  ? "bg-violet-600 text-white shadow-sm"
                  : "bg-white text-slate-500 ring-1 ring-slate-900/5 hover:bg-violet-50 hover:text-violet-700"
              )}
            >
              <span className="text-[11px] font-semibold uppercase tracking-wide opacity-80">
                {dag.toLocaleDateString("nl-NL", { weekday: "short" })}
              </span>
              <span className="font-heading text-lg font-bold leading-none">{dag.getDate()}</span>
            </button>
          );
        })}
      </div>

      {/* Lijstweergave: dagen onder elkaar - altijd op mobiel, en op elk formaat als 'Lijst' gekozen is */}
      <div className={clsx("flex flex-col gap-4", weergave === "rooster" && "md:hidden")}>
        {lijstDagen.map((dag) => {
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

          // Een vak dat die dag meerdere keren in het rooster staat (bv. 2
          // lesuren) toont zijn huiswerk/toets bij het lesuur waarop het
          // daadwerkelijk is aangemaakt (rooster_start_tijd). Alleen items
          // zonder die koppeling (bv. via Planningshulp aangemaakt) vallen
          // terug op "eerste lesuur claimt 'm" - anders lijkt het net of
          // dezelfde toets 2x apart gepland staat. Items die hier als
          // deadline getoond worden, verdwijnen verderop uit de losse
          // takenlijst (dat zou dubbelop zijn).
          const geclaimdeVakIds = new Set<string>();
          const roosterBlokkenMetDeadline = roosterBlokken.map((b) => {
            const klikbaar = !b.isFietsen && Boolean(b.subjectId);
            const blokTijd = b.tijd.split("-")[0];
            let deadlines: PlanningItem[] = [];
            if (klikbaar) {
              const vakItems = dagItems.filter(
                (it) => it.subject_id === b.subjectId && (it.type === "huiswerk" || it.type === "toets")
              );
              const exact = vakItems.filter((it) => it.rooster_start_tijd?.slice(0, 5) === blokTijd);
              if (exact.length > 0) {
                deadlines = exact;
              } else {
                const algeclaimd = b.subjectId ? geclaimdeVakIds.has(b.subjectId) : false;
                const zonderLesuur = vakItems.filter((it) => !it.rooster_start_tijd);
                deadlines = !algeclaimd ? zonderLesuur : [];
                if (deadlines.length > 0 && b.subjectId) geclaimdeVakIds.add(b.subjectId);
              }
            }
            return { b, klikbaar, deadlines, blokTijd };
          });
          const voorRoosterGetoondeIds = new Set(
            roosterBlokkenMetDeadline.flatMap(({ deadlines }) => deadlines.map((d) => d.id))
          );

          return (
            <div
              key={iso}
              data-dag-iso={iso}
              className={clsx(
                "scroll-mt-4 rounded-3xl p-2 transition-colors",
                eventMeta?.dayTintClass,
                lijstDoelIso === iso && "bg-accent-50 ring-2 ring-accent-400"
              )}
            >
              <div className="mb-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <p className="font-heading text-lg font-bold capitalize text-slate-900">{formatDatumLabel(iso)}</p>
                {eventMeta && jaarEvent && (
                  <span className={clsx("rounded px-1.5 py-0.5 text-[10px] font-medium", eventMeta.dayLabelClass)}>
                    {jaarEvent.titel}
                  </span>
                )}
                {(() => {
                  const cap = capaciteitPerDag.get(iso);
                  if (!cap) return null;
                  return <CapaciteitRing percentage={cap.percentage} tekst={capaciteitTekst(cap)} toonKleur={cap.niveau} />;
                })()}
              </div>

              {(() => {
                if (roosterBlokkenMetDeadline.length === 0) return null;
                return (
                  <div className="mb-3 flex flex-col gap-1 rounded-3xl bg-white/70 p-2 ring-1 ring-slate-900/5">
                    {roosterBlokkenMetDeadline.map(({ b, klikbaar, deadlines, blokTijd }, i) => {
                      const heeftToets = deadlines.some((d) => d.type === "toets");
                      const heeftDeadline = deadlines.length > 0;
                      const alleKlaar = heeftDeadline && deadlines.every((d) => d.status === "klaar");
                      const heeftAandacht = deadlines.some((d) => aandachtItemIds.has(d.id));
                      const vakSubject = b.subjectId ? subjects.find((s) => s.id === b.subjectId) : null;
                      const kleur = vakKleur(b.subjectId);
                      return (
                        <div
                          key={i}
                          onClick={
                            klikbaar
                              ? () => setDeadlineVak({ subjectId: b.subjectId!, titel: b.titel, datum: iso, lesuurTijd: blokTijd })
                              : undefined
                          }
                          className={clsx(
                            "flex items-center gap-2.5 rounded-2xl px-1.5 py-1.5 text-sm transition-colors",
                            klikbaar && "cursor-pointer hover:bg-violet-50/70",
                            heeftDeadline &&
                              (alleKlaar
                                ? "bg-emerald-50 ring-1 ring-inset ring-emerald-200"
                                : heeftToets
                                  ? "bg-toets-50 ring-1 ring-inset ring-toets-200"
                                  : "bg-huiswerk-50 ring-1 ring-inset ring-huiswerk-200"),
                            heeftAandacht && "ring-2 ring-inset ring-rose-400"
                          )}
                        >
                          <span
                            className={clsx(
                              "relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                              b.isFietsen
                                ? "bg-slate-100 text-slate-400"
                                : !heeftDeadline
                                  ? [kleur.bg, kleur.text]
                                  : alleKlaar
                                    ? "bg-emerald-500 text-white"
                                    : heeftToets
                                      ? "bg-toets-500 text-white"
                                      : "bg-huiswerk-500 text-white"
                            )}
                          >
                            {heeftAandacht && (
                              <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-600 text-white ring-2 ring-white">
                                <Icon name="alert-triangle" size={10} />
                              </span>
                            )}
                            {heeftDeadline && !alleKlaar ? (
                              <span className="text-[9px] font-extrabold tracking-tight">{heeftToets ? "TOETS" : "HW"}</span>
                            ) : (
                              <Icon
                                name={
                                  b.isFietsen
                                    ? "bike"
                                    : !heeftDeadline
                                      ? (vakSubject?.icon ?? "school")
                                      : "check"
                                }
                                size={17}
                              />
                            )}
                          </span>
                          <span className="min-w-0 flex-1 truncate">
                            <span className="font-semibold tabular-nums text-slate-400">{b.tijd}</span>{" "}
                            <span className={b.isFietsen ? "text-slate-400" : "font-medium text-slate-800"}>{b.titel}</span>
                          </span>
                          {b.bron === "gewijzigd" && <Icon name="pencil-line" size={13} className="shrink-0 text-amber-500" />}
                          {!heeftDeadline && klikbaar && <Icon name="plus" size={15} className="shrink-0 text-violet-400" />}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              {dagItems.filter((it) => !voorRoosterGetoondeIds.has(it.id)).length === 0 ? (
                <Card className="py-3">
                  <p className="text-base text-slate-400">Niets gepland.</p>
                </Card>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {dagItems
                    .filter((it) => !voorRoosterGetoondeIds.has(it.id))
                    .map((item) => {
                    const meta = PLANNING_TYPE_META[item.type];
                    const isVoorstel = item.status === "voorstel";
                    const isKlaar = item.status === "klaar";
                    return (
                      <Card
                        key={item.id}
                        onClick={() => openDetail(item)}
                        className={clsx(
                          "flex cursor-pointer items-center gap-3 py-3.5 transition-colors hover:border-accent-200",
                          isKlaar
                            ? "border-emerald-200 bg-emerald-50/60"
                            : isVoorstel && "border-dashed"
                        )}
                      >
                        {!isVoorstel && (
                          <span
                            onPointerDown={(e) => startLijstSlepen(e, item)}
                            onPointerMove={lijstSlepen}
                            onPointerUp={eindigLijstSlepen}
                            onPointerCancel={eindigLijstSlepen}
                            onClick={(e) => e.stopPropagation()}
                            title="Sleep naar een andere dag"
                            aria-label="Sleep naar een andere dag"
                            className={clsx(
                              "-ml-1 flex shrink-0 cursor-grab touch-none items-center self-stretch px-1 text-slate-300 hover:text-slate-500 active:cursor-grabbing",
                              lijstSleep?.id === item.id && "text-accent-500"
                            )}
                          >
                            <Icon name="grip" size={18} />
                          </span>
                        )}

                        <span
                          className={clsx(
                            "relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border",
                            isKlaar ? "border-emerald-200 bg-emerald-100 text-emerald-600" : meta.badgeClass
                          )}
                        >
                          {!isKlaar && aandachtItemIds.has(item.id) && (
                            <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-600 text-white ring-2 ring-white">
                              <Icon name="alert-triangle" size={10} />
                            </span>
                          )}
                          <Icon name={isKlaar ? "check" : meta.icon} size={18} />
                        </span>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <p
                              className={clsx(
                                "text-base font-medium text-slate-800",
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
                          <p className="truncate text-sm text-slate-500">
                            {[meta.label, !subjectCode(item.subject_id) ? subjectNaam(item.subject_id) : null]
                              .filter(Boolean)
                              .join(" - ")}
                            {item.estimated_minutes && ` - ~${formatMinuten(item.estimated_minutes)}`}
                            {isVoorstel && " - voorstel, nog niet bevestigd"}
                          </p>
                          {item.type === "toets" &&
                            (() => {
                              const voortgang = leermomentVoortgang.get(item.id);
                              return (
                                <p className="truncate text-xs font-medium text-toets-700">
                                  {toetsAftelling(item.due_date)}
                                  {voortgang && (
                                    <span className="font-normal text-slate-500">
                                      {" "}
                                      - {voortgang.klaar} van {voortgang.totaal} leermomenten af
                                    </span>
                                  )}
                                </p>
                              );
                            })()}
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

      {/* Onder de agenda, niet erboven - zo staat de agenda zelf zoveel
          mogelijk meteen in beeld. */}
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

      {/* Wat je vasthoudt tijdens het slepen in de lijstweergave. */}
      {lijstSleep &&
        (() => {
          const item = items.find((i) => i.id === lijstSleep.id);
          if (!item) return null;
          return (
            <div
              className="pointer-events-none fixed z-50 flex max-w-[60vw] items-center gap-1.5 rounded-xl border border-accent-300 bg-white px-2.5 py-1.5 shadow-lg"
              style={{ left: lijstSleep.x + 12, top: lijstSleep.y - 16 }}
            >
              <span className={clsx("h-4 w-1 shrink-0 rounded-full", KAART_STIJL[item.type].rail)} />
              <span className="truncate text-xs font-semibold text-slate-700">{item.title}</span>
            </div>
          );
        })()}

      {deadlineVak && (
        <RoosterVakDeadlineModal
          open
          onClose={() => setDeadlineVak(null)}
          titel={deadlineVak.titel}
          subjectId={deadlineVak.subjectId}
          datum={deadlineVak.datum}
          lesuurTijd={deadlineVak.lesuurTijd}
          bestaandeDeadlines={items.filter(
            (it) =>
              it.subject_id === deadlineVak.subjectId &&
              it.due_date === deadlineVak.datum &&
              (it.type === "huiswerk" || it.type === "toets")
          )}
          items={items}
          subjects={subjects}
        />
      )}

      {planningshulp && (
        <Modal open onClose={() => setPlanningshulp(null)} title="Planningshulp" maxWidthClass="max-w-xl">
          <PlanningHulpChat items={items} subjects={subjects} openingsbericht={planningshulp.openingsbericht} />
        </Modal>
      )}
    </div>
  );
}
