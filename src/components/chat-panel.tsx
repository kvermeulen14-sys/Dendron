"use client";

import { useRef, useState } from "react";
import clsx from "clsx";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { ChatInvoer } from "@/components/ui/chat-invoer";
import { MarkdownTekst } from "@/components/markdown-tekst";
import { VisualWeergave } from "@/components/visuals/visual-weergave";
import { extraheerVisuals } from "@/lib/visuals";
import { bewaarChatFotoAlsLesstof } from "@/lib/actions/materials";
import type { ChatMessage } from "@/lib/types";

type WeergaveBericht = ChatMessage & {
  images?: { url: string; title: string }[];
  /** Alleen voor een net-verstuurd bericht in deze sessie: lokale voorvertoning van de bijgevoegde foto. */
  previewImageUrl?: string;
  /** Voor eerder opgeslagen berichten (na een refresh): getekende URL, opgelost bij het laden van de pagina. */
  imageUrl?: string;
  /** Alleen voor een net-ontvangen antwoord op een foto: of die foto theorie of een opgave toont (zie /api/chat). */
  fotoType?: "theorie" | "opgave" | null;
  /** Opslagpad van de bijgevoegde foto van het VORIGE (user-)bericht - nodig om 'm evt. als lesstof te bewaren. */
  fotoPadOmTeBewaren?: string | null;
};
type Modus = "algemeen" | "opdracht";

const MODUS_TEKST: Record<
  Modus,
  { titel: string; ondertitel: string; icon: string; leeg: (naam: string) => string; placeholder: string }
> = {
  algemeen: {
    titel: "Vakdocent",
    ondertitel: "Stelt liever vragen terug dan het antwoord te geven",
    icon: "chat",
    leeg: (naam) => `Stel gerust een vraag over ${naam} - bijvoorbeeld over je huiswerk of iets wat je niet snapt.`,
    placeholder: "Typ je vraag...",
  },
  opdracht: {
    titel: "Opdracht maken",
    ondertitel: "Help stap voor stap met 1 specifieke opgave",
    icon: "pencil-line",
    leeg: (naam) =>
      `Welke opgave van ${naam} wil je maken? Noem het hoofdstuk/paragraaf en opgavenummer, of maak een foto van de opgave.`,
    placeholder: "Bijv. 'H7.3 opgave 42' of typ/plak de opgave...",
  },
};

const TOEGESTANE_FOTO_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic", "image/heif"];
const MAX_FOTO_BYTES = 8 * 1024 * 1024;

function leesAlsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // dataURL heeft de vorm "data:<mime>;base64,<data>" - alleen het deel na de komma versturen.
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = () => reject(new Error("Foto inlezen mislukt."));
    reader.readAsDataURL(file);
  });
}

