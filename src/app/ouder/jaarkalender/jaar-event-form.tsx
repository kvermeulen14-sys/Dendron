"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Modal } from "@/components/ui/modal";
import { Icon } from "@/components/icon";
import { JAAR_EVENT_META } from "@/lib/jaarkalender";
import { maakJaarEvent } from "@/lib/actions/jaar-events";
import type { JaarEventType } from "@/lib/types";

export function JaarEventForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<JaarEventType>("vakantie");
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <Button icon={<Icon name="plus" size={18} />} onClick={() => setOpen(true)}>
        Handmatig toevoegen
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title="Periode toevoegen">
        <form
          action={async (formData) => {
            setError(null);
            const res = await maakJaarEvent(formData);
            if (res?.error) {
              setError(res.error);
              return;
            }
            setOpen(false);
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
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Tot en met</label>
              <input
                type="date"
                name="eindDatum"
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100"
              />
            </div>
          </div>
          <p className="text-xs text-slate-500">Laat &quot;tot en met&quot; leeg voor een periode van 1 dag.</p>

          {error && <p className="text-sm text-rose-600">{error}</p>}

          <div className="flex gap-2">
            <SubmitButton>Opslaan</SubmitButton>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Annuleren
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
