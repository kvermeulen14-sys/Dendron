"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { verwijderOverhoorGeschiedenis } from "@/lib/actions/overhoor";

/**
 * Wist de volledige oefen-/overhoorvoortgang (score EN transcript) voor 1
 * vak - bedoeld om testsessies of een gewenste schone lei mogelijk te maken.
 * RLS bepaalt zelf de scope (zie verwijderOverhoorGeschiedenis): een
 * leerling wist alleen eigen sessies, een ouder die van het hele gezin.
 */
export function OverhoorGeschiedenisOpschonenKnop({ subjectId }: { subjectId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [melding, setMelding] = useState<string | null>(null);

  function opschonen() {
    if (!confirm("Weet je zeker dat je de oefengeschiedenis voor dit vak wilt wissen? Dit kan niet ongedaan gemaakt worden.")) {
      return;
    }
    setMelding(null);
    startTransition(async () => {
      const res = await verwijderOverhoorGeschiedenis(subjectId);
      if ("error" in res && res.error) {
        setMelding(res.error);
        return;
      }
      const aantal = "verwijderd" in res ? res.verwijderd : 0;
      setMelding(aantal > 0 ? `${aantal} sessie(s) gewist.` : "Niks om te wissen.");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <button
        onClick={opschonen}
        disabled={pending}
        className="flex items-center gap-1 self-start text-xs font-medium text-slate-400 transition-colors hover:text-rose-600 disabled:opacity-50"
      >
        <Icon name={pending ? "loader" : "trash"} size={12} className={pending ? "animate-spin" : undefined} />
        Voortgang opschonen
      </button>
      {melding && <p className="text-xs text-slate-500">{melding}</p>}
    </div>
  );
}
