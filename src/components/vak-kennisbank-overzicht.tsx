import { Card } from "@/components/ui/card";
import { Icon } from "@/components/icon";
import type { KennisOefenvraag, KennisOnderdeel, KennisParagraafContext, KennisWoordenlijst } from "@/lib/types";

interface ParagraafRij {
  paragraafId: string;
  hoofdstuk: string;
  titel: string;
  context: KennisParagraafContext | null;
  onderdelen: KennisOnderdeel[];
  oefenvragen: KennisOefenvraag[];
  woordenlijsten: KennisWoordenlijst[];
}

function StatusChip({ concept, gepubliceerd }: { concept: number; gepubliceerd: number }) {
  if (concept === 0 && gepubliceerd === 0) return null;
  return (
    <div className="flex shrink-0 gap-1">
      {gepubliceerd > 0 && (
        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
          {gepubliceerd} live
        </span>
      )}
      {concept > 0 && (
        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
          {concept} concept
        </span>
      )}
    </div>
  );
}

/**
 * Puur informatief overzicht van de huidige kennisbank van 1 vak - alle
 * bewerk/publiceer/verwijder-knoppen zijn weg, dat gaat nu allemaal via de
 * chat hierboven (VakInhoudWizard). Dit laat de ouder alleen ZIEN wat er
 * staat, gegroepeerd zoals het kind het ook in "Oefenen" tegenkomt
 * (hoofdstuk -> paragraaf), zodat duidelijk is wat de chat al heeft
 * opgebouwd en wat nog ontbreekt.
 */
export function VakKennisbankOverzicht({
  onderdelen,
  contexten,
  oefenvragen,
  woordenlijsten,
}: {
  onderdelen: KennisOnderdeel[];
  contexten: KennisParagraafContext[];
  oefenvragen: KennisOefenvraag[];
  woordenlijsten: KennisWoordenlijst[];
}) {
  const rijenMap = new Map<string, ParagraafRij>();
  function rij(paragraafId: string, hoofdstuk: string): ParagraafRij {
    let r = rijenMap.get(paragraafId);
    if (!r) {
      r = { paragraafId, hoofdstuk, titel: `Paragraaf ${paragraafId}`, context: null, onderdelen: [], oefenvragen: [], woordenlijsten: [] };
      rijenMap.set(paragraafId, r);
    }
    return r;
  }
  for (const c of contexten) {
    const r = rij(c.paragraaf_id, c.hoofdstuk);
    r.context = c;
    r.titel = c.titel;
  }
  for (const o of onderdelen) {
    if (!o.paragraaf_id) continue;
    rij(o.paragraaf_id, o.hoofdstuk).onderdelen.push(o);
  }
  for (const v of oefenvragen) {
    rij(v.paragraaf_id, v.hoofdstuk).oefenvragen.push(v);
  }
  for (const w of woordenlijsten) {
    const r = rij(w.paragraaf_id, w.hoofdstuk);
    r.woordenlijsten.push(w);
    if (!r.context) r.titel = w.titel;
  }

  const perHoofdstuk = new Map<string, ParagraafRij[]>();
  for (const r of rijenMap.values()) {
    const lijst = perHoofdstuk.get(r.hoofdstuk) ?? [];
    lijst.push(r);
    perHoofdstuk.set(r.hoofdstuk, lijst);
  }
  const hoofdstukken = Array.from(perHoofdstuk.entries())
    .map(([hoofdstuk, rijen]) => ({
      hoofdstuk,
      rijen: rijen.sort((a, b) => a.paragraafId.localeCompare(b.paragraafId, undefined, { numeric: true })),
    }))
    .sort((a, b) => a.hoofdstuk.localeCompare(b.hoofdstuk, undefined, { numeric: true }));

  if (hoofdstukken.length === 0) {
    return (
      <Card>
        <p className="text-sm text-slate-400">
          Nog geen kennisbank voor dit vak - upload hierboven een of meerdere bestanden om te beginnen.
        </p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {hoofdstukken.map(({ hoofdstuk, rijen }) => (
        <Card key={hoofdstuk} className="flex flex-col gap-3">
          <h3 className="font-heading text-base font-bold text-slate-900">{hoofdstuk}</h3>
          <div className="flex flex-col gap-2">
            {rijen.map((r) => {
              const woordenschat = r.woordenlijsten.filter((w) => w.categorie === "woordenschat");
              const zinnen = r.woordenlijsten.filter((w) => w.categorie === "zinnen");
              const conceptTotaal =
                r.onderdelen.filter((o) => o.status === "concept").length +
                r.oefenvragen.filter((v) => v.status === "concept").length +
                r.woordenlijsten.filter((w) => w.status === "concept").length +
                (r.context?.status === "concept" ? 1 : 0);
              const gepubliceerdTotaal =
                r.onderdelen.filter((o) => o.status === "gepubliceerd").length +
                r.oefenvragen.filter((v) => v.status === "gepubliceerd").length +
                r.woordenlijsten.filter((w) => w.status === "gepubliceerd").length +
                (r.context?.status === "gepubliceerd" ? 1 : 0);

              return (
                <details key={r.paragraafId} className="group rounded-2xl border border-slate-200 p-3">
                  <summary className="flex cursor-pointer list-none items-center gap-2">
                    <Icon
                      name="chevron-right"
                      size={14}
                      className="shrink-0 text-slate-400 transition-transform group-open:rotate-90"
                    />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">
                      {r.paragraafId} - {r.titel}
                    </span>
                    <StatusChip concept={conceptTotaal} gepubliceerd={gepubliceerdTotaal} />
                  </summary>

                  <div className="mt-3 flex flex-col gap-2.5 pl-6 text-sm">
                    {r.context?.leerdoelen && (
                      <p className="text-slate-600">
                        <span className="font-medium text-slate-500">Leerdoelen: </span>
                        {r.context.leerdoelen}
                      </p>
                    )}
                    {r.onderdelen.length > 0 && (
                      <div>
                        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">
                          Grammatica/regels ({r.onderdelen.length})
                        </p>
                        <ul className="flex flex-col gap-0.5 text-slate-600">
                          {r.onderdelen.map((o) => (
                            <li key={o.id} className="truncate">
                              - {o.naam}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {woordenschat.length > 0 && (
                      <p className="text-slate-600">
                        <span className="font-medium text-slate-500">Woordenschat: </span>
                        {woordenschat.map((w) => `${w.titel} (${w.woorden.length})`).join(", ")}
                      </p>
                    )}
                    {zinnen.length > 0 && (
                      <p className="text-slate-600">
                        <span className="font-medium text-slate-500">Zinnen &amp; uitdrukkingen: </span>
                        {zinnen.map((w) => `${w.titel} (${w.woorden.length})`).join(", ")}
                      </p>
                    )}
                    {r.oefenvragen.length > 0 && (
                      <p className="text-slate-600">
                        <span className="font-medium text-slate-500">Oefenbank: </span>
                        {r.oefenvragen.length} vragen
                      </p>
                    )}
                    {r.onderdelen.length === 0 &&
                      r.woordenlijsten.length === 0 &&
                      r.oefenvragen.length === 0 &&
                      !r.context?.leerdoelen && <p className="text-slate-400">Nog geen inhoud in deze paragraaf.</p>}
                  </div>
                </details>
              );
            })}
          </div>
        </Card>
      ))}
    </div>
  );
}
