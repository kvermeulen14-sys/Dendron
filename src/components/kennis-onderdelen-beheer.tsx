"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Modal } from "@/components/ui/modal";
import { Icon } from "@/components/icon";
import { GETAL_EN_RUIMTE_2HV13 } from "@/lib/data/getal-en-ruimte-2hv13";
import {
  genereerKennisOnderdelenVoorParagraaf,
  bewerkKennisOnderdeel,
  zetKennisOnderdeelStatus,
  verwijderKennisOnderdeel,
} from "@/lib/actions/kennis-onderdelen";
import type { KennisOnderdeel } from "@/lib/types";

const HOOFDSTUK_1_PARAGRAFEN = GETAL_EN_RUIMTE_2HV13.filter((p) => p.hoofdstukNr === 1);

export function KennisOnderdelenBeheer({
  subjectId,
  onderdelen,
}: {
  subjectId: string;
  onderdelen: KennisOnderdeel[];
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-slate-500">
        Pilot: hoofdstuk 1 (Rekenen met letters) van Getal &amp; Ruimte, opgesplitst in losse regels met eigen
        voorbeelden - zo kan Oefenen en Toets straks per regel bijhouden wat beheerst wordt, in plaats van per heel
        hoofdstuk. Laat de AI per paragraaf onderdelen voorstellen en controleer/publiceer ze hieronder.
      </p>
      <div className="flex flex-col gap-2">
        {HOOFDSTUK_1_PARAGRAFEN.map((paragraaf) => (
          <ParagraafRij
            key={paragraaf.id}
            subjectId={subjectId}
            paragraafId={paragraaf.id}
            titel={paragraaf.titel}
            onderdelen={onderdelen.filter((o) => o.paragraaf_id === paragraaf.id)}
          />
        ))}
      </div>
    </div>
  );
}

