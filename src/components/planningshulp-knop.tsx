"use client";

import { useState } from "react";
import { Icon } from "@/components/icon";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { PlanningHulpChat } from "@/components/planning-hulp-chat";
import type { PlanningItem, Subject } from "@/lib/types";

/**
 * Opent de Planningshulp-chat als popup i.p.v. inline op de pagina - zodat
 * de rest van het scherm wegvalt en er focus is op het gesprek. De volledige
 * pagina (/kind/planningshulp) blijft daarnaast gewoon bestaan als directe
 * link/bladwijzer.
 */
export function PlanningshulpKnop({
  items,
  subjects,
  variant = "kaart",
}: {
  items: PlanningItem[];
  subjects: Subject[];
  variant?: "kaart" | "knop";
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {variant === "kaart" ? (
        <Card
          onClick={() => setOpen(true)}
          className="flex cursor-pointer items-center gap-3 border-accent-100 bg-accent-50/40 transition-shadow hover:shadow-md"
        >
          <Icon name="brain" size={22} className="text-accent-600" />
          <div>
            <p className="text-sm font-semibold text-slate-900">Loop je vast met plannen?</p>
            <p className="text-xs text-slate-500">Overleg een dilemma met je planningshulp</p>
          </div>
        </Card>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
        >
          <Icon name="brain" size={18} />
          Planningshulp
        </button>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Planningshulp" maxWidthClass="max-w-xl">
        <PlanningHulpChat items={items} subjects={subjects} />
      </Modal>
    </>
  );
}
