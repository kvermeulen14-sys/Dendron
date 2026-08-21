"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Modal } from "@/components/ui/modal";
import { Icon, SUBJECT_ICON_OPTIONS } from "@/components/icon";
import { bewerkVak } from "@/lib/actions/subjects";
import type { Subject } from "@/lib/types";

export function VakBewerkForm({ subject }: { subject: Subject }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [icon, setIcon] = useState(subject.icon);
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        aria-label="Vak bewerken"
      >
        <Icon name="pencil-line" size={18} />
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Vak bewerken">
        <form
          action={async (formData) => {
            setError(null);
            const res = await bewerkVak(subject.id, formData);
            if (res?.error) {
              setError(res.error);
              return;
            }
            setOpen(false);
            router.refresh();
          }}
          className="flex flex-col gap-4"
        >
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Vaknaam</label>
              <input
                name="name"
                required
                defaultValue={subject.name}
                placeholder="bijv. Wiskunde"
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Code</label>
              <input
                name="code"
                maxLength={4}
                defaultValue={subject.code ?? ""}
                placeholder="WI"
                className="w-20 rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm uppercase focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Icoon</label>
            <div className="flex flex-wrap gap-2">
              {SUBJECT_ICON_OPTIONS.map((opt) => (
                <button
                  type="button"
                  key={opt}
                  onClick={() => setIcon(opt)}
                  className={clsx(
                    "flex h-10 w-10 items-center justify-center rounded-xl border",
                    icon === opt
                      ? "border-accent-600 bg-accent-50 text-accent-600"
                      : "border-slate-200 text-slate-500 hover:bg-slate-50"
                  )}
                >
                  <Icon name={opt} size={18} />
                </button>
              ))}
            </div>
            <input type="hidden" name="icon" value={icon} />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Instructies voor de AI-vakdocent (optioneel)
            </label>
            <textarea
              name="aiInstructions"
              rows={3}
              defaultValue={subject.ai_instructions ?? ""}
              placeholder="bijv. Blijf dicht bij de examenstof van niveau Havo 2. Geef nooit meteen het antwoord, stel eerst een tegenvraag."
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100"
            />
          </div>

          {error && <p className="text-sm text-rose-600">{error}</p>}

          <div className="flex gap-2">
            <SubmitButton>Wijzigingen opslaan</SubmitButton>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Annuleren
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
