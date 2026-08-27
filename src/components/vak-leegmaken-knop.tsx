"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icon";
import { wisVakInhoud } from "@/lib/actions/vak-opschonen";

/**
 * Vak in 1 keer leegmaken, per onderdeel te kiezen - bedoeld voor een schone
 * herstart (bv. na een rommelige/dubbele import) i.p.v. elk kaartje los te
 * moeten verwijderen. Standaard alleen kennisbank+lesstof aangevinkt, de
 * oefen-/overhoorvoortgang is een expliciete keuze omdat dat echte
 * voortgang van de leerling kan zijn.
 */
export function VakLeegmakenKnop({ subjectId }: { subjectId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kennisbank, setKennisbank] = useState(true);
  const [materials, setMaterials] = useState(true);
  const [voortgang, setVoortgang] = useState(false);
  const [pending, startTransition] = useTransition();
  const [melding, setMelding] = useState<string | null>(null);

  function bevestig() {
    if (!kennisbank && !materials && !voortgang) return;
    const delen = [kennisbank && "kennisonderdelen/woordenlijsten", materials && "losse lesstof", voortgang && "oefenvoortgang"]
      .filter(Boolean)
      .join(", ");
    if (!confirm(`Weet je zeker dat je dit wilt wissen: ${delen}? Dit kan niet ongedaan gemaakt worden.`)) return;

    setMelding(null);
    startTransition(async () => {
      const res = await wisVakInhoud(subjectId, { kennisbank, materials, voortgang });
      if ("error" in res && res.error) {
        setMelding(res.error);
        return;
      }
      setMelding("Gewist.");
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 self-start text-xs font-medium text-slate-400 transition-colors hover:text-rose-600"
      >
        <Icon name="trash" size={12} />
        Vak leegmaken
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-rose-200 bg-rose-50/60 p-3">
      <p className="text-xs font-semibold text-rose-800">Wat wil je wissen?</p>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={kennisbank} onChange={(e) => setKennisbank(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
        Kennisonderdelen, woordenlijsten en paragraafinfo
      </label>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={materials} onChange={(e) => setMaterials(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
        Losse lesstof-bestanden
      </label>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={voortgang} onChange={(e) => setVoortgang(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
        Oefen-/overhoorvoortgang
      </label>
      {melding && <p className="text-xs text-rose-700">{melding}</p>}
      <div className="flex gap-2">
        <Button
          size="md"
          variant="secondary"
          loading={pending}
          disabled={!kennisbank && !materials && !voortgang}
          onClick={bevestig}
          icon={<Icon name="trash" size={14} />}
        >
          Wissen
        </Button>
        <Button size="md" variant="secondary" onClick={() => setOpen(false)}>
          Annuleren
        </Button>
      </div>
    </div>
  );
}
