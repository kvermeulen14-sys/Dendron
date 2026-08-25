"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Modal } from "@/components/ui/modal";
import { Icon } from "@/components/icon";
import { GETAL_EN_RUIMTE_2HV13 } from "@/lib/data/getal-en-ruimte-2hv13";
import { normaliseerWiskundeNotatie } from "@/lib/tekst";
import {
  genereerKennisOnderdelenVoorParagraaf,
  bewerkKennisOnderdeel,
  zetKennisOnderdeelStatus,
  verwijderKennisOnderdeel,
} from "@/lib/actions/kennis-onderdelen";
import {
  verwerkKennisBrontekst,
  verwerkTaalvakBrontekst,
  bewerkKennisParagraafContext,
  zetKennisParagraafContextStatus,
  bewerkKennisOefenvraag,
  zetKennisOefenvraagStatus,
  verwijderKennisOefenvraag,
  publiceerParagraaf,
  verwijderParagraaf,
  bewerkKennisWoordenlijst,
  zetKennisWoordenlijstStatus,
  verwijderKennisWoordenlijst,
} from "@/lib/actions/kennis-bron-import";
import type { KennisOnderdeel, KennisOefenvraag, KennisParagraafContext, KennisWoordenlijst } from "@/lib/types";

const INGEBOUWD_HOOFDSTUK_1 = GETAL_EN_RUIMTE_2HV13.filter((p) => p.hoofdstukNr === 1);

interface ParagraafRijData {
  paragraafId: string;
  titel: string;
  uitIngebouwdeDataset: boolean;
}

export function KennisOnderdelenBeheer({
  subjectId,
  onderdelen,
  contexten,
  oefenvragen,
  woordenlijsten,
  toonIngebouwdePilot = false,
}: {
  subjectId: string;
  onderdelen: KennisOnderdeel[];
  contexten: KennisParagraafContext[];
  oefenvragen: KennisOefenvraag[];
  woordenlijsten: KennisWoordenlijst[];
  toonIngebouwdePilot?: boolean;
}) {
  const rijen = new Map<string, ParagraafRijData>();
  if (toonIngebouwdePilot) {
    for (const p of INGEBOUWD_HOOFDSTUK_1) {
      rijen.set(p.id, { paragraafId: p.id, titel: p.titel, uitIngebouwdeDataset: true });
    }
  }
  for (const c of contexten) {
    if (!rijen.has(c.paragraaf_id)) rijen.set(c.paragraaf_id, { paragraafId: c.paragraaf_id, titel: c.titel, uitIngebouwdeDataset: false });
  }
  for (const o of onderdelen) {
    if (!rijen.has(o.paragraaf_id ?? "")) {
      rijen.set(o.paragraaf_id ?? "", { paragraafId: o.paragraaf_id ?? "", titel: `Paragraaf ${o.paragraaf_id}`, uitIngebouwdeDataset: false });
    }
  }
  for (const v of oefenvragen) {
    if (!rijen.has(v.paragraaf_id)) {
      rijen.set(v.paragraaf_id, { paragraafId: v.paragraaf_id, titel: `Paragraaf ${v.paragraaf_id}`, uitIngebouwdeDataset: false });
    }
  }
  for (const w of woordenlijsten) {
    if (!rijen.has(w.paragraaf_id)) {
      rijen.set(w.paragraaf_id, { paragraafId: w.paragraaf_id, titel: `Paragraaf ${w.paragraaf_id}`, uitIngebouwdeDataset: false });
    }
  }
  const gesorteerdeRijen = Array.from(rijen.values()).sort((a, b) =>
    a.paragraafId.localeCompare(b.paragraafId, undefined, { numeric: true })
  );

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-slate-500">
        Kennisbank op regel-niveau: losse regels met eigen voorbeelden, paragraafcontext (leerdoelen/voorkennis/
        beheersingscriterium) en een oefenbank - zo kan Oefenen en Toets straks per regel bijhouden wat beheerst
        wordt, in plaats van per heel hoofdstuk.{" "}
        {toonIngebouwdePilot && "Voor hoofdstuk 1 (Rekenen met letters) kan de AI onderdelen voorstellen met de ingebouwde Getal & Ruimte-samenvatting, of "}
        Upload eigen .md-bestanden (1 tegelijk per paragraaf, of meerdere ineens) - de AI herkent zelf welke
        paragraaf elk bestand behandelt en welke structuur het gebruikt, dus dit werkt ook voor andere vakken.
        Controleer en publiceer de voorstellen hieronder.{" "}
        <strong className="font-medium text-slate-600">
          Bevat een bestand ook letterlijke woordenlijsten (Engels e.d.)? Gebruik dan niet deze knop maar de
          taalvak-knop hieronder - die verwerkt het hele hoofdstuk/de hele unit in 1x.
        </strong>
      </p>

      <BulkUpload subjectId={subjectId} />
      <TaalvakUpload subjectId={subjectId} />

      <div className="flex flex-col gap-2">
        {gesorteerdeRijen.map((rij) => (
          <ParagraafRij
            key={rij.paragraafId}
            subjectId={subjectId}
            paragraafId={rij.paragraafId}
            titel={rij.titel}
            uitIngebouwdeDataset={rij.uitIngebouwdeDataset}
            onderdelen={onderdelen.filter((o) => o.paragraaf_id === rij.paragraafId)}
            context={contexten.find((c) => c.paragraaf_id === rij.paragraafId) ?? null}
            oefenvragen={oefenvragen.filter((v) => v.paragraaf_id === rij.paragraafId)}
            woordenlijsten={woordenlijsten.filter((w) => w.paragraaf_id === rij.paragraafId)}
          />
        ))}
      </div>
    </div>
  );
}

