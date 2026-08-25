"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { ChatInvoer } from "@/components/ui/chat-invoer";
import { MarkdownTekst } from "@/components/markdown-tekst";
import {
  maakPlanningItemSimpel,
  updatePlanningStatus,
  verplaatsPlanningItem,
  verplaatsPlanningItemNaarTijd,
  verwijderPlanningItem,
} from "@/lib/actions/planning";
import { PLANNING_TYPE_META } from "@/lib/planning";
import type { PlanningItem, PlanningType, Subject } from "@/lib/types";

type Actie = "aanmaken" | "verplaats" | "klaar_melden" | "heropenen" | "verwijderen";
interface Voorstel {
  actie: Actie;
  planningItemId: string | null;
  nieuweDatum: string | null;
  nieuweTijd: string | null;
  type: PlanningType | null;
  titel: string | null;
  vakId: string | null;
  geschatteMinuten: number | null;
  toelichting: string | null;
}
type VoorstelStatus = "open" | "bevestigd" | "afgewezen";

interface Bericht {
  id: string;
  role: "user" | "model";
  content: string;
  voorstellen?: { voorstel: Voorstel; status: VoorstelStatus }[];
}

function formatDatum(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "short" });
}

/** Korte, leesbare samenvatting van 1 voorstel - wat er gaat gebeuren als de leerling op "Ja doe dit" tikt. */
function voorstelOmschrijving(voorstel: Voorstel, item: PlanningItem | null, subjects: Subject[]) {
  const vakNaam = (id: string | null) => subjects.find((s) => s.id === id)?.name ?? null;

  switch (voorstel.actie) {
    case "aanmaken": {
      const typeLabel = voorstel.type ? PLANNING_TYPE_META[voorstel.type].label : "Item";
      const vak = vakNaam(voorstel.vakId);
      return `Nieuw (${typeLabel}): "${voorstel.titel}"${vak ? ` - ${vak}` : ""}${voorstel.nieuweDatum ? ` op ${formatDatum(voorstel.nieuweDatum)}` : ""}${voorstel.nieuweTijd ? ` om ${voorstel.nieuweTijd}` : ""}`;
    }
    case "verplaats": {
      if (!item) return null;
      const datum = voorstel.nieuweDatum ?? item.due_date;
      // Bij alleen een nieuwe datum blijft een al bestaand tijdstip gewoon
      // staan (verplaatsPlanningItem raakt start_time niet aan) - dat tonen
      // we dus ook zo.
      const tijd = voorstel.nieuweTijd ?? item.start_time;
      return `"${item.title}" verplaatsen naar ${formatDatum(datum)}${tijd ? ` om ${tijd.slice(0, 5)}` : ""}`;
    }
    case "klaar_melden":
      return item ? `"${item.title}" als klaar markeren` : null;
    case "heropenen":
      return item ? `"${item.title}" weer openzetten` : null;
    case "verwijderen":
      return item
        ? `"${item.title}" verwijderen${item.type === "toets" ? " (gekoppelde leermomenten verdwijnen mee)" : ""}`
        : null;
    default:
      return null;
  }
}

/**
 * Planning-buddy chat: het kind (of de ouder) legt een planningsdilemma voor,
 * de AI denkt mee en erkent het eerst (geen preek), en kan zelf voorstellen
 * doen om de agenda aan te passen - aanmaken, verplaatsen, klaar/heropenen,
 * verwijderen. Elk voorstel wordt nooit automatisch uitgevoerd, alleen na
 * expliciete bevestiging via de knop bij dat ene voorstel - de leerling
 * houdt zo altijd de regie, ook al kan de hulp nu veel meer.
 */
