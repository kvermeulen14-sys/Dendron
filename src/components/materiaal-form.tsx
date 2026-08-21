"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Modal } from "@/components/ui/modal";
import { Icon } from "@/components/icon";
import { voegLesstofToe } from "@/lib/actions/materials";

export function MateriaalForm({ subjectId }: { subjectId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <Button icon={<Icon name="upload" size={18} />} onClick={() => setOpen(true)}>
        Lesstof toevoegen (tekst)
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title="Lesstof toevoegen">
        <form
          action={async (formData) => {
            setError(null);
            const res = await voegLesstofToe(formData);
            if (res?.error) {
              setError(res.error);
              return;
            }
            setOpen(false);
            router.refresh();
          }}
          className="flex flex-col gap-4"
        >
          <input type="hidden" name="subjectId" value={subjectId} />
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Titel</label>
            <input
              name="title"
              required
              placeholder="bijv. Hoofdstuk 4 - Breuken"
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Inhoud (samenvatting, uitleg, opgaven - platte tekst)
            </label>
            <textarea
              name="content"
              required
              rows={8}
              placeholder="Plak of typ hier de lesstof die de AI-vakdocent mag gebruiken."
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100"
            />
          </div>

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
