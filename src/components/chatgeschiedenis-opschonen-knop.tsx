"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icon";
import { wisOudeChatgeschiedenis } from "@/lib/actions/chat-retentie";

function formatDatum(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });
}

/**
 * Chatinhoud (vakdocent, opdracht maken, planningshulp, overhoor-transcripts)
 * blijft staan zolang de huidige roosterperiode loopt; deze knop wist alles
 * van daarvoor met 1 klik. Bewust met window.confirm() - net als bij het
 * verwijderen van een vak - omdat dit onomkeerbaar is en een grotere impact
 * heeft dan de meeste andere acties in de app.
 */
export function ChatgeschiedenisOpschonenKnop() {
  const [bezig, setBezig] = useState(false);
  const [resultaat, setResultaat] = useState<{ type: "success" | "error"; tekst: string } | null>(null);

  async function opschonen() {
    if (!window.confirm("Weet je zeker dat je alle chatgeschiedenis van vóór de huidige periode wilt verwijderen? Dit kan niet ongedaan gemaakt worden.")) {
      return;
    }
    setBezig(true);
    setResultaat(null);
    const res = await wisOudeChatgeschiedenis();
    setBezig(false);
    if (res.success) {
      setResultaat({ type: "success", tekst: `Opgeschoond - alles van vóór ${formatDatum(res.cutoffDatum)} is verwijderd.` });
    } else {
      setResultaat({ type: "error", tekst: res.error });
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button variant="secondary" loading={bezig} onClick={opschonen} icon={<Icon name="trash" size={16} />}>
        Oude chatgeschiedenis opschonen
      </Button>
      {resultaat && (
        <p className={resultaat.type === "success" ? "text-xs text-emerald-700" : "text-xs text-rose-600"}>
          {resultaat.tekst}
        </p>
      )}
    </div>
  );
}
