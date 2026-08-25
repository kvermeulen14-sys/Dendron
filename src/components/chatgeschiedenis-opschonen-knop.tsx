"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icon";
import { wisOudeChatgeschiedenis, wisAlleChatgeschiedenis } from "@/lib/actions/chat-retentie";

function formatDatum(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });
}

/**
 * Chatinhoud (vakdocent, opdracht maken, planningshulp, overhoor-transcripts)
 * blijft staan zolang de huidige roosterperiode loopt. 2 opties: alleen alles
 * van vóór de huidige periode wissen (rustiger, houdt recente context), of
 * echt alles wissen ongeacht periode (volledig schone lei). Allebei bewust
 * met window.confirm() - net als bij het verwijderen van een vak - omdat dit
 * onomkeerbaar is en een grotere impact heeft dan de meeste andere acties.
 */
export function ChatgeschiedenisOpschonenKnop() {
  const [bezigOud, setBezigOud] = useState(false);
  const [bezigAlles, setBezigAlles] = useState(false);
  const [resultaat, setResultaat] = useState<{ type: "success" | "error"; tekst: string } | null>(null);

  async function opschonenOud() {
    if (!window.confirm("Weet je zeker dat je alle chatgeschiedenis van vóór de huidige periode wilt verwijderen? Dit kan niet ongedaan gemaakt worden.")) {
      return;
    }
    setBezigOud(true);
    setResultaat(null);
    const res = await wisOudeChatgeschiedenis();
    setBezigOud(false);
    if (res.success) {
      setResultaat({ type: "success", tekst: `Opgeschoond - alles van vóór ${formatDatum(res.cutoffDatum)} is verwijderd.` });
    } else {
      setResultaat({ type: "error", tekst: res.error });
    }
  }

  async function opschonenAlles() {
    if (
      !window.confirm(
        "Weet je zeker dat je ALLE chatgeschiedenis wilt verwijderen (van elk vak, elke periode)? Dit kan niet ongedaan gemaakt worden."
      )
    ) {
      return;
    }
    setBezigAlles(true);
    setResultaat(null);
    const res = await wisAlleChatgeschiedenis();
    setBezigAlles(false);
    if (res.success) {
      setResultaat({ type: "success", tekst: "Alle chatgeschiedenis is verwijderd." });
    } else {
      setResultaat({ type: "error", tekst: res.error });
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" loading={bezigOud} onClick={opschonenOud} icon={<Icon name="trash" size={16} />}>
          Oude chatgeschiedenis opschonen
        </Button>
        <Button variant="secondary" loading={bezigAlles} onClick={opschonenAlles} icon={<Icon name="trash" size={16} />}>
          Alle chatgeschiedenis wissen
        </Button>
      </div>
      {resultaat && (
        <p className={resultaat.type === "success" ? "text-xs text-emerald-700" : "text-xs text-rose-600"}>
          {resultaat.tekst}
        </p>
      )}
    </div>
  );
}
