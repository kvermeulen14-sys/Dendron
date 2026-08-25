"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { TijdSelect } from "@/components/ui/tijd-select";
import { Icon } from "@/components/icon";
import {
  maakRoosterPeriode,
  bewerkRoosterPeriode,
  verwijderRoosterPeriode,
  maakRoosterItem,
  bewerkRoosterItem,
  verwijderRoosterItem,
  koppelRoosterItemsAutomatisch,
} from "@/lib/actions/rooster";
import { vindSubjectVoorTitel } from "@/lib/vak-matching";
import { vakAfkorting } from "@/lib/vak-afkorting";
import type { RoosterItem, RoosterPeriode, Subject } from "@/lib/types";
import { SomTodayUploader } from "./somtoday-uploader";
import { HuiswerkKoppelenKnop } from "./huiswerk-koppelen-knop";

const DAGEN = [
  { value: 1, label: "Maandag" },
  { value: 2, label: "Dinsdag" },
  { value: 3, label: "Woensdag" },
  { value: 4, label: "Donderdag" },
  { value: 5, label: "Vrijdag" },
  { value: 6, label: "Zaterdag" },
  { value: 7, label: "Zondag" },
];

// Standaard belschema (lesuren van 50 minuten) - snelkeuze bij het
// toevoegen van een lesuur, zodat begin- en eindtijd niet elke keer
// handmatig ingesteld hoeven te worden.
const LESUUR_DUUR_MINUTEN = 50;
const LESUUR_STARTTIJDEN = [
  "08:15",
  "09:05",
  "10:15",
  "11:05",
  "12:25",
  "13:15",
  "14:05",
  "15:05",
  "15:55",
  "16:45",
];

function optellenTijd(tijd: string, minuten: number) {
  const [h, m] = tijd.split(":").map(Number);
  const totaal = h * 60 + m + minuten;
  const hh = Math.floor(totaal / 60).toString().padStart(2, "0");
  const mm = (totaal % 60).toString().padStart(2, "0");
  return `${hh}:${mm}`;
}

