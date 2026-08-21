"use client";

import { useTransition } from "react";
import { Icon } from "@/components/icon";
import { verwijderVak } from "@/lib/actions/subjects";

export function VerwijderVakKnop({ subjectId, subjectName }: { subjectId: string; subjectName: string }) {
  const [pending, startTransition] = useTransition();

  function verwijder() {
    if (
      !window.confirm(
        `Weet je zeker dat je "${subjectName}" wilt verwijderen? Alle lesstof en chatgeschiedenis van dit vak gaan hiermee ook verloren. Dit kan niet ongedaan gemaakt worden.`
      )
    ) {
      return;
    }
    startTransition(async () => {
      await verwijderVak(subjectId);
    });
  }

  return (
    <button
      disabled={pending}
      onClick={verwijder}
      className="rounded-xl p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
      aria-label="Vak verwijderen"
    >
      <Icon name={pending ? "loader" : "trash"} size={18} className={pending ? "animate-spin" : undefined} />
    </button>
  );
}
