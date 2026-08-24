"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Modal } from "@/components/ui/modal";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/icon";
import { JAAR_EVENT_META } from "@/lib/jaarkalender";
import { bewerkJaarEvent, maakJaarEvent, verwijderJaarEvent } from "@/lib/actions/jaar-events";
import type { JaarEvent, JaarEventType } from "@/lib/types";

export function JaarkalenderBeheer({ events }: { events: JaarEvent[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [bewerkId, setBewerkId] = useState<string | null>(null);
  const [type, setType] = useState<JaarEventType>("vakantie");
  const [error, setError] = useState<string | null>(null);
  const [verwijderPending, startVerwijderTransition] = useTransition();

  const bewerkEvent = bewerkId ? (events.find((e) => e.id === bewerkId) ?? null) : null;
  const modalOpen = open || bewerkEvent !== null;

  function openNieuw() {
    setBewerkId(null);
    setType("vakantie");
    setOpen(true);
  }

  function openBewerken(event: JaarEvent) {
    setOpen(false);
    setType(event.type);
    setBewerkId(event.id);
  }

  function sluitModal() {
    setOpen(false);
    setBewerkId(null);
    setError(null);
  }

  function verwijder(id: string) {
    startVerwijderTransition(async () => {
      await verwijderJaarEvent(id);
      router.refresh();
    });
  }

  return (
    <>
      <Button icon={<Icon name="plus" size={18} />} onClick={openNieuw}>
        Handmatig toevoegen
      </Button>

      <Modal open={modalOpen} onClose={sluitModal} title={bewerkEvent ? "Periode bewerken" : "Periode toevoegen"}>
        <form
          action={async (formData) => {
            setError(null);
            const res = bewerkEvent ? await bewerkJaarEvent(bewerkEvent.id, formData) : await maakJaarEvent(formData);
            if (res?.error) {
              setError(res.error);
              return;
            }
            sluitModal();
            router.refresh();
          }}
          className="flex flex-col gap-4"
        >
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(JAAR_EVENT_META) as JaarEventType[]).map((t) => (
              <button
                type="button"
                key={t}
                onClick={() => setType(t)}
                className={clsx(
                  "rounded-xl border px-2 py-2.5 text-xs font-medium transition-colors",
                  type === t ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                )}
              >
                {JAAR_EVENT_META[t].label}
              </button>
            ))}
          </div>
          <input type="hidden" name="type" value={type} />

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Titel</label>
            <input
              name="titel"
              required
              defaultValue={bewerkEvent?.titel ?? ""}
              placeholder="bijv. Meivakantie of Toetsweek 1"
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
                defaultValue={bewerkEvent?.start_datum ?? ""}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Tot en met</label>
              <input
                type="date"
                name="eindDatum"
                defaultValue={bewerkEvent?.eind_datum ?? ""}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100"
              />
            </div>
          </div>
          <p className="text-xs text-slate-500">Laat &quot;tot en met&quot; leeg voor een periode van 1 dag.</p>

          {error && <p className="text-sm text-rose-600">{error}</p>}

          <div className="flex gap-2">
            <SubmitButton>{bewerkEvent ? "Wijzigingen opslaan" : "Opslaan"}</SubmitButton>
            <Button type="button" variant="secondary" onClick={sluitModal}>
              Annuleren
            </Button>
          </div>
        </form>
      </Modal>

      {events.length > 0 && (
        <div>
          <h2 className="mb-3 text-base font-semibold text-slate-900">Alles beheren</h2>
          <div className="flex flex-col gap-2">
            {events.map((e) => (
              <Card key={e.id} className="flex items-center gap-3 py-3">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${JAAR_EVENT_META[e.type].dotClass}`} />
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-800">{e.titel}</p>
                  <p className="text-xs text-slate-500">
                    {JAAR_EVENT_META[e.type].label} -{" "}
                    {new Date(e.start_datum + "T00:00:00").toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" })}
                    {e.eind_datum !== e.start_datum &&
                      ` t/m ${new Date(e.eind_datum + "T00:00:00").toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" })}`}
                  </p>
                </div>
                <button
                  onClick={() => openBewerken(e)}
                  className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  aria-label="Bewerken"
                >
                  <Icon name="pencil-line" size={16} />
                </button>
                <button
                  disabled={verwijderPending}
                  onClick={() => verwijder(e.id)}
                  className="rounded-xl p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                  aria-label="Verwijderen"
                >
                  <Icon name={verwijderPending ? "loader" : "trash"} size={16} className={verwijderPending ? "animate-spin" : undefined} />
                </button>
              </Card>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