export function ChatPanel({
  subjectId,
  subjectName,
  initialMessages = [],
  modus = "algemeen",
}: {
  subjectId: string;
  subjectName: string;
  initialMessages?: ChatMessage[];
  modus?: Modus;
}) {
  const [messages, setMessages] = useState<WeergaveBericht[]>(initialMessages);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [foto, setFoto] = useState<{ previewUrl: string; base64: string; mimeType: string } | null>(null);
  const [bewaardeFotoIds, setBewaardeFotoIds] = useState<Set<string>>(new Set());
  const [bewaarBezigId, setBewaarBezigId] = useState<string | null>(null);
  const fotoInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const tekst = MODUS_TEKST[modus];

  async function bewaarAlsLesstof(bericht: WeergaveBericht) {
    if (!bericht.fotoPadOmTeBewaren) return;
    setBewaarBezigId(bericht.id);
    const res = await bewaarChatFotoAlsLesstof(subjectId, bericht.fotoPadOmTeBewaren, `Foto - ${subjectName}`, bericht.content);
    setBewaarBezigId(null);
    if (!res.error) setBewaardeFotoIds((prev) => new Set(prev).add(bericht.id));
  }

  async function fotoGekozen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setError(null);
    if (!TOEGESTANE_FOTO_TYPES.includes(file.type)) {
      setError("Alleen JPEG/PNG/WebP/HEIC-foto's worden ondersteund.");
      return;
    }
    if (file.size > MAX_FOTO_BYTES) {
      setError("Deze foto is te groot (max 8MB).");
      return;
    }

    const base64 = await leesAlsBase64(file);
    setFoto({ previewUrl: URL.createObjectURL(file), base64, mimeType: file.type });
  }

  async function verstuur() {
    const bericht = input.trim() || (foto ? "Kun je me hierbij helpen?" : "");
    if (!bericht || sending) return;

    setError(null);
    setInput("");
    const bijgevoegdeFoto = foto;
    setFoto(null);
    setSending(true);
    setMessages((prev) => [
      ...prev,
      {
        id: `tmp-${Date.now()}`,
        family_id: "",
        subject_id: subjectId,
        user_id: "",
        role: "user",
        content: bericht,
        image_path: null,
        created_at: new Date().toISOString(),
        previewImageUrl: bijgevoegdeFoto?.previewUrl,
      },
    ]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subjectId,
          message: bericht,
          gespreksmodus: modus,
          ...(bijgevoegdeFoto ? { image: { mimeType: bijgevoegdeFoto.mimeType, data: bijgevoegdeFoto.base64 } } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Er ging iets mis.");

      setMessages((prev) => [
        ...prev,
        {
          id: `tmp-reply-${Date.now()}`,
          family_id: "",
          subject_id: subjectId,
          user_id: "",
          role: "model",
          content: data.reply,
          image_path: null,
          created_at: new Date().toISOString(),
          images: data.images,
          fotoType: data.fotoType ?? null,
          fotoPadOmTeBewaren: data.imagePath ?? null,
        },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Er ging iets mis.");
    } finally {
      setSending(false);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }
  }

  return (
    <div className="flex h-[70vh] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
          <Icon name={tekst.icon} size={18} />
        </span>
        <div>
          <p className="text-sm font-semibold text-slate-900">
            {tekst.titel} {subjectName}
          </p>
          <p className="text-xs text-slate-500">{tekst.ondertitel}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {messages.length === 0 && <p className="text-sm text-slate-400">{tekst.leeg(subjectName)}</p>}
        <div className="flex flex-col gap-3">
          {messages.map((m) => {
            const { tekst: schoneTekst, visuals } = m.role === "model" ? extraheerVisuals(m.content) : { tekst: m.content, visuals: [] };
            const eigenFotoUrl = m.previewImageUrl ?? m.imageUrl;
            return (
            <div
              key={m.id}
              className={clsx("flex flex-col", m.role === "user" ? "items-end" : "items-start")}
            >
              {m.role === "user" && eigenFotoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={eigenFotoUrl} alt="Bijgevoegde foto" className="mb-1 h-32 w-auto rounded-xl border border-slate-200 object-cover" />
              )}
              <div
                className={clsx(
                  "max-w-[80%] rounded-2xl px-4 py-2.5",
                  m.role === "user"
                    ? "whitespace-pre-wrap text-sm bg-emerald-600 text-white"
                    : "bg-slate-100 text-slate-800"
                )}
              >
                {m.role === "model" ? <MarkdownTekst>{schoneTekst}</MarkdownTekst> : schoneTekst}
              </div>
              {visuals.length > 0 && (
                <div className="flex max-w-[80%] flex-col gap-2">
                  {visuals.map((v, i) => (
                    <VisualWeergave key={i} visual={v} />
                  ))}
                </div>
              )}
              {m.images && m.images.length > 0 && (
                <div className="mt-2 flex max-w-[80%] flex-wrap gap-2">
                  {m.images.map((img, i) => (
                    <a
                      key={i}
                      href={img.url}
                      target="_blank"
                      rel="noreferrer"
                      className="block overflow-hidden rounded-xl border border-slate-200"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={img.url} alt={img.title} className="h-28 w-auto object-cover" />
                    </a>
                  ))}
                </div>
              )}
              {m.fotoType === "theorie" && m.fotoPadOmTeBewaren && (
                <div className="mt-1.5">
                  {bewaardeFotoIds.has(m.id) ? (
                    <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-600">
                      <Icon name="check" size={13} />
                      Toegevoegd aan lesstof
                    </p>
                  ) : (
                    <button
                      onClick={() => bewaarAlsLesstof(m)}
                      disabled={bewaarBezigId === m.id}
                      className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 disabled:opacity-50"
                    >
                      <Icon name={bewaarBezigId === m.id ? "loader" : "book-open"} size={13} className={bewaarBezigId === m.id ? "animate-spin" : undefined} />
                      Deze foto is theorie - bewaar als lesstof
                    </button>
                  )}
                </div>
              )}
            </div>
            );
          })}
          {sending && (
            <div className="flex justify-start">
              <div className="rounded-2xl bg-slate-100 px-4 py-2.5 text-sm text-slate-400">
                aan het typen...
              </div>
            </div>
          )}
        </div>
        <div ref={bottomRef} />
      </div>

      {error && <p className="px-5 pb-1 text-sm text-rose-600">{error}</p>}

      {foto && (
        <div className="flex items-center gap-2 border-t border-slate-100 px-3 pt-3">
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={foto.previewUrl} alt="Te versturen foto" className="h-14 w-14 rounded-lg border border-slate-200 object-cover" />
            <button
              type="button"
              onClick={() => setFoto(null)}
              className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-slate-700 text-white"
              aria-label="Foto verwijderen"
            >
              <Icon name="close" size={12} />
            </button>
          </div>
          <p className="text-xs text-slate-500">
            Bij een opgave: alleen voor dit bericht. Bij theorie/uitleg: kun je na het antwoord bewaren als lesstof.
          </p>
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          verstuur();
        }}
        className="flex items-end gap-2 border-t border-slate-100 p-3"
      >
        <button
          type="button"
          onClick={() => fotoInputRef.current?.click()}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50"
          aria-label="Foto toevoegen aan dit bericht"
        >
          <Icon name="image" size={18} />
        </button>
        <input ref={fotoInputRef} type="file" accept="image/*" className="hidden" onChange={fotoGekozen} />
        <ChatInvoer
          value={input}
          onChange={setInput}
          onVerstuur={verstuur}
          placeholder={tekst.placeholder}
          focusClassName="focus:border-emerald-500 focus:ring-emerald-100"
        />
        <Button type="submit" loading={sending} disabled={!input.trim() && !foto} className="shrink-0">
          Versturen
        </Button>
      </form>
    </div>
  );
}