// Netlify's serverfuncties (waar deze AI-verwerking op draait) breken vanzelf
// af na een kort ingebouwd maximum (in de orde van seconden, geen minuten).
// Als die afbreking niet netjes als fout terugkomt (bv. een verbroken
// verbinding i.p.v. een nette foutrespons) zou "await" hier voor altijd
// blijven hangen zonder deze cliëntzijdige noodrem - dan blijft de UI oneindig
// "Bezig..." tonen in plaats van een foutmelding.
// 2 losse AI-aanroepen na elkaar (meta+onderdelen, dan de oefenbank) - iets
// meer marge dan bij 1 aanroep.
const VERWERK_TIMEOUT_MS = 90_000;

function metTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Duurde langer dan ${Math.round(ms / 1000)} seconden - waarschijnlijk vastgelopen. Probeer het opnieuw.`)),
      ms
    );
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}

type BestandStatus = { naam: string; status: "bezig" | "klaar" | "overgeslagen" | "fout"; bericht: string };

function BulkUpload({ subjectId }: { subjectId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [bezig, setBezig] = useState(false);
  const [resultaten, setResultaten] = useState<BestandStatus[]>([]);

  async function bestandenGekozen(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;

    setBezig(true);
    setResultaten(files.map((f) => ({ naam: f.name, status: "bezig", bericht: "" })));

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        let uitkomst: BestandStatus;
        try {
          const tekst = await file.text();
          const res = await metTimeout(verwerkKennisBrontekst(subjectId, tekst, file.name), VERWERK_TIMEOUT_MS);
          if ("error" in res && res.error) {
            uitkomst = { naam: file.name, status: "fout", bericht: res.error };
          } else if ("overgeslagen" in res && res.overgeslagen) {
            uitkomst = { naam: file.name, status: "overgeslagen", bericht: res.reden };
          } else {
            uitkomst = {
              naam: file.name,
              status: "klaar",
              bericht:
                `${res.paragraafId} - ${res.aantalOnderdelen} onderdelen, ${res.aantalOefenvragen} oefenvragen` +
                (res.oefenvragenFout ? ` (oefenbank mislukt: ${res.oefenvragenFout})` : ""),
            };
          }
        } catch (e) {
          uitkomst = { naam: file.name, status: "fout", bericht: e instanceof Error ? e.message : "Verwerken mislukt." };
        }
        setResultaten((prev) => prev.map((r, idx) => (idx === i ? uitkomst : r)));
      }
    } finally {
      setBezig(false);
      router.refresh();
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="secondary"
        size="md"
        icon={<Icon name={bezig ? "loader" : "upload"} size={15} className={bezig ? "animate-spin" : undefined} />}
        onClick={() => inputRef.current?.click()}
        disabled={bezig}
        className="self-start"
      >
        {bezig ? "Bezig met verwerken..." : "Upload meerdere .md-bestanden"}
      </Button>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".md,.markdown,text/markdown,text/plain"
        className="hidden"
        onChange={bestandenGekozen}
      />
      {resultaten.length > 0 && (
        <ul className="flex flex-col gap-1 rounded-xl border border-slate-200 p-2.5 text-xs">
          {resultaten.map((r) => (
            <li key={r.naam} className="flex items-start gap-2">
              <span
                className={clsx(
                  "mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full",
                  r.status === "bezig" && "animate-pulse bg-slate-300",
                  r.status === "klaar" && "bg-emerald-500",
                  r.status === "overgeslagen" && "bg-slate-300",
                  r.status === "fout" && "bg-rose-500"
                )}
              />
              <span className="text-slate-600">
                <span className="font-medium text-slate-800">{r.naam}</span>
                {r.bericht && <span className="text-slate-500"> — {r.bericht}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TaalvakUpload({ subjectId }: { subjectId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [bezig, setBezig] = useState(false);
  const [resultaten, setResultaten] = useState<BestandStatus[]>([]);

  async function bestandenGekozen(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;

    setBezig(true);
    setResultaten(files.map((f) => ({ naam: f.name, status: "bezig", bericht: "" })));

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        let uitkomst: BestandStatus;
        try {
          const tekst = await file.text();
          const res = await metTimeout(verwerkTaalvakBrontekst(subjectId, tekst, file.name), VERWERK_TIMEOUT_MS);
          if ("error" in res && res.error) {
            uitkomst = { naam: file.name, status: "fout", bericht: res.error };
          } else if ("overgeslagen" in res && res.overgeslagen) {
            uitkomst = {
              naam: file.name,
              status: res.aantalWoordenlijsten > 0 ? "klaar" : "overgeslagen",
              bericht: `${res.aantalWoordenlijsten} woordenlijst(en), ${res.aantalWoorden} woorden. ${res.reden}`,
            };
          } else if ("paragraafId" in res) {
            uitkomst = {
              naam: file.name,
              status: "klaar",
              bericht:
                `${res.paragraafId} - ${res.aantalWoordenlijsten} woordenlijst(en) (${res.aantalWoorden} woorden), ` +
                `${res.aantalOnderdelen ?? 0} onderdelen, ${res.aantalOefenvragen ?? 0} oefenvragen` +
                (res.oefenvragenFout ? ` (oefenbank mislukt: ${res.oefenvragenFout})` : ""),
            };
          } else {
            uitkomst = { naam: file.name, status: "fout", bericht: "Onbekende fout." };
          }
        } catch (e) {
          uitkomst = { naam: file.name, status: "fout", bericht: e instanceof Error ? e.message : "Verwerken mislukt." };
        }
        setResultaten((prev) => prev.map((r, idx) => (idx === i ? uitkomst : r)));
      }
    } finally {
      setBezig(false);
      router.refresh();
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-dashed border-slate-200 p-3">
      <p className="text-xs text-slate-500">
        Voor taalvakken (Engels e.d.): upload hier het HELE hoofdstuk-/unit-bestand in 1x (dus niet ook nog via de
        knop hierboven). De woordenlijsten/uitdrukkingentabellen erin worden apart herkend en woord-voor-woord
        bewaard, i.p.v. door de AI samengevat - de rest van hetzelfde bestand (grammatica-uitleg, oefenbank) wordt
        automatisch meeverwerkt via de gebruikelijke verwerking, in dezelfde upload.
      </p>
      <Button
        variant="secondary"
        size="md"
        icon={<Icon name={bezig ? "loader" : "language"} size={15} className={bezig ? "animate-spin" : undefined} />}
        onClick={() => inputRef.current?.click()}
        disabled={bezig}
        className="self-start"
      >
        {bezig ? "Bezig met verwerken..." : "Upload taalvak-bestand(en) (.md)"}
      </Button>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".md,.markdown,text/markdown,text/plain"
        className="hidden"
        onChange={bestandenGekozen}
      />
      {resultaten.length > 0 && (
        <ul className="flex flex-col gap-1 rounded-xl border border-slate-200 p-2.5 text-xs">
          {resultaten.map((r) => (
            <li key={r.naam} className="flex items-start gap-2">
              <span
                className={clsx(
                  "mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full",
                  r.status === "bezig" && "animate-pulse bg-slate-300",
                  r.status === "klaar" && "bg-emerald-500",
                  r.status === "overgeslagen" && "bg-slate-300",
                  r.status === "fout" && "bg-rose-500"
                )}
              />
              <span className="text-slate-600">
                <span className="font-medium text-slate-800">{r.naam}</span>
                {r.bericht && <span className="text-slate-500"> — {r.bericht}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ParagraafRij({
  subjectId,
  paragraafId,
  titel,
  uitIngebouwdeDataset,
  onderdelen,
  context,
  oefenvragen,
  woordenlijsten,
}: {
  subjectId: string;
  paragraafId: string;
  titel: string;
  uitIngebouwdeDataset: boolean;
  onderdelen: KennisOnderdeel[];
  context: KennisParagraafContext | null;
  oefenvragen: KennisOefenvraag[];
  woordenlijsten: KennisWoordenlijst[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const bestandInputRef = useRef<HTMLInputElement>(null);

  const aantalGepubliceerd = onderdelen.filter((o) => o.status === "gepubliceerd").length;
  const aantalConcept = onderdelen.length - aantalGepubliceerd;
  const totaalConcept =
    aantalConcept +
    (context?.status === "concept" ? 1 : 0) +
    oefenvragen.filter((v) => v.status === "concept").length +
    woordenlijsten.filter((w) => w.status === "concept").length;
  const heeftContent = onderdelen.length > 0 || oefenvragen.length > 0 || woordenlijsten.length > 0 || Boolean(context);

  function alleenPubliceren() {
    setError(null);
    startTransition(async () => {
      const res = await publiceerParagraaf(subjectId, paragraafId);
      if (res.error) setError(res.error);
      router.refresh();
    });
  }

  function alleenVerwijderen() {
    if (
      !confirm(
        `Alle kennisonderdelen, context, oefenvragen en woordenlijsten van "${paragraafId} - ${titel}" verwijderen? Dit geldt ook voor al gepubliceerde onderdelen.`
      )
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await verwijderParagraaf(subjectId, paragraafId);
      if (res.error) setError(res.error);
      router.refresh();
    });
  }

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

  async function bestandGekozen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setError(null);
    const brontekst = await file.text();
    startTransition(async () => {
      let res;
      try {
        res = await metTimeout(verwerkKennisBrontekst(subjectId, brontekst, file.name, paragraafId), VERWERK_TIMEOUT_MS);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Verwerken mislukt.");
        return;
      }
      if ("error" in res && res.error) {
        setError(res.error);
        return;
      }
      if ("overgeslagen" in res && res.overgeslagen) {
        setError(res.reden);
        return;
      }
      setOpen(true);
      router.refresh();
    });
  }

  const taalvakBestandInputRef = useRef<HTMLInputElement>(null);

  async function taalvakBestandGekozen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setError(null);
    const brontekst = await file.text();
    startTransition(async () => {
      let res;
      try {
        res = await metTimeout(verwerkTaalvakBrontekst(subjectId, brontekst, file.name, paragraafId), VERWERK_TIMEOUT_MS);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Verwerken mislukt.");
        return;
      }
      if ("error" in res && res.error) {
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
        {context && (
          <span
            className={clsx(
              "rounded-full px-2 py-0.5 text-[11px] font-medium",
              context.status === "gepubliceerd" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
            )}
          >
            context
          </span>
        )}
        {oefenvragen.length > 0 && (
          <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700">
            {oefenvragen.length} oefenvragen
          </span>
        )}
        {woordenlijsten.length > 0 && (
          <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700">
            {woordenlijsten.length} woordenlijst(en)
          </span>
        )}
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
        {!heeftContent && <span className="text-[11px] text-slate-400">nog niets gegenereerd</span>}
      </button>

      {open && (
        <div className="flex flex-col gap-4 border-t border-slate-100 px-4 py-3">
          {context && <ContextKaart subjectId={subjectId} context={context} />}

          {onderdelen.length > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Kennisonderdelen</h3>
              {onderdelen
                .slice()
                .sort((a, b) => a.volgorde - b.volgorde)
                .map((o) => (
                  <OnderdeelKaart key={o.id} subjectId={subjectId} onderdeel={o} />
                ))}
            </div>
          )}

          {woordenlijsten.length > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Woordenlijsten ({woordenlijsten.length})
              </h3>
              {woordenlijsten
                .slice()
                .sort((a, b) => a.volgorde - b.volgorde)
                .map((w) => (
                  <WoordenlijstKaart key={w.id} subjectId={subjectId} woordenlijst={w} />
                ))}
            </div>
          )}

          {oefenvragen.length > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Oefenbank ({oefenvragen.length})
              </h3>
              {oefenvragen
                .slice()
                .sort((a, b) => a.volgorde - b.volgorde)
                .map((v) => (
                  <OefenvraagKaart key={v.id} subjectId={subjectId} oefenvraag={v} />
                ))}
            </div>
          )}

          {!heeftContent && <p className="text-xs text-slate-500">Nog geen kennisbank voor deze paragraaf.</p>}

          {error && <p className="text-xs text-rose-600">{error}</p>}

          <div className="flex flex-wrap gap-2">
            {totaalConcept > 0 && (
              <Button
                variant="secondary"
                size="md"
                icon={<Icon name="check" size={15} />}
                onClick={alleenPubliceren}
                disabled={pending}
              >
                Alles publiceren ({totaalConcept})
              </Button>
            )}
            {heeftContent && (
              <Button
                variant="secondary"
                size="md"
                icon={<Icon name="trash" size={15} />}
                onClick={alleenVerwijderen}
                disabled={pending}
                className="!text-rose-600 hover:!bg-rose-50"
              >
                Deze paragraaf verwijderen
              </Button>
            )}
            {uitIngebouwdeDataset && (
              <Button
                variant="secondary"
                size="md"
                icon={<Icon name={pending ? "loader" : "sparkles"} size={15} className={pending ? "animate-spin" : undefined} />}
                onClick={genereer}
                disabled={pending}
              >
                {pending ? "Bezig..." : onderdelen.length === 0 ? "Genereer onderdelen met AI" : "Nog meer onderdelen genereren"}
              </Button>
            )}
            <Button
              variant="secondary"
              size="md"
              icon={<Icon name="upload" size={15} />}
              onClick={() => bestandInputRef.current?.click()}
              disabled={pending}
            >
              Eigen .md-bestand gebruiken
            </Button>
            <input
              ref={bestandInputRef}
              type="file"
              accept=".md,.markdown,text/markdown,text/plain"
              className="hidden"
              onChange={bestandGekozen}
            />
            <Button
              variant="secondary"
              size="md"
              icon={<Icon name="language" size={15} />}
              onClick={() => taalvakBestandInputRef.current?.click()}
              disabled={pending}
            >
              Taalvak-bestand gebruiken (woordenlijsten)
            </Button>
            <input
              ref={taalvakBestandInputRef}
              type="file"
              accept=".md,.markdown,text/markdown,text/plain"
              className="hidden"
              onChange={taalvakBestandGekozen}
            />
          </div>
        </div>
      )}
    </Card>
  );
}

function StatusKnop({
  status,
  bezig,
  onWissel,
}: {
  status: "concept" | "gepubliceerd";
  bezig: boolean;
  onWissel: () => void;
}) {
  return (
    <Button variant="secondary" size="md" onClick={onWissel} disabled={bezig} className="!px-3 !py-1.5 text-xs">
      {status === "concept" ? "Publiceren" : "Terug naar concept"}
    </Button>
  );
}

function ContextKaart({ subjectId, context }: { subjectId: string; context: KennisParagraafContext }) {
  const router = useRouter();
  const [bewerken, setBewerken] = useState(false);
  const [pending, startTransition] = useTransition();

  function wisselStatus() {
    startTransition(async () => {
      await zetKennisParagraafContextStatus(context.id, subjectId, context.status === "concept" ? "gepubliceerd" : "concept");
      router.refresh();
    });
  }

  const velden: { label: string; waarde: string | null }[] = [
    { label: "Leerdoelen", waarde: context.leerdoelen },
    { label: "Voorkennis", waarde: context.voorkennis },
    { label: "Kernbegrippen", waarde: context.kernbegrippen },
    { label: "Oplossingsroute", waarde: context.oplossingsroute },
    { label: "Beheersingscriterium", waarde: context.beheersingscriterium },
    { label: "Coachaanpak (voor de AI-tutor)", waarde: context.coachaanpak },
  ];

  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-slate-900">Paragraafcontext</p>
          <span
            className={clsx(
              "rounded-full px-2 py-0.5 text-[11px] font-medium",
              context.status === "gepubliceerd" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
            )}
          >
            {context.status === "gepubliceerd" ? "gepubliceerd" : "concept"}
          </span>
        </div>
        <button
          onClick={() => setBewerken(true)}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          aria-label="Context bewerken"
        >
          <Icon name="pencil-line" size={14} />
        </button>
      </div>

      <dl className="mt-2 flex flex-col gap-1.5">
        {velden
          .filter((v) => v.waarde)
          .map((v) => (
            <div key={v.label}>
              <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{v.label}</dt>
              <dd className="whitespace-pre-wrap text-xs text-slate-700">{v.waarde && normaliseerWiskundeNotatie(v.waarde)}</dd>
            </div>
          ))}
      </dl>

      {context.videos.length > 0 && (
        <div className="mt-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Uitlegvideo&apos;s</p>
          <ul className="mt-0.5 flex flex-col gap-0.5">
            {context.videos.map((v, i) => (
              <li key={i} className="text-xs">
                <a href={v.url} target="_blank" rel="noreferrer" className="text-accent-600 underline">
                  {v.titel}
                </a>
                {v.aanbiedenBij && <span className="text-slate-500"> — {v.aanbiedenBij}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-2.5">
        <StatusKnop status={context.status} bezig={pending} onWissel={wisselStatus} />
      </div>

      <Modal open={bewerken} onClose={() => setBewerken(false)} title="Paragraafcontext bewerken">
        <form
          action={async (formData) => {
            const res = await bewerkKennisParagraafContext(context.id, subjectId, formData);
            if (!res?.error) {
              setBewerken(false);
              router.refresh();
            }
          }}
          className="flex flex-col gap-3"
        >
          {(["leerdoelen", "voorkennis", "kernbegrippen", "oplossingsroute", "beheersingscriterium", "coachaanpak"] as const).map(
            (veld) => (
              <div key={veld}>
                <label className="mb-1.5 block text-sm font-medium capitalize text-slate-700">{veld}</label>
                <textarea
                  name={veld}
                  rows={2}
                  defaultValue={context[veld] ?? ""}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100"
                />
              </div>
            )
          )}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Uitlegvideo&apos;s (1 per regel: titel | link | wanneer aanbieden)
            </label>
            <textarea
              name="videos"
              rows={3}
              defaultValue={context.videos.map((v) => `${v.titel} | ${v.url} | ${v.aanbiedenBij ?? ""}`).join("\n")}
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs font-mono focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100"
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

function OefenvraagKaart({ subjectId, oefenvraag }: { subjectId: string; oefenvraag: KennisOefenvraag }) {
  const router = useRouter();
  const [bewerken, setBewerken] = useState(false);
  const [pending, startTransition] = useTransition();

  function wisselStatus() {
    startTransition(async () => {
      await zetKennisOefenvraagStatus(oefenvraag.id, subjectId, oefenvraag.status === "concept" ? "gepubliceerd" : "concept");
      router.refresh();
    });
  }

  function verwijder() {
    if (!confirm("Deze oefenvraag verwijderen?")) return;
    startTransition(async () => {
      await verwijderKennisOefenvraag(oefenvraag.id, subjectId);
      router.refresh();
    });
  }

  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {oefenvraag.niveau && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
              niveau {oefenvraag.niveau}
            </span>
          )}
          <span
            className={clsx(
              "rounded-full px-2 py-0.5 text-[11px] font-medium",
              oefenvraag.status === "gepubliceerd" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
            )}
          >
            {oefenvraag.status === "gepubliceerd" ? "gepubliceerd" : "concept"}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={() => setBewerken(true)}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Oefenvraag bewerken"
          >
            <Icon name="pencil-line" size={14} />
          </button>
          <button
            onClick={verwijder}
            disabled={pending}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
            aria-label="Oefenvraag verwijderen"
          >
            <Icon name="trash" size={14} />
          </button>
        </div>
      </div>

      <p className="mt-1.5 whitespace-pre-wrap text-sm text-slate-800">{normaliseerWiskundeNotatie(oefenvraag.vraag)}</p>
      <p className="mt-1 whitespace-pre-wrap font-mono text-xs text-emerald-700">{normaliseerWiskundeNotatie(oefenvraag.antwoord)}</p>
      {oefenvraag.uitwerking && (
        <p className="mt-1 whitespace-pre-wrap text-xs text-slate-500">{normaliseerWiskundeNotatie(oefenvraag.uitwerking)}</p>
      )}

      <div className="mt-2.5">
        <StatusKnop status={oefenvraag.status} bezig={pending} onWissel={wisselStatus} />
      </div>

      <Modal open={bewerken} onClose={() => setBewerken(false)} title="Oefenvraag bewerken">
        <form
          action={async (formData) => {
            const res = await bewerkKennisOefenvraag(oefenvraag.id, subjectId, formData);
            if (!res?.error) {
              setBewerken(false);
              router.refresh();
            }
          }}
          className="flex flex-col gap-3"
        >
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Niveau (optioneel)</label>
            <input
              name="niveau"
              defaultValue={oefenvraag.niveau ?? ""}
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Vraag</label>
            <textarea
              name="vraag"
              required
              rows={2}
              defaultValue={oefenvraag.vraag}
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Antwoord</label>
            <input
              name="antwoord"
              required
              defaultValue={oefenvraag.antwoord}
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-mono focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Uitwerking (optioneel)</label>
            <textarea
              name="uitwerking"
              rows={2}
              defaultValue={oefenvraag.uitwerking ?? ""}
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100"
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

      <p className="mt-1.5 whitespace-pre-wrap text-sm text-slate-700">{normaliseerWiskundeNotatie(onderdeel.regel)}</p>

      <ul className="mt-1.5 flex flex-col gap-0.5 text-xs text-slate-600">
        {onderdeel.voorbeelden.map((v, i) => (
          <li key={i} className="whitespace-pre-wrap font-mono">
            {normaliseerWiskundeNotatie(v)}
          </li>
        ))}
      </ul>

      {onderdeel.gecombineerd_voorbeeld && (
        <p className="mt-1.5 whitespace-pre-wrap font-mono text-xs text-slate-600">{normaliseerWiskundeNotatie(onderdeel.gecombineerd_voorbeeld)}</p>
      )}
      {onderdeel.tip && (
        <p className="mt-2 whitespace-pre-wrap rounded-lg bg-sky-50 px-2.5 py-1.5 text-xs text-sky-800">
          Tip: {normaliseerWiskundeNotatie(onderdeel.tip)}
        </p>
      )}
      {onderdeel.uitzondering && (
        <p className="mt-1.5 whitespace-pre-wrap rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">
          Let op: {normaliseerWiskundeNotatie(onderdeel.uitzondering)}
        </p>
      )}
      {onderdeel.fout_voorbeeld && (
        <p className="mt-1.5 whitespace-pre-wrap rounded-lg bg-rose-50 px-2.5 py-1.5 text-xs text-rose-800">
          {normaliseerWiskundeNotatie(onderdeel.fout_voorbeeld)}
        </p>
      )}

      <div className="mt-2.5">
        <StatusKnop status={onderdeel.status} bezig={pending} onWissel={wisselStatus} />
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

function WoordenlijstKaart({ subjectId, woordenlijst }: { subjectId: string; woordenlijst: KennisWoordenlijst }) {
  const router = useRouter();
  const [bewerken, setBewerken] = useState(false);
  const [pending, startTransition] = useTransition();

  function wisselStatus() {
    startTransition(async () => {
      await zetKennisWoordenlijstStatus(woordenlijst.id, subjectId, woordenlijst.status === "concept" ? "gepubliceerd" : "concept");
      router.refresh();
    });
  }

  function verwijder() {
    if (!confirm(`Woordenlijst "${woordenlijst.titel}" (${woordenlijst.woorden.length} woorden) verwijderen?`)) return;
    startTransition(async () => {
      await verwijderKennisWoordenlijst(woordenlijst.id, subjectId);
      router.refresh();
    });
  }

  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-slate-900">{woordenlijst.titel}</p>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
            {woordenlijst.woorden.length} woorden
          </span>
          <span
            className={clsx(
              "rounded-full px-2 py-0.5 text-[11px] font-medium",
              woordenlijst.status === "gepubliceerd" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
            )}
          >
            {woordenlijst.status === "gepubliceerd" ? "gepubliceerd" : "concept"}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={() => setBewerken(true)}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Woordenlijst bewerken"
          >
            <Icon name="pencil-line" size={14} />
          </button>
          <button
            onClick={verwijder}
            disabled={pending}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
            aria-label="Woordenlijst verwijderen"
          >
            <Icon name="trash" size={14} />
          </button>
        </div>
      </div>

      <div className="mt-1.5 overflow-x-auto">
        <table className="w-full text-xs">
          <tbody>
            {woordenlijst.woorden.map((w, i) => (
              <tr key={i} className="border-t border-slate-100 first:border-t-0">
                <td className="py-1 pr-3 font-medium text-slate-800">{w.bron}</td>
                <td className="py-1 pr-3 text-slate-600">{w.doel}</td>
                {w.voorbeeldzin && <td className="py-1 text-slate-400 italic">{w.voorbeeldzin}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-2.5">
        <StatusKnop status={woordenlijst.status} bezig={pending} onWissel={wisselStatus} />
      </div>

      <Modal open={bewerken} onClose={() => setBewerken(false)} title="Woordenlijst bewerken">
        <form
          action={async (formData) => {
            const res = await bewerkKennisWoordenlijst(woordenlijst.id, subjectId, formData);
            if (!res?.error) {
              setBewerken(false);
              router.refresh();
            }
          }}
          className="flex flex-col gap-3"
        >
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Titel</label>
            <input
              name="titel"
              required
              defaultValue={woordenlijst.titel}
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Woorden (1 per regel: brontaal | doeltaal | voorbeeldzin (optioneel))
            </label>
            <textarea
              name="woorden"
              required
              rows={Math.min(20, Math.max(4, woordenlijst.woorden.length))}
              defaultValue={woordenlijst.woorden.map((w) => `${w.bron} | ${w.doel} | ${w.voorbeeldzin ?? ""}`).join("\n")}
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs font-mono focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100"
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
