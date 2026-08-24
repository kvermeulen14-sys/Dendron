"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Modal } from "@/components/ui/modal";
import { Icon } from "@/components/icon";
import { PlanningHulpChat } from "@/components/planning-hulp-chat";
import { maakPlanningItem, updatePlanningStatus, verwijderPlanningItem } from "@/lib/actions/planning";
import type { PlanningItem } from "@/lib/types";

function datumLabel(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long" });
}

/**
 * Klik-op-een-vak-in-het-rooster-flow: dit lesuur ZELF is de deadline - geen
 * losse datum/tijd-keuze, dat zou hetzelfde nog een keer laten kiezen. Laat
 * zien welk huiswerk/welke toets voor dit vak op deze dag al gepland staat,
 * en/of voegt er 1 toe (huiswerk of toets). Maakt gewoon een los
 * planning_item aan met due_date = deze dag - het rooster zelf (rooster_items)
 * blijft altijd ongewijzigd.
 */
export function RoosterVakDeadlineModal({
  open,
  onClose,
  titel,
  subjectId,
  datum,
  bestaandeDeadlines,
  items,
}: {
  open: boolean;
  onClose: () => void;
  titel: string;
  subjectId: string;
  datum: string;
  bestaandeDeadlines: PlanningItem[];
  items: PlanningItem[];
}) {
  const router = useRouter();
  const [type, setType] = useState<"huiswerk" | "toets">("huiswerk");
  const [error, setError] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);
  const [planningshulp, setPlanningshulp] = useState<{ type: "huiswerk" | "toets" } | null>(null);

  function sluit() {
    onClose();
    setError(null);
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
          {bestaandeDeadlines.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Moet af op {datumLabel(datum)}</p>
              {bestaandeDeadlines.map((d) => (
                <div key={d.id} className="flex items-center gap-2.5 rounded-xl border border-slate-200 p-3">
                  <Icon
                    name={d.type === "toets" ? "alert-circle" : "book-open"}
                    size={16}
                    className={clsx("shrink-0", d.type === "toets" ? "text-rose-500" : "text-amber-500")}
                  />
                  <div className="min-w-0 flex-1">
                    <p className={clsx("text-sm font-medium", d.status === "klaar" ? "text-slate-400 line-through" : "text-slate-800")}>
                      {d.title}
                    </p>
                    {d.description && <p className="text-xs text-slate-500">{d.description}</p>}
                  </div>
                  <button
                    onClick={() => zetKlaar(d.id, d.status !== "klaar")}
                    disabled={bezig}
                    className={clsx(
                      "rounded-lg p-1.5",
                      d.status === "klaar" ? "bg-emerald-50 text-emerald-600" : "text-slate-400 hover:bg-slate-100"
                    )}
                    aria-label={d.status === "klaar" ? "Weer openzetten" : "Klaar melden"}
                    title={d.status === "klaar" ? "Weer openzetten" : "Klaar melden"}
                  >
                    <Icon name="check" size={15} />
                  </button>
                  <button
                    onClick={() => verwijder(d.id)}
                    disabled={bezig}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                    aria-label="Verwijderen"
                    title="Verwijderen"
                  >
                    <Icon name="trash" size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}

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

            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
              {bestaandeDeadlines.length > 0 ? "Nog iets toevoegen" : `Moet af op ${datumLabel(datum)}`}
            </p>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setType("huiswerk")}
                className={clsx(
                  "flex-1 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors",
                  type === "huiswerk" ? "border-amber-400 bg-amber-50 text-amber-800" : "border-slate-200 text-slate-500 hover:bg-slate-50"
                )}
              >
                Huiswerk
              </button>
              <button
                type="button"
                onClick={() => setType("toets")}
                className={clsx(
                  "flex-1 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors",
                  type === "toets" ? "border-rose-400 bg-rose-50 text-rose-800" : "border-slate-200 text-slate-500 hover:bg-slate-50"
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
              <Button type="button" variant="secondary" onClick={sluit}>
                Sluiten
              </Button>
            </div>
          </form>
        </div>
      </Modal>

      {planningshulp && (
        <Modal open onClose={() => setPlanningshulp(null)} title="Planningshulp" maxWidthClass="max-w-xl">
          <PlanningHulpChat
            items={items}
            openingsbericht={`Ik heb net ${planningshulp.type === "toets" ? "een toets" : "huiswerk"} voor ${titel} toegevoegd, moet af zijn op ${datumLabel(datum)}. Kun je me helpen bedenken wanneer ik hier het beste aan kan werken?`}
          />
        </Modal>
      )}
    </>
  );
}
