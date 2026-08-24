"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { ChatInvoer } from "@/components/ui/chat-invoer";
import { MarkdownTekst } from "@/components/markdown-tekst";
import { updatePlanningStatus, verplaatsPlanningItem } from "@/lib/actions/planning";
import type { PlanningItem } from "@/lib/types";

type Actie = "verplaats" | "klaar_melden" | "geen";
type Voorstel = { actie: Actie; planningItemId: string | null; nieuweDatum: string | null };
type VoorstelStatus = "open" | "bevestigd" | "afgewezen";

interface Bericht {
  id: string;
  role: "user" | "model";
  content: string;
  voorstel?: Voorstel;
  voorstelStatus?: VoorstelStatus;
}

function formatDatum(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "short" });
}

/**
 * Planning-buddy chat: het kind legt een planningsdilemma voor, de AI denkt
 * mee en erkent het eerst (geen preek), en doet pas een concreet voorstel
 * als dat past - dat voorstel wordt nooit automatisch uitgevoerd, alleen na
 * expliciete bevestiging via de knop bij het voorstel.
 */
export function PlanningHulpChat({ items, openingsbericht }: { items: PlanningItem[]; openingsbericht?: string }) {
  const router = useRouter();
  const [messages, setMessages] = useState<Bericht[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [uitvoerenId, setUitvoerenId] = useState<string | null>(null);
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

      setMessages((prev) => [
        ...prev,
        {
          id: `m-${Date.now()}`,
          role: "model",
          content: data.antwoord,
          voorstel: data.voorstel?.actie && data.voorstel.actie !== "geen" ? data.voorstel : undefined,
          voorstelStatus: "open",
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

  async function bevestigVoorstel(berichtId: string, voorstel: Voorstel) {
    if (!voorstel.planningItemId) return;
    setUitvoerenId(berichtId);
    try {
      if (voorstel.actie === "verplaats" && voorstel.nieuweDatum) {
        await verplaatsPlanningItem(voorstel.planningItemId, voorstel.nieuweDatum);
      } else if (voorstel.actie === "klaar_melden") {
        await updatePlanningStatus(voorstel.planningItemId, "klaar");
      }
      setMessages((prev) => prev.map((m) => (m.id === berichtId ? { ...m, voorstelStatus: "bevestigd" } : m)));
      router.refresh();
    } catch {
      setError("Kon de wijziging niet doorvoeren - probeer het nog eens.");
    } finally {
      setUitvoerenId(null);
    }
  }

  function wijsAf(berichtId: string) {
    setMessages((prev) => prev.map((m) => (m.id === berichtId ? { ...m, voorstelStatus: "afgewezen" } : m)));
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
            Bijvoorbeeld: &quot;ik heb morgen te veel te doen&quot; of &quot;kan ik dit verplaatsen?&quot; - denk hardop, ik denk mee.
          </p>
        )}
        <div className="flex flex-col gap-3">
          {messages.map((m) => {
            const item = m.voorstel ? itemVoor(m.voorstel.planningItemId) : null;
            return (
              <div key={m.id} className={clsx("flex flex-col", m.role === "user" ? "items-end" : "items-start")}>
                <div
                  className={clsx(
                    "max-w-[85%] rounded-2xl px-4 py-2.5",
                    m.role === "user"
                      ? "whitespace-pre-wrap text-sm bg-accent-600 text-white"
                      : "bg-slate-100 text-slate-800"
                  )}
                >
                  {m.role === "model" ? <MarkdownTekst>{m.content}</MarkdownTekst> : m.content}
                </div>

                {m.voorstel && item && (
                  <div className="mt-2 flex max-w-[85%] flex-col gap-2 rounded-xl border border-accent-200 bg-accent-50/60 p-3">
                    <p className="text-xs font-medium text-accent-800">
                      Voorstel: {m.voorstel.actie === "verplaats" && m.voorstel.nieuweDatum
                        ? `"${item.title}" verplaatsen naar ${formatDatum(m.voorstel.nieuweDatum)}`
                        : `"${item.title}" als klaar markeren`}
                    </p>
                    {m.voorstelStatus === "bevestigd" ? (
                      <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                        <Icon name="check" size={14} /> Gedaan!
                      </p>
                    ) : m.voorstelStatus === "afgewezen" ? (
                      <p className="text-xs text-slate-500">Oke, laten staan zoals het was.</p>
                    ) : (
                      <div className="flex gap-2">
                        <Button
                          size="md"
                          loading={uitvoerenId === m.id}
                          onClick={() => bevestigVoorstel(m.id, m.voorstel!)}
                          className="!px-3 !py-1.5 !text-xs"
                        >
                          Ja, doe dit
                        </Button>
                        <Button
                          size="md"
                          variant="secondary"
                          disabled={uitvoerenId === m.id}
                          onClick={() => wijsAf(m.id)}
                          className="!px-3 !py-1.5 !text-xs"
                        >
                          Nee, laat maar
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
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
