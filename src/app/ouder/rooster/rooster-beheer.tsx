"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { Icon } from "@/components/icon";
import {
  maakRoosterPeriode,
  verwijderRoosterPeriode,
  maakRoosterItem,
  bewerkRoosterItem,
  verwijderRoosterItem,
} from "@/lib/actions/rooster";
import type { RoosterItem, RoosterPeriode, Subject } from "@/lib/types";
import { SomTodayUploader } from "./somtoday-uploader";

const DAGEN = [
  { value: 1, label: "Maandag" },
  { value: 2, label: "Dinsdag" },
  { value: 3, label: "Woensdag" },
  { value: 4, label: "Donderdag" },
  { value: 5, label: "Vrijdag" },
  { value: 6, label: "Zaterdag" },
  { value: 7, label: "Zondag" },
];

function formatDatum(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" });
}

export function RoosterBeheer({
  periodes,
  subjects,
  roosterItems,
}: {
  periodes: RoosterPeriode[];
  subjects: Subject[];
  roosterItems: RoosterItem[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [periodeFormOpen, setPeriodeFormOpen] = useState(false);
  const [periodeError, setPeriodeError] = useState<string | null>(null);
  const [selectedPeriodeId, setSelectedPeriodeId] = useState<string | null>(periodes[0]?.id ?? null);
  const [itemFormOpen, setItemFormOpen] = useState(false);
  const [bewerkId, setBewerkId] = useState<string | null>(null);
  const [itemError, setItemError] = useState<string | null>(null);

  const itemsVoorPeriode = useMemo(
    () => roosterItems.filter((i) => i.periode_id === selectedPeriodeId).sort((a, b) => a.start_tijd.localeCompare(b.start_tijd)),
    [roosterItems, selectedPeriodeId]
  );

  const bewerkItem = bewerkId ? itemsVoorPeriode.find((i) => i.id === bewerkId) ?? null : null;
  const itemModalOpen = itemFormOpen || bewerkItem !== null;

  function subjectNaam(id: string | null) {
    return subjects.find((s) => s.id === id)?.name ?? null;
  }

  function verwijderPeriode(id: string) {
    startTransition(async () => {
      await verwijderRoosterPeriode(id);
      if (selectedPeriodeId === id) setSelectedPeriodeId(null);
      router.refresh();
    });
  }

  function verwijderItem(id: string) {
    startTransition(async () => {
      await verwijderRoosterItem(id);
      router.refresh();
    });
  }

  function sluitItemModal() {
    setItemFormOpen(false);
    setBewerkId(null);
    setItemError(null);
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Periodes */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Periodes</h2>
          <Button size="md" icon={<Icon name="plus" size={16} />} onClick={() => setPeriodeFormOpen(true)}>
            Nieuwe periode
          </Button>
        </div>

        <Modal open={periodeFormOpen} onClose={() => setPeriodeFormOpen(false)} title="Nieuwe periode">
          <form
            action={async (formData) => {
              setPeriodeError(null);
              const res = await maakRoosterPeriode(formData);
              if (res?.error) {
                setPeriodeError(res.error);
                return;
              }
              setPeriodeFormOpen(false);
              router.refresh();
            }}
            className="flex flex-col gap-4"
          >
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Naam</label>
              <input
                name="naam"
                required
                placeholder="bijv. Periode 1"
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Vanaf</label>
                <input
                  type="date"
                  name="startDatum"
                  required
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Tot en met</label>
                <input
                  type="date"
                  name="eindDatum"
                  required
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </div>
            </div>
            {periodeError && <p className="text-sm text-rose-600">{periodeError}</p>}
            <div className="flex gap-2">
              <Button type="submit">Opslaan</Button>
              <Button type="button" variant="secondary" onClick={() => setPeriodeFormOpen(false)}>
                Annuleren
              </Button>
            </div>
          </form>
        </Modal>

        {periodes.length === 0 ? (
          <Card>
            <p className="text-sm text-slate-500">
              Nog geen periode aangemaakt. Maak eerst een periode (bijv. &quot;Periode 1&quot;
              met een start- en einddatum), daarna kun je daar lesuren aan toevoegen.
            </p>
          </Card>
        ) : (
          <div className="flex flex-wrap gap-2">
            {periodes.map((p) => (
              <div key={p.id} className="flex items-center gap-1">
                <button
                  onClick={() => setSelectedPeriodeId(p.id)}
                  className={clsx(
                    "rounded-xl border px-3.5 py-2.5 text-sm font-medium transition-colors",
                    selectedPeriodeId === p.id
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  )}
                >
                  {p.naam}
                  <span className={clsx("ml-2 text-xs", selectedPeriodeId === p.id ? "text-slate-300" : "text-slate-400")}>
                    {formatDatum(p.start_datum)} - {formatDatum(p.eind_datum)}
                  </span>
                </button>
                <button
                  disabled={pending}
                  onClick={() => verwijderPeriode(p.id)}
                  className="rounded-xl p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                  aria-label="Periode verwijderen"
                >
                  <Icon name="trash" size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Lesuren binnen de gekozen periode */}
      {selectedPeriodeId && (
        <div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-slate-900">Lesuren</h2>
            <div className="flex flex-wrap gap-2">
              <SomTodayUploader periodes={periodes} />
              <Button
                size="md"
                icon={<Icon name="plus" size={16} />}
                onClick={() => {
                  setBewerkId(null);
                  setItemFormOpen(true);
                }}
              >
                Lesuur toevoegen
              </Button>
            </div>
          </div>

          <Modal open={itemModalOpen} onClose={sluitItemModal} title={bewerkItem ? "Lesuur bewerken" : "Lesuur toevoegen"}>
            <form
              action={async (formData) => {
                setItemError(null);
                const res = bewerkItem
                  ? await bewerkRoosterItem(bewerkItem.id, formData)
                  : await maakRoosterItem(formData);
                if (res?.error) {
                  setItemError(res.error);
                  return;
                }
                sluitItemModal();
                router.refresh();
              }}
              className="flex flex-col gap-4"
            >
              <input type="hidden" name="periodeId" value={selectedPeriodeId} />
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Vak</label>
                <select
                  name="subjectId"
                  defaultValue={bewerkItem?.subject_id ?? ""}
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
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Titel op rooster</label>
                <input
                  name="titel"
                  required
                  defaultValue={bewerkItem?.titel ?? ""}
                  placeholder="bijv. Wiskunde"
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Dag</label>
                <select
                  name="dagVanWeek"
                  required
                  defaultValue={bewerkItem?.dag_van_week ?? ""}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                >
                  <option value="" disabled>
                    Kies een dag
                  </option>
                  {DAGEN.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">Begintijd</label>
                  <input
                    type="time"
                    name="startTijd"
                    required
                    defaultValue={bewerkItem?.start_tijd?.slice(0, 5) ?? ""}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">Eindtijd</label>
                  <input
                    type="time"
                    name="eindTijd"
                    required
                    defaultValue={bewerkItem?.eind_tijd?.slice(0, 5) ?? ""}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  />
                </div>
              </div>

              {itemError && <p className="text-sm text-rose-600">{itemError}</p>}

              <div className="flex gap-2">
                <Button type="submit">{bewerkItem ? "Wijzigingen opslaan" : "Toevoegen"}</Button>
                <Button type="button" variant="secondary" onClick={sluitItemModal}>
                  Annuleren
                </Button>
              </div>
            </form>
          </Modal>

          {itemsVoorPeriode.length === 0 ? (
            <Card>
              <p className="text-sm text-slate-500">Nog geen lesuren in deze periode.</p>
            </Card>
          ) : (
            <div className="flex flex-col gap-4">
              {DAGEN.map((dag) => {
                const items = itemsVoorPeriode.filter((i) => i.dag_van_week === dag.value);
                if (items.length === 0) return null;
                return (
                  <div key={dag.value}>
                    <p className="mb-2 text-sm font-medium text-slate-500">{dag.label}</p>
                    <div className="flex flex-col gap-2">
                      {items.map((item) => (
                        <Card key={item.id} className="flex items-center gap-3 py-3">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                            <Icon name="school" size={16} />
                          </span>
                          <div className="flex-1">
                            <p className="text-sm font-medium text-slate-800">
                              {item.titel}
                              {subjectNaam(item.subject_id) && subjectNaam(item.subject_id) !== item.titel && (
                                <span className="ml-1.5 text-xs font-normal text-slate-400">
                                  ({subjectNaam(item.subject_id)})
                                </span>
                              )}
                            </p>
                            <p className="text-xs text-slate-500">
                              {item.start_tijd.slice(0, 5)} - {item.eind_tijd.slice(0, 5)}
                            </p>
                          </div>
                          <button
                            onClick={() => {
                              setBewerkId(item.id);
                              setItemFormOpen(false);
                            }}
                            className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                            aria-label="Bewerken"
                          >
                            <Icon name="pencil-line" size={16} />
                          </button>
                          <button
                            disabled={pending}
                            onClick={() => verwijderItem(item.id)}
                            className="rounded-xl p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                            aria-label="Verwijderen"
                          >
                            <Icon name="trash" size={16} />
                          </button>
                        </Card>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
