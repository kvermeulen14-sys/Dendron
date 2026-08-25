"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Modal } from "@/components/ui/modal";
import { Icon } from "@/components/icon";
import { PlanningHulpChat } from "@/components/planning-hulp-chat";
import { bewerkPlanningItem, maakPlanningItem, updatePlanningStatus, verwijderPlanningItem } from "@/lib/actions/planning";
import type { PlanningItem, Subject } from "@/lib/types";

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
  bestaandeDeadlines,
  items,
  subjects,
}: {
  open: boolean;
  onClose: () => void;
  titel: string;
  subjectId: string;
  datum: string;
  /** Starttijd van het aangeklikte lesuur - puur om deze deadline aan dat specifieke lesuur te koppelen. */
  lesuurTijd: string;
  bestaandeDeadlines: PlanningItem[];
  items: PlanningItem[];
  subjects: Subject[];
}) {
  const router = useRouter();
  const [type, setType] = useState<"huiswerk" | "toets">("huiswerk");
  const [toevoegenOpen, setToevoegenOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);
  const [planningshulp, setPlanningshulp] = useState<{ type: "huiswerk" | "toets" } | null>(null);
  const [bewerkId, setBewerkId] = useState<string | null>(null);

  function sluit() {
    onClose();
    setError(null);
    setBewerkId(null);
    setToevoegenOpen(false);
  }

  function openToevoegen(t: "huiswerk" | "toets") {
    setType(t);
    setToevoegenOpen(true);
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

          {bestaandeDeadlines.length === 0 && !toevoegenOpen && (
            <p className="text-sm text-slate-400">Nog niks gepland voor dit vak op deze dag.</p>
          )}

          {bestaandeDeadlines.length > 0 && (
            <div className="flex flex-col gap-2">
              {bestaandeDeadlines.map((d) => {
                const isToets = d.type === "toets";
                const isKlaar = d.status === "klaar";
                const watMoetJeDoen = d.description || d.title;
                return bewerkId === d.id ? (
                  <form
                    key={d.id}
                    action={async (formData) => {
                      setError(null);
                      setBezig(true);
                      const res = await bewerkPlanningItem(d.id, formData);
                      setBezig(false);
                      if (res?.error) {
                        setError(res.error);
                        return;
                      }
                      setBewerkId(null);
                      router.refresh();
                    }}
                    className="flex flex-col gap-2.5 rounded-2xl border border-slate-200 p-3"
                  >
                    <input type="hidden" name="title" value={d.title} />
                    <input type="hidden" name="dueDate" value={d.due_date} />
                    <input type="hidden" name="subjectId" value={d.subject_id ?? ""} />
                    {d.start_time && <input type="hidden" name="startTime" value={d.start_time} />}
                    <p className={clsx("text-xs font-semibold uppercase tracking-wide", isToets ? "text-toets-700" : "text-huiswerk-700")}>
                      {isToets ? "Toets" : "Huiswerk"}
                    </p>
                    <textarea
                      name="description"
                      defaultValue={d.description ?? ""}
                      rows={2}
                      autoFocus
                      placeholder={isToets ? "Waar gaat de toets over?" : "Wat moet je doen?"}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100"
                    />
                    <input
                      type="number"
                      name="estimatedMinutes"
                      min={0}
                      defaultValue={d.estimated_minutes ?? ""}
                      placeholder="Geschatte tijd in minuten"
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100"
                    />
                    <div className="flex gap-2">
                      <SubmitButton>Opslaan</SubmitButton>
                      <Button type="button" size="md" variant="secondary" onClick={() => setBewerkId(null)}>
                        Annuleren
                      </Button>
                    </div>
                  </form>
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

                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant={isKlaar ? "secondary" : "primary"}
                        disabled={bezig}
                        onClick={() => zetKlaar(d.id, !isKlaar)}
                        icon={<Icon name="check" size={14} />}
                      >
                        {isKlaar ? "Heropenen" : "Klaar"}
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={bezig}
                        onClick={() => setBewerkId(d.id)}
                        icon={<Icon name="pencil-line" size={14} />}
                      >
                        Bewerken
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={bezig}
                        onClick={() => verwijder(d.id)}
                        icon={<Icon name="trash" size={14} />}
                      >
                        Verwijderen
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {toevoegenOpen ? (
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
                setPlanningshulp({ type });
              }}
              className={clsx("flex flex-col gap-3", bestaandeDeadlines.length > 0 && "border-t border-slate-100 pt-4")}
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

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Hoeveel tijd denk je nodig te hebben?</label>
                <input
                  type="number"
                  name="estimatedMinutes"
                  min={0}
                  placeholder="in minuten, bijv. 30"
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100"
                />
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
            <div className={clsx("flex gap-2", bestaandeDeadlines.length > 0 && "border-t border-slate-100 pt-3")}>
              <button
                type="button"
                onClick={() => openToevoegen("huiswerk")}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-full border border-huiswerk-200 bg-huiswerk-50 px-3 py-2 text-xs font-semibold text-huiswerk-700 transition-colors hover:bg-huiswerk-100"
              >
                <Icon name="plus" size={13} />
                Huiswerk toevoegen
              </button>
              <button
                type="button"
                onClick={() => openToevoegen("toets")}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-full border border-toets-200 bg-toets-50 px-3 py-2 text-xs font-semibold text-toets-700 transition-colors hover:bg-toets-100"
              >
                <Icon name="plus" size={13} />
                Toets toevoegen
              </button>
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
