"use client";

import { useRef, useState } from "react";
import clsx from "clsx";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import type { ChatMessage } from "@/lib/types";

type WeergaveBericht = ChatMessage & { images?: { url: string; title: string }[] };

export function ChatPanel({
  subjectId,
  subjectName,
  initialMessages,
}: {
  subjectId: string;
  subjectName: string;
  initialMessages: ChatMessage[];
}) {
  const [messages, setMessages] = useState<WeergaveBericht[]>(initialMessages);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  async function verstuur() {
    const tekst = input.trim();
    if (!tekst || sending) return;

    setError(null);
    setInput("");
    setSending(true);
    setMessages((prev) => [
      ...prev,
      {
        id: `tmp-${Date.now()}`,
        family_id: "",
        subject_id: subjectId,
        user_id: "",
        role: "user",
        content: tekst,
        created_at: new Date().toISOString(),
      },
    ]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subjectId, message: tekst }),
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
          created_at: new Date().toISOString(),
          images: data.images,
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
          <Icon name="chat" size={18} />
        </span>
        <div>
          <p className="text-sm font-semibold text-slate-900">Vakdocent {subjectName}</p>
          <p className="text-xs text-slate-500">Stelt liever vragen terug dan het antwoord te geven</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {messages.length === 0 && (
          <p className="text-sm text-slate-400">
            Stel gerust een vraag over {subjectName} - bijvoorbeeld over je huiswerk of iets wat
            je niet snapt.
          </p>
        )}
        <div className="flex flex-col gap-3">
          {messages.map((m) => (
            <div
              key={m.id}
              className={clsx("flex flex-col", m.role === "user" ? "items-end" : "items-start")}
            >
              <div
                className={clsx(
                  "max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm",
                  m.role === "user"
                    ? "bg-emerald-600 text-white"
                    : "bg-slate-100 text-slate-800"
                )}
              >
                {m.content}
              </div>
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
            </div>
          ))}
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

      <form
        onSubmit={(e) => {
          e.preventDefault();
          verstuur();
        }}
        className="flex items-center gap-2 border-t border-slate-100 p-3"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Typ je vraag..."
          className="flex-1 rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
        />
        <Button type="submit" disabled={sending || !input.trim()} className="shrink-0">
          Versturen
        </Button>
      </form>
    </div>
  );
}