function ParagraafRij({
  subjectId,
  paragraafId,
  titel,
  onderdelen,
}: {
  subjectId: string;
  paragraafId: string;
  titel: string;
  onderdelen: KennisOnderdeel[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const aantalGepubliceerd = onderdelen.filter((o) => o.status === "gepubliceerd").length;
  const aantalConcept = onderdelen.length - aantalGepubliceerd;

  function genereer() {
    setError(null);
    startTransition(async () => {
      const res = await genereerKennisOnderdelenVoorParagraaf(subjectId, paragraafId);
      if (res.error) {
        setError(res.error);
        return;
      }
      setOpen(true);
      router.refresh();
    });
  }

  return (
    <Card className="!p-0 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50"
      >
        <Icon
          name="chevron-right"
          size={16}
          className={clsx("shrink-0 text-slate-400 transition-transform", open && "rotate-90")}
        />
        <span className="flex-1 text-sm font-medium text-slate-900">
          {paragraafId} - {titel}
        </span>
        {aantalGepubliceerd > 0 && (
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
            {aantalGepubliceerd} gepubliceerd
          </span>
        )}
        {aantalConcept > 0 && (
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
            {aantalConcept} concept
          </span>
        )}
        {onderdelen.length === 0 && <span className="text-[11px] text-slate-400">nog niets gegenereerd</span>}
      </button>

      {open && (
        <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3">
          {onderdelen.length === 0 && <p className="text-xs text-slate-500">Nog geen onderdelen voor deze paragraaf.</p>}

          {onderdelen
            .slice()
            .sort((a, b) => a.volgorde - b.volgorde)
            .map((o) => (
              <OnderdeelKaart key={o.id} subjectId={subjectId} onderdeel={o} />
            ))}

          {error && <p className="text-xs text-rose-600">{error}</p>}

          <Button
            variant="secondary"
            size="md"
            icon={<Icon name={pending ? "loader" : "sparkles"} size={15} className={pending ? "animate-spin" : undefined} />}
            onClick={genereer}
            disabled={pending}
            className="self-start"
          >
            {pending ? "Bezig..." : onderdelen.length === 0 ? "Genereer onderdelen met AI" : "Nog meer onderdelen genereren"}
          </Button>
        </div>
      )}
    </Card>
  );
}

function OnderdeelKaart({ subjectId, onderdeel }: { subjectId: string; onderdeel: KennisOnderdeel }) {
  const router = useRouter();
  const [bewerken, setBewerken] = useState(false);
  const [pending, startTransition] = useTransition();

  function wisselStatus() {
    startTransition(async () => {
      await zetKennisOnderdeelStatus(
        onderdeel.id,
        subjectId,
        onderdeel.status === "concept" ? "gepubliceerd" : "concept"
      );
      router.refresh();
    });
  }

  function verwijder() {
    if (!confirm(`"${onderdeel.naam}" verwijderen?`)) return;
    startTransition(async () => {
      await verwijderKennisOnderdeel(onderdeel.id, subjectId);
      router.refresh();
    });
  }

  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-slate-900">{onderdeel.naam}</p>
          <span
            className={clsx(
              "rounded-full px-2 py-0.5 text-[11px] font-medium",
              onderdeel.status === "gepubliceerd" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
            )}
          >
            {onderdeel.status === "gepubliceerd" ? "gepubliceerd" : "concept"}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={() => setBewerken(true)}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Onderdeel bewerken"
          >
            <Icon name="pencil-line" size={14} />
          </button>
          <button
            onClick={verwijder}
            disabled={pending}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
            aria-label="Onderdeel verwijderen"
          >
            <Icon name="trash" size={14} />
          </button>
        </div>
      </div>

      <p className="mt-1.5 text-sm text-slate-700">{onderdeel.regel}</p>

      <ul className="mt-1.5 flex flex-col gap-0.5 text-xs text-slate-600">
        {onderdeel.voorbeelden.map((v, i) => (
          <li key={i} className="font-mono">
            {v}
          </li>
        ))}
      </ul>

      {onderdeel.gecombineerd_voorbeeld && (
        <p className="mt-1.5 font-mono text-xs text-slate-600">{onderdeel.gecombineerd_voorbeeld}</p>
      )}
      {onderdeel.tip && (
        <p className="mt-2 rounded-lg bg-sky-50 px-2.5 py-1.5 text-xs text-sky-800">Tip: {onderdeel.tip}</p>
      )}
      {onderdeel.uitzondering && (
        <p className="mt-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">
          Let op: {onderdeel.uitzondering}
        </p>
      )}
      {onderdeel.fout_voorbeeld && (
        <p className="mt-1.5 rounded-lg bg-rose-50 px-2.5 py-1.5 text-xs text-rose-800">{onderdeel.fout_voorbeeld}</p>
      )}

      <div className="mt-2.5">
        <Button variant="secondary" size="md" onClick={wisselStatus} disabled={pending} className="!px-3 !py-1.5 text-xs">
          {onderdeel.status === "concept" ? "Publiceren" : "Terug naar concept"}
        </Button>
      </div>

      <Modal open={bewerken} onClose={() => setBewerken(false)} title="Kennisonderdeel bewerken">
        <form
          action={async (formData) => {
            const res = await bewerkKennisOnderdeel(onderdeel.id, subjectId, formData);
            if (!res?.error) {
              setBewerken(false);
              router.refresh();
            }
          }}
          className="flex flex-col gap-3"
        >
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Naam</label>
            <input
              name="naam"
              required
              defaultValue={onderdeel.naam}
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Regel</label>
            <textarea
              name="regel"
              required
              rows={2}
              defaultValue={onderdeel.regel}
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Voorbeelden (1 per regel)</label>
            <textarea
              name="voorbeelden"
              required
              rows={3}
              defaultValue={onderdeel.voorbeelden.join("\n")}
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-mono focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Gecombineerd voorbeeld (optioneel)</label>
            <input
              name="gecombineerdVoorbeeld"
              defaultValue={onderdeel.gecombineerd_voorbeeld ?? ""}
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-mono focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Tip (optioneel)</label>
            <input
              name="tip"
              defaultValue={onderdeel.tip ?? ""}
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Uitzondering (optioneel)</label>
            <input
              name="uitzondering"
              defaultValue={onderdeel.uitzondering ?? ""}
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Fout voorbeeld (optioneel)</label>
            <input
              name="foutVoorbeeld"
              defaultValue={onderdeel.fout_voorbeeld ?? ""}
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-mono focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100"
            />
          </div>

          <div className="flex gap-2">
            <SubmitButton>Wijzigingen opslaan</SubmitButton>
            <Button type="button" variant="secondary" onClick={() => setBewerken(false)}>
              Annuleren
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
