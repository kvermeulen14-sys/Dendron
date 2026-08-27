"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Modal } from "@/components/ui/modal";
import { Icon } from "@/components/icon";
import { DuurKiezer } from "@/components/duur-kiezer";
import { PlanningHulpChat } from "@/components/planning-hulp-chat";
import { bewerkPlanningItem, maakPlanningItem, updatePlanningStatus, verwijderPlanningItem } from "@/lib/actions/planning";
import {
  maakRoosterNotitie,
  maakRoosterUitzonderingSimpel,
  updateRoosterNotitieStatus,
  verwijderRoosterNotitie,
} from "@/lib/actions/rooster";
import type { PlanningItem, RoosterNotitie, Subject, TestType } from "@/lib/types";

function datumLabel(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long" });
}

/**
 * Klik-op-een-vak-in-het-rooster-flow: dit lesuur ZELF is de deadline - geen
 * losse datum/tijd-keuze, dat zou hetzelfde nog een keer laten kiezen. Focus
 * ligt op "wat moet ik doen" (de toelichting, niet de gegenereerde titel) met
 * klaar/bewerk/verwijder er direct bij - toevoegen is bewust klein en
 * uitklapbaar, dat gebeurt veel minder vaak dan even kijken/afvinken.
 */
export function RoosterVakDeadlineModal({
  open,
  onClose,
  titel,
  subjectId,
  datum,
  lesuurTijd,
  lesuurId,
  bestaandeDeadlines,
  bestaandeNotities,
  items,
  subjects,
  testTypes,
}: {
  open: boolean;
  onClose: () => void;
  titel: string;
  subjectId: string;
  datum: string;
  /** Starttijd van het aangeklikte lesuur - puur om deze deadline aan dat specifieke lesuur te koppelen. */
  lesuurTijd: string;
  /** Het onderliggende rooster_items.id - null bij fietsen/extra-blokken (geen echt lesuur, dus geen "valt uit" mogelijk). */
  lesuurId: string | null;
  bestaandeDeadlines: PlanningItem[];
  bestaandeNotities: RoosterNotitie[];
  items: PlanningItem[];
  subjects: Subject[];
  testTypes: TestType[];
}) {
  const router = useRouter();
  const [type, setType] = useState<"huiswerk" | "toets" | "herinnering">("huiswerk");
  const [toevoegenOpen, setToevoegenOpen] = useState(false);
  const [notitieTekst, setNotitieTekst] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);
  const [planningshulp, setPlanningshulp] = useState<{ type: "huiswerk" | "toets" } | null>(null);
  const [bewerkId, setBewerkId] = useState<string | null>(null);
  const [estimatedMinutes, setEstimatedMinutes] = useState<number | null>(null);

  function sluit() {
    onClose();
    setError(null);
    setBewerkId(null);
    setToevoegenOpen(false);
    setNotitieTekst("");
    setEstimatedMinutes(null);
  }

  function openToevoegen(t: "huiswerk" | "toets" | "herinnering") {
    setType(t);
    setToevoegenOpen(true);
    setEstimatedMinutes(null);
  }

  async function voegNotitieToe() {
    const tekstSchoon = notitieTekst.trim();
    if (!tekstSchoon) return;
    setError(null);
    setBezig(true);
    const res = await maakRoosterNotitie(datum, tekstSchoon, subjectId, lesuurId);
    setBezig(false);
    if (res?.error) {
      setError(res.error);
      return;
    }
    setNotitieTekst("");
    setToevoegenOpen(false);
    router.refresh();
  }

  async function zetNotitieKlaar(id: string, klaar: boolean) {
    setBezig(true);
    await updateRoosterNotitieStatus(id, klaar ? "klaar" : "open");
    router.refresh();
    setBezig(false);
  }

  async function verwijderNotitie(id: string) {
    setBezig(true);
    await verwijderRoosterNotitie(id);
    router.refresh();
    setBezig(false);
  }

  async function laatVervallen() {
    if (!lesuurId) return;
    if (!confirm(`Weet je zeker dat ${titel} op ${datumLabel(datum)} vervalt?`)) return;
    setBezig(true);
    const res = await maakRoosterUitzonderingSimpel(lesuurId, datum);
    setBezig(false);
    if (res?.error) {
      setError(res.error);
      return;
    }
    sluit();
    router.refresh();
  }

  async function zetKlaar(id: string, klaar: boolean) {
    setBezig(true);
    await updatePlanningStatus(id, klaar ? "klaar" : "open");
    router.refresh();
    setBezig(false);
  }

  async function verwijder(id: string) {
    if (!confirm("Weet je het zeker? Dit verwijdert de deadline.")) return;
    setBezig(true);
    await verwijderPlanningItem(id);
    router.refresh();
    setBezig(false);
  }

  return (
    <>
      <Modal open={open} onClose={sluit} title={titel}>
        <div className="flex flex-col gap-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{datumLabel(datum)}</p>

          {bestaandeDeadlines.length === 0 && bestaandeNotities.length === 0 && !toevoegenOpen && (
            <p className="text-sm text-slate-400">Nog niks gepland voor dit vak op deze dag.</p>
          )}

          {bestaandeNotities.length > 0 && (
            <div className="flex flex-col gap-1.5">
              {bestaandeNotities.map((n) => {
                const isKlaar = n.status === "klaar";
                return (
                  <div
                    key={n.id}
                    className={clsx(
                      "flex items-center gap-2.5 rounded-xl border px-3 py-2",
                      isKlaar ? "border-emerald-200 bg-emerald-50/60" : "border-accent-200 bg-accent-50/60"
                    )}
                  >
                    <button
                      disabled={bezig}
                      onClick={() => zetNotitieKlaar(n.id, !isKlaar)}
                      aria-label={isKlaar ? "Weer openzetten" : "Afgevinkt"}
                      className={clsx(
                        "flex h-6 w-6 shrink-0 items-center justify-center rounded-md border disabled:opacity-50",
                        isKlaar ? "border-emerald-400 bg-emerald-500 text-white" : "border-accent-300 text-accent-600 hover:bg-white"
                      )}
                    >
                      <Icon name="check" size={13} />
                    </button>
                    <span className={clsx("min-w-0 flex-1 text-sm", isKlaar ? "text-slate-400 line-through" : "text-slate-800")}>
                      {n.tekst}
                    </span>
                    <button
                      disabled={bezig}
                      onClick={() => verwijderNotitie(n.id)}
                      aria-label="Verwijderen"
                      className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-white hover:text-rose-600 disabled:opacity-50"
                    >
                      <Icon name="trash" size={13} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {bestaandeDeadlines.length > 0 && (
            <div className="flex flex-col gap-2">
              {bestaandeDeadlines.map((d) => {
                const isToets = d.type === "toets";
                const isKlaar = d.status === "klaar";
                const watMoetJeDoen = d.description || d.title;
                return bewerkId === d.id ? (
                  <BewerkDeadlineForm
                    key={d.id}
                    item={d}
                    isToets={isToets}
                    onAnnuleren={() => setBewerkId(null)}
                    onOpgeslagen={() => {
                      setBewerkId(null);
                      router.refresh();
                    }}
                  />
                ) : (
                  <div
                    key={d.id}
                    className={clsx(
                      "flex flex-col gap-2.5 rounded-2xl border p-3",
                      isKlaar ? "border-emerald-200 bg-emerald-50/60" : isToets ? "border-toets-200 bg-toets-50/60" : "border-huiswerk-200 bg-huiswerk-50/60"
                    )}
                  >
                    <div className="flex items-start gap-2.5">
                      <span
                        className={clsx(
                          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white",
                          isKlaar ? "bg-emerald-500" : isToets ? "bg-toets-500" : "bg-huiswerk-500"
                        )}
                      >
                        {isKlaar ? (
                          <Icon name="check" size={15} />
                        ) : isToets ? (
                          <Icon name="target" size={15} />
                        ) : (
                          <span className="text-[10px] font-extrabold tracking-tight">HW</span>
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className={clsx("text-[11px] font-semibold uppercase tracking-wide", isKlaar ? "text-emerald-600" : isToets ? "text-toets-700" : "text-huiswerk-700")}>
                          {isToets ? "Toets" : "Huiswerk"}
                          {isKlaar && " - klaar"}
                        </p>
                        <p className={clsx("text-base font-semibold", isKlaar ? "text-slate-400 line-through" : "text-slate-900")}>
                          {watMoetJeDoen}
                        </p>
                      </div>
                    </div>

                    <div className="flex justify-end gap-1">
                      <button
                        disabled={bezig}
                        onClick={() => zetKlaar(d.id, !isKlaar)}
                        aria-label={isKlaar ? "Weer openzetten" : "Klaar melden"}
                        title={isKlaar ? "Weer openzetten" : "Klaar melden"}
                        className={clsx(
                          "rounded-lg p-1.5 disabled:opacity-50",
                          isKlaar ? "bg-emerald-100 text-emerald-700" : "text-slate-400 hover:bg-white hover:text-emerald-600"
                        )}
                      >
                        <Icon name="check" size={15} />
                      </button>
                      <button
                        disabled={bezig}
                        onClick={() => setBewerkId(d.id)}
                        aria-label="Bewerken"
                        title="Bewerken"
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-slate-700 disabled:opacity-50"
                      >
                        <Icon name="pencil-line" size={15} />
                      </button>
                      <button
                        disabled={bezig}
                        onClick={() => verwijder(d.id)}
                        aria-label="Verwijderen"
                        title="Verwijderen"
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-rose-600 disabled:opacity-50"
                      >
                        <Icon name="trash" size={15} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {toevoegenOpen && type === "herinnering" ? (
            <div
              className={clsx(
                "flex flex-col gap-3",
                (bestaandeDeadlines.length > 0 || bestaandeNotities.length > 0) && "border-t border-slate-100 pt-4"
              )}
            >
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Wat moet je niet vergeten?</label>
                <input
                  value={notitieTekst}
                  onChange={(e) => setNotitieTekst(e.target.value)}
                  autoFocus
                  placeholder="bijv. gymkleren meenemen"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      voegNotitieToe();
                    }
                  }}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100"
                />
              </div>

              {error && <p className="text-sm text-rose-600">{error}</p>}

              <div className="flex gap-2">
                <Button type="button" loading={bezig} disabled={!notitieTekst.trim()} onClick={voegNotitieToe}>
                  Toevoegen
                </Button>
                <Button type="button" variant="secondary" onClick={() => setToevoegenOpen(false)}>
                  Annuleren
                </Button>
              </div>
            </div>
          ) : toevoegenOpen ? (
            <form
              action={async (formData) => {
                setError(null);
                const res = await maakPlanningItem(formData);
                if (res?.error) {
                  setError(res.error);
                  return;
                }
                sluit();
                router.refresh();
                setPlanningshulp({ type: type === "herinnering" ? "huiswerk" : type });
              }}
              className={clsx(
                "flex flex-col gap-3",
                (bestaandeDeadlines.length > 0 || bestaandeNotities.length > 0) && "border-t border-slate-100 pt-4"
              )}
            >
              <input type="hidden" name="subjectId" value={subjectId} />
              <input type="hidden" name="dueDate" value={datum} />
              <input type="hidden" name="type" value={type} />
              <input type="hidden" name="title" value={`${type === "toets" ? "Toets" : "Huiswerk"} ${titel}`} />
              <input type="hidden" name="roosterStartTijd" value={lesuurTijd} />

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setType("huiswerk")}
                  className={clsx(
                    "flex-1 rounded-xl border px-3 py-2 text-sm font-medium transition-colors",
                    type === "huiswerk" ? "border-huiswerk-400 bg-huiswerk-50 text-huiswerk-800" : "border-slate-200 text-slate-500 hover:bg-slate-50"
                  )}
                >
                  Huiswerk
                </button>
                <button
                  type="button"
                  onClick={() => setType("toets")}
                  className={clsx(
                    "flex-1 rounded-xl border px-3 py-2 text-sm font-medium transition-colors",
                    type === "toets" ? "border-toets-400 bg-toets-50 text-toets-800" : "border-slate-200 text-slate-500 hover:bg-slate-50"
                  )}
                >
                  Toets
                </button>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  {type === "toets" ? "Waar gaat de toets over? (optioneel)" : "Wat moet je doen? (optioneel)"}
                </label>
                <textarea
                  name="description"
                  rows={2}
                  autoFocus
                  placeholder="bijv. paragraaf 3.2, opgave 5 t/m 10"
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100"
                />
              </div>

              {type === "toets" && testTypes.length > 0 && (
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">Soort toets (voor leertips)</label>
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
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Hoeveel tijd denk je nodig te hebben?</label>
                <DuurKiezer value={estimatedMinutes} onChange={setEstimatedMinutes} />
                <input type="hidden" name="estimatedMinutes" value={estimatedMinutes ?? ""} />
                <p className="mt-1 text-xs text-slate-400">
                  Dit is voor de hele taak samen, niet per keer dat je ermee bezig gaat. Weet je het niet? Sla dit veld
                  gewoon over.
                </p>
              </div>

              {error && <p className="text-sm text-rose-600">{error}</p>}

              <div className="flex gap-2">
                <SubmitButton>Toevoegen</SubmitButton>
                <Button type="button" variant="secondary" onClick={() => setToevoegenOpen(false)}>
                  Annuleren
                </Button>
              </div>
            </form>
          ) : (
            <div
              className={clsx(
                "flex flex-col gap-2",
                (bestaandeDeadlines.length > 0 || bestaandeNotities.length > 0) && "border-t border-slate-100 pt-2.5"
              )}
            >
              <div className="flex justify-center gap-3">
                <button
                  type="button"
                  onClick={() => openToevoegen("huiswerk")}
                  className="flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-600"
                >
                  <Icon name="plus" size={11} />
                  Huiswerk
                </button>
                <button
                  type="button"
                  onClick={() => openToevoegen("toets")}
                  className="flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-600"
                >
                  <Icon name="plus" size={11} />
                  Toets
                </button>
                <button
                  type="button"
                  onClick={() => openToevoegen("herinnering")}
                  className="flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-600"
                >
                  <Icon name="plus" size={11} />
                  Herinnering
                </button>
              </div>
              {lesuurId && (
                <button
                  type="button"
                  disabled={bezig}
                  onClick={laatVervallen}
                  className="self-center text-[11px] font-medium text-slate-400 underline underline-offset-2 hover:text-rose-600 disabled:opacity-50"
                >
                  Deze les valt uit
                </button>
              )}
            </div>
          )}
        </div>
      </Modal>

      {planningshulp && (
        <Modal open onClose={() => setPlanningshulp(null)} title="Planningshulp" maxWidthClass="max-w-xl">
          <PlanningHulpChat
            items={items}
            subjects={subjects}
            openingsbericht={`Ik heb net ${planningshulp.type === "toets" ? "een toets" : "huiswerk"} voor ${titel} toegevoegd, moet af zijn op ${datumLabel(datum)}. Kun je me helpen bedenken wanneer ik hier het beste aan kan werken?`}
          />
        </Modal>
      )}
    </>
  );
}

function BewerkDeadlineForm({
  item,
  isToets,
  onAnnuleren,
  onOpgeslagen,
}: {
  item: PlanningItem;
  isToets: boolean;
  onAnnuleren: () => void;
  onOpgeslagen: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [estimatedMinutes, setEstimatedMinutes] = useState<number | null>(item.estimated_minutes ?? null);

  return (
    <form
      action={async (formData) => {
        setError(null);
        const res = await bewerkPlanningItem(item.id, formData);
        if (res?.error) {
          setError(res.error);
          return;
        }
        onOpgeslagen();
      }}
      className="flex flex-col gap-2.5 rounded-2xl border border-slate-200 p-3"
    >
      <input type="hidden" name="title" value={item.title} />
      <input type="hidden" name="dueDate" value={item.due_date} />
      <input type="hidden" name="subjectId" value={item.subject_id ?? ""} />
      {item.start_time && <input type="hidden" name="startTime" value={item.start_time} />}
      <p className={clsx("text-xs font-semibold uppercase tracking-wide", isToets ? "text-toets-700" : "text-huiswerk-700")}>
        {isToets ? "Toets" : "Huiswerk"}
      </p>
      <textarea
        name="description"
        defaultValue={item.description ?? ""}
        rows={2}
        autoFocus
        placeholder={isToets ? "Waar gaat de toets over?" : "Wat moet je doen?"}
        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100"
      />
      <div>
        <label className="mb-1.5 block text-xs font-medium text-slate-600">Geschatte tijd</label>
        <DuurKiezer value={estimatedMinutes} onChange={setEstimatedMinutes} />
        <input type="hidden" name="estimatedMinutes" value={estimatedMinutes ?? ""} />
      </div>
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <div className="flex gap-2">
        <SubmitButton>Opslaan</SubmitButton>
        <Button type="button" size="md" variant="secondary" onClick={onAnnuleren}>
          Annuleren
        </Button>
      </div>
    </form>
  );
}
