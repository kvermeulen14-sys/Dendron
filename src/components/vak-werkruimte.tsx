"use client";

import { useState } from "react";
import clsx from "clsx";
import { Icon } from "@/components/icon";
import { ChatPanel } from "@/components/chat-panel";
import { OverhoorPanel } from "@/components/overhoor-panel";
import type { ChatMessage } from "@/lib/types";

const TABS = [
  { modus: "chat", label: "Chat", icon: "chat" },
  { modus: "opdracht", label: "Opdracht maken", icon: "pencil-line" },
  { modus: "overhoren", label: "Overhoren", icon: "target" },
] as const;

export function VakWerkruimte({
  subjectId,
  subjectName,
  initialMessages,
  initialModus = "chat",
  hoofdstukken = [],
}: {
  subjectId: string;
  subjectName: string;
  initialMessages: ChatMessage[];
  initialModus?: (typeof TABS)[number]["modus"];
  hoofdstukken?: string[];
}) {
  const [modus, setModus] = useState<(typeof TABS)[number]["modus"]>(initialModus);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <button
            key={tab.modus}
            onClick={() => setModus(tab.modus)}
            className={clsx(
              "flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-sm font-medium transition-colors",
              modus === tab.modus
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-200 text-slate-600 hover:bg-slate-50"
            )}
          >
            <Icon name={tab.icon} size={16} />
            {tab.label}
          </button>
        ))}
      </div>

      {modus === "chat" && (
        <ChatPanel subjectId={subjectId} subjectName={subjectName} initialMessages={initialMessages} modus="algemeen" />
      )}
      {modus === "opdracht" && <ChatPanel subjectId={subjectId} subjectName={subjectName} modus="opdracht" />}
      {modus === "overhoren" && <OverhoorPanel subjectId={subjectId} subjectName={subjectName} hoofdstukken={hoofdstukken} />}
    </div>
  );
}
