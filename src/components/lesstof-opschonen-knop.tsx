"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icon";
import { vindOvertolligeLesstof, verwijderOvertolligeLesstof } from "@/lib/actions/materials";

/**
 * Verwijdert oude lesstof (materials) die overbodig is geworden doordat
 * dezelfde paragraaf al gepubliceerde kennisonderdelen heeft - zodra dat zo
 * is, gebruikt de AI-vakdocent toch alleen nog de kennisonderdelen (zie de
 * chat-route), dus blijft de oude tekst alleen maar dubbel en kan die uit
 * sync raken met wat in de kennisonderdelen is bijgewerkt.
 */
export function LesstofOpschonenKnop({ subjectId }: { subjectId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [melding, setMelding] = useState<string | null>(null);

  function opschonen() {
    setMelding(null);
    startTransition(async () => {
      const preview = await vindOvertolligeLesstof(subjectId);
      if ("error" in preview && preview.error) {
        setMelding(preview.error);
        return;
      }
      if (!preview.materialen || preview.materialen.length === 0) {
        setMelding("Geen dubbele lesstof gevonden.");
        return;
      }

      const lijst = preview.materialen.map((m) => `- ${m.title}`).join("\n");
      const bevestigd = confirm(
        `${preview.materialen.length} lesstof-item(s) staan al (beter) in de kennisonderdelen en worden niet meer gebruikt door de AI-vakdocent:\n\n${lijst}\n\nVerwijderen?`
      );
      if (!bevestigd) return;

      const res = await verwijderOvertolligeLesstof(subjectId);
      if ("error" in res && res.error) {
        setMelding(res.error);
        return;
      }
      setMelding(`${res.verwijderd} lesstof-item(s) verwijderd.`);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Button
        variant="secondary"
        size="md"
        icon={<Icon name={pending ? "loader" : "trash"} size={15} className={pending ? "animate-spin" : undefined} />}
        onClick={opschonen}
        disabled={pending}
      >
        {pending ? "Bezig..." : "Dubbele lesstof opschonen"}
      </Button>
      {melding && <p className="text-xs text-slate-500">{melding}</p>}
    </div>
  );
}
