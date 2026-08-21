"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Modal } from "@/components/ui/modal";
import { Icon } from "@/components/icon";
import { bewerkLesstof } from "@/lib/actions/materials";
import type { Material } from "@/lib/types";

export function MateriaalBewerkForm({ material, subjectId }: { material: Material; subjectId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        aria-label="Lesstof bewerken"
      >
        <Icon name="pencil-line" size={16} />
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Lesstof bewerken">
        <form
          action={async (formData) => {
            setError(null);
            const res = await bewerkLesstof(material.id, subjectId, formData);
            if (res?.error) {
              setError(res.error);
              return;
            }
            setOpen(false);
            router.refresh();
          }}
          className="flex flex-col gap-4"
        >
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Titel</label>
            <input
              name="title"
              required
              defaultValue={material.title}
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Hoofdstuk (optioneel)</label>
              <input
                name="hoofdstuk"
                defaultValue={material.hoofdstuk ?? ""}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Opdrachten (optioneel)</label>
              <input
                name="opdrachten"
                defaultValue={material.opdrachten ?? ""}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100"
              />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Inhoud (wat de AI-vakdocent gebruikt)
            </label>
            <textarea
              name="content"
              required
              rows={8}
              defaultValue={material.content}
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