const LESUUR_PRESETS = LESUUR_STARTTIJDEN.map((start, i) => ({
  nummer: i + 1,
  start,
  eind: optellenTijd(start, LESUUR_DUUR_MINUTEN),
}));

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
  const [bewerkPeriodeId, setBewerkPeriodeId] = useState<string | null>(null);
  const [periodeError, setPeriodeError] = useState<string | null>(null);
  const [selectedPeriodeId, setSelectedPeriodeId] = useState<string | null>(periodes[0]?.id ?? null);
  const [itemFormOpen, setItemFormOpen] = useState(false);
  const [bewerkId, setBewerkId] = useState<string | null>(null);
  const [itemError, setItemError] = useState<string | null>(null);
  const [startTijd, setStartTijd] = useState("");
  const [eindTijd, setEindTijd] = useState("");
  const [itemTitel, setItemTitel] = useState("");
  const [itemSubjectId, setItemSubjectId] = useState("");
  const [subjectHandmatigGekozen, setSubjectHandmatigGekozen] = useState(false);
  const [koppelBezig, setKoppelBezig] = useState(false);
  const [koppelResultaat, setKoppelResultaat] = useState<string | null>(null);

  const aantalOngekoppeld = roosterItems.filter((i) => !i.subject_id).length;

  async function koppelAutomatisch() {
    setKoppelBezig(true);
    setKoppelResultaat(null);
    const res = await koppelRoosterItemsAutomatisch();
    setKoppelBezig(false);
    if (res.error) {
      setKoppelResultaat(res.error);
      return;
    }
    setKoppelResultaat(
      res.aantal === 0 ? "Geen lesuren gevonden om te koppelen." : `${res.aantal} lesuren gekoppeld aan het juiste vak.`
    );
    router.refresh();
  }

  const itemsVoorPeriode = useMemo(
    () => roosterItems.filter((i) => i.periode_id === selectedPeriodeId).sort((a, b) => a.start_tijd.localeCompare(b.start_tijd)),
    [roosterItems, selectedPeriodeId]
  );

  const bewerkPeriode = bewerkPeriodeId ? periodes.find((p) => p.id === bewerkPeriodeId) ?? null : null;
  const periodeModalOpen = periodeFormOpen || bewerkPeriode !== null;

  function sluitPeriodeModal() {
    setPeriodeFormOpen(false);
    setBewerkPeriodeId(null);
    setPeriodeError(null);
  }

  const bewerkItem = bewerkId ? itemsVoorPeriode.find((i) => i.id === bewerkId) ?? null : null;
  const itemModalOpen = itemFormOpen || bewerkItem !== null;

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

  function openItemToevoegen() {
    setBewerkId(null);
    setStartTijd("");
    setEindTijd("");
    setItemTitel("");
    setItemSubjectId("");
    setSubjectHandmatigGekozen(false);
    setItemFormOpen(true);
  }

  function openItemBewerken(item: RoosterItem) {
    setBewerkId(item.id);
    setStartTijd(item.start_tijd.slice(0, 5));
    setEindTijd(item.eind_tijd.slice(0, 5));
    setItemTitel(item.titel);
    setItemSubjectId(item.subject_id ?? "");
    // Een al gekoppeld vak nooit stilzwijgend overschrijven terwijl de titel
    // hier verder aangepast wordt - alleen bij een nog ongekoppeld lesuur
    // blijft live meesuggereren zinvol.
    setSubjectHandmatigGekozen(item.subject_id !== null);
    setItemFormOpen(false);
  }

  function titelGewijzigd(waarde: string) {
    setItemTitel(waarde);
    if (!subjectHandmatigGekozen) {
      setItemSubjectId(vindSubjectVoorTitel(waarde, subjects) ?? "");
    }
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

        <Modal open={periodeModalOpen} onClose={sluitPeriodeModal} title={bewerkPeriode ? "Periode bewerken" : "Nieuwe periode"}>
          <form
            action={async (formData) => {
              setPeriodeError(null);
              const res = bewerkPeriode
                ? await bewerkRoosterPeriode(bewerkPeriode.id, formData)
                : await maakRoosterPeriode(formData);
              if (res?.error) {
                setPeriodeError(res.error);
                return;
              }
              sluitPeriodeModal();
              router.refresh();
            }}
            className="flex flex-col gap-4"
          >
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Naam</label>
              <input
                name="naam"
                required
                defaultValue={bewerkPeriode?.naam ?? ""}
                placeholder="bijv. Periode 1"
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Vanaf</label>
                <input
                  type="date"
                  name="startDatum"
                  required
                  defaultValue={bewerkPeriode?.start_datum ?? ""}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Tot en met</label>
                <input
                  type="date"
                  name="eindDatum"
                  required
                  defaultValue={bewerkPeriode?.eind_datum ?? ""}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100"
                />
              </div>
            </div>
            {periodeError && <p className="text-sm text-rose-600">{periodeError}</p>}
            <div className="flex gap-2">
              <SubmitButton pendingText="Bezig...">{bewerkPeriode ? "Wijzigingen opslaan" : "Opslaan"}</SubmitButton>
              <Button type="button" variant="secondary" onClick={sluitPeriodeModal}>
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
                  onClick={() => setBewerkPeriodeId(p.id)}
                  className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  aria-label="Periode bewerken"
                >
                  <Icon name="pencil-line" size={14} />
                </button>
                <button
                  disabled={pending}
                  onClick={() => verwijderPeriode(p.id)}
                  className="rounded-xl p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                  aria-label="Periode verwijderen"
                >
                  <Icon name={pending ? "loader" : "trash"} size={14} className={pending ? "animate-spin" : undefined} />
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
              {aantalOngekoppeld > 0 && (
                <Button size="md" variant="secondary" loading={koppelBezig} onClick={koppelAutomatisch} icon={<Icon name="sparkles" size={16} />}>
                  Automatisch koppelen ({aantalOngekoppeld})
                </Button>
              )}
              <SomTodayUploader periodes={periodes} subjects={subjects} />
              <Button size="md" icon={<Icon name="plus" size={16} />} onClick={openItemToevoegen}>
                Lesuur toevoegen
              </Button>
            </div>
          </div>
          {koppelResultaat && <p className="mb-3 text-xs text-slate-500">{koppelResultaat}</p>}

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
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Titel op rooster</label>
                <input
                  name="titel"
                  required
                  value={itemTitel}
                  onChange={(e) => titelGewijzigd(e.target.value)}
                  placeholder="bijv. Wiskunde"
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Vak</label>
                <select
                  name="subjectId"
                  value={itemSubjectId}
                  onChange={(e) => {
                    setSubjectHandmatigGekozen(true);
                    setItemSubjectId(e.target.value);
                  }}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100"
                >
                  <option value="">Geen specifiek vak</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code ? `${s.code} - ${s.name}` : s.name}
                    </option>
                  ))}
                </select>
                {itemSubjectId && !subjectHandmatigGekozen && (
                  <p className="mt-1 text-xs text-slate-400">Automatisch herkend op basis van de titel.</p>
                )}
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Dag</label>
                <select
                  name="dagVanWeek"
                  required
                  defaultValue={bewerkItem?.dag_van_week ?? ""}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100"
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
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Snelkeuze lesuur (optioneel)
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {LESUUR_PRESETS.map((l) => (
                    <button
                      type="button"
                      key={l.nummer}
                      onClick={() => {
                        setStartTijd(l.start);
                        setEindTijd(l.eind);
                      }}
                      className={clsx(
                        "rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors",
                        startTijd === l.start && eindTijd === l.eind
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-200 text-slate-600 hover:bg-slate-50"
                      )}
                    >
                      {l.nummer}e {l.start}
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 text-xs text-slate-500">
                  Vult begin- en eindtijd automatisch in (lesuur van {LESUUR_DUUR_MINUTEN} minuten) - hierna
                  nog aan te passen.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">Begintijd</label>
                  <TijdSelect
                    name="startTijd"
                    required
                    placeholder="Kies een tijd"
                    value={startTijd}
                    onChange={(e) => setStartTijd(e.target.value)}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">Eindtijd</label>
                  <TijdSelect
                    name="eindTijd"
                    required
                    placeholder="Kies een tijd"
                    value={eindTijd}
                    onChange={(e) => setEindTijd(e.target.value)}
                  />
                </div>
              </div>

              {itemError && <p className="text-sm text-rose-600">{itemError}</p>}

              <div className="flex gap-2">
                <SubmitButton pendingText="Bezig...">{bewerkItem ? "Wijzigingen opslaan" : "Toevoegen"}</SubmitButton>
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
                      {items.map((item) => {
                        const vak = subjects.find((s) => s.id === item.subject_id) ?? null;
                        return (
                        <Card key={item.id} className="flex items-start gap-3 py-3">
                          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                            <Icon name="school" size={16} />
                          </span>
                          <div className="min-w-0 flex-1">
                            {/* Afkorting i.p.v. de volle vaknaam - blijft compact en netjes
                                uitlijnen ook als de titel zelf al lang is (zie items-start
                                hierboven, dat houdt de knoppen rechts bovenaan vast). */}
                            <p className="text-sm font-medium text-slate-800">
                              {item.titel}
                              {vak && vak.name !== item.titel && (
                                <span className="ml-1.5 inline-block rounded bg-slate-100 px-1.5 py-0.5 align-middle text-[10px] font-bold tracking-wide text-slate-500">
                                  {vakAfkorting(vak)}
                                </span>
                              )}
                            </p>
                            <p className="text-xs text-slate-500">
                              {item.start_tijd.slice(0, 5)} - {item.eind_tijd.slice(0, 5)}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            {item.subject_id && (
                              <HuiswerkKoppelenKnop
                                titel={vak?.name ?? item.titel}
                                subjectId={item.subject_id}
                                dagVanWeek={item.dag_van_week}
                              />
                            )}
                            <button
                              onClick={() => openItemBewerken(item)}
                              className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                              aria-label="Bewerken"
                            >
                              <Icon name="pencil-line" size={16} />
                            </button>
                            <button
                              disabled={pending}
                              onClick={() => verwijderItem(item.id)}
                              className="rounded-xl p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                              aria-label="Verwijderen"
                            >
                              <Icon name={pending ? "loader" : "trash"} size={16} className={pending ? "animate-spin" : undefined} />
                            </button>
                          </div>
                        </Card>
                        );
                      })}
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
