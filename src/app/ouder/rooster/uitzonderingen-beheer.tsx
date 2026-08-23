"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { TijdSelect } from "@/components/ui/tijd-select";
import { Icon } from "@/components/icon";
import {
  maakRoosterUitzondering,
  bewerkRoosterUitzondering,
  verwijderRoosterUitzondering,
} from "@/lib/actions/rooster";
import type { RoosterItem, RoosterUitzondering, UitzonderingType } from "@/lib/types";

const DAGNAMEN = ["", "Maandag", "Dinsdag", "Woensdag", "Donderdag", "Vrijdag", "Zaterdag", "Zondag"];

function isoWeekdag(datum: Date) {
  const jsDag = datum.getDay();
  return jsDag === 0 ? 7 : jsDag;
}

export function UitzonderingenBeheer({
  roosterItems,
  uitzonderingen,
}: {
  roosterItems: RoosterItem[];
  uitzonderingen: RoosterUitzondering[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [bewerkId, setBewerkId] = useState<string | null>(null);
  const [datum, setDatum] = useState("");
  const [type, setType] = useState<UitzonderingType>("vervallen");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const bewerkUitzondering = bewerkId ? uitzonderingen.find((u) => u.id === bewerkId) ?? null : null;
  const modalOpen = open || bewerkUitzondering !== null;

  const lesurenOpDatum = useMemo(() => {
    if (!datum) return [];
    const dag = isoWeekdag(new Date(datum + "T00:00:00"));
    return roosterItems.filter((i) => i.dag_van_week === dag).sort((a, b) => a.start_tijd.localeCompare(b.start_tijd));
  }, [datum, roosterItems]);

  function sluitModal() {
    setOpen(false);
    setBewerkId(null);
    setDatum("");
    setError(null);
  }

  function bewerk(u: RoosterUitzondering) {
    setBewerkId(u.id);
    setDatum(u.datum);
    setType(u.type);
  }

  function verwijder(id: string) {
    startTransition(async () => {
      await verwijderRoosterUitzondering(id);
      router.refresh();
    });
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Uitzonderingen</h2>
          <p className="text-sm text-slate-500">
            Voor als het rooster op een specifieke dag afwijkt (les vervalt, verschuift, of
            er komt iets bij) - zonder het standaardrooster aan te passen.
          </p>
        </div>
        <Button
          size="md"
          icon={<Icon name="plus" size={16} />}
          onClick={() => {
            setBewerkId(null);
            setDatum("");
            setType("vervallen");
            setOpen(true);
          }}
        >
          Uitzondering
        </Button>
      </div>

      <Modal open={modalOpen} onClose={sluitModal} title={bewerkUitzondering ? "Uitzondering bewerken" : "Uitzondering toevoegen"}>
          <form
            action={async (formData) => {
              setError(null);
              const res = bewerkUitzondering
                ? await bewerkRoosterUitzondering(bewerkUitzondering.id, formData)
                : await maakRoosterUitzondering(formData);
              if (res?.error) {
                setError(res.error);
                return;
              }
              sluitModal();
              router.refresh();
            }}
            className="flex flex-col gap-4"
          >
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Datum</label>
              <input
                type="date"
                name="datum"
                required
                value={datum}
                onChange={(e) => setDatum(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100"
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              {(["vervallen", "gewijzigd", "extra"] as UitzonderingType[]).map((t) => (
                <button
                  type="button"
                  key={t}
                  onClick={() => setType(t)}
                  className={
                    "rounded-xl border px-2 py-2.5 text-xs font-medium capitalize transition-colors " +
                    (type === t ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-600 hover:bg-slate-50")
                  }
                >
                  {t}
                </button>
              ))}
            </div>
            <input type="hidden" name="type" value={type} />

            {(type === "vervallen" || type === "gewijzigd") && (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Welk lesuur?</label>
                <select
                  name="origineelItemId"
                  required
                  defaultValue={
                    bewerkUitzondering
                      ? (bewerkUitzondering.origineel_item_id ?? (bewerkUitzondering.type === "vervallen" ? "HELE_DAG" : ""))
                      : ""
                  }
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100"
                >
                  <option value="">
                    {datum ? "Kies een lesuur" : "Kies eerst een datum"}
                  </option>
                  {type === "vervallen" && <option value="HELE_DAG">Hele dag</option>}
                  {lesurenOpDatum.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.titel} ({i.start_tijd.slice(0, 5)}-{i.eind_tijd.slice(0, 5)})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {type !== "vervallen" && (
              <>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    {type === "extra" ? "Titel" : "Nieuwe titel"}
                  </label>
                  <input
                    name="titel"
                    required
                    defaultValue={bewerkUitzondering?.titel ?? ""}
                    placeholder="bijv. Wiskunde (verplaatst)"
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">Begintijd</label>
                    <TijdSelect
                      name="startTijd"
                      required
                      placeholder="Kies een tijd"
                      defaultValue={bewerkUitzondering?.start_tijd?.slice(0, 5) ?? ""}
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">Eindtijd</label>
                    <TijdSelect
                      name="eindTijd"
                      required
                      placeholder="Kies een tijd"
                      defaultValue={bewerkUitzondering?.eind_tijd?.slice(0, 5) ?? ""}
                    />
                  </div>
                </div>
              </>
            )}

            {error && <p className="text-sm text-rose-600">{error}</p>}

            <div className="flex gap-2">
              <SubmitButton pendingText="Bezig...">{bewerkUitzondering ? "Wijzigingen opslaan" : "Opslaan"}</SubmitButton>
              <Button type="button" variant="secondary" onClick={sluitModal}>
                Annuleren
              </Button>
            </div>
          </form>
      </Modal>

      {uitzonderingen.length === 0 ? (
        <p className="text-sm text-slate-400">Geen uitzonderingen.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {uitzonderingen.map((u) => {
            const datumObj = new Date(u.datum + "T00:00:00");
            return (
              <Card key={u.id} className="flex items-center gap-3 py-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-600">
                  <Icon name="alert-circle" size={16} />
                </span>
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-800">
                    {DAGNAMEN[isoWeekdag(datumObj)]} {datumObj.toLocaleDateString("nl-NL", { day: "numeric", month: "short" })} -{" "}
                    {u.type === "vervallen" ? (u.origineel_item_id ? "vervalt" : "hele dag vervalt") : u.titel}
                  </p>
                  {u.type !== "vervallen" && u.start_tijd && (
                    <p className="text-xs text-slate-500">
                      {u.start_tijd.slice(0, 5)} - {u.eind_tijd?.slice(0, 5)}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => bewerk(u)}
                  className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  aria-label="Bewerken"
                >
                  <Icon name="pencil-line" size={16} />
                </button>
                <button
                  disabled={pending}
                  onClick={() => verwijder(u.id)}
                  className="rounded-xl p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                  aria-label="Verwijderen"
                >
                  <Icon name={pending ? "loader" : "trash"} size={16} className={pending ? "animate-spin" : undefined} />
                </button>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
