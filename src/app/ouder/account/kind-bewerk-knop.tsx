"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Modal } from "@/components/ui/modal";
import { Icon } from "@/components/icon";
import { bewerkKindAccount } from "./actions";

export function KindBewerkKnop({
  kindId,
  huidigeNaam,
  huidigeEmail,
}: {
  kindId: string;
  huidigeNaam: string;
  huidigeEmail: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gelukt, setGelukt] = useState(false);

  function sluit() {
    setOpen(false);
    setError(null);
    setGelukt(false);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        aria-label={`${huidigeNaam} bewerken`}
      >
        <Icon name="pencil-line" size={16} />
      </button>

      <Modal open={open} onClose={sluit} title="Kind-account bewerken">
        <form
          action={async (formData) => {
            setError(null);
            const res = await bewerkKindAccount(kindId, formData);
            if (res?.error) {
              setError(res.error);
              return;
            }
            setGelukt(true);
            router.refresh();
          }}
          className="flex flex-col gap-4"
        >
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Naam</label>
            <input
              name="fullName"
              required
              defaultValue={huidigeNaam}
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">E-mailadres</label>
            <input
              type="email"
              name="email"
              required
              defaultValue={huidigeEmail}
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Nieuw wachtwoord</label>
            <input
              type="password"
              name="password"
              minLength={6}
              placeholder="Laat leeg om het wachtwoord niet te wijzigen"
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100"
            />
            <p className="mt-1.5 text-xs text-slate-500">
              Alleen invullen als je het wachtwoord wilt resetten (bv. omdat je kind het vergeten is).
            </p>
          </div>

          {error && <p className="text-sm text-rose-600">{error}</p>}
          {gelukt && <p className="text-sm text-emerald-600">Opgeslagen.</p>}

          <div className="flex gap-2">
            <SubmitButton pendingText="Bezig...">Opslaan</SubmitButton>
            <Button type="button" variant="secondary" onClick={sluit}>
              {gelukt ? "Sluiten" : "Annuleren"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