export function PlanningHulpChat({
  items,
  subjects,
  openingsbericht,
}: {
  items: PlanningItem[];
  subjects: Subject[];
  openingsbericht?: string;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<Bericht[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [uitvoerenSleutel, setUitvoerenSleutel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const openingVerzonden = useRef(false);

  function itemVoor(id: string | null) {
    return id ? (items.find((i) => i.id === id) ?? null) : null;
  }

  async function verstuur(overrideTekst?: string) {
    const tekst = (overrideTekst ?? input).trim();
    if (!tekst || sending) return;

    setError(null);
    if (overrideTekst === undefined) setInput("");
    setSending(true);
    const huidigeMessages = messages;
    const userBericht: Bericht = { id: `u-${Date.now()}`, role: "user", content: tekst };
    setMessages((prev) => [...prev, userBericht]);

    try {
      const res = await fetch("/api/planning-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: tekst,
          geschiedenis: [...huidigeMessages, userBericht].map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Er ging iets mis.");

      const voorstellen: Voorstel[] = Array.isArray(data.voorstellen) ? data.voorstellen : [];
      setMessages((prev) => [
        ...prev,
        {
          id: `m-${Date.now()}`,
          role: "model",
          content: data.antwoord,
          voorstellen: voorstellen.length > 0 ? voorstellen.map((voorstel) => ({ voorstel, status: "open" as const })) : undefined,
        },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Er ging iets mis.");
    } finally {
      setSending(false);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }
  }

  // Als deze chat geopend wordt met een openingsbericht (bv. net huiswerk
  // toegevoegd vanuit een rooster-blokje), stuurt die meteen zelf een eerste
  // bericht - zodat de AI direct de context heeft en een concreet voorstel
  // kan doen, zonder dat de leerling dit zelf hoeft uit te typen.
  useEffect(() => {
    if (openingsbericht && !openingVerzonden.current) {
      openingVerzonden.current = true;
      verstuur(openingsbericht);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openingsbericht]);

  async function bevestigVoorstel(berichtId: string, index: number, voorstel: Voorstel) {
    const sleutel = `${berichtId}-${index}`;
    setUitvoerenSleutel(sleutel);
    setError(null);
    try {
      switch (voorstel.actie) {
        case "aanmaken":
          if (!voorstel.type || !voorstel.titel || !voorstel.nieuweDatum) return;
          await maakPlanningItemSimpel({
            type: voorstel.type,
            title: voorstel.titel,
            dueDate: voorstel.nieuweDatum,
            subjectId: voorstel.vakId,
            startTime: voorstel.nieuweTijd,
            estimatedMinutes: voorstel.geschatteMinuten,
          });
          break;
        case "verplaats": {
          if (!voorstel.planningItemId) return;
          const item = itemVoor(voorstel.planningItemId);
          const datum = voorstel.nieuweDatum ?? item?.due_date;
          if (!datum) return;
          if (voorstel.nieuweTijd) {
            await verplaatsPlanningItemNaarTijd(voorstel.planningItemId, datum, voorstel.nieuweTijd);
          } else {
            await verplaatsPlanningItem(voorstel.planningItemId, datum);
          }
          break;
        }
        case "klaar_melden":
          if (!voorstel.planningItemId) return;
          await updatePlanningStatus(voorstel.planningItemId, "klaar");
          break;
        case "heropenen":
          if (!voorstel.planningItemId) return;
          await updatePlanningStatus(voorstel.planningItemId, "open");
          break;
        case "verwijderen":
          if (!voorstel.planningItemId) return;
          await verwijderPlanningItem(voorstel.planningItemId);
          break;
      }
      setMessages((prev) =>
        prev.map((m) =>
          m.id === berichtId
            ? {
                ...m,
                voorstellen: m.voorstellen?.map((v, i) => (i === index ? { ...v, status: "bevestigd" as const } : v)),
              }
            : m
        )
      );
      router.refresh();
    } catch {
      setError("Kon de wijziging niet doorvoeren - probeer het nog eens.");
    } finally {
      setUitvoerenSleutel(null);
    }
  }

  function wijsAf(berichtId: string, index: number) {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === berichtId
          ? { ...m, voorstellen: m.voorstellen?.map((v, i) => (i === index ? { ...v, status: "afgewezen" as const } : v)) }
          : m
      )
    );
  }

  return (
    <div className="flex h-[65vh] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-50 text-accent-600">
          <Icon name="brain" size={18} />
        </span>
        <div>
          <p className="text-sm font-semibold text-slate-900">Planningshulp</p>
          <p className="text-xs text-slate-500">Loop je vast met plannen? Overleg het hier eerst.</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {messages.length === 0 && (
          <p className="text-sm text-slate-400">
            Bijvoorbeeld: &quot;ik heb morgen te veel te doen&quot;, &quot;mijn wiskundeles valt uit&quot; of &quot;plan
            vanmiddag even kamer opruimen in&quot; - denk hardop, ik denk mee en kan het meteen voor je inplannen.
          </p>
        )}
        <div className="flex flex-col gap-3">
          {messages.map((m) => (
            <div key={m.id} className={clsx("flex flex-col", m.role === "user" ? "items-end" : "items-start")}>
              <div
                className={clsx(
                  "max-w-[85%] rounded-2xl px-4 py-2.5",
                  m.role === "user" ? "whitespace-pre-wrap text-sm bg-accent-600 text-white" : "bg-slate-100 text-slate-800"
                )}
              >
                {m.role === "model" ? <MarkdownTekst>{m.content}</MarkdownTekst> : m.content}
              </div>

              {m.voorstellen?.map(({ voorstel, status }, index) => {
                const item = itemVoor(voorstel.planningItemId);
                const omschrijving = voorstelOmschrijving(voorstel, item, subjects);
                if (!omschrijving) return null;
                return (
                  <div
                    key={index}
                    className="mt-2 flex max-w-[85%] flex-col gap-2 rounded-xl border border-accent-200 bg-accent-50/60 p-3"
                  >
                    <p className="text-xs font-medium text-accent-800">Voorstel: {omschrijving}</p>
                    {voorstel.toelichting && <p className="text-xs text-slate-500">{voorstel.toelichting}</p>}
                    {status === "bevestigd" ? (
                      <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                        <Icon name="check" size={14} /> Gedaan!
                      </p>
                    ) : status === "afgewezen" ? (
                      <p className="text-xs text-slate-500">Oke, laten staan zoals het was.</p>
                    ) : (
                      <div className="flex gap-2">
                        <Button
                          size="md"
                          loading={uitvoerenSleutel === `${m.id}-${index}`}
                          onClick={() => bevestigVoorstel(m.id, index, voorstel)}
                          className="!px-3 !py-1.5 !text-xs"
                        >
                          Ja, doe dit
                        </Button>
                        <Button
                          size="md"
                          variant="secondary"
                          disabled={uitvoerenSleutel === `${m.id}-${index}`}
                          onClick={() => wijsAf(m.id, index)}
                          className="!px-3 !py-1.5 !text-xs"
                        >
                          Nee, laat maar
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
          {sending && (
            <div className="flex justify-start">
              <div className="rounded-2xl bg-slate-100 px-4 py-2.5 text-sm text-slate-400">aan het denken...</div>
            </div>
          )}
        </div>
        <div ref={bottomRef} />
      </div>

      {error && <p className="px-5 pb-1 text-sm text-rose-600">{error}</p>}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          verstuur();
        }}
        className="flex items-end gap-2 border-t border-slate-100 p-3"
      >
        <ChatInvoer value={input} onChange={setInput} onVerstuur={verstuur} placeholder="Typ je vraag of dilemma..." />
        <Button type="submit" loading={sending} disabled={!input.trim()} className="shrink-0">
          Versturen
        </Button>
      </form>
    </div>
  );
}
